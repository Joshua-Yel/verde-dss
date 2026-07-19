import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { supabaseServer } from '@/src/lib/supabaseServer'
import { forecastSeriesForModel, type ForecastModel } from '../forecast/wma'
import { bucketKeyForDate, resolveDateRange, type PeriodGranularity } from '@/lib/dateRange'

interface ServiceRow {
  id: number
  name: string
  category: string
  price: number
}

interface InventoryRow {
  name: string
  supplier: string | null
  stock: number | null
  reorder_point: number | null
  unit_cost: number | null
  status?: string | null
  month?: string | null
  used?: number | null
  closing_stock?: number | null
  opening_stock?: number | null
  purchased?: number | null
}

interface OperationRow {
  date: string
  quantity: number | null
  revenue: number | null
  service_id: number | null
}

function normalizeString(value: unknown): string | null {
  if (value === undefined || value === null) return null
  const str = String(value).trim()
  return str === '' ? null : str
}

function normalizeNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const cleaned = String(value).replace(/[₱,$]/g, '').replace(/,/g, '').trim()
  if (!cleaned) return null
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

// Groups rows by cheap bucket key (see dateRange.ts) instead of formatting
// a display label per row. `keys` is DateRangeSummary.keys — parallel to
// the display `labels` array, so the returned series lines up with labels
// in the same order without re-deriving anything.
function buildSeriesFromBuckets(rows: Array<{ date: string; value: number }>, keys: string[], granularity: PeriodGranularity) {
  const bucketMap = new Map<string, number>()
  for (const row of rows) {
    const key = bucketKeyForDate(row.date, granularity)
    if (!key) continue
    const current = bucketMap.get(key) ?? 0
    bucketMap.set(key, current + row.value)
  }
  return keys.map((key) => bucketMap.get(key) ?? 0)
}

function buildSeriesFromOperations(rows: OperationRow[], keys: string[], granularity: PeriodGranularity) {
  return buildSeriesFromBuckets(
    rows
      .filter((row) => row.date)
      .map((row) => ({ date: row.date, value: Number(row.revenue ?? 0) })),
    keys,
    granularity
  )
}

function getDaysInMonth(month: string | null | undefined) {
  if (!month) return 30
  const [year, mon] = month.split('-').map((value) => Number(value))
  if (!year || !mon) return 30
  return new Date(year, mon, 0).getDate()
}

function calculateMape(values: number[], model: ForecastModel, window = 3) {
  if (values.length < 2) return 0

  const errors: number[] = []
  for (let index = 1; index < values.length; index += 1) {
    const history = values.slice(0, index)
    const prediction = predictNextValue(history, model, Math.min(window, history.length))
    const actual = values[index]
    if (actual > 0) {
      errors.push(Math.abs((actual - prediction) / actual) * 100)
    }
  }

  if (errors.length === 0) return 0
  return errors.reduce((sum, error) => sum + error, 0) / errors.length
}

function predictNextValue(values: number[], model: ForecastModel, window = 3) {
  if (values.length === 0) return 0
  const history = values.slice(-Math.max(1, Math.min(window, values.length)))

  if (model === 'naive') {
    return history[history.length - 1] ?? 0
  }

  if (model === 'sma') {
    return history.reduce((sum, value) => sum + value, 0) / history.length
  }

  return history.reduce((sum, value, index) => sum + value * (index + 1), 0) / history.reduce((sum, _value, index) => sum + (index + 1), 0)
}

type RawRow = Record<string, unknown>

interface DashboardDataOptions {
  businessId?: string | null
  client?: typeof supabaseServer
  displayRange?: '1y' | '2y' | 'all'
  lookbackMonths?: number
}

