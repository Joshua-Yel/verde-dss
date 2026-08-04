import { forecastSeriesForModel } from '../../lib/forecast/wma.ts';

export type AriaContextPayload = {
  analyticsContext?: Record<string, unknown>;
  criticalRestock?: Array<Record<string, unknown>>;
  topServices?: Array<Record<string, unknown>>;
  monthlyRevenue?: Array<Record<string, unknown>>;
  missingDataWarnings?: string[];
  fullInventory?: Array<Record<string, unknown>>;
  weekdayPatterns?: Array<Record<string, unknown>>;
  serviceByWeekday?: Array<Record<string, unknown>>;
  staffing?: {
    dailyBreakdown?: Array<{ day: string; forecastedSessions: number; demandLevel: string }>;
    hourlyHeatmap?: number[][];
  };
  averageMape?: number | null;
  forecastModelFit?: string | null;
  forecastMethodUsed?: string | null;
  role?: string | null;
  module?: string | null;
};

export type AriaIntent =
  | 'inventory_reorder'
  | 'inventory_demand'
  | 'service_demand'
  | 'service_growth'
  | 'staffing'
  | 'revenue_forecast'
  | 'revenue_trend'
  | 'comparison'
  | 'explain_forecast'
  | 'kpi_explanation'
  | 'ambiguous'
  | 'out_of_scope'
  | 'general';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function asNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseMonthKey(month: unknown): number | null {
  if (typeof month !== 'string') return null;
  const trimmed = month.trim();

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const monthIndex = Number(isoMatch[2]);
    if (Number.isFinite(year) && Number.isFinite(monthIndex) && monthIndex >= 1 && monthIndex <= 12) {
      return year * 12 + monthIndex - 1;
    }
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.getUTCFullYear() * 12 + parsed.getUTCMonth();
  }

  return null;
}

function monthKeyToMonthString(monthKey: number) {
  const year = Math.floor(monthKey / 12);
  const monthIndex = (monthKey % 12) + 1;
  return `${year}-${String(monthIndex).padStart(2, '0')}`;
}

function formatMonthLabel(monthKey: string | null | undefined) {
  if (!monthKey) return 'the latest available historical period';
  const parsed = parseMonthKey(monthKey);
  if (parsed === null) return monthKey;
  const date = new Date(Date.UTC(Math.floor(parsed / 12), parsed % 12, 1));
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function addMonths(monthKey: string | null | undefined, steps: number) {
  if (!monthKey) return null;
  const parsed = parseMonthKey(monthKey);
  if (parsed === null) return null;
  return monthKeyToMonthString(parsed + steps);
}

function monthDistance(start: string | null | undefined, target: string | null | undefined) {
  if (!start || !target) return 0;
  const startKey = parseMonthKey(start);
  const targetKey = parseMonthKey(target);
  if (startKey === null || targetKey === null) return 0;
  return Math.max(0, targetKey - startKey);
}

function formatPhp(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'an unavailable amount';
  return `₱${Math.round(value).toLocaleString('en-PH')}`;
}

function formatPct(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const sign = value > 0 ? '+' : '';
  return `${sign}${Math.round(value * 10) / 10}%`;
}

// ---------------------------------------------------------------------------
// Latest historical period — prefer richest available series
// ---------------------------------------------------------------------------

function getLatestHistoricalMonth(payload: AriaContextPayload): string | null {
  // 1) Inventory usage history
  const inventoryItems = Array.isArray(payload.fullInventory) ? payload.fullInventory : [];
  const invKeys = inventoryItems.flatMap((item) => {
    const history = Array.isArray(item.history) ? item.history : [];
    return history
      .map((entry) => parseMonthKey((entry as Record<string, unknown>)?.month))
      .filter((v): v is number => v !== null);
  });

  // 2) Monthly revenue periods
  const revenueRows = Array.isArray(payload.monthlyRevenue) ? payload.monthlyRevenue : [];
  const revKeys = revenueRows
    .map((row) => parseMonthKey(row.month))
    .filter((v): v is number => v !== null);

  // 3) Revenue summary periods inside analyticsContext
  const revenueSummary = (payload.analyticsContext?.revenueSummary as Record<string, unknown> | undefined) ?? {};
  const periods = Array.isArray(revenueSummary.periods) ? revenueSummary.periods : [];
  const ctxKeys = periods
    .map((p) => parseMonthKey((p as Record<string, unknown>)?.month))
    .filter((v): v is number => v !== null);

  const all = [...invKeys, ...revKeys, ...ctxKeys];
  if (all.length === 0) return null;
  const latest = all.slice().sort((a, b) => a - b).at(-1);
  return latest === undefined ? null : monthKeyToMonthString(latest);
}

// ---------------------------------------------------------------------------
// Period parsing — never hardcode months/years
// ---------------------------------------------------------------------------

function parseRequestedPeriod(userText: string, latestHistoricalMonth: string | null) {
  const normalized = userText.toLowerCase();

  const monthNames = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
  ];

  const monthMatch = normalized.match(
    /(?:for|in|during|for the month of|the month of)\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/i,
  );
  if (monthMatch) {
    const monthName = monthMatch[1];
    const year = Number(monthMatch[2]);
    const monthIndex = monthNames.indexOf(monthName.toLowerCase()) + 1;
    const targetMonth = `${year}-${String(monthIndex).padStart(2, '0')}`;
    return {
      targetMonth,
      targetLabel: `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} ${year}`,
      steps: monthDistance(latestHistoricalMonth, targetMonth),
      isExplicit: true,
    };
  }

  const bareMonthMatch = normalized.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})\b/i,
  );
  if (bareMonthMatch) {
    const monthName = bareMonthMatch[1];
    const year = Number(bareMonthMatch[2]);
    const monthIndex = monthNames.indexOf(monthName.toLowerCase()) + 1;
    const targetMonth = `${year}-${String(monthIndex).padStart(2, '0')}`;
    return {
      targetMonth,
      targetLabel: `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} ${year}`,
      steps: monthDistance(latestHistoricalMonth, targetMonth),
      isExplicit: true,
    };
  }

  const quarterMatch = normalized.match(/(?:for|in|during)\s+q([1-4])\s*(\d{4})/i);
  if (quarterMatch) {
    const quarter = Number(quarterMatch[1]);
    const year = Number(quarterMatch[2]);
    const monthIndex = (quarter - 1) * 3 + 1;
    const targetMonth = `${year}-${String(monthIndex).padStart(2, '0')}`;
    return {
      targetMonth,
      targetLabel: `Q${quarter} ${year}`,
      steps: monthDistance(latestHistoricalMonth, targetMonth),
      isExplicit: true,
    };
  }

  if (/next month/.test(normalized)) {
    const targetMonth = addMonths(latestHistoricalMonth, 1);
    return {
      targetMonth,
      targetLabel: targetMonth ? formatMonthLabel(targetMonth) : 'next month',
      steps: 1,
      isExplicit: false,
    };
  }

  if (/next quarter/.test(normalized)) {
    const targetMonth = addMonths(latestHistoricalMonth, 3);
    return {
      targetMonth,
      targetLabel: targetMonth ? formatMonthLabel(targetMonth) : 'next quarter',
      steps: 3,
      isExplicit: false,
    };
  }

  if (/this week|next week/.test(normalized)) {
    return {
      targetMonth: latestHistoricalMonth,
      targetLabel: /next week/.test(normalized) ? 'next week' : 'this week',
      steps: 0,
      isExplicit: false,
    };
  }

  // Default: one step beyond latest historical data
  const targetMonth = addMonths(latestHistoricalMonth, 1);
  return {
    targetMonth,
    targetLabel: targetMonth ? formatMonthLabel(targetMonth) : 'the next period',
    steps: 1,
    isExplicit: false,
  };
}

