import { unstable_cache } from 'next/cache';
import {
  getKPIsOverview,
  getRevenueSeries,
  getServicesForecastTable,
  getRestockList,
  getDailyLog,
  getFinancialSummary,
  getInventoryItems,
  getWeekdayPatternsData,
  getServiceByWeekdayData,
} from '@/lib/data';

function getStaffingContext(totalProjectedVolume: number) {
  const dailyBreakdown = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, index) => {
    const dailyMultipliers = [0.45, 0.55, 0.7, 0.8, 0.95, 1.15, 0.2];
    const forecastSessions = Math.max(0, Math.round((totalProjectedVolume / 7) * (dailyMultipliers[index] ?? 1)));
    const demandLevel = forecastSessions > 35 ? 'Critical' : forecastSessions > 25 ? 'Peak' : forecastSessions > 18 ? 'High' : forecastSessions > 10 ? 'Medium' : 'Low';
    const recommendedStaff = forecastSessions === 0 ? 0 : Math.max(1, Math.round(forecastSessions / 12));

    return {
      day,
      forecastedSessions: forecastSessions,
      demandLevel,
      recommendedStaff,
    };
  });

  const heatmapGrid = Array.from({ length: 6 }, (_, dayIdx) =>
    Array.from({ length: 12 }, (_, hourIdx) => {
      const base = Math.round((totalProjectedVolume / 18) * (0.6 + dayIdx * 0.14) + hourIdx * 0.2);
      return Math.min(10, Math.max(1, base));
    })
  );

  return { dailyBreakdown, hourlyHeatmap: heatmapGrid };
}

const buildAriaContextSummary = unstable_cache(
  async (businessId: string | null) => {
    if (!businessId) {
      return null;
    }

    const [kpis, revenueSeries, svcTable, restockList, dailyLog, financialSeries, inventoryItems, weekdayPatterns, serviceByWeekday] = await Promise.all([
      getKPIsOverview({ businessId, lookbackMonths: 12 }),
      getRevenueSeries({ businessId, lookbackMonths: 12 }),
      getServicesForecastTable({ businessId, lookbackMonths: 12 }),
      getRestockList({ businessId, lookbackMonths: 12 }),
      getDailyLog({ businessId, lookbackMonths: 12 }),
      getFinancialSummary({ businessId, lookbackMonths: 12 }),
      getInventoryItems({ businessId, lookbackMonths: 12 }),
      getWeekdayPatternsData({ businessId, lookbackMonths: 12 }),
      getServiceByWeekdayData({ businessId, lookbackMonths: 12 }),
    ]);

    const totalProjectedVolume = svcTable.reduce((sum, service) => sum + Math.round(service.forecasts[0] || 0), 0);
    const staffingContext = getStaffingContext(totalProjectedVolume);

    const periodLabels = (financialSeries.periodLabels ?? []).length > 0 ? financialSeries.periodLabels : revenueSeries.map((_, index) => `P${index + 1}`);
    const monthlyRevenue = periodLabels.map((month, i) => ({
      month,
      revenue: revenueSeries[i] ?? 0,
      expenses: financialSeries.expenseSeries[i] ?? 0,
      netIncome: financialSeries.netIncomeSeries[i] ?? 0,
    }));

    const averageMape = svcTable.length > 0
      ? Math.round((svcTable.reduce((sum, s) => sum + parseFloat(s.mape), 0) / svcTable.length) * 10) / 10
      : null;

    const topServices = [...svcTable]
      .sort((a, b) => (b.bookings ?? 0) - (a.bookings ?? 0))
      .slice(0, 5)
      .map((s) => ({
        service: s.service,
        category: s.category,
        bookings: s.bookings,
        forecastError: s.mape,
      }));

    const criticalRestock = restockList
      .filter((item) => item.stock <= item.rp)
      .slice(0, 10)
      .map((item) => ({
        item: item.name,
        stock: item.stock,
        reorderPoint: item.rp,
        supplier: item.supplier,
      }));

    const trackedCapabilities = {
      tracksCustomers: false,
      tracksStaff: false,
      tracksNoShows: false,
      tracksBookingLeadTime: false,
      tracksTimeOfDay: true,
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
      fullInventory: inventoryItems.slice(0, 16),
      recentOperations: dailyLog.slice(0, 15),
      staffing: {
        dailyBreakdown: staffingContext.dailyBreakdown.slice(0, 7),
        hourlyHeatmap: staffingContext.hourlyHeatmap.slice(0, 6).map((row) => row.slice(0, 12)),
      },
      weekdayPatterns: weekdayPatterns.slice(0, 7),
      serviceByWeekday: serviceByWeekday.slice(0, 7),
      trackedCapabilities,
      dataAvailability: {
        ...(financialSeries.dataAvailability ?? {}),
        trackedCapabilities,
      },
    };
  },
  ['aria-context-summary-v4'],
  { revalidate: 60, tags: ['aria-context'] }
);

export async function getAriaContextSummary(businessId: string | null) {
  return buildAriaContextSummary(businessId);
}