// Fetches every raw_imports payload for a business ONCE. Previously each
// caller (inventory matching, expense matching) ran its own full query
// against raw_imports — same table, same rows, fetched twice over the
// wire. Matching against the different candidate-key sets now happens
// in-memory against this single fetched result.
async function fetchRawImportPayloads(client: typeof supabaseServer, businessId: string | null): Promise<RawRow[][]> {
  if (!businessId) return []
  const { data } = await client
    .from('raw_imports')
    .select('data')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .range(0, 9999)

  if (!data) return []

  return data
    .map((importPayload) => (Array.isArray(importPayload?.data) ? (importPayload.data as RawRow[]) : null))
    .filter((rows): rows is RawRow[] => rows !== null)
}

// Pure, in-memory — no network. Walks import payloads (newest first) and
// returns the rows of the first payload whose keys match any candidate.
function findMatchingRows(importPayloads: RawRow[][], candidateKeys: string[]): RawRow[] {
  for (const rows of importPayloads) {
    const matchingRows: RawRow[] = []
    for (const row of rows) {
      const isCandidate = candidateKeys.some((candidate) =>
        Object.keys(row ?? {}).some((key) => key.toLowerCase().includes(candidate.toLowerCase()))
      )
      if (isCandidate) matchingRows.push(row)
    }
    if (matchingRows.length > 0) return matchingRows
  }
  return []
}

async function resolveBusinessId(client: typeof supabaseServer, userId: string | null | undefined) {
  if (!userId) return null

  const { data: businesses } = await client
    .from('businesses')
    .select('id')
    .eq('owner_id', userId)
    .limit(1)

  return businesses?.[0]?.id ?? null
}

