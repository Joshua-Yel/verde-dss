import { supabaseServer } from '@/src/lib/supabaseServer';
import { forecastSeries, wma } from '../forecast/wma';

interface ServiceRow {
  id: number;
  name: string;
  category: string;
  price: number;
}

interface InventoryRow {
  name: string;
  supplier: string;
  stock: number;
  reorder_point: number;
  unit_cost: number;
}

interface OperationRow {
  date: string;
  quantity: number | null;
  revenue: number | null;
  service_id: number | null;
}

function normalizeString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  return str === '' ? null : str;
}

function normalizeNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/[₱,$]/g, '').replace(/,/g, '').trim();
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function toMonthKey(value?: string | null) {
  if (!value) return null;
  const trimmed = value.slice(0, 7);
  return trimmed.length === 7 ? trimmed : null;
}

function buildMonthLabels(months: string[]) {
  return months.slice(-5);
}

function buildSeriesFromOperations(rows: OperationRow[], monthLabels: string[]) {
  const monthMap = new Map<string, number>();

  for (const row of rows) {
    const monthKey = toMonthKey(row.date);
    if (!monthKey) continue;
    const current = monthMap.get(monthKey) ?? 0;
    monthMap.set(monthKey, current + Number(row.revenue ?? 0));
  }

  return monthLabels.map((month) => monthMap.get(month) ?? 0);
}

