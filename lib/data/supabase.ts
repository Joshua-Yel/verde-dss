import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { supabaseServer } from '@/src/lib/supabaseServer'
import { forecastSeriesForModel, type ForecastModel } from '../forecast/wma'
import { bucketKeyForDate, resolveDateRange, type PeriodGranularity } from '@/lib/dateRange'
import { resolveBusinessIdForUser } from '@/src/lib/businessAccess'

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
  history?: Array<{
    month: string | null
    used: number
    purchased: number
    opening_stock: number
    closing_stock: number
  }>

  // Derived fields used in inventory analytics and UI
  reorderPoint?: number | null
  unitCost?: number | null
  consumptionRate?: number
  avgMonthlyUsage?: number
  projectedNextMonth?: number | null
  reorderQuantity?: number | null
  daysOfCover?: number | null
  statusNote?: string | null
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
  const history = values.filter((value) => Number.isFinite(value))
  if (history.length < 2) return 0

  const errors: number[] = []
  for (let index = 1; index < history.length; index += 1) {
    const slice = history.slice(0, index)
    const prediction = predictNextValue(slice, model, Math.min(window, slice.length))
    const actual = history[index]
    if (actual > 0) {
      errors.push(Math.abs((actual - prediction) / actual) * 100)
    }
  }

  if (errors.length === 0) return 0
  return errors.reduce((sum, error) => sum + error, 0) / errors.length
}

function standardDeviation(values: number[]) {
  const list = values.filter((value) => Number.isFinite(value))
  if (list.length < 2) return 0
  const mean = list.reduce((sum, value) => sum + value, 0) / list.length
  const variance = list.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (list.length - 1)
  return Math.sqrt(variance)
}

function coefficientOfVariation(values: number[]) {
  const list = values.filter((value) => Number.isFinite(value))
  if (list.length < 2) return 0
  const mean = list.reduce((sum, value) => sum + value, 0) / list.length
  if (mean === 0) return 0
  return standardDeviation(list) / Math.abs(mean)
}

