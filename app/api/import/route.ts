import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { randomUUID } from 'crypto'
import supabaseServer from '../../../src/lib/supabaseServer'
import { createSupabaseRouteClient } from '../../../src/lib/supabaseRoute'

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

function normalizeDate(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null

  if (typeof value === 'number' || (!isNaN(Number(value)) && String(value).trim() !== '')) {
    const serial = Number(value)
    if (Number.isFinite(serial)) {
      const offset = serial > 59 ? serial - 1 : serial
      const ms = (offset - 25569) * 86400000
      const date = new Date(ms)
      if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10)
    }
  }

  const parsed = new Date(String(value))
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

// Resolves the business that belongs to the current user.
// Each account has exactly one business (created at signup) — imports
// always attach to that business. A "business_name" column in the
// spreadsheet, if present, is informational only and is NOT used to
// look up or create a different business row. Matching by name previously
// caused duplicate business rows per user whenever the sheet's name didn't
// exactly match the one entered at signup.
async function resolveBusinessId(
  ownerId: string,
  filename: string | undefined
): Promise<{ businessId: string } | { error: NextResponse }> {
  const { data: businessData } = await supabaseServer
    .from('businesses')
    .select('id')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: true })
    .limit(1)

  if (businessData && businessData[0]?.id) {
    return { businessId: businessData[0].id }
  }

  // Fallback: user somehow has no business row yet. Create a minimal one
  // so the import doesn't fail outright.
  const businessIdCandidate = randomUUID()
  const insertBusiness = await supabaseServer
    .from('businesses')
    .insert({ id: businessIdCandidate, name: filename ?? 'My business', owner_id: ownerId })
    .select('id')

  if (insertBusiness.error || !insertBusiness.data || insertBusiness.data.length === 0) {
    return {
      error: NextResponse.json(
        { error: insertBusiness.error?.message ?? 'Failed to create a business record for this import.' },
        { status: 500 }
      ),
    }
  }

  return { businessId: insertBusiness.data[0].id }
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

      if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SERVICE_KEY) {
        return NextResponse.json({ error: 'Server is not configured for Supabase writes' }, { status: 500 })
      }

      const resolved = await resolveBusinessId(user.id, filename)
      if ('error' in resolved) return resolved.error
      const businessId = resolved.businessId

      const rawInsert = await supabaseServer.from('raw_imports').insert([
        {
          filename: filename || 'upload',
          data: rows,
          business_id: businessId,
        },
      ])
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
          updates.push({
            id: existingByName.get(name),
            supplier,
            stock,
            reorder_point,
            unit_cost,
          })
        } else {
          inserts.push({
            business_id: businessId,
            name,
            supplier,
            stock,
            reorder_point,
            unit_cost,
          })
        }
      }

      const inventoryWriteError = (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        if (message.includes('public.inventory_items') || message.includes('inventory_items')) {
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
        const { error: insertError } = await supabaseServer.from('inventory_items').insert(inserts)
        if (insertError) {
          return inventoryWriteError(insertError)
        }
      }

      if (updates.length) {
        const { error: updateError } = await supabaseServer.from('inventory_items').upsert(updates, { onConflict: 'id' })
        if (updateError) {
          return inventoryWriteError(updateError)
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

      if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SERVICE_KEY) {
        return NextResponse.json({ error: 'Server is not configured for Supabase writes' }, { status: 500 })
      }

      const resolved = await resolveBusinessId(user.id, filename)
      if ('error' in resolved) return resolved.error
      const businessId = resolved.businessId

      const rawInsert = await supabaseServer.from('raw_imports').insert([
        {
          filename: filename || 'upload',
          data: rows,
          business_id: businessId,
        },
      ])
      if (rawInsert.error) {
        return NextResponse.json({ error: rawInsert.error.message }, { status: 500 })
      }

      return NextResponse.json({ message: `Expenses upload accepted (${(rows as ImportedRow[]).length} rows)` })
    }

    const mapped: MappedRowWithIndex[] = (rows as ImportedRow[]).map((row, index) => ({
      date: normalizeDate(row.date),
      service_name: normalizeString(row.service_name) ?? '',
      quantity: normalizeNumber(row.quantity),
      revenue: normalizeNumber(row.revenue),
      category: normalizeString(row.category),
      price: normalizeNumber(row.price),
      notes: normalizeString(row.notes),
      business_name: normalizeString(row.business_name),
      raw: row,
      rowIndex: index,
    }))

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

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SERVICE_KEY) {
      return NextResponse.json({ error: 'Server is not configured for Supabase writes' }, { status: 500 })
    }

    const resolved = await resolveBusinessId(user.id, filename)
    if ('error' in resolved) return resolved.error
    const businessId = resolved.businessId

    const rawInsert = await supabaseServer.from('raw_imports').insert([
      {
        filename: filename || 'upload',
        data: mapped.map(({ rowIndex, ...rest }) => {
          void rowIndex
          return rest
        }),
        business_id: businessId,
      },
    ])
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
    const ops: Array<{ business_id: string; service_id: number; date: string; quantity: number | null; revenue: number | null }> = []
    let duplicateCount = 0
    for (const row of mapped) {
      const service_id = serviceNameToId[row.service_name]
      if (!service_id) continue
      const key = `${row.date}|${row.service_name}|${row.quantity}|${row.revenue}`
      if (seen.has(key)) {
        duplicateCount += 1
        continue
      }
      seen.add(key)
      ops.push({ business_id: businessId, service_id, date: row.date!, quantity: row.quantity, revenue: row.revenue })
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

    return NextResponse.json({ message: `Imported ${ops.length} operations${duplicateCount ? `, skipped ${duplicateCount} duplicate row(s)` : ''}` })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}