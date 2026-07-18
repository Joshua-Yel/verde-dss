import React, { Suspense } from 'react';
import LineChart from '../../components/LineChart';
import RevenuePieChart from '../../components/RevenuePieChart';
import DailyLogSection from '../../components/DailyLogSection';
import { KpiRowSkeleton, ChartCardSkeleton, TableCardSkeleton } from '../../components/DailyLogSkeleton';
import {
  getKPIsOverview,
  getRevenueSeries,
  getMonths,
  getServicesForecastTable,
  getDailyLog,
  getFinancialSummary,
} from '../../lib/data';

export const revalidate = 30;

interface PageProps {
  searchParams?: Promise<{ span?: string }> | { span?: string } | undefined;
}

export default async function OverviewPage({ searchParams }: PageProps) {
  const searchParamsObject =
    searchParams && typeof searchParams === 'object' && 'then' in searchParams
      ? await searchParams
      : searchParams || {};

  return (
    <div className="space-y-6 mx-auto p-4 md:p-6 text-foreground bg-background transition-colors duration-200">

      {/* HEADER & MAIN BUSINESS METRICS CARD WRAPPER */}
      <div className="space-y-6 border-b border-dashed border-border pb-6">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-primary uppercase">
            <span className="h-1.5 w-1.5 bg-secondary rounded-full" />
            Overview
          </div>
          <h1 className="font-display text-2xl md:text-3xl font-semibold tracking-tight">Operations Overview</h1>
          <Suspense fallback={<p className="text-xs text-muted-foreground leading-relaxed max-w-xl">Financial trends, operational metrics, and predictive insights.</p>}>
            <OverviewSubheading />
          </Suspense>
        </div>

        {/* Dynamic KPI Rows Injection Point */}
        <Suspense fallback={<KpiRowSkeleton />}>
          <KpiSection />
        </Suspense>
      </div>

      {/* CHARTS CONTAINER */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-7 xl:col-span-7">
          <Suspense fallback={<ChartCardSkeleton height={340} />}>
            <RevenueChartSection />
          </Suspense>
        </div>

        <div className="lg:col-span-5 xl:col-span-5">
          <Suspense fallback={<ChartCardSkeleton height={340} />}>
            <RevenueByServiceSection />
          </Suspense>
        </div>
      </div>

      {/* HISTORICAL WORKLOG STREAMS */}
      <Suspense fallback={<TableCardSkeleton />}>
        <DailyLogStreamSection />
      </Suspense>

    </div>
  );
}

async function OverviewSubheading() {
  // Previously this was a hardcoded "Jan – May 2025" string, disconnected
  // from the actual imported data. If the underlying date range changes
  // (new imports, different months), the header would silently keep
  // showing the old range. Deriving it from the real query removes that
  // class of bug entirely — this call is deduped with every other
  // getX() call on this page via the cache() wrap in lib/data/supabase.ts,
  // so it doesn't add an extra round-trip.
  const summary = await getFinancialSummary();
  const labels = summary.periodLabels ?? [];
  const rangeText = labels.length > 0
    ? labels.length === 1
      ? labels[0]
      : `${labels[0]} – ${labels[labels.length - 1]}`
    : 'No data imported yet';

  return (
    <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
      Financial trends, operational metrics, and predictive insights. {rangeText}.
    </p>
  );
}

async function KpiSection() {
  const kpis = await getKPIsOverview();
  
  const totalSessions = Number(kpis.totalSessions ?? 0);
  const totalRevenue = Number(kpis.totalRevenue ?? 0);
  const avgDailyRev = Number(kpis.avgDailyRevenue ?? 0);
  const totalNetIncome = Number(kpis.totalNetIncome ?? 0);

  const cards = [
    {
      label: "Total Sessions Recorded",
      value: totalSessions.toLocaleString(),
      desc: "Completed patient workflows",
      icon: (
        <>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </>
      ),
    },
    {
      label: "Avg Daily Revenue",
      value: `₱${Math.round(avgDailyRev).toLocaleString()}`,
      desc: "Rolling platform utilization yield",
      icon: (
        <>
          <line x1="12" x2="12" y1="2" y2="22" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </>
      ),
    },
    {
      label: "Total Revenue",
      value: `₱${Math.round(totalRevenue).toLocaleString()}`,
      desc: "Cumulative gross earnings",
      icon: (
        <>
          <rect width="20" height="12" x="2" y="6" rx="2" />
          <circle cx="12" cy="12" r="2" />
          <path d="M6 12h.01M18 12h.01" />
        </>
      ),
    },
    {
      label: "Total Net Income",
      value: `₱${Math.round(totalNetIncome).toLocaleString()}`,
      desc: "Net income after operating costs",
      icon: (
        <>
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          <circle cx="12" cy="12" r="10" className="opacity-20" />
        </>
      ),
    },
    {
      label: "This Month's Forecast",
      value: `₱${kpis.projectedRevenue.toLocaleString()}`,
      desc: `${kpis.projectedPct}% variance versus last period`,
      icon: (
        <>
          <path d="M22 7 13.5 15.5 8.5 10.5 2 17" />
          <path d="M16 7h6v6" />
        </>
      ),
    },
    {
      label: "Most Booked Service",
      value: kpis.topService.name,
      desc: `${kpis.topService.bookings} slots · ${kpis.topService.category}`,
      icon: (
        <>
          <circle cx="6" cy="6" r="3" />
          <path d="M8.12 8.12 12 12M20 4 8.12 15.88" />
          <circle cx="6" cy="18" r="3" />
          <path d="M14.8 14.8 20 20" />
        </>
      ),
    },
    {
      label: "Items Below Stock",
      value: `${kpis.reorderAlerts} Items`,
      desc: "Action required via procurement",
      isAlert: Number(kpis.reorderAlerts) > 0,
      icon: (
        <>
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
          <path d="M12 9v4M12 17h.01" />
        </>
      ),
    },
    {
      label: "Forecast Engine Model",
      value: kpis.modelFit,
      desc: "Weighted dynamic moving averages",
      icon: (
        <>
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="2" />
        </>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 w-full">
      {cards.map((kpi, i) => (
        <div
          key={i}
          className="p-4 rounded-xl border border-border bg-card shadow-2xs flex flex-col justify-between group hover:border-primary/20 transition-all duration-200"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase truncate block">
              {kpi.label}
            </span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`p-1 rounded-md shrink-0 ${
                kpi.isAlert
                  ? "bg-destructive/10 text-destructive"
                  : "bg-primary/10 text-primary"
              }`}
            >
              {kpi.icon}
            </svg>
          </div>

          <div className="mt-3">
            <h3
              className={`text-sm md:text-base font-semibold tracking-tight truncate font-mono ${
                kpi.isAlert ? "text-destructive" : "text-foreground"
              }`}
            >
              {kpi.value}
            </h3>
            <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
              {kpi.desc}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

async function RevenueChartSection() {
  const revenue = await getRevenueSeries();
  const labels = await getMonths();

  return (
    <div className="h-full p-6 rounded-xl border border-border bg-card shadow-2xs flex flex-col justify-between">
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-border/40">
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-foreground">Revenue Run Rate</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">Realized billing cycles compared to baseline trend forecasts.</p>
          </div>

          <div className="flex items-center gap-3 text-[10px] font-medium">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full ring-2 ring-offset-1 ring-offset-card ring-primary/40 bg-primary" />
              <span className="text-muted-foreground">Actual Revenue</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full ring-2 ring-offset-1 ring-offset-card ring-border bg-muted-foreground/60" />
              <span className="text-muted-foreground">Forecast Trend</span>
            </div>
          </div>
        </div>

        <div className="w-full pt-2">
          <LineChart
            height={340}
            labels={labels}
            datasets={[
              {
                label: "Actual",
                data: Array.isArray(revenue) ? revenue.map(Number) : [],
                borderColor: 'hsl(var(--primary))',
              },
              {
                label: "Forecast",
                data: Array.isArray(revenue)
                  ? revenue.map((v, i) => (i < revenue.length - 3 ? null : Number(v)))
                  : [],
                borderColor: 'hsl(var(--muted-foreground) / 0.5)',
              },
            ]}
          />
        </div>
      </div>

      <p className="mt-6 pt-3 border-t border-border/40 text-[11px] text-muted-foreground">
        Projections emphasize heavy variable weighting on modern operational performance metrics.
      </p>
    </div>
  );
}

async function RevenueByServiceSection() {
  const svcTable = await getServicesForecastTable();

  return (
    <div className="h-full p-6 rounded-xl border border-border bg-card shadow-2xs flex flex-col">
      <div className="pb-4 border-b border-border/40">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">Revenue Allocation Structure</h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Percent breakdown of absolute volume across all service lines.
        </p>
      </div>

      <div className="flex-1 flex items-center justify-center py-1">
        <div className="w-full max-w-[410px] h-[410px]">
          <RevenuePieChart
            data={svcTable.map((service) => Number(service.bookings ?? service.actuals?.[service.actuals.length - 1] ?? 0))}
            labels={svcTable.map((service) => service.service)}
          />
        </div>
      </div>

      <p className="pt-3 border-t border-border/40 text-[10px] text-muted-foreground">
        Ranked via raw contribution margins across global transactional pipelines.
      </p>
    </div>
  );
}

async function DailyLogStreamSection() {
  const dailyLog = await getDailyLog();

  return <DailyLogSection dailyLog={dailyLog} />;
}