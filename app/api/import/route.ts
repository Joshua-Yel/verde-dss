import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import supabaseServer from '../../../src/lib/supabaseServer'
import { createSupabaseRouteClient } from '../../../src/lib/supabaseRoute'
import { resolveBusinessIdForUser } from '../../../src/lib/businessAccess'
import { insertWithBusinessIdFallback } from '../../../src/lib/supabaseCompat'
import { normalizeDate } from '../../../src/lib/dateUtils'

const revalidateDashboardTag = revalidateTag as unknown as (tag: string) => void

type ImportedRow = {
  date?: unknown
  service_name?: unknown
  quantity?: unknown
  revenue?: unknown
  category?: unknown
  price?: unknown
  notes?: unknown
  business_name?: unknown
  time_of_day?: unknown
  [key: string]: unknown
}

type MappedRow = {
  date: string | null
  service_name: string
  quantity: number | null
  revenue: number | null
  category: string | null
  price: number | null
  notes: string | null
  business_name: string | null
  time_of_day: string | null
  hour: number | null
  raw: ImportedRow
}

type MappedRowWithIndex = MappedRow & {
  rowIndex: number
}

function normalizeString(value: unknown): string | null {
  if (value === undefined || value === null) return null
  const str = String(value).trim()
  return str === '' ? null : str
}

function normalizeNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  const normalized = String(value).replace(/[₱,$]/g, '').replace(/,/g, '').trim()
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Parse a time-of-day value from the upload into:
 *  - time_of_day: normalized display string (or null)
 *  - hour: integer 0–23 for aggregation (or null)
 *
 * Accepts:
 *  - "11:45:00" / "11:45" / "9:05"
 *  - Excel fractional day (0 ≤ n < 1) or date serial with fraction
 *  - "AM" / "PM" / "Morning" / "Afternoon" (maps to representative hours)
 */
function parseTimeOfDay(value: unknown): { time_of_day: string | null; hour: number | null } {
  if (value === undefined || value === null || value === '') {
    return { time_of_day: null, hour: null }
  }

  // Excel fraction → HH:MM:00 + hour (0–23)
  const fromFraction = (n: number): { time_of_day: string; hour: number } | null => {
    if (!Number.isFinite(n)) return null
    let fraction = n
    // Full Excel date serial (e.g. 45323.48958) — keep only the time portion
    if (n >= 1) fraction = n - Math.floor(n)
    if (fraction < 0 || fraction >= 1) return null
    const totalMinutes = Math.round(fraction * 24 * 60)
    const hour = Math.floor(totalMinutes / 60) % 24
    const minute = totalMinutes % 60
    return {
      hour,
      time_of_day: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`,
    }
  }

  // Numeric Excel serial (when SheetJS keeps the cell as a number)
  if (typeof value === 'number') {
    const parsed = fromFraction(value)
    if (parsed) return parsed
  }

  const raw = String(value).trim()
  if (!raw) return { time_of_day: null, hour: null }

  // Numeric STRING from client normalizeText / JSON — e.g. "0.4895833333333333"
  // This is what left hour=null on the first re-import after migration.
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const parsed = fromFraction(Number(raw))
    if (parsed) return parsed
  }

  // HH:MM or HH:MM:SS (optional AM/PM)
  const clockMatch = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i)
  if (clockMatch) {
    let hour = Number(clockMatch[1])
    const minute = Number(clockMatch[2])
    const meridiem = clockMatch[4]?.toUpperCase()
    if (meridiem === 'PM' && hour < 12) hour += 12
    if (meridiem === 'AM' && hour === 12) hour = 0
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      const sec = clockMatch[3] ?? '00'
      return {
        hour,
        time_of_day: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(sec).padStart(2, '0')}`,
      }
    }
  }

  // Standalone AM / PM / period labels
  const upper = raw.toUpperCase()
  if (upper === 'AM' || upper === 'MORNING' || upper.includes('MORNING')) {
    return { time_of_day: 'AM', hour: 10 }
  }
  if (upper === 'PM' || upper === 'AFTERNOON' || upper.includes('AFTERNOON')) {
    return { time_of_day: 'PM', hour: 15 }
  }
  if (upper === 'EVENING' || upper.includes('EVENING') || upper.includes('NIGHT')) {
    return { time_of_day: 'PM', hour: 19 }
  }

  return { time_of_day: raw, hour: null }
}