const getDashboardDataForUser = async (userId: string, options?: DashboardDataOptions) => {
  const client = options?.client ?? supabaseServer

  if (!userId && !options?.businessId) {
    throw new Error('getSupabaseDashboardData requires a userId or businessId — refusing to load unscoped data.')
  }

  if (!client || typeof client.from !== 'function') {
    return {
      months: [],
      periodLabels: [],
      revenueSeries: [],
      expenseSeries: [],
      netIncomeSeries: [],
      inventoryItems: [],
      kpis: {
        projectedRevenue: 0,
        projectedPct: 0,
        topService: { name: 'No data', bookings: 0, category: 'General' },
        reorderAlerts: 0,
        modelFit: '0%',
      },
      topServices: [],
      restockList: [],
      serviceForecasts: [],
      dailyLog: [],
      expenseBreakdown: [],
      forecastMethodUsed: 'WMA',
      confidenceBand: null,
      dataAvailability: {
        timeOfDayFillRate: 0,
        inventoryHasReorderPoints: false,
        inventoryHasUnitCost: false,
        dateRangeMonths: 0,
        expenseCategoriesTracked: [],
      },
    }
  }

  const businessId = options?.businessId ?? await resolveBusinessId(client, userId)
  const lookbackMonths = options?.lookbackMonths ?? null
  const displayRange = options?.displayRange ?? 'all'

  // Computed up-front so it can be pushed into the daily_operations query
  // itself (see below), instead of being applied only after fetching every
  // row for the full history. This is what actually makes "Last year" /
  // "Last 2 years" cheaper than "All records" — previously all three
  // fetched the same full dataset and only differed in a JS-side slice at
  // the very end.
  const cutoffDate = typeof lookbackMonths === 'number' && lookbackMonths > 0 ? new Date() : null
  if (cutoffDate && typeof lookbackMonths === 'number') {
    cutoffDate.setMonth(cutoffDate.getMonth() - lookbackMonths)
  }
  const cutoffDateISO = cutoffDate ? cutoffDate.toISOString().slice(0, 10) : null

  let services: ServiceRow[] = []
  let inventory: InventoryRow[] = []
  let operations: OperationRow[] = []

  if (businessId) {
    const inventoryQuery = client
      .from('inventory_items')
      .select('name,supplier,stock,reorder_point,unit_cost')
      .eq('business_id', businessId)
      .order('name')
      .range(0, 9999)
    const serviceQuery = client
      .from('services')
      .select('id,name,category,price')
      .eq('business_id', businessId)
      .order('name')
      .range(0, 9999)

    let operationQueryBuilder = client
      .from('daily_operations')
      .select('date,quantity,revenue,service_id')
      .eq('business_id', businessId)

    if (cutoffDateISO) {
      operationQueryBuilder = operationQueryBuilder.gte('date', cutoffDateISO)
    }

    const operationQuery = operationQueryBuilder.order('date').range(0, 9999)

    const [{ data: serviceRows }, inventoryResult, { data: operationRows }] = await Promise.all([
      serviceQuery,
      inventoryQuery,
      operationQuery,
    ])

    services = (serviceRows ?? []) as unknown as ServiceRow[]
    operations = (operationRows ?? []) as unknown as OperationRow[]

    if (inventoryResult && 'data' in inventoryResult) {
      inventory = (inventoryResult.data ?? []) as unknown as InventoryRow[]
    }
  }

  const rawImportPayloads = await fetchRawImportPayloads(client, businessId)
  const rawInventoryRows = findMatchingRows(rawImportPayloads, ['product_name', 'product', 'closing_stock', 'opening_stock', 'used'])
  const rawExpenseRows = findMatchingRows(rawImportPayloads, ['amount', 'category'])

  const inventoryFromRaw = rawInventoryRows
    .map((row: RawRow) => {
      const name = normalizeString(row?.product_name ?? row?.['Product Name'] ?? row?.product ?? row?.name)
      if (!name) return null
      const month = normalizeString(row?.month ?? row?.['Month'])
      const opening_stock = normalizeNumber(row?.opening_stock ?? row?.['Opening Stock'] ?? row?.opening)
      const purchased = normalizeNumber(row?.purchased ?? row?.['Purchased'] ?? row?.purchase)
      const used = normalizeNumber(row?.used ?? row?.['Used'] ?? row?.consumed)
      const closing_stock = normalizeNumber(row?.closing_stock ?? row?.['Closing Stock'] ?? row?.closing)
      const status = normalizeString(row?.status ?? row?.['Status'])
      const supplier = normalizeString(row?.supplier ?? row?.['Supplier'])
      const reorder_point = normalizeNumber(row?.reorder_point ?? row?.['Reorder Point'] ?? row?.rp)
      const unit_cost = normalizeNumber(row?.unit_cost ?? row?.['Unit Cost'] ?? row?.cost)
      return {
        name,
        month,
        opening_stock: opening_stock ?? 0,
        purchased: purchased ?? 0,
        used: used ?? 0,
        closing_stock: closing_stock ?? 0,
        supplier: supplier ?? '',
        reorder_point: reorder_point ?? 0,
        unit_cost: unit_cost ?? 0,
        status,
      } as InventoryRow
    })
    .filter((item): item is InventoryRow => item !== null)

  if (inventoryFromRaw.length > 0) {
    inventory = inventoryFromRaw.map((item) => ({
      ...item,
      stock: item.closing_stock ?? 0,
      reorder_point: item.reorder_point ?? 0,
      unit_cost: item.unit_cost ?? 0,
      supplier: item.supplier ?? '',
    })) as InventoryRow[]
  }

  const expenseRows = rawExpenseRows
    .map((row: RawRow) => {
      const date = normalizeString(row?.date ?? row?.['Date'])
      const category = normalizeString(row?.category ?? row?.['Category'])
      const amount = normalizeNumber(
        row?.amount ??
        row?.['Amount (PHP)'] ??
        row?.['Amount'] ??
        row?.['amount (php)'] ??
        row?.price ??
        row?.['Price'] ??
        row?.['price']
      )
      if (!date || !category || amount === null) return null
      const rowDate = new Date(date)
      if (cutoffDate && Number.isNaN(rowDate.getTime())) return null
      if (cutoffDate && rowDate < cutoffDate) return null
      return { date, category, amount }
    })
    .filter((row): row is { date: string; category: string; amount: number } => Boolean(row))

  const serviceMap = new Map<number, ServiceRow>(services.map((service) => [service.id, service]))
  const dates = operations.map((row) => row.date).concat(expenseRows.map((row) => row.date))
  const range = resolveDateRange(dates)
  const granularity = range.granularity
  const labels = range.labels
  const bucketKeys = range.keys
  const revenueSeries = buildSeriesFromOperations(operations, bucketKeys, granularity)
  const expenseSeries = expenseRows.length > 0
    ? buildSeriesFromBuckets(expenseRows.map((row) => ({ date: row.date, value: row.amount })), bucketKeys, granularity)
    : labels.map(() => 0)

  const netIncomeSeries = revenueSeries.map((value, index) => value - (expenseSeries[index] ?? 0))
  const visibleWindow = displayRange === '1y' ? 12 : displayRange === '2y' ? 24 : null
  const visibleLabels = visibleWindow ? labels.slice(-visibleWindow) : labels
  const visibleRevenueSeries = visibleWindow ? revenueSeries.slice(-visibleWindow) : revenueSeries
  const visibleExpenseSeries = visibleWindow ? expenseSeries.slice(-visibleWindow) : expenseSeries
  const visibleNetIncomeSeries = visibleWindow ? netIncomeSeries.slice(-visibleWindow) : netIncomeSeries

  const serviceSeries = new Map<number, number[]>()
  const serviceTotals = new Map<number, Map<string, number>>()

  for (const row of operations) {
    const key = bucketKeyForDate(row.date, granularity)
    if (!key || !row.service_id) continue
    if (!serviceTotals.has(row.service_id)) {
      serviceTotals.set(row.service_id, new Map())
    }
    const totals = serviceTotals.get(row.service_id)!
    totals.set(key, (totals.get(key) ?? 0) + Number(row.quantity ?? 0))
  }

  for (const service of services) {
    const totals = serviceTotals.get(service.id) ?? new Map<string, number>()
    serviceSeries.set(service.id, bucketKeys.map((key) => totals.get(key) ?? 0))
  }

  const visibleServiceSeries = new Map<number, number[]>()
  for (const [serviceId, actuals] of serviceSeries.entries()) {
    visibleServiceSeries.set(serviceId, visibleWindow ? actuals.slice(-visibleWindow) : actuals)
  }

  const visibleOperations = visibleWindow
    ? operations.filter((row) => {
        const rowDate = new Date(row.date)
        if (Number.isNaN(rowDate.getTime())) return false
        const cutoff = new Date()
        cutoff.setMonth(cutoff.getMonth() - visibleWindow)
        return rowDate >= cutoff
      })
    : operations

  const visibleExpenseRows = visibleWindow
    ? expenseRows.filter((row) => {
        const rowDate = new Date(row.date)
        if (Number.isNaN(rowDate.getTime())) return false
        const cutoff = new Date()
        cutoff.setMonth(cutoff.getMonth() - visibleWindow)
        return rowDate >= cutoff
      })
    : expenseRows

  const serviceForecasts = services.map((service) => {
    const actuals = serviceSeries.get(service.id) ?? []
    const visibleActuals = visibleServiceSeries.get(service.id) ?? []
    const forecastValuesByModel: Record<ForecastModel, number[]> = {
      wma: forecastSeriesForModel(actuals, 3, Math.min(3, actuals.length), 'wma'),
      sma: forecastSeriesForModel(actuals, 3, Math.min(3, actuals.length), 'sma'),
      naive: forecastSeriesForModel(actuals, 3, Math.min(3, actuals.length), 'naive'),
    }
    const lastActual = visibleActuals[visibleActuals.length - 1] ?? actuals[actuals.length - 1] ?? 0
    const mapeByModel = Object.fromEntries(
      (Object.entries(forecastValuesByModel) as Array<[ForecastModel, number[]]>).map(([model]) => [model, `${calculateMape(actuals, model, Math.min(3, actuals.length)).toFixed(1)}%`])
    ) as Record<ForecastModel, string>
    const forecastRevenueByModel = Object.fromEntries(
      (Object.entries(forecastValuesByModel) as Array<[ForecastModel, number[]]>).map(([model, values]) => [model, Number(service.price ?? 0) * (values[0] ?? 0)])
    ) as Record<ForecastModel, number>
    return {
      service: service.name,
      category: service.category,
      actuals,
      forecasts: forecastValuesByModel.wma,
      forecastsByModel: forecastValuesByModel,
      mape: mapeByModel.wma,
      mapeByModel,
      bookings: lastActual,
      price: service.price,
      forecastRevenue: forecastRevenueByModel.wma,
      forecastRevenueByModel,
      forecastMethodUsed: actuals.length >= 3 ? 'WMA (3-point)' : 'WMA (available history)',
    }
  })

  const forecastNext = forecastSeriesForModel(revenueSeries, 1, Math.min(3, revenueSeries.length), 'wma')[0] ?? 0
  const lastRevenue = revenueSeries[revenueSeries.length - 1] ?? 0
  const projectedPct = lastRevenue > 0 ? ((forecastNext - lastRevenue) / lastRevenue) * 100 : 0

  const topService = serviceForecasts
    .slice()
    .sort((left, right) => (right.bookings ?? 0) - (left.bookings ?? 0))[0] ?? {
      service: 'No data',
      category: 'General',
      bookings: 0,
    }

  const topServices = serviceForecasts
    .slice()
    .sort((left, right) => (right.bookings ?? 0) - (left.bookings ?? 0))
    .slice(0, 5)
    .map((service) => ({
      name: service.service,
      category: service.category,
      bookings: service.bookings,
    }))

  const inventoryItems = inventory
    .map((item) => {
      const latestStock = item.stock ?? 0
      const used = item.used ?? 0
      const monthDays = getDaysInMonth(item.month)
      const consumptionRate = monthDays > 0 ? used / monthDays : 0
      const daysOfCover = consumptionRate > 0 ? latestStock / consumptionRate : Number.POSITIVE_INFINITY
      const criticalDays = 14
      const status = daysOfCover < criticalDays ? 'Critical' : daysOfCover < 30 ? 'Low' : 'Healthy'
      const statusNote = item.status ? `Marked ${item.status}` : null
      const reorderQuantity = Math.max(0, Math.round((60 * Math.max(consumptionRate, 1)) - latestStock))
      const unitCost = item.unit_cost ?? 0
      return {
        name: item.name,
        supplier: item.supplier ?? '',
        stock: latestStock,
        reorderPoint: item.reorder_point ?? 0,
        unitCost: unitCost,
        consumptionRate,
        daysOfCover,
        status,
        statusNote,
        reorderQuantity,
        month: item.month,
      }
    })
    .sort((left, right) => left.name.localeCompare(right.name))

  const restockList = inventoryItems
    .map((item) => ({
      name: item.name,
      stock: item.stock,
      rp: item.reorderPoint,
      days: Number.isFinite(item.daysOfCover) ? Math.max(1, Math.round(item.daysOfCover)) : 999,
      supplier: item.supplier,
      status: item.status,
      unitCost: item.unitCost,
      reorderQuantity: item.reorderQuantity,
    }))
    .sort((left, right) => left.stock - right.stock)

  const categorySeries = new Map<string, Map<string, number>>()
  for (const row of expenseRows) {
    const key = bucketKeyForDate(row.date, granularity)
    if (!key) continue
    const bucketMap = categorySeries.get(row.category) ?? new Map<string, number>()
    bucketMap.set(key, (bucketMap.get(key) ?? 0) + row.amount)
    categorySeries.set(row.category, bucketMap)
  }

  const expenseCategorySeries = Object.fromEntries(
    Array.from(categorySeries.entries()).map(([category, bucketMap]) => [
      category,
      bucketKeys.map((key) => bucketMap.get(key) ?? 0),
    ])
  )

  const expenseBreakdown = Array.from(
    visibleExpenseRows.reduce((map, row) => {
      const existing = map.get(row.category) ?? { category: row.category, total: 0, latestAmount: 0 }
      existing.total += row.amount
      existing.latestAmount = row.amount
      map.set(row.category, existing)
      return map
    }, new Map<string, { category: string; total: number; latestAmount: number }>()).values()
  ).sort((left, right) => right.total - left.total)

  const totalRevenue = visibleRevenueSeries.reduce((sum, value) => sum + value, 0)
  const totalExpenses = visibleExpenseSeries.reduce((sum, value) => sum + value, 0)
  const totalSessions = visibleOperations.reduce((sum, row) => sum + Number(row.quantity ?? (row.revenue ? 1 : 0)), 0)
  const activeDays = new Set(visibleOperations.map((row) => row.date)).size || Math.max(1, visibleRevenueSeries.length)
  const avgDailyRevenue = totalRevenue / activeDays
  const totalNetIncome = totalRevenue - totalExpenses

  const confidenceBand = {
    revenue: Math.max(1000, Math.round((revenueSeries[revenueSeries.length - 1] ?? 0) * 0.12)),
    expense: Math.max(800, Math.round((expenseSeries[expenseSeries.length - 1] ?? 0) * 0.1)),
  }


  const dailyLog = visibleOperations
    .map((op) => {
      const day = new Date(op.date).toLocaleDateString('en-US', { weekday: 'long' })
      const expenses = Math.round(Number(op.revenue ?? 0) * 0.38)
      const net = Number(op.revenue ?? 0) - expenses
      const service = op.service_id !== null ? serviceMap.get(op.service_id) : undefined
      return {
        date: op.date,
        day,
        sessions: op.quantity,
        revenue: op.revenue,
        expenses,
        net,
        topService: service?.name ?? 'N/A',
      }
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  // Previously re-filtered dailyLog against visibleWindow a second time
  // here. dailyLog is already derived from visibleOperations (already
  // scoped to the window above), so the second pass was redundant work
  // that could never change the result — removed.

  return {
    months: visibleLabels,
    periodLabels: visibleLabels,
    revenueSeries: visibleRevenueSeries,
    expenseSeries: visibleExpenseSeries,
    netIncomeSeries: visibleNetIncomeSeries,
    inventoryItems,
    kpis: {
      projectedRevenue: Math.round(forecastNext),
      projectedPct: Math.round(projectedPct * 10) / 10,
      totalSessions,
      totalRevenue,
      avgDailyRevenue: Math.round(avgDailyRevenue),
      totalNetIncome,
      topService: {
        name: topService.service,
        bookings: topService.bookings,
        category: topService.category,
      },
      reorderAlerts: inventoryItems.filter((item) => item.status === 'Critical').length,
      modelFit: `${serviceForecasts.length > 0 ? Math.round(serviceForecasts.reduce((sum, item) => sum + parseFloat(item.mape), 0) / serviceForecasts.length) : 0}%`,
    },
    topServices,
    restockList,
    serviceForecasts,
    dailyLog,
    expenseBreakdown,
    expenseCategorySeries,
    forecastMethodUsed: 'WMA',
    confidenceBand,
    dataAvailability: {
      timeOfDayFillRate: 0,
      inventoryHasReorderPoints: inventoryItems.some((item) => item.reorderPoint > 0),
      inventoryHasUnitCost: inventoryItems.some((item) => item.unitCost > 0),
      dateRangeMonths: Math.max(1, Math.round(labels.length / 4)),
      expenseCategoriesTracked: expenseBreakdown.map((item) => item.category),
    },
  }
}

function buildDashboardDataTag(userId?: string | null, businessId?: string | null) {
  return `dashboard-data-${businessId ?? userId ?? 'anonymous'}`
}

// React's cache() gives genuine single-flight de-duplication *within one
// request/render pass*: when several Suspense boundaries on the overview
// page each call getSupabaseDashboardData with the same (userId,
// businessId, lookbackMonths, displayRange), only one of them actually
// runs the underlying fetch — the rest reuse that same in-flight/settled
// promise. This only works reliably because the wrapped function's args
// are primitives (string/number/null), not a fresh options object per
// call site — cache() compares args by value, and a new object literal
// each call would never match another.
//
// unstable_cache still sits underneath this for cross-request caching
// (60s revalidate, tag-based invalidation) — the two are complementary,
// not redundant: cache() dedupes concurrent calls in one render,
// unstable_cache persists the result across separate requests.
const getDashboardDataCached = cache(
  async (
    userId: string,
    businessId: string | null,
    lookbackMonths: number | null,
    displayRange: DashboardDataOptions['displayRange']
  ) => {
    const cacheKey = ['dashboard-data-v2', userId || businessId || 'anonymous', String(lookbackMonths ?? 12), displayRange ?? 'all']
    const cached = unstable_cache(
      (uid: string, opts?: DashboardDataOptions) => getDashboardDataForUser(uid, opts),
      cacheKey,
      {
        revalidate: 60,
        tags: [buildDashboardDataTag(userId, businessId)],
      }
    )
    return cached(userId, { businessId: businessId ?? undefined, lookbackMonths: lookbackMonths ?? undefined, displayRange })
  }
)

export function getSupabaseDashboardData(userId: string, options?: DashboardDataOptions) {
  if (options?.client) {
    // A custom client (tests/scripts) bypasses both cache layers — those
    // callers want a direct, uncached read against whatever client they
    // passed in, same as before.
    return getDashboardDataForUser(userId, options)
  }
  return getDashboardDataCached(userId, options?.businessId ?? null, options?.lookbackMonths ?? null, options?.displayRange ?? 'all')
}

export async function getWeekdayPatterns(userId: string, options?: DashboardDataOptions) {
  const data = await getSupabaseDashboardData(userId, options)
  const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const rows = data.dailyLog ?? []
  const totals = new Map<string, { revenue: number; sessions: number }>()
  for (const row of rows) {
    const date = row.date as string | undefined
    if (!date) continue
    const dayName = new Date(date).toLocaleDateString('en-US', { weekday: 'long' })
    const payload = totals.get(dayName) ?? { revenue: 0, sessions: 0 }
    payload.revenue += Number(row.revenue ?? 0)
    payload.sessions += Number(row.sessions ?? 0)
    totals.set(dayName, payload)
  }
  return weekdayNames.map((day) => ({
    day,
    revenue: totals.get(day)?.revenue ?? 0,
    sessions: totals.get(day)?.sessions ?? 0,
  }))
}

export async function getServiceByWeekday(userId: string, options?: DashboardDataOptions) {
  const data = await getSupabaseDashboardData(userId, options)
  const rows = data.dailyLog ?? []
  const byDay = new Map<string, Map<string, { revenue: number; sessions: number }>>()
  for (const row of rows) {
    const date = row.date as string | undefined
    const dayName = date ? new Date(date).toLocaleDateString('en-US', { weekday: 'long' }) : 'Unknown'
    const serviceName = String(row.topService ?? 'Unknown')
    const bucket = byDay.get(dayName) ?? new Map<string, { revenue: number; sessions: number }>()
    const payload = bucket.get(serviceName) ?? { revenue: 0, sessions: 0 }
    payload.revenue += Number(row.revenue ?? 0)
    payload.sessions += Number(row.sessions ?? 0)
    bucket.set(serviceName, payload)
    byDay.set(dayName, bucket)
  }
  return Array.from(byDay.entries()).map(([day, services]) => ({ day, services: Array.from(services.entries()).map(([name, values]) => ({ name, ...values })) }))
}

export async function getExpenseCategoryBreakdown(userId: string, options?: DashboardDataOptions) {
  const data = await getSupabaseDashboardData(userId, options)
  return data.expenseBreakdown ?? []
}

export async function getInventoryConsumptionSignal(userId: string, options?: DashboardDataOptions) {
  const data = await getSupabaseDashboardData(userId, options)
  return data.inventoryItems ?? []
}