// IMPORTANT: userId is required. This function must only ever return data
// belonging to the given user's own business — never "any" business found
// in the tables. supabaseServer uses the service-role key, which bypasses
// RLS entirely, so scoping happens here in application code, not the DB.
export async function getSupabaseDashboardData(userId: string) {
  const client = supabaseServer as any;

  if (!userId) {
    throw new Error('getSupabaseDashboardData requires a userId — refusing to load unscoped data.');
  }

  if (!client || typeof client.from !== 'function') {
    return {
      months: ['2025-01', '2025-02', '2025-03', '2025-04', '2025-05'],
      revenueSeries: [0, 0, 0, 0, 0],
      expenseSeries: [0, 0, 0, 0, 0],
      netIncomeSeries: [0, 0, 0, 0, 0],
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
    };
  }

  // Resolve the business belonging to THIS user only. We do NOT fall back to
  // scanning inventory_items/services/daily_operations for "any" business_id —
  // that was the bug: it silently returned whichever row was first in the
  // table, regardless of who was logged in.
  const { data: businesses } = await client
    .from('businesses')
    .select('id,name')
    .eq('owner_id', userId)
    .limit(1);

  const businessId = businesses?.[0]?.id ?? null;

  let services: ServiceRow[] = [];
  let inventory: InventoryRow[] = [];
  let operations: OperationRow[] = [];

  const findRawKey = (row: any, candidates: string[]) => {
    if (!row || typeof row !== 'object') return null;
    const keys = Object.keys(row);
    const lowerKeys = keys.map((key) => key.toLowerCase());

    for (const candidate of candidates) {
      const exactIndex = lowerKeys.indexOf(candidate.toLowerCase());
      if (exactIndex !== -1) return keys[exactIndex];
    }

    for (const key of keys) {
      const lowerKey = key.toLowerCase();
      if (candidates.some((candidate) => lowerKey.includes(candidate.toLowerCase()))) {
        return key;
      }
    }

    return null;
  };

  const getRawValue = (row: any, candidates: string[]) => {
    const key = findRawKey(row, candidates);
    return key ? row[key] : undefined;
  };

  // Also scoped to this user's business_id now — previously pulled the
  // single most recent raw_imports row across ALL users.
  const getRawInventoryRows = async () => {
    if (!businessId) return [] as InventoryRow[];

    const { data: latestRaw, error: rawError } = await client
      .from('raw_imports')
      .select('data')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (rawError || !latestRaw || !Array.isArray(latestRaw.data)) return [] as InventoryRow[];

    return (latestRaw.data as any[])
      .map((row) => {
        const name = normalizeString(getRawValue(row, ['product_name', 'product name', 'product', 'item', 'inventory item']));
        if (!name) return null;

        const supplier = normalizeString(getRawValue(row, ['supplier', 'vendor', 'source']));
        const stock = normalizeNumber(getRawValue(row, ['closing_stock', 'closing stock', 'closing', 'closing_stock', 'stock on hand', 'stock'])) ?? 0;
        const reorder_point = normalizeNumber(getRawValue(row, ['reorder_point', 'reorder point', 'rp', 'reorder'])) ?? 0;
        const unit_cost = normalizeNumber(getRawValue(row, ['unit_cost', 'unit cost', 'cost', 'price', 'unit price'])) ?? 0;

        return {
          name,
          supplier,
          stock,
          reorder_point,
          unit_cost,
        } as InventoryRow;
      })
      .filter((item): item is InventoryRow => item !== null);
  };

  if (businessId) {
    const inventoryQuery = client
      .from('inventory_items')
      .select('name,supplier,stock,reorder_point,unit_cost')
      .eq('business_id', businessId)
      .order('name');
    const serviceQuery = client
      .from('services')
      .select('id,name,category,price')
      .eq('business_id', businessId)
      .order('name');
    const operationQuery = client
      .from('daily_operations')
      .select('date,quantity,revenue,service_id')
      .eq('business_id', businessId)
      .order('date');

    const [{ data: serviceRows }, inventoryResult, { data: operationRows }] = await Promise.all([
      serviceQuery,
      inventoryQuery,
      operationQuery,
    ]);

    services = (serviceRows ?? []) as ServiceRow[];

    if (!inventoryResult.error) {
      inventory = (inventoryResult.data ?? []) as InventoryRow[];
    }

    operations = (operationRows ?? []) as OperationRow[];

    if (inventoryResult.error || inventory.length === 0) {
      inventory = await getRawInventoryRows();
    }
  } else {
    // No business yet for this user — return empty state, not someone else's data.
    inventory = [];
  }

  const monthKeys = Array.from(
    new Set(
      operations
        .map((row) => toMonthKey(row.date))
        .filter((value): value is string => Boolean(value))
    )
  ).sort();

  const months = buildMonthLabels(monthKeys);
  const revenueSeries = buildSeriesFromOperations(
    operations.filter((row) => toMonthKey(row.date) && months.includes(toMonthKey(row.date)!)),
    months
  );

  const serviceSeries = new Map<number, number[]>();
  const serviceTotals = new Map<number, Map<string, number>>();

  for (const row of operations) {
    const monthKey = toMonthKey(row.date);
    if (!monthKey || !row.service_id) continue;

    if (!serviceTotals.has(row.service_id)) {
      serviceTotals.set(row.service_id, new Map());
    }

    const totals = serviceTotals.get(row.service_id)!;
    totals.set(monthKey, (totals.get(monthKey) ?? 0) + Number(row.quantity ?? 0));
  }

  for (const service of services) {
    const totals = serviceTotals.get(service.id) ?? new Map<string, number>();
    const values = months.map((month) => totals.get(month) ?? 0);
    serviceSeries.set(service.id, values);
  }

  const serviceForecasts = services.map((service) => {
    const actuals = serviceSeries.get(service.id) ?? [];
    const forecasts = forecastSeries(actuals, 3, 3);
    const lastActual = actuals[actuals.length - 1] ?? 0;
    const pred = wma(actuals.slice(-3));
    const mape = lastActual > 0 ? Math.round(Math.abs((lastActual - pred) / lastActual) * 1000) / 10 : 0;

    return {
      service: service.name,
      category: service.category,
      actuals,
      forecasts,
      mape: `${mape}%`,
      bookings: lastActual,
    };
  });

  const forecastNext = forecastSeries(revenueSeries, 1, 3)[0] ?? 0;
  const lastRevenue = revenueSeries[revenueSeries.length - 1] ?? 0;
  const projectedPct = lastRevenue > 0 ? ((forecastNext - lastRevenue) / lastRevenue) * 100 : 0;

  const topService = serviceForecasts
    .slice()
    .sort((left, right) => (right.bookings ?? 0) - (left.bookings ?? 0))[0] ?? {
      service: 'No data',
      category: 'General',
      bookings: 0,
    };

  const topServices = serviceForecasts
    .slice()
    .sort((left, right) => (right.bookings ?? 0) - (left.bookings ?? 0))
    .slice(0, 5)
    .map((service) => ({
      name: service.service,
      category: service.category,
      bookings: service.bookings,
    }));

  const restockList = inventory
    .map((item) => ({
      name: item.name,
      stock: item.stock,
      rp: item.reorder_point,
      days: Math.max(1, Math.round((item.stock / Math.max(1, item.reorder_point)) * 7)),
      supplier: item.supplier,
    }))
    .sort((left, right) => (left.stock - left.rp) - (right.stock - right.rp));

  const inventoryItems = inventory.map((item) => ({
    name: item.name,
    supplier: item.supplier,
    stock: item.stock,
    reorderPoint: item.reorder_point,
    unitCost: item.unit_cost,
  }));

  const expenseSeries = revenueSeries.map((value) => Math.round(value * 0.38));
  const netIncomeSeries = revenueSeries.map((value, index) => value - (expenseSeries[index] ?? 0));

  const dailyLog = operations.map(op => {
    const day = new Date(op.date).toLocaleDateString('en-US', { weekday: 'long' });
    const expenses = Math.round(Number(op.revenue ?? 0) * 0.38);
    const net = Number(op.revenue ?? 0) - expenses;
    const service = services.find(s => s.id === op.service_id);
    return {
      date: op.date,
      day: day,
      sessions: op.quantity,
      revenue: op.revenue,
      expenses: expenses,
      net: net,
      topService: service?.name ?? 'N/A'
    }
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return {
    months,
    revenueSeries,
    expenseSeries,
    netIncomeSeries,
    inventoryItems,
    kpis: {
      projectedRevenue: Math.round(forecastNext),
      projectedPct: Math.round(projectedPct * 10) / 10,
      topService: {
        name: topService.service,
        bookings: topService.bookings,
        category: topService.category,
      },
      reorderAlerts: inventory.filter((item) => item.stock < item.reorder_point).length,
      modelFit: `${serviceForecasts.length > 0 ? Math.round(serviceForecasts.reduce((sum, item) => sum + parseFloat(item.mape), 0) / serviceForecasts.length) : 0}%`,
    },
    topServices,
    restockList,
    serviceForecasts,
    dailyLog,
  };
}