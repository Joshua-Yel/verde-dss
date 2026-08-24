import { unstable_cache } from 'next/cache';
import {
  getKPIsOverview,
  getRevenueSeries,
  getServicesForecastTable,
  getRestockList,
  getDailyLog,
  getFinancialSummary,
  getInventoryItems,
  getInventoryAnalytics,
  getWeekdayPatternsData,
  getServiceByWeekdayData,
  getHourPatternsData,
  getTimeOfDayAvailabilityData,
} from '@/lib/data';

type WeekdayRow = { day?: string; sessions?: number; revenue?: number };

type HourPatterns = {
  byHour?: Array<{ hour: number; label: string; sessions: number }>;
  peakHours?: Array<{ hour: number; label: string; sessions: number; share: number }>;
  amSessions?: number;
  pmSessions?: number;
  earliestHour?: number | null;
  latestHour?: number | null;
  heatmap?: number[][];
};

/**
 * Derive staffing signals from weekday session patterns + real hour-of-day data.
 */
function buildStaffingContext(
  weekdayPatterns: WeekdayRow[],
  hourPatterns: HourPatterns | null,
  timeOfDayFillRate: number,
) {
  if (!Array.isArray(weekdayPatterns) || weekdayPatterns.length === 0) {
    return {
      dailyBreakdown: [] as Array<{ day: string; forecastedSessions: number; demandLevel: string }>,
      hourlyHeatmap: [] as number[][],
      peakHours: [] as Array<{ hour: number; label: string; sessions: number; share: number }>,
      amSessions: 0,
      pmSessions: 0,
      earliestHour: null as number | null,
      latestHour: null as number | null,
      hasTimeOfDay: false,
      timeOfDayFillRate: 0,
    };
  }

  const sessions = weekdayPatterns.map((d) => Number(d.sessions ?? 0));
  const maxSessions = Math.max(...sessions, 1);

  const dailyBreakdown = weekdayPatterns.map((d) => {
    const forecastedSessions = Number(d.sessions ?? 0);
    const demandLevel =
      forecastedSessions >= maxSessions * 0.75
        ? 'high'
        : forecastedSessions >= maxSessions * 0.4
          ? 'medium'
          : 'low';
    return {
      day: String(d.day ?? 'Unknown'),
      forecastedSessions,
      demandLevel,
    };
  });

  const hasTimeOfDay = timeOfDayFillRate >= 0.05 && Array.isArray(hourPatterns?.peakHours) && (hourPatterns?.peakHours?.length ?? 0) > 0;

  // Prefer real weekday×hour heatmap when available; otherwise empty
  let hourlyHeatmap: number[][] = [];
  if (hasTimeOfDay && Array.isArray(hourPatterns?.heatmap) && hourPatterns!.heatmap!.length === 7) {
    // Compress 24 hours → 12 buckets (2-hour blocks) to keep payload small
    hourlyHeatmap = hourPatterns!.heatmap!.map((dayRow) => {
      const compressed: number[] = [];
      for (let i = 0; i < 24; i += 2) {
        compressed.push((dayRow[i] ?? 0) + (dayRow[i + 1] ?? 0));
      }
      return compressed;
    });
  }

  return {
    dailyBreakdown,
    hourlyHeatmap,
    peakHours: hasTimeOfDay ? (hourPatterns?.peakHours ?? []).slice(0, 5) : [],
    amSessions: hasTimeOfDay ? Number(hourPatterns?.amSessions ?? 0) : 0,
    pmSessions: hasTimeOfDay ? Number(hourPatterns?.pmSessions ?? 0) : 0,
    earliestHour: hasTimeOfDay ? (hourPatterns?.earliestHour ?? null) : null,
    latestHour: hasTimeOfDay ? (hourPatterns?.latestHour ?? null) : null,
    hasTimeOfDay,
    timeOfDayFillRate,
  };
}

type MissingDataWarningInput = {
  financialSeries: {
    dataAvailability?: { expenseDataAvailable?: boolean };
    periodLabels?: string[];
  };
  inventoryItems: Array<Record<string, unknown>>;
  inventoryAnalytics: {
    hasInventoryHistory?: boolean;
  };
  timeOfDayFillRate: number;
};

