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
} from '@/lib/data';

/**
 * Derive staffing signals from weekday session / revenue patterns.
 * Replaces the previous empty stub so ARIA can answer staffing questions.
 */
function buildStaffingContext(
  weekdayPatterns: Array<{ day?: string; sessions?: number; revenue?: number }>,
) {
  if (!Array.isArray(weekdayPatterns) || weekdayPatterns.length === 0) {
    return {
      dailyBreakdown: [] as Array<{ day: string; forecastedSessions: number; demandLevel: string }>,
      hourlyHeatmap: [] as number[][],
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

  return {
    dailyBreakdown,
    hourlyHeatmap: [] as number[][],
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
};

const buildMissingDataWarnings = ({ financialSeries, inventoryItems, inventoryAnalytics }: MissingDataWarningInput) => {
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
    ]);

    const staffingContext = buildStaffingContext(weekdayPatterns ?? []);

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

    // Honest capability flags — extend when real tracking is wired
    const trackedCapabilities = {
      tracksCustomers: false,
      tracksStaff: staffingContext.dailyBreakdown.length > 0,
      tracksNoShows: false,
      tracksBookingLeadTime: false,
      tracksTimeOfDay: false,
    };

    const missingDataWarnings = buildMissingDataWarnings({
      financialSeries,
      inventoryItems,
      inventoryAnalytics,
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
      availableMetrics: {
        revenue: revenueSeries.length > 0,
        expenses: Boolean(financialSeries.dataAvailability?.expenseDataAvailable),
        inventory: inventoryItems.length > 0,
        reorderPoint: inventoryItems.some(
          (item: { reorderPoint?: number | null }) => item.reorderPoint !== null,
        ),
        staffing: staffingContext.dailyBreakdown.length > 0,
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
      // Keep enough history for multi-step inventory WMA in ARIA
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
        hourlyHeatmap: staffingContext.hourlyHeatmap.slice(0, 6).map((row) => row.slice(0, 12)),
      },
      weekdayPatterns: (weekdayPatterns ?? []).slice(0, 7),
      serviceByWeekday: (serviceByWeekday ?? []).slice(0, 7),
      trackedCapabilities,
      dataAvailability: {
        ...(financialSeries.dataAvailability ?? {}),
        trackedCapabilities,
      },
      analyticsContext,
      missingDataWarnings,
    };
  },
  ['aria-context-summary-v6-staffing-horizon'],
  { revalidate: 15, tags: ['aria-context'] },
);

export async function getAriaContextSummary(businessId: string | null) {
  return buildAriaContextSummary(businessId);
}