// Resolves the workspace/business that belongs to the current user.
// Imports always attach to that shared workspace, and the resolution logic
// now uses the same shared helper as dashboards, ARIA, and exports so all
// routes stay consistent.
async function resolveBusinessId(
  user: { id?: string | null; app_metadata?: Record<string, unknown> | null; user_metadata?: Record<string, unknown> | null } | null | undefined,
  filename: string | undefined
): Promise<{ businessId: string } | { error: NextResponse }> {
  const resolvedBusinessId = await resolveBusinessIdForUser(supabaseServer, user)

  if (resolvedBusinessId) {
    return { businessId: resolvedBusinessId }
  }

  return {
    error: NextResponse.json(
      { error: `No workspace is associated with this account yet. Please complete sign-up before importing ${filename ? 'this file' : 'data'}.` },
      { status: 404 }
    ),
  }
}

export async function POST(request: Request) {
  try {
    // Identify the current user from the session cookie.
    const routeClient = await createSupabaseRouteClient()
    const {
      data: { user },
    } = await routeClient.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'You must be signed in to import data.' }, { status: 401 })
    }

    const body = await request.json()
    const { filename, mode = 'operations', rows } = body

    if (!rows || !Array.isArray(rows)) {
      return NextResponse.json({ error: 'rows must be an array' }, { status: 400 })
    }

    if (mode === 'inventory') {
      const invalidRows = (rows as ImportedRow[]).map((row, index) => {
        const product_name = normalizeString(row.product_name)
        const unit = normalizeString(row.unit)
        const month = normalizeString(row.month)
        const opening_stock = normalizeNumber(row.opening_stock)
        const purchased = normalizeNumber(row.purchased)
        const used = normalizeNumber(row.used)
        const closing_stock = normalizeNumber(row.closing_stock)
        return {
          rowIndex: index + 1,
          product_name,
          unit,
          month,
          opening_stock,
          purchased,
          used,
          closing_stock,
          valid: Boolean(product_name && unit && month && opening_stock !== null && purchased !== null && used !== null && closing_stock !== null),
        }
      }).filter(row => !row.valid)

      if (invalidRows.length) {
        return NextResponse.json(
          {
            error: 'Validation failed for one or more inventory rows',
            invalidRows: invalidRows.map(row => ({
              rowIndex: row.rowIndex,
              product_name: row.product_name,
              unit: row.unit,
              month: row.month,
              opening_stock: row.opening_stock,
              purchased: row.purchased,
              used: row.used,
              closing_stock: row.closing_stock,
            })),
          },
          { status: 400 }
        )
      }

      if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SERVICE_KEY && !process.env.SUPABASE_SECRET_KEY) {
        return NextResponse.json({ error: 'Server is not configured for Supabase writes' }, { status: 500 })
      }

      const resolved = await resolveBusinessId(user, filename)
      if ('error' in resolved) return resolved.error
      const businessId = resolved.businessId

      const rawInsert = await insertWithBusinessIdFallback(
        supabaseServer,
        'raw_imports',
        [
          {
            filename: filename || 'upload',
            data: rows,
          },
        ],
        businessId,
      )
      if (rawInsert.error) {
        return NextResponse.json({ error: rawInsert.error.message }, { status: 500 })
      }

      const inventoryRows = (rows as ImportedRow[])
      const itemNames = Array.from(new Set(inventoryRows
        .map((row) => normalizeString(row.product_name))
        .filter((name): name is string => Boolean(name))
      ))

      let existingItems: Array<{ id: number; name: string }> = []
      if (itemNames.length) {
        const { data } = await supabaseServer
          .from('inventory_items')
          .select('id,name')
          .eq('business_id', businessId)
          .in('name', itemNames)
        existingItems = data ?? []
      }

      const existingByName = new Map(existingItems.map((item) => [item.name, item.id]))
      const inserts: Array<Record<string, unknown>> = []
      const updates: Array<Record<string, unknown>> = []

      for (const row of inventoryRows) {
        const name = normalizeString(row.product_name)
        if (!name) continue

        const supplier = normalizeString(row.supplier)
        const reorder_point = normalizeNumber(row.reorder_point)
        const unit_cost = normalizeNumber(row.unit_cost)
        const stock = normalizeNumber(row.closing_stock ?? row.opening_stock) ?? 0

        if (existingByName.has(name)) {
          const updateRow: Record<string, unknown> = {
            id: existingByName.get(name),
            stock,
          }
          if (supplier !== null) updateRow.supplier = supplier
          if (reorder_point !== null) updateRow.reorder_point = reorder_point
          if (unit_cost !== null) updateRow.unit_cost = unit_cost

          updates.push(updateRow)
        } else {
          inserts.push({
            business_id: businessId,
            name,
            supplier,
            stock,
            reorder_point: reorder_point ?? 0,
            unit_cost: unit_cost ?? 0,
          })
        }
      }

      const inventoryWriteError = (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        if (message.includes('public.inventory_items') || message.includes('inventory_items') || message.includes('does not exist')) {
          return NextResponse.json(
            {
              message: 'Inventory raw upload accepted, but inventory persistence failed because the inventory_items table is not available in the database schema. Please create the table and then reprocess the import.',
              detail: message,
            },
            { status: 200 }
          )
        }
        return NextResponse.json({ error: message }, { status: 500 })
      }

      if (inserts.length) {
        try {
          const { error: insertError } = await supabaseServer.from('inventory_items').insert(inserts)
          if (insertError) {
            return inventoryWriteError(insertError)
          }
        } catch (error) {
          return inventoryWriteError(error)
        }
      }

      if (updates.length) {
        try {
          const { error: updateError } = await supabaseServer.from('inventory_items').upsert(updates, { onConflict: 'id' })
          if (updateError) {
            return inventoryWriteError(updateError)
          }
        } catch (error) {
          return inventoryWriteError(error)
        }
      }

      return NextResponse.json({ message: `Inventory imported (${inserts.length + updates.length} rows)` })
    }

    // Minimal expenses import support — stores raw expenses JSON for now
    if (mode === 'expenses') {
      const invalidRows = (rows as ImportedRow[]).map((row, index) => {
        const date = normalizeDate(row.date)
        const category = normalizeString(row.category)
        const amount = normalizeNumber(row.amount ?? row.price ?? row['Amount (PHP)'] ?? row['amount (php)'] ?? row['amount_php'])
        return {
          rowIndex: index + 1,
          date,
          category,
          amount,
          valid: Boolean(date && category && amount !== null),
        }
      }).filter(r => !r.valid)

      if (invalidRows.length) {
        return NextResponse.json(
          {
            error: 'Validation failed for one or more expense rows',
            invalidRows: invalidRows.map(r => ({ rowIndex: r.rowIndex, date: r.date, category: r.category, amount: r.amount })),
          },
          { status: 400 }
        )
      }

      if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SERVICE_KEY && !process.env.SUPABASE_SECRET_KEY) {
        return NextResponse.json({ error: 'Server is not configured for Supabase writes' }, { status: 500 })
      }

      const resolved = await resolveBusinessId(user, filename)
      if ('error' in resolved) return resolved.error
      const businessId = resolved.businessId

      const rawInsert = await insertWithBusinessIdFallback(
        supabaseServer,
        'raw_imports',
        [
          {
            filename: filename || 'upload',
            data: rows,
          },
        ],
        businessId,
      )
      if (rawInsert.error) {
        return NextResponse.json({ error: rawInsert.error.message }, { status: 500 })
      }

      return NextResponse.json({ message: `Expenses upload accepted (${(rows as ImportedRow[]).length} rows)` })
    }

    const mapped: MappedRowWithIndex[] = (rows as ImportedRow[]).map((row, index) => {
  const normalizedDate = normalizeDate(row.date)

  console.log('DATE DEBUG:', {
    original: row.date,
    originalType: typeof row.date,
    isDateObject: row.date instanceof Date,
    normalized: normalizedDate,
  })

      // Prefer explicit time_of_day field from the uploader; fall back to common header aliases
      const timeSource =
        row.time_of_day ??
        row['Time of Day'] ??
        row['time of day'] ??
        row.Time ??
        row.time ??
        null
      const { time_of_day, hour } = parseTimeOfDay(timeSource)

      return {
        date: normalizeDate(row.date),
        service_name: normalizeString(row.service_name) ?? '',
        quantity: normalizeNumber(row.quantity),
        revenue: normalizeNumber(row.revenue),
        category: normalizeString(row.category),
        price: normalizeNumber(row.price),
        notes: normalizeString(row.notes),
        business_name: normalizeString(row.business_name),
        time_of_day,
        hour,
        raw: row,
        rowIndex: index,
      }
    })

    const invalidRows = mapped.filter(row => !row.date || !row.service_name || row.quantity === null || row.revenue === null)

    if (invalidRows.length) {
      return NextResponse.json(
        {
          error: 'Validation failed for one or more rows',
          invalidRows: invalidRows.map(row => ({
            rowIndex: row.rowIndex + 1,
            date: row.date,
            service_name: row.service_name,
            quantity: row.quantity,
            revenue: row.revenue,
          })),
        },
        { status: 400 }
      )
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SERVICE_KEY && !process.env.SUPABASE_SECRET_KEY) {
      return NextResponse.json({ error: 'Server is not configured for Supabase writes' }, { status: 500 })
    }

    const resolved = await resolveBusinessId(user, filename)
    if ('error' in resolved) return resolved.error
    const businessId = resolved.businessId

    const rawInsert = await insertWithBusinessIdFallback(
      supabaseServer,
      'raw_imports',
      [
        {
          filename: filename || 'upload',
          data: mapped.map(({ rowIndex, ...rest }) => {
            void rowIndex
            return rest
          }),
        },
      ],
      businessId,
    )
    if (rawInsert.error) {
      return NextResponse.json({ error: rawInsert.error.message }, { status: 500 })
    }

    const serviceNames = Array.from(new Set(mapped.map(r => r.service_name)))
    const serviceCategories: Record<string, string | null> = {}
    const servicePrices: Record<string, number | null> = {}
    for (const row of mapped) {
      if (!serviceCategories[row.service_name] && row.category) serviceCategories[row.service_name] = row.category
      if (!servicePrices[row.service_name] && row.price !== null) servicePrices[row.service_name] = row.price
    }

    const { data: existingServices } = await supabaseServer
      .from('services')
      .select('id,name')
      .eq('business_id', businessId)
      .in('name', serviceNames)

    const serviceNameToId: Record<string, number> = {}
    if (existingServices && Array.isArray(existingServices)) {
      for (const service of existingServices) {
        if (service?.name && service?.id) {
          serviceNameToId[service.name] = service.id
        }
      }
    }

    const missingServices = serviceNames.filter(name => !serviceNameToId[name])
    if (missingServices.length) {
      const inserts = missingServices.map(name => ({
        business_id: businessId,
        name,
        category: serviceCategories[name] || null,
        price: servicePrices[name] || null,
      }))
      const { data: insertedServices, error: insertError } = await supabaseServer
        .from('services')
        .insert(inserts)
        .select('id,name')
      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 })
      }
      if (insertedServices) {
        for (const service of insertedServices) {
          if (service?.name && service?.id) {
            serviceNameToId[service.name] = service.id
          }
        }
      }
    }

    const seen = new Set<string>()
    const ops: Array<{
      business_id: string
      service_id: number
      date: string
      quantity: number | null
      revenue: number | null
      time_of_day: string | null
      hour: number | null
    }> = []
    let duplicateCount = 0
    let rowsWithHour = 0
    for (const row of mapped) {
      const service_id = serviceNameToId[row.service_name]
      if (!service_id) continue
      // Include hour in dedupe key so same service/qty/revenue at different times stay distinct
      const key = `${row.date}|${row.service_name}|${row.quantity}|${row.revenue}|${row.hour ?? ''}|${row.time_of_day ?? ''}`
      if (seen.has(key)) {
        duplicateCount += 1
        continue
      }
      seen.add(key)
      if (row.hour !== null) rowsWithHour += 1
      ops.push({
        business_id: businessId,
        service_id,
        date: row.date!,
        quantity: row.quantity,
        revenue: row.revenue,
        time_of_day: row.time_of_day,
        hour: row.hour,
      })
    }

    if (!ops.length) {
      return NextResponse.json({ message: `No valid operations were created from the upload`, count: mapped.length }, { status: 200 })
    }

    const { error: clearError } = await supabaseServer.from('daily_operations').delete().eq('business_id', businessId)
    if (clearError) {
      return NextResponse.json({ error: clearError.message }, { status: 500 })
    }

    const { error: opsError } = await supabaseServer.from('daily_operations').insert(ops)
    if (opsError) {
      return NextResponse.json({ error: opsError.message }, { status: 500 })
    }

    revalidateDashboardTag(`dashboard-data-${businessId}`)
    // Also invalidate ARIA context so staffing answers pick up the new hour data immediately
    try {
      revalidateDashboardTag('aria-context')
    } catch {
      // tag may not exist yet in older Next caches — ignore
    }

    const hourCoverage =
      ops.length > 0 ? Math.round((rowsWithHour / ops.length) * 1000) / 10 : 0

    return NextResponse.json({
      message: `Imported ${ops.length} operations${duplicateCount ? `, skipped ${duplicateCount} duplicate row(s)` : ''}${
        rowsWithHour > 0
          ? ` · time-of-day captured on ${rowsWithHour} rows (${hourCoverage}% hour coverage)`
          : ' · no usable time-of-day values found (map the Time of Day column and re-import if needed)'
      }`,
      timeOfDay: {
        rowsWithHour,
        totalOps: ops.length,
        fillRate: hourCoverage / 100,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}