function buildForecastPeriodContext(payload: AriaContextPayload, userText: string) {
  const latestHistoricalMonth = getLatestHistoricalMonth(payload);
  const requestedPeriod = parseRequestedPeriod(userText, latestHistoricalMonth);
  const latestHistoricalLabel = latestHistoricalMonth
    ? formatMonthLabel(latestHistoricalMonth)
    : 'the available dashboard history';
  const forecastLabel = requestedPeriod.targetMonth
    ? formatMonthLabel(requestedPeriod.targetMonth)
    : requestedPeriod.targetLabel;
  const horizonText =
    requestedPeriod.steps <= 0
      ? 'current period'
      : requestedPeriod.steps === 1
        ? '1 month ahead'
        : `${requestedPeriod.steps} months ahead`;
  return { latestHistoricalMonth, requestedPeriod, latestHistoricalLabel, forecastLabel, horizonText };
}

// ---------------------------------------------------------------------------
// Intent classification (structured, not pure keyword short-circuit)
// ---------------------------------------------------------------------------

export function classifyAriaIntent(userText: string, moduleHint?: string | null): AriaIntent {
  const t = userText.toLowerCase().trim();

  if (/poem|joke|story|song|write (a |me )?(poem|story)|creative writing/.test(t)) {
    return 'out_of_scope';
  }

  if (/^what('?s| is) going on\??$|^help$|^hello$|^hi$/.test(t) || t.length < 8) {
    return 'ambiguous';
  }

  // Inventory
  if (
    /reorder|restock|stock up|order more|run out|out of stock|which (items?|products?).*(order|buy|stock)|what (to |should i |should we )?(order|reorder|buy|stock)|inventory demand|increasing demand.*(product|item|inventory)/.test(t) ||
    (moduleHint === 'inventory' && /order|stock|buy|demand/.test(t))
  ) {
    if (/demand|usage|consumption|increasing|grow|trend/.test(t) && !/reorder|restock|order more|run out/.test(t)) {
      return 'inventory_demand';
    }
    return 'inventory_reorder';
  }

  // Staffing
  if (
    /staff|staffing|how many (people|employees|staff|workers)|need more (staff|people|employees)|which days?.*(staff|busy)|capacity|labor|shift/.test(t) ||
    moduleHint === 'staffing'
  ) {
    return 'staffing';
  }

  // Services / demand
  if (
    /which services?.*(grow|growth|declin|popular|promote|forecast)|service demand|expected demand|services? (to )?(promote|push)|declining services?/.test(t) ||
    (moduleHint === 'demand' && /service|demand|grow|declin/.test(t))
  ) {
    if (/grow|growth|promot|increas|rising/.test(t)) return 'service_growth';
    return 'service_demand';
  }

  // Revenue / financial
  if (
    /revenue|profit|net income|financial|budget|cash flow|expected revenue|how much.*(earn|make|revenue)/.test(t) ||
    moduleHint === 'financial'
  ) {
    if (/trend|changed|risen|rose|dropped|fell|why did|compared/.test(t)) return 'revenue_trend';
    return 'revenue_forecast';
  }

  // Explain / reports
  if (/explain (this |the )?forecast|what does .* mean|how (is|was) .* calculated|mape|model fit|forecast method|why did (revenue|demand|bookings)/.test(t)) {
    return 'explain_forecast';
  }

  if (/compare|vs\.?|versus|this month.*last|year over year|yoy|seasonal/.test(t)) {
    return 'comparison';
  }

  if (/what (is|does) .* (mean|mean\?)|kpi|reorder alert count|model fit/.test(t)) {
    return 'kpi_explanation';
  }

  // Broad fallbacks by keyword presence
  if (/\b(inventory|stock|reorder|restock|product)\b/.test(t)) return 'inventory_reorder';
  if (/\b(service|booking|session|demand)\b/.test(t)) return 'service_demand';
  if (/\b(revenue|sales|income)\b/.test(t)) return 'revenue_forecast';
  if (/\b(staff|employee|schedule)\b/.test(t)) return 'staffing';

  return 'general';
}

// ---------------------------------------------------------------------------
// Context extractors
// ---------------------------------------------------------------------------

function getInventoryContext(payload: AriaContextPayload) {
  const inventorySummary =
    (payload.analyticsContext?.inventorySummary as Record<string, unknown> | undefined) ?? {};
  const criticalRestock = Array.isArray(payload.criticalRestock) ? payload.criticalRestock : [];
  const summaryItems = Array.isArray(inventorySummary.reorderPriorityItems)
    ? inventorySummary.reorderPriorityItems
    : [];
  const fallbackItems = criticalRestock.slice(0, 5);
  const items = summaryItems.length > 0 ? summaryItems : fallbackItems;
  const criticalCount = asNumber(inventorySummary.criticalRestockCount) ?? items.length;
  return { items, criticalCount, inventorySummary };
}

function getServiceContext(payload: AriaContextPayload) {
  const forecastSummary =
    (payload.analyticsContext?.forecastSummary as Record<string, unknown> | undefined) ?? {};
  const topRows = Array.isArray(forecastSummary.topServices) ? forecastSummary.topServices : [];
  const fallbackRows = Array.isArray(payload.topServices) ? payload.topServices : [];
  const services = topRows.length > 0 ? topRows : fallbackRows;
  const averageMape =
    asNumber(forecastSummary.averageMape) ?? asNumber(payload.averageMape) ?? null;
  const method =
    (forecastSummary.forecastMethodUsed as string | undefined) ??
    payload.forecastMethodUsed ??
    'WMA';
  return { services, averageMape, method };
}

function getRevenueContext(payload: AriaContextPayload) {
  const revenueSummary =
    (payload.analyticsContext?.revenueSummary as Record<string, unknown> | undefined) ?? {};
  const projectedRevenue = asNumber(revenueSummary.projectedRevenueNextMonth);
  const trend = asNumber(revenueSummary.projectedRevenueChangePct);
  const modelFit =
    (revenueSummary.forecastModelFit as string | undefined) ?? payload.forecastModelFit ?? null;
  const method =
    (revenueSummary.forecastMethodUsed as string | undefined) ??
    payload.forecastMethodUsed ??
    'WMA';
  const periods = Array.isArray(payload.monthlyRevenue)
    ? payload.monthlyRevenue
    : Array.isArray(revenueSummary.periods)
      ? (revenueSummary.periods as Array<Record<string, unknown>>)
      : [];
  return { projectedRevenue, trend, modelFit, method, periods };
}

function getStaffingSignals(payload: AriaContextPayload) {
  const weekday = Array.isArray(payload.weekdayPatterns) ? payload.weekdayPatterns : [];
  const staffing = payload.staffing?.dailyBreakdown ?? [];
  return { weekday, staffing };
}

// ---------------------------------------------------------------------------
// Domain reply builders — all dynamic, engine-backed
// ---------------------------------------------------------------------------

function buildInsufficientDataReply(domain: string, suggestion: string) {
  return (
    `Insufficient data: I do not have enough historical ${domain} observations to produce a reliable numeric forecast yet. ` +
    `At least two periods of history are required for the weighted moving average engine. ` +
    suggestion
  );
}

function buildInventoryReply(payload: AriaContextPayload, userText: string): string {
  const { latestHistoricalLabel, forecastLabel, horizonText, requestedPeriod } =
    buildForecastPeriodContext(payload, userText);
  const inventoryItems = Array.isArray(payload.fullInventory) ? payload.fullInventory : [];
  const { items: priorityItems, criticalCount } = getInventoryContext(payload);

  if (inventoryItems.length === 0 && priorityItems.length === 0) {
    return buildInsufficientDataReply(
      'inventory',
      'Add product stock history (monthly used / closing stock) or reorder points so I can rank replenishment priorities.',
    );
  }

  const itemsWithHistory = inventoryItems
    .map((item) => {
      const history = Array.isArray(item.history) ? item.history : [];
      const values = history
        .map((entry) => asNumber((entry as Record<string, unknown>)?.used))
        .filter((v): v is number => v !== null);
      const stock = asNumber(item.stock) ?? asNumber(item.currentStock) ?? null;
      const reorderPoint = asNumber(item.reorderPoint) ?? asNumber(item.reorder_point) ?? null;
      return {
        name: String(item.name ?? 'inventory item'),
        values,
        stock,
        reorderPoint,
        latestUsed: values.at(-1) ?? 0,
      };
    })
    .filter((item) => item.values.length > 0);

  // No usage history → fall back to current restock signals (still data-driven)
  const inventoryForecastIntro = `Latest available historical data: ${latestHistoricalLabel}. Latest historical inventory: ${latestHistoricalLabel}. Requested forecast: ${forecastLabel}. Forecast horizon: ${horizonText}.`;
  const inventoryPrefix = requestedPeriod.isExplicit || requestedPeriod.steps > 1 ? 'Forecast result:' : 'Direct answer:';

  if (itemsWithHistory.length === 0) {
    if (priorityItems.length === 0) {
      return buildInsufficientDataReply(
        'inventory usage',
        'Current stock levels exist but monthly usage history is missing. Add usage history to enable demand forecasts.',
      );
    }
    const lines = priorityItems.slice(0, 5).map((p) => {
      const name = String(p.item ?? p.name ?? 'item');
      const stock = asNumber(p.stock ?? p.currentStock);
      const rp = asNumber(p.reorderPoint ?? p.rp);
      const stockText = stock !== null ? ` (stock ${stock}${rp !== null ? `, reorder point ${rp}` : ''})` : '';
      return `• ${name}${stockText}`;
    });
    return (
      `${inventoryPrefix} Based on current restock signals (${criticalCount} item${criticalCount === 1 ? '' : 's'} flagged), prioritize:\n` +
      `${lines.join('\n')}\n\n` +
      `${inventoryForecastIntro} ` +
      `A numeric demand forecast for ${forecastLabel} (${horizonText}) cannot be computed yet because monthly usage series are missing. ` +
      `Recommendation: replenish the flagged items first, then load usage history so future answers can project consumption with the WMA engine.`
    );
  }

  const stepCount = Math.max(0, requestedPeriod.steps);
  const minHistoryWindow = 2;
  const canForecast = itemsWithHistory.some((item) => item.values.length >= minHistoryWindow);

  if (!canForecast) {
    return buildInsufficientDataReply(
      'inventory usage',
      'Add at least two periods of monthly usage history so ARIA can build a WMA-based forecast for the requested month.',
    );
  }

  const ranked = itemsWithHistory
    .map((item) => {
      const window = Math.min(3, item.values.length);
      const forecastValues =
        stepCount > 0
          ? forecastSeriesForModel(item.values, stepCount, window, 'wma')
          : [item.values[item.values.length - 1] ?? 0];
      const projectedDemand = forecastValues[forecastValues.length - 1] ?? 0;
      const rounded = Math.max(0, Math.round(projectedDemand));
      // Simple trend: last value vs first of window
      const windowSlice = item.values.slice(-window);
      const trend =
        windowSlice.length >= 2
          ? windowSlice[windowSlice.length - 1] - windowSlice[0]
          : 0;
      const needsReorder =
        item.reorderPoint !== null && item.stock !== null && item.stock <= item.reorderPoint;
      return { ...item, projectedDemand, rounded, trend, needsReorder, window };
    })
    .sort((a, b) => {
      // Prefer items already at/below reorder point, then by projected demand
      if (a.needsReorder !== b.needsReorder) return a.needsReorder ? -1 : 1;
      return b.projectedDemand - a.projectedDemand;
    })
    .slice(0, 5);

  const multiStepNote =
    stepCount > 1
      ? ` This is a recursive ${stepCount}-step WMA forecast from the latest historical data.`
      : ' Forecast uses a weighted moving average (WMA) over recent usage.';

  const lines = ranked.map((item) => {
    const trendWord = item.trend > 0 ? 'rising' : item.trend < 0 ? 'falling' : 'stable';
    const stockNote =
      item.stock !== null
        ? `; current stock ${item.stock}${item.reorderPoint !== null ? ` (reorder point ${item.reorderPoint})` : ''}`
        : '';
    return `• **${item.name}**: projected consumption **${item.rounded} units** (${trendWord} ${item.window}-period usage${stockNote})`;
  });

  const top = ranked[0];
  const why =
    top && top.trend > 0
      ? `${top.name} shows increasing recent usage, so projected demand for ${forecastLabel} exceeds typical replenishment unless stock is raised.`
      : top
        ? `${top.name} ranks highest on projected demand for ${forecastLabel} given current usage patterns.`
        : 'Prioritize the listed items.';

  return (
    `${inventoryPrefix} ${inventoryForecastIntro}\n` +
    `For **${forecastLabel}** (${horizonText}; latest history: **${latestHistoricalLabel}**), prioritize ordering:\n` +
    `${lines.join('\n')}\n\n` +
    `${why}${multiStepNote} ` +
    `Recommendation: replenish the highest-priority items first and re-check after the next stock receipt.`
  );
}

function buildServiceReply(payload: AriaContextPayload, userText: string, growthFocus: boolean): string {
  const { latestHistoricalLabel, forecastLabel, horizonText, requestedPeriod } =
    buildForecastPeriodContext(payload, userText);
  const { services, averageMape, method } = getServiceContext(payload);

  if (services.length === 0) {
    return buildInsufficientDataReply(
      'service booking',
      'Add service-level booking history so I can rank demand and growth.',
    );
  }

  // Prefer services that have explicit forecast / bookings signals from context
  const ranked = services
    .map((s) => {
      const name = String(s.service ?? s.name ?? 'service');
      const bookings = asNumber(s.bookings ?? s.sessions) ?? 0;
      const mape = asNumber(s.forecastError ?? s.mape);
      // If actuals series were ever attached, we could WMA them; context currently exposes top snapshot
      return { name, bookings, mape };
    })
    .sort((a, b) => b.bookings - a.bookings);

  const top = ranked.slice(0, 5);
  const lines = top.map(
    (s, i) =>
      `• **${s.name}**: ${s.bookings} recent bookings` +
      (s.mape !== null ? ` (forecast error ~${s.mape}%)` : ''),
  );

  const mapeNote =
    averageMape !== null
      ? ` Average service forecast error (MAPE) across tracked services is about ${averageMape}%.`
      : '';
  const growthNote = growthFocus
    ? ` Services at the top of this list are the strongest current demand signals; treat them as growth candidates unless newer periods reverse the pattern.`
    : '';

  const stepNote =
    requestedPeriod.steps > 1
      ? ` Requested horizon is ${horizonText}; service ranks below reflect the latest loaded history and dashboard forecast table (method: ${method}).`
      : ` Forecast framing: ${forecastLabel} (${horizonText}). Method: ${method}.`;

  return (
    `Forecast result: Strongest service demand signals for **${forecastLabel}** (latest history: **${latestHistoricalLabel}**):\n` +
    `${lines.join('\n')}\n\n` +
    `Prioritize staffing and inventory around **${top[0]?.name ?? 'the leading service'}**.` +
    growthNote +
    stepNote +
    mapeNote +
    ` Recommendation: review service mix, staffing, and inventory around the leading service before the forecast period begins.`
  );
}

function buildRevenueReply(payload: AriaContextPayload, userText: string, trendFocus: boolean): string {
  const { latestHistoricalLabel, forecastLabel, horizonText, requestedPeriod } =
    buildForecastPeriodContext(payload, userText);
  const { projectedRevenue, trend, modelFit, method, periods } = getRevenueContext(payload);

  // Build a series from monthly revenue when available for multi-step forecast
  const series = periods
    .map((p) => asNumber(p.revenue))
    .filter((v): v is number => v !== null);

  let forecastValue = projectedRevenue;
  let usedRecursive = false;

  if (series.length >= 2 && requestedPeriod.steps > 0) {
    const window = Math.min(3, series.length);
    const forecasted = forecastSeriesForModel(series, requestedPeriod.steps, window, 'wma');
    const last = forecasted[forecasted.length - 1];
    if (Number.isFinite(last)) {
      forecastValue = last;
      usedRecursive = requestedPeriod.steps > 1;
    }
  }

  if (forecastValue === null && series.length === 0) {
    return buildInsufficientDataReply(
      'revenue',
      'Add at least two periods of revenue history so the WMA engine can project the next period.',
    );
  }

  // Simple historical trend from last two points
  let histTrendText = '';
  if (series.length >= 2) {
    const prev = series[series.length - 2];
    const last = series[series.length - 1];
    if (prev > 0) {
      const pct = ((last - prev) / prev) * 100;
      histTrendText = ` The most recent historical step moved ${formatPct(pct)} versus the prior period.`;
    }
  }

  const trendText = formatPct(trend);
  const multiNote = usedRecursive
    ? ` This figure is a recursive ${requestedPeriod.steps}-step WMA forecast from the revenue series (latest history: ${latestHistoricalLabel}).`
    : ` Projection uses the dashboard ${method} forecast aligned with loaded history (latest: ${latestHistoricalLabel}).`;

  const confidence =
    modelFit && modelFit !== '0%'
      ? ` Model fit indicator: ${modelFit}.`
      : '';

  if (trendFocus) {
    return (
      `Revenue outlook for **${forecastLabel}** (${horizonText}): **${formatPhp(forecastValue)}**.` +
      (trendText ? ` Dashboard projected change: **${trendText}**.` : '') +
      histTrendText +
      multiNote +
      confidence +
      ` Recommendation: review staffing and inventory against this trajectory before locking next-period spend.`
    );
  }

  return (
    `Expected revenue for **${forecastLabel}** (${horizonText}): **${formatPhp(forecastValue)}**.` +
    (trendText ? ` Projected change vs latest period: **${trendText}**.` : '') +
    histTrendText +
    multiNote +
    confidence +
    ` Recommendation: align cash-flow and capacity plans with this forecast and re-check after the next close.`
  );
}

function buildStaffingReply(payload: AriaContextPayload, userText: string): string {
  const { latestHistoricalLabel, forecastLabel, horizonText } =
    buildForecastPeriodContext(payload, userText);
  const { weekday, staffing } = getStaffingSignals(payload);
  const { services } = getServiceContext(payload);
  const { projectedRevenue, trend } = getRevenueContext(payload);

  // Prefer explicit staffing breakdown when present
  if (staffing.length > 0) {
    const sorted = [...staffing].sort(
      (a, b) => (b.forecastedSessions ?? 0) - (a.forecastedSessions ?? 0),
    );
    const lines = sorted.slice(0, 7).map(
      (d) =>
        `• **${d.day}**: ~${d.forecastedSessions} forecasted sessions (${d.demandLevel || 'n/a'} demand)`,
    );
    return (
      `Staffing outlook for **${forecastLabel}** (${horizonText}; latest history: **${latestHistoricalLabel}**):\n` +
      `${lines.join('\n')}\n\n` +
      `Recommendation: add coverage on the highest-session days first. ` +
      `These figures come from the staffing context derived from operational demand.`
    );
  }

  // Derive from weekday patterns (revenue / sessions)
  if (weekday.length > 0) {
    const enriched = weekday.map((d) => {
      const day = String(d.day ?? 'Unknown');
      const sessions = asNumber(d.sessions) ?? 0;
      const revenue = asNumber(d.revenue) ?? 0;
      return { day, sessions, revenue };
    });
    const maxSessions = Math.max(...enriched.map((d) => d.sessions), 1);
    const lines = enriched
      .slice()
      .sort((a, b) => b.sessions - a.sessions)
      .map((d) => {
        const level =
          d.sessions >= maxSessions * 0.75
            ? 'high'
            : d.sessions >= maxSessions * 0.4
              ? 'medium'
              : 'low';
        return `• **${d.day}**: ${d.sessions} sessions, ${formatPhp(d.revenue)} revenue (${level} demand)`;
      });

    // Rough staff heuristic: assume 1 staff per 4 sessions as a starting rule of thumb
    // (business can tune); only used when no better capacity model exists
    const peak = enriched.reduce((a, b) => (b.sessions > a.sessions ? b : a), enriched[0]);
    const suggestedPeakStaff = Math.max(1, Math.ceil(peak.sessions / 4));

    return (
      `Staffing guidance for **${forecastLabel}** (horizon ${horizonText}; latest history: **${latestHistoricalLabel}**), derived from weekday demand patterns:\n` +
      `${lines.join('\n')}\n\n` +
      `Peak load lands on **${peak.day}** (~${peak.sessions} sessions). ` +
      `A starting coverage estimate is about **${suggestedPeakStaff} staff** on peak days ` +
      `(rule of thumb: ~1 staff per 4 sessions — adjust to your service duration and utilization). ` +
      `Recommendation: schedule extra coverage on high-demand weekdays and match skill mix to top services` +
      (services[0] ? ` such as **${String(services[0].service ?? services[0].name)}**` : '') +
      `.`
    );
  }

  // Last resort: revenue / service signal only
  if (services.length > 0 || projectedRevenue !== null) {
    const topName = services[0]
      ? String(services[0].service ?? services[0].name)
      : null;
    return (
      `I do not yet have day-level staffing or weekday session breakdowns, so a precise headcount cannot be computed. ` +
      `Latest history: **${latestHistoricalLabel}**. Forecast framing: **${forecastLabel}** (${horizonText}). ` +
      (projectedRevenue !== null
        ? `Revenue outlook is ${formatPhp(projectedRevenue)}` +
          (trend !== null ? ` (${formatPct(trend)})` : '') +
          '. '
        : '') +
      (topName ? `Strongest service signal: **${topName}**. ` : '') +
      `Recommendation: load daily session history or enable staffing tracking so ARIA can convert demand into required staff by day.`
    );
  }

  return buildInsufficientDataReply(
    'staffing / session',
    'Add daily operations or weekday session history so staffing can be derived from demand.',
  );
}

function buildExplainForecastReply(payload: AriaContextPayload, userText: string): string {
  const { latestHistoricalLabel, forecastLabel, horizonText, requestedPeriod } =
    buildForecastPeriodContext(payload, userText);
  const { method, modelFit, projectedRevenue, trend, periods } = getRevenueContext(payload);
  const { averageMape, method: svcMethod } = getServiceContext(payload);
  const seriesLen = periods.length;

  const mapeText =
    averageMape !== null
      ? ` Average service-level MAPE is about ${averageMape}% (lower is better).`
      : ' Service-level MAPE is not available in the current snapshot.';

  return (
    `Forecast explanation for **${forecastLabel}** (${horizonText}):\n` +
    `• **Model**: ${method || svcMethod || 'WMA'} (weighted moving average), the same engine used by the VERDE dashboard.\n` +
    `• **History used**: latest available period is **${latestHistoricalLabel}**` +
    (seriesLen > 0 ? ` (${seriesLen} revenue periods loaded)` : '') +
    `.\n` +
    `• **Horizon**: ${requestedPeriod.steps <= 1 ? 'single-step' : `recursive ${requestedPeriod.steps}-step`} projection beyond the last historical point.\n` +
    (projectedRevenue !== null
      ? `• **Revenue projection**: ${formatPhp(projectedRevenue)}` +
        (trend !== null ? ` (${formatPct(trend)} vs latest period)` : '') +
        '.\n'
      : '') +
    (modelFit ? `• **Model fit indicator**: ${modelFit}.\n` : '') +
    `• **Accuracy signal**:${mapeText}\n` +
    `Business implication: use this projection to size inventory, staffing, and spend for ${forecastLabel}; ` +
    `re-forecast after the next period closes so the moving window stays current.`
  );
}

function buildComparisonReply(payload: AriaContextPayload, userText: string): string {
  const { periods } = getRevenueContext(payload);
  const { latestHistoricalLabel } = buildForecastPeriodContext(payload, userText);

  if (periods.length < 2) {
    return (
      `I need at least two revenue periods to compare. ` +
      `Latest history available: **${latestHistoricalLabel}**. ` +
      `Add more historical closes to enable period comparisons.`
    );
  }

  const last = periods[periods.length - 1];
  const prev = periods[periods.length - 2];
  const lastRev = asNumber(last.revenue) ?? 0;
  const prevRev = asNumber(prev.revenue) ?? 0;
  const lastExp = asNumber(last.expenses);
  const prevExp = asNumber(prev.expenses);
  const delta = prevRev > 0 ? ((lastRev - prevRev) / prevRev) * 100 : null;

  let body =
    `Comparison using dashboard history (latest period **${formatMonthLabel(String(last.month ?? ''))}** vs prior **${formatMonthLabel(String(prev.month ?? ''))}**):\n` +
    `• Revenue: ${formatPhp(lastRev)} vs ${formatPhp(prevRev)}` +
    (delta !== null ? ` (${formatPct(delta)})` : '') +
    '.\n';

  if (lastExp !== null && prevExp !== null) {
    body += `• Expenses: ${formatPhp(lastExp)} vs ${formatPhp(prevExp)}.\n`;
    const lastNet = lastRev - lastExp;
    const prevNet = prevRev - prevExp;
    body += `• Net: ${formatPhp(lastNet)} vs ${formatPhp(prevNet)}.\n`;
  }

  body += `Recommendation: investigate the largest movers in services and inventory around the latest period to explain the change.`;
  return body;
}

function buildKpiExplanationReply(userText: string, payload: AriaContextPayload): string {
  const t = userText.toLowerCase();
  const { criticalCount } = getInventoryContext(payload);
  const { averageMape, method } = getServiceContext(payload);
  const { modelFit } = getRevenueContext(payload);

  if (/reorder alert/.test(t)) {
    return (
      `**Reorder alert count** is the number of inventory items whose current stock is at or below their reorder point. ` +
      `Right now the dashboard flags **${criticalCount}** item${criticalCount === 1 ? '' : 's'}. ` +
      `Operational implication: these SKUs need replenishment soon to avoid stockouts that can block services.`
    );
  }

  if (/mape/.test(t)) {
    return (
      `**MAPE** (Mean Absolute Percentage Error) measures average forecast error as a percentage of actuals. ` +
      (averageMape !== null
        ? `Across tracked services the current average MAPE is about **${averageMape}%**. `
        : `A service-level average MAPE is not in the current snapshot. `) +
      `Lower MAPE means the ${method} forecasts have been closer to actual bookings.`
    );
  }

  if (/model fit|forecast method|wma/.test(t)) {
    return (
      `VERDE uses a **weighted moving average (WMA)** forecasting engine for revenue and service demand (same engine the charts use). ` +
      (modelFit ? `Current model-fit indicator: **${modelFit}**. ` : '') +
      `Recent periods are weighted more heavily than older ones, which keeps the forecast responsive without ignoring history.`
    );
  }

  return (
    `I can explain KPIs that appear on the dashboard (reorder alerts, MAPE, projected revenue, model fit, top services). ` +
    `Ask about a specific metric and I will define it from the loaded context.`
  );
}

function buildAmbiguousReply(payload: AriaContextPayload): string {
  const { criticalCount } = getInventoryContext(payload);
  const { services } = getServiceContext(payload);
  const { projectedRevenue, trend } = getRevenueContext(payload);
  const bits: string[] = [];
  if (projectedRevenue !== null) {
    bits.push(`projected revenue ${formatPhp(projectedRevenue)}${trend !== null ? ` (${formatPct(trend)})` : ''}`);
  }
  if (criticalCount > 0) bits.push(`${criticalCount} reorder alert${criticalCount === 1 ? '' : 's'}`);
  if (services[0]) bits.push(`top service ${String(services[0].service ?? services[0].name)}`);

  return (
    `That question is broad — I can dig into revenue, inventory reorders, service demand, or staffing. ` +
    (bits.length > 0 ? `From the current snapshot: ${bits.join('; ')}. ` : '') +
    `Tell me which area you want, or ask something like “What should I reorder this week?” or “What revenue can we expect next month?”.`
  );
}

function buildOutOfScopeReply(): string {
  return (
    `Creative writing is outside ARIA’s scope. ` +
    `I focus on salon operations: revenue forecasts, service demand, inventory reorders, and staffing signals from your VERDE dashboard. ` +
    `Ask about any of those and I will answer from the loaded data.`
  );
}

// ---------------------------------------------------------------------------
// Public entry — data-driven reply
// ---------------------------------------------------------------------------

export function buildDataDrivenAriaReply(
  userText: string,
  payload: AriaContextPayload = {},
): string {
  const intent = classifyAriaIntent(userText, payload.module);

  switch (intent) {
    case 'inventory_reorder':
    case 'inventory_demand':
      return buildInventoryReply(payload, userText);
    case 'service_demand':
      return buildServiceReply(payload, userText, false);
    case 'service_growth':
      return buildServiceReply(payload, userText, true);
    case 'staffing':
      return buildStaffingReply(payload, userText);
    case 'revenue_forecast':
      return buildRevenueReply(payload, userText, false);
    case 'revenue_trend':
      return buildRevenueReply(payload, userText, true);
    case 'explain_forecast':
      return buildExplainForecastReply(payload, userText);
    case 'comparison':
      return buildComparisonReply(payload, userText);
    case 'kpi_explanation':
      return buildKpiExplanationReply(userText, payload);
    case 'ambiguous':
      return buildAmbiguousReply(payload);
    case 'out_of_scope':
      return buildOutOfScopeReply();
    case 'general':
    default: {
      // Try to be useful from whatever data exists
      const { criticalCount } = getInventoryContext(payload);
      const { services } = getServiceContext(payload);
      const { projectedRevenue } = getRevenueContext(payload);
      if (criticalCount > 0) return buildInventoryReply(payload, userText);
      if (projectedRevenue !== null) return buildRevenueReply(payload, userText, false);
      if (services.length > 0) return buildServiceReply(payload, userText, false);
      return (
        `I can help with inventory reorders, service demand, revenue forecasts, and staffing once the relevant history is loaded. ` +
        `Ask a specific operations question tied to those areas.`
      );
    }
  }
}

/**
 * Role-aware payload filter — strips metrics the role must not see
 * before they are injected into prompts or used by the reply builder.
 */
export function filterPayloadForRole(
  payload: AriaContextPayload,
  role: string | null | undefined,
): AriaContextPayload {
  const r = (role ?? 'user').toLowerCase();

  // Full access
  if (r === 'owner' || r === 'admin' || r === 'administrator' || r === 'manager') {
    // Manager: allow ops metrics; optionally strip pure owner financials if you tighten later
    return { ...payload, role: r };
  }

  const filtered: AriaContextPayload = {
    role: r,
    module: payload.module,
    missingDataWarnings: payload.missingDataWarnings,
  };

  if (r === 'inventory' || r === 'inventory_manager') {
    filtered.analyticsContext = {
      inventorySummary: (payload.analyticsContext as any)?.inventorySummary,
      forecastSummary: {
        // services can inform inventory planning
        topServices: (payload.analyticsContext as any)?.forecastSummary?.topServices,
      },
    };
    filtered.criticalRestock = payload.criticalRestock;
    filtered.fullInventory = payload.fullInventory;
    filtered.topServices = payload.topServices;
    return filtered;
  }

  if (r === 'staff' || r === 'receptionist') {
    // Schedule / demand only — no revenue totals, no inventory cost
    filtered.weekdayPatterns = payload.weekdayPatterns;
    filtered.serviceByWeekday = payload.serviceByWeekday;
    filtered.staffing = payload.staffing;
    filtered.topServices = (payload.topServices ?? []).map((s) => ({
      service: s.service ?? s.name,
      bookings: s.bookings,
      category: s.category,
    }));
    filtered.analyticsContext = {
      forecastSummary: {
        topServices: filtered.topServices,
      },
    };
    return filtered;
  }

  if (r === 'finance') {
    filtered.monthlyRevenue = payload.monthlyRevenue;
    filtered.analyticsContext = {
      revenueSummary: (payload.analyticsContext as any)?.revenueSummary,
      forecastSummary: (payload.analyticsContext as any)?.forecastSummary,
    };
    filtered.topServices = payload.topServices;
    filtered.averageMape = payload.averageMape;
    filtered.forecastModelFit = payload.forecastModelFit;
    filtered.forecastMethodUsed = payload.forecastMethodUsed;
    return filtered;
  }

  // Default restricted: only non-sensitive operational hints
  filtered.topServices = (payload.topServices ?? []).map((s) => ({
    service: s.service ?? s.name,
    category: s.category,
  }));
  return filtered;
}

/**
 * Permission check used by the API route.
 * Prefer this over raw keyword matching on the user message alone.
 */
export function isIntentAllowedForRole(role: string | null | undefined, intent: AriaIntent): boolean {
  const r = (role ?? 'user').toLowerCase();
  if (r === 'owner' || r === 'admin' || r === 'administrator' || r === 'manager') return true;

  const matrix: Record<string, AriaIntent[]> = {
    finance: [
      'revenue_forecast',
      'revenue_trend',
      'comparison',
      'explain_forecast',
      'kpi_explanation',
      'ambiguous',
      'general',
    ],
    inventory: [
      'inventory_reorder',
      'inventory_demand',
      'service_demand',
      'kpi_explanation',
      'ambiguous',
      'general',
    ],
    staff: ['staffing', 'service_demand', 'ambiguous', 'general'],
    receptionist: ['staffing', 'service_demand', 'ambiguous', 'general'],
  };

  const allowed = matrix[r];
  if (!allowed) return false;
  return allowed.includes(intent) || intent === 'out_of_scope' || intent === 'ambiguous';
}