function predictNextValue(values: number[], model: ForecastModel, window = 3, seasonLength = 0) {
  const series = values.filter((value) => Number.isFinite(value))
  if (series.length === 0) return 0
  if (series.length === 1) return series[0]

  const history = series.slice(-Math.max(1, Math.min(window, series.length)))

  if (model === 'naive') {
    if (seasonLength > 0 && series.length >= seasonLength * 2) {
      const seasonalIndex = series.length - seasonLength
      return series[seasonalIndex] ?? history[history.length - 1] ?? 0
    }
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

  const { data: userData } = await client.auth.admin.getUserById(userId)
  return resolveBusinessIdForUser(client, userData?.user ?? null)
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
    const seasonLength = granularity === 'monthly' && actuals.length >= 24 ? 12 : granularity === 'weekly' && actuals.length >= 52 ? 52 : 0
    const forecastValuesByModel: Record<ForecastModel, number[]> = {
      wma: forecastSeriesForModel(actuals, 3, Math.min(3, actuals.length), 'wma', undefined, seasonLength),
      sma: forecastSeriesForModel(actuals, 3, Math.min(3, actuals.length), 'sma', undefined, seasonLength),
      naive: forecastSeriesForModel(actuals, 3, Math.min(3, actuals.length), 'naive', undefined, seasonLength),
    }
    const lastActual = visibleActuals[visibleActuals.length - 1] ?? actuals[actuals.length - 1] ?? 0
    const mapeByModel = Object.fromEntries(
      (Object.entries(forecastValuesByModel) as Array<[ForecastModel, number[]]>).map(([model]) => [model, `${calculateMape(actuals, model, Math.min(3, actuals.length)).toFixed(1)}%`])
    ) as Record<ForecastModel, string>
    const reliability = {
      dataPoints: actuals.filter((value) => Number.isFinite(value)).length,
      coefficientOfVariation: Number((coefficientOfVariation(actuals) * 100).toFixed(1)),
      category: actuals.length < 3 ? 'Insufficient data' : coefficientOfVariation(actuals) < 0.25 ? 'Higher reliability' : coefficientOfVariation(actuals) < 0.5 ? 'Moderate reliability' : 'Lower reliability',
    }
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
      forecastReliability: reliability,
    }
  })

  const revenueSeasonLength = granularity === 'monthly' && revenueSeries.length >= 24 ? 12 : granularity === 'weekly' && revenueSeries.length >= 52 ? 52 : 0
  const forecastNext = revenueSeries.length >= 2 ? forecastSeriesForModel(revenueSeries, 1, Math.min(3, revenueSeries.length), 'wma', undefined, revenueSeasonLength)[0] ?? 0 : 0
  const lastRevenue = revenueSeries[revenueSeries.length - 1] ?? 0
  const projectedPct = lastRevenue > 0 && revenueSeries.length >= 2 ? ((forecastNext - lastRevenue) / lastRevenue) * 100 : null

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

  const inventoryByName = new Map<string, InventoryRow[]>()
  for (const item of inventory) {
    const name = (item.name ?? '').trim()
    if (!name) continue
    const bucket = inventoryByName.get(name) ?? []
    bucket.push(item)
    inventoryByName.set(name, bucket)
  }

  const inventoryItems = Array.from(inventoryByName.entries())
    .map(([name, rows]) => {
      const sortedRows = [...rows].sort((left, right) => {
        const leftValue = left.month ?? '1970-01'
        const rightValue = right.month ?? '1970-01'
        return leftValue.localeCompare(rightValue)
      })
      const latestRow = sortedRows.at(-1) ?? rows[0]
      const latestStock = latestRow?.stock ?? 0
      const usageHistory = sortedRows
        .map((row) => Number(row.used ?? 0))
        .filter((amount) => Number.isFinite(amount) && amount >= 0)
      const avgMonthlyUsage = usageHistory.length > 0
        ? usageHistory.reduce((sum, value) => sum + value, 0) / usageHistory.length
        : 0
      const projectedNextMonth = usageHistory.length >= 2 ? Math.max(0, latestStock - avgMonthlyUsage) : null
      const monthDays = getDaysInMonth(latestRow?.month)
      const consumptionRate = monthDays > 0 && avgMonthlyUsage > 0 ? avgMonthlyUsage / monthDays : 0
      const daysOfCover = consumptionRate > 0 ? latestStock / consumptionRate : null
      const reorderPoint = latestRow?.reorder_point ?? null
      const reorderQuantity = reorderPoint !== null ? Math.max(0, Math.round(reorderPoint - latestStock)) : null
      const status = reorderPoint !== null
        ? latestStock <= reorderPoint
          ? 'At or below reorder point'
          : 'Above reorder point'
        : 'Reorder point unavailable'
      const unitCost = latestRow?.unit_cost ?? null
      const history = sortedRows.map((row) => ({
        month: row.month ?? null,
        used: Number(row.used ?? 0),
        purchased: Number(row.purchased ?? 0),
        opening_stock: Number(row.opening_stock ?? 0),
        closing_stock: Number(row.closing_stock ?? 0),
      }))
      return {
        name,
        supplier: latestRow?.supplier ?? '',
        stock: latestStock,
        reorderPoint,
        unitCost,
        consumptionRate,
        avgMonthlyUsage,
        projectedNextMonth,
        usageHistory,
        history,
        daysOfCover,
        status,
        statusNote: latestRow?.status ? `Marked ${latestRow.status}` : null,
        reorderQuantity,
        month: latestRow?.month,
      }
    })
    .sort((left, right) => left.name.localeCompare(right.name))

  const restockList = inventoryItems
    .filter((item) => item.reorderPoint !== null && item.stock !== null && item.stock <= item.reorderPoint)
    .map((item) => ({
      name: item.name,
      stock: item.stock,
      rp: item.reorderPoint,
      days: item.daysOfCover !== null ? Math.max(1, Math.round(item.daysOfCover)) : null,
      supplier: item.supplier,
      status: item.status,
      unitCost: item.unitCost,
      reorderQuantity: item.reorderQuantity,
    }))
    .sort((left, right) => (left.rp ?? 0) - (right.rp ?? 0))

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
  const hasExpenseData = expenseRows.length > 0
  const totalNetIncome = hasExpenseData ? totalRevenue - totalExpenses : null

  const revenueVolatility = standardDeviation(visibleRevenueSeries)
  const expenseVolatility = standardDeviation(visibleExpenseSeries)
  const confidenceBand = {
    revenue: Math.round(revenueVolatility),
    expense: Math.round(expenseVolatility),
  }


  const dailyLog = visibleOperations
    .map((op) => {
      const day = new Date(op.date).toLocaleDateString('en-US', { weekday: 'long' })
      const service = op.service_id !== null ? serviceMap.get(op.service_id) : undefined
      return {
        date: op.date,
        day,
        sessions: op.quantity,
        revenue: op.revenue,
        expenses: null,
        net: null,
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
    netIncomeSeries: hasExpenseData ? visibleNetIncomeSeries : [],
    inventoryItems,
    kpis: {
      projectedRevenue: Math.round(forecastNext),
      projectedPct: projectedPct !== null ? Math.round(projectedPct * 10) / 10 : null,
      totalSessions,
      totalRevenue,
      avgDailyRevenue: Math.round(avgDailyRevenue),
      totalNetIncome,
      topService: {
        name: topService.service,
        bookings: topService.bookings,
        category: topService.category,
      },
      reorderAlerts: restockList.length,
      modelFit: serviceForecasts.length > 0
        ? serviceForecasts.every((item) => Number.isFinite(parseFloat(item.mape)))
          ? `${Math.round(serviceForecasts.reduce((sum, item) => sum + parseFloat(item.mape), 0) / serviceForecasts.length)}%`
          : 'Insufficient service history'
        : 'Insufficient service history',
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
      inventoryHasReorderPoints: inventoryItems.some((item) => item.reorderPoint !== null),
      inventoryHasUnitCost: inventoryItems.some((item) => item.unitCost !== null),
      expenseDataAvailable: hasExpenseData,
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
        revalidate: 15,
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

function parseMonthKey(month: unknown) {
  if (typeof month !== 'string') return null
  const [year, mon] = month.split('-').map((value) => Number(value))
  if (!Number.isFinite(year) || !Number.isFinite(mon) || mon < 1 || mon > 12) return null
  return year * 12 + mon - 1
}

function buildYearOverYearUsage(history: Array<{ month: string | null; used: number }>) {
  const monthlyUsage = new Map<number, number>()
  let latestIndex: number | null = null

  for (const row of history) {
    const idx = parseMonthKey(row.month)
    if (idx === null) continue
    monthlyUsage.set(idx, (monthlyUsage.get(idx) ?? 0) + Number(row.used ?? 0))
    latestIndex = latestIndex === null ? idx : Math.max(latestIndex, idx)
  }

  if (latestIndex === null) {
    return {
      lastYearUsage: 0,
      priorYearUsage: 0,
      changePct: 0,
      trend: 'flat' as const,
    }
  }

  let lastYearUsage = 0
  let priorYearUsage = 0
  for (let offset = 0; offset < 12; offset += 1) {
    const targetMonth = latestIndex - offset
    if (targetMonth < 0) break
    lastYearUsage += monthlyUsage.get(targetMonth) ?? 0
    priorYearUsage += monthlyUsage.get(targetMonth - 12) ?? 0
  }

  const changePct = priorYearUsage > 0
    ? Math.round(((lastYearUsage - priorYearUsage) / priorYearUsage) * 100)
    : lastYearUsage > 0
      ? 100
      : 0

  const trend = lastYearUsage > priorYearUsage ? 'increase' : lastYearUsage < priorYearUsage ? 'decrease' : 'flat'

  return { lastYearUsage, priorYearUsage, changePct, trend }
}

function buildInventoryAnalyticsFromRows(inventoryItems: Array<InventoryRow>) {
  const items = inventoryItems.map((item) => {
    const history = item.history ?? []
    const totalUsed = history.reduce((sum, row) => sum + Number(row.used ?? 0), 0)
    const validMonthKeys = new Set(
      history
        .map((row) => row.month)
        .filter((month): month is string => typeof month === 'string' && parseMonthKey(month) !== null)
    )
    const monthCount = validMonthKeys.size
    const avgMonthlyUsage = monthCount > 0 ? totalUsed / monthCount : 0
    const recentUsed = history.at(-1)?.used ?? 0
    const yoy = buildYearOverYearUsage(history)

    return {
      name: item.name,
      supplier: item.supplier ?? '',
      currentStock: item.stock ?? 0,
      reorderPoint: item.reorder_point ?? item.reorderPoint ?? 0,
      daysOfCover: item.daysOfCover ?? 0,
      status: item.status ?? 'Unknown',
      projectedNextMonth: item.projectedNextMonth ?? 0,
      avgMonthlyUsage,
      totalUsed,
      recentUsed,
      monthsTracked: monthCount,
      yearOverYear: yoy,
      history: history
        .filter((row) => typeof row.month === 'string' && parseMonthKey(row.month) !== null)
        .slice(-12)
        .map((row) => ({ month: row.month ?? null, used: Number(row.used ?? 0) })),
    }
  })

  const sortedByUsage = items.slice().sort((a, b) => b.totalUsed - a.totalUsed)
  const sortedByRisk = items.slice().sort((a, b) => (a.daysOfCover ?? Number.POSITIVE_INFINITY) - (b.daysOfCover ?? Number.POSITIVE_INFINITY))
  const topYoY = items
    .filter((item) => item.monthsTracked >= 6)
    .sort((a, b) => Math.abs(b.yearOverYear.changePct) - Math.abs(a.yearOverYear.changePct))

  return {
    trackedSKUCount: items.length,
    hasInventoryHistory: items.some((item) => item.monthsTracked > 1),
    topUsageItems: sortedByUsage.slice(0, 5).map((item) => ({
      name: item.name,
      totalUsed: item.totalUsed,
      avgMonthlyUsage: Math.round(item.avgMonthlyUsage),
      recentUsed: item.recentUsed,
      currentStock: item.currentStock,
      status: item.status,
    })),
    reorderPriorityItems: sortedByRisk.slice(0, 6).map((item) => ({
      name: item.name,
      currentStock: item.currentStock,
      daysOfCover: item.daysOfCover,
      projectedNextMonth: item.projectedNextMonth,
      status: item.status,
    })),
    yearOverYearUsage: topYoY.slice(0, 5).map((item) => ({
      name: item.name,
      priorYearUsage: item.yearOverYear.priorYearUsage,
      lastYearUsage: item.yearOverYear.lastYearUsage,
      changePct: item.yearOverYear.changePct,
      trend: item.yearOverYear.trend,
    })),
  }
}

export async function getInventoryAnalytics(userId: string, options?: DashboardDataOptions) {
  const data = await getSupabaseDashboardData(userId, options)
  return buildInventoryAnalyticsFromRows((data.inventoryItems ?? []) as InventoryRow[])
}

export async function getInventoryConsumptionSignal(userId: string, options?: DashboardDataOptions) {
  const data = await getSupabaseDashboardData(userId, options)
  return data.inventoryItems ?? []
}