const buildMissingDataWarnings = ({
  financialSeries,
  inventoryItems,
  inventoryAnalytics,
  timeOfDayFillRate,
}: MissingDataWarningInput) => {
  const warnings: string[] = [];
  if (!financialSeries.dataAvailability?.expenseDataAvailable) {
    warnings.push('Expense records are unavailable; profit or net income calculations are not supported.');
  }
  if (inventoryItems.length === 0) {
    warnings.push('No current inventory records are available for stock or reorder analysis.');
  }
  if (!inventoryAnalytics.hasInventoryHistory) {
    warnings.push('Inventory history is insufficient to calculate usage-based forecasts for stock.');
  }
  if (!financialSeries.periodLabels || financialSeries.periodLabels.length === 0) {
    warnings.push('Revenue history is insufficient to build a reliable forecast.');
  }
  if (timeOfDayFillRate < 0.05) {
    warnings.push(
      'Time-of-day data is missing or sparse; peak-hour and shift-timing answers will use weekday patterns only.',
    );
  }
  return warnings;
};

const buildAriaContextSummary = unstable_cache(
  async (businessId: string | null) => {
    if (!businessId) {
      return null;
    }

    const [
      kpis,
      revenueSeries,
      svcTable,
      restockList,
      dailyLog,
      financialSeries,
      inventoryItems,
      inventoryAnalytics,
      weekdayPatterns,
      serviceByWeekday,
      hourPatterns,
      timeAvailability,
    ] = await Promise.all([
      getKPIsOverview({ businessId, displayRange: 'all' }),
      getRevenueSeries({ businessId, displayRange: 'all' }),
      getServicesForecastTable({ businessId, displayRange: 'all' }),
      getRestockList({ businessId, displayRange: 'all' }),
      getDailyLog({ businessId, displayRange: 'all' }),
      getFinancialSummary({ businessId, displayRange: 'all' }),
      getInventoryItems({ businessId, displayRange: 'all' }),
      getInventoryAnalytics({ businessId, displayRange: 'all' }),
      getWeekdayPatternsData({ businessId, displayRange: 'all' }),
      getServiceByWeekdayData({ businessId, displayRange: 'all' }),
      getHourPatternsData({ businessId, displayRange: 'all' }),
      getTimeOfDayAvailabilityData({ businessId, displayRange: 'all' }),
    ]);

    const timeOfDayFillRate = Number(
      (timeAvailability as { timeOfDayFillRate?: number })?.timeOfDayFillRate ?? 0,
    );

    const staffingContext = buildStaffingContext(
      weekdayPatterns ?? [],
      hourPatterns as HourPatterns,
      timeOfDayFillRate,
    );

    const periodLabels =
      (financialSeries.periodLabels ?? []).length > 0
        ? financialSeries.periodLabels
        : revenueSeries.map((_: unknown, index: number) => `P${index + 1}`);
    const monthlyRevenue = periodLabels.map((month: string, i: number) => ({
      month,
      revenue: revenueSeries[i] ?? 0,
      expenses: financialSeries.expenseSeries[i] ?? 0,
      netIncome: financialSeries.netIncomeSeries[i] ?? 0,
    }));

    const averageMape =
      svcTable.length > 0
        ? Math.round(
            (svcTable.reduce((sum: number, s: { mape: string }) => sum + parseFloat(s.mape), 0) /
              svcTable.length) *
              10,
          ) / 10
        : null;

    const topServices = [...svcTable]
      .sort((a: { bookings?: number }, b: { bookings?: number }) => (b.bookings ?? 0) - (a.bookings ?? 0))
      .slice(0, 5)
      .map((s: { service: string; category: string; bookings?: number; mape: string }) => ({
        service: s.service,
        category: s.category,
        bookings: s.bookings,
        forecastError: s.mape,
      }));

    const criticalRestock = (restockList ?? [])
      .filter((item: { rp?: number | null; stock?: number | null }) => {
        const stock = typeof item.stock === 'number' ? item.stock : Number(item.stock ?? 0);
        const rp = typeof item.rp === 'number' ? item.rp : Number(item.rp ?? 0);
        return Number.isFinite(stock) && Number.isFinite(rp) && stock <= rp;
      })
      .slice(0, 10);

    const trackedCapabilities = {
      tracksCustomers: false,
      tracksStaff: staffingContext.dailyBreakdown.length > 0,
      tracksNoShows: false,
      tracksBookingLeadTime: false,
      tracksTimeOfDay: staffingContext.hasTimeOfDay,
    };

    const missingDataWarnings = buildMissingDataWarnings({
      financialSeries,
      inventoryItems,
      inventoryAnalytics,
      timeOfDayFillRate,
    });

    const analyticsContext = {
      revenueSummary: {
        latestRevenue: revenueSeries[revenueSeries.length - 1] ?? 0,
        periods: monthlyRevenue,
        projectedRevenueNextMonth: kpis.projectedRevenue,
        projectedRevenueChangePct: kpis.projectedPct,
        forecastModelFit: kpis.modelFit,
        forecastMethodUsed: financialSeries.forecastMethodUsed ?? 'WMA',
      },
      inventorySummary: {
        currentInventoryCount: inventoryItems.length,
        criticalRestockCount: restockList.length,
        inventoryHistoryAvailable: inventoryAnalytics.hasInventoryHistory,
        topUsageItems: inventoryAnalytics.topUsageItems,
        reorderPriorityItems: inventoryAnalytics.reorderPriorityItems,
        yearOverYearUsage: inventoryAnalytics.yearOverYearUsage,
      },
      forecastSummary: {
        totalServicesTracked: svcTable.length,
        averageMape,
        topServices,
        forecastMethodUsed: financialSeries.forecastMethodUsed ?? 'WMA',
      },
      staffingSummary: {
        hasTimeOfDay: staffingContext.hasTimeOfDay,
        timeOfDayFillRate: staffingContext.timeOfDayFillRate,
        peakHours: staffingContext.peakHours,
        amSessions: staffingContext.amSessions,
        pmSessions: staffingContext.pmSessions,
        earliestHour: staffingContext.earliestHour,
        latestHour: staffingContext.latestHour,
      },
      availableMetrics: {
        revenue: revenueSeries.length > 0,
        expenses: Boolean(financialSeries.dataAvailability?.expenseDataAvailable),
        inventory: inventoryItems.length > 0,
        reorderPoint: inventoryItems.some(
          (item: { reorderPoint?: number | null }) => item.reorderPoint !== null,
        ),
        staffing: staffingContext.dailyBreakdown.length > 0,
        timeOfDay: staffingContext.hasTimeOfDay,
      },
      missingDataWarnings,
      trackedCapabilities,
    };

    return {
      projectedRevenueNextMonth: kpis.projectedRevenue,
      projectedRevenueChangePct: kpis.projectedPct,
      topService: kpis.topService,
      reorderAlertCount: kpis.reorderAlerts,
      forecastModelFit: kpis.modelFit,
      averageMape,
      totalServicesTracked: svcTable.length,
      forecastMethodUsed: financialSeries.forecastMethodUsed ?? 'WMA',
      monthlyRevenue,
      topServices,
      criticalRestock,
      fullInventory: inventoryItems.slice(0, 50).map((item: Record<string, unknown>) => ({
        ...item,
        history: Array.isArray((item as { history?: unknown }).history)
          ? (item as { history?: Array<Record<string, unknown>> }).history?.slice(0, 24)
          : [],
      })),
      inventoryAnalytics,
      recentOperations: dailyLog.slice(0, 15),
      staffing: {
        dailyBreakdown: staffingContext.dailyBreakdown.slice(0, 7),
        hourlyHeatmap: staffingContext.hourlyHeatmap.slice(0, 7),
        peakHours: staffingContext.peakHours,
        amSessions: staffingContext.amSessions,
        pmSessions: staffingContext.pmSessions,
        earliestHour: staffingContext.earliestHour,
        latestHour: staffingContext.latestHour,
        hasTimeOfDay: staffingContext.hasTimeOfDay,
        timeOfDayFillRate: staffingContext.timeOfDayFillRate,
      },
      weekdayPatterns: (weekdayPatterns ?? []).slice(0, 7),
      serviceByWeekday: (serviceByWeekday ?? []).slice(0, 7),
      trackedCapabilities,
      dataAvailability: {
        ...(financialSeries.dataAvailability ?? {}),
        timeOfDayFillRate: staffingContext.timeOfDayFillRate,
        trackedCapabilities,
      },
      analyticsContext,
      missingDataWarnings,
    };
  },
  ['aria-context-summary-v7-timeofday'],
  { revalidate: 15, tags: ['aria-context'] },
);

export async function getAriaContextSummary(businessId: string | null) {
  return buildAriaContextSummary(businessId);
}
