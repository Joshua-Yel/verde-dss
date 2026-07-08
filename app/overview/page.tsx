import React, { Suspense } from 'react';
import Card from '../../components/Card';
import LineChart from '../../components/LineChart';
import RevenuePieChart from '../../components/RevenuePieChart';
import DailyLogSection from '../../components/DailyLogSection';
import {
  getKPIsOverview,
  getRevenueSeries,
  getTopServices,
  getRestockList,
  getServicesForecastTable,
  getDailyLog,
} from '../../lib/data';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface PageProps {
  searchParams?: Promise<{ span?: string }> | { span?: string } | undefined;
}

export default async function OverviewPage({ searchParams }: PageProps) {
  const resolvedParams =
    searchParams && typeof searchParams === 'object' && 'then' in searchParams
      ? await searchParams
      : searchParams || {};
  const currentSpan = resolvedParams?.span || '14';

  const kpis = await getKPIsOverview();
  const revenue = await getRevenueSeries();
  const top = await getTopServices();
  const restock = await getRestockList();
  const svcTable = await getServicesForecastTable();
  const dailyLog = await getDailyLog() ?? [];

  const spanDays = currentSpan === 'all' ? null : Number(currentSpan);
  const spanThreshold = spanDays && !Number.isNaN(spanDays)
    ? new Date(Date.now() - (spanDays - 1) * 24 * 60 * 60 * 1000)
    : null;

  const filteredDailyLog = spanThreshold
    ? dailyLog.filter((row) => {
        const rowDate = new Date(row.date);
        return !Number.isNaN(rowDate.getTime()) && rowDate >= spanThreshold;
      })
    : dailyLog;

  return (
    <div className="space-y-6 mx-auto p-4 md:p-6 text-foreground bg-background transition-colors duration-200">

      {/* HEADER */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start border-b border-dashed border-border pb-6">
        <div className="xl:col-span-1 space-y-1">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-primary uppercase">
            <span className="h-1.5 w-1.5 bg-secondary" />
            Overview
          </div>
          <h1 className="font-display text-2xl md:text-3xl font-semibold tracking-tight">Operations Overview</h1>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
            Revenue, top services, and reorder alerts. Jan – May 2025.
          </p>
        </div>

        <div className="xl:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-3 w-full">
          {[
            {
              label: "This month's forecast",
              value: `₱${kpis.projectedRevenue.toLocaleString()}`,
              desc: `${kpis.projectedPct}% vs last month`,
              isAlert: false,
              icon: (
                <>
                  <path d="M22 7 13.5 15.5 8.5 10.5 2 17" />
                  <path d="M16 7h6v6" />
                </>
              ),
            },
            {
              label: "Most booked service",
              value: kpis.topService.name,
              desc: `${kpis.topService.bookings} bookings · ${kpis.topService.category}`,
              isAlert: false,
              icon: (
                <>
                  <circle cx="6" cy="6" r="3" />
                  <path d="M8.12 8.12 12 12" />
                  <path d="M20 4 8.12 15.88" />
                  <circle cx="6" cy="18" r="3" />
                  <path d="M14.8 14.8 20 20" />
                </>
              ),
            },
            {
              label: "Items below stock",
              value: `${kpis.reorderAlerts} SKUs`,
              desc: "Need a purchase order soon",
              isAlert: Number(kpis.reorderAlerts) > 0,
              icon: (
                <>
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                  <path d="M12 9v4" />
                  <path d="M12 17h.01" />
                </>
              ),
            },
            {
              label: "Forecast method",
              value: kpis.modelFit,
              desc: "Weighted average, last 3 months",
              isAlert: false,
              icon: (
                <>
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="12" cy="12" r="6" />
                  <circle cx="12" cy="12" r="2" />
                </>
              ),
            },
          ].map((kpi, i) => (
            <div
              key={i}
              className="p-4 rounded-xl border border-border bg-card shadow-xs flex flex-col justify-between group transition-all duration-200"
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
                    kpi.isAlert ? "text-destructive" : ""
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
      </div>

      {/* CHARTS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">

        <div className="lg:col-span-7 xl:col-span-7 p-6 rounded-xl border border-border bg-card shadow-xs flex flex-col justify-between">
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-border/40">
              <div>
                <h3 className="text-sm font-semibold tracking-tight text-foreground">Revenue Forecast</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">Monthly revenue, actual vs. forecast.</p>
              </div>

              <div className="flex items-center gap-3 text-[10px] font-medium">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full ring-2 ring-offset-1 ring-offset-card ring-primary/40 bg-primary" />
                  <span className="text-muted-foreground">Actual</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full ring-2 ring-offset-1 ring-offset-card ring-border bg-muted-foreground/60" />
                  <span className="text-muted-foreground">Forecast</span>
                </div>
              </div>
            </div>

            <div className="w-full pt-2">
              <LineChart
                height={340}
                labels={["Jan", "Feb", "Mar", "Apr", "May"]}
                datasets={[
                  {
                    label: "Actual",
                    data: Array.isArray(revenue) ? revenue.map(Number) : [],
                  },
                  {
                    label: "Forecast",
                    data: Array.isArray(revenue)
                      ? revenue.map((v, i) => (i < revenue.length - 3 ? null : Number(v)))
                      : [],
                  },
                ]}
              />
            </div>
          </div>

          <p className="mt-6 pt-3 border-t border-border/40 text-[11px] text-muted-foreground">
            Forecast weights the most recent month more heavily than earlier ones.
          </p>
        </div>

        <div className="lg:col-span-5 xl:col-span-5 p-6 rounded-xl border border-border bg-card shadow-xs flex flex-col">
          <div className="pb-4 border-b border-border/40">
            <h3 className="text-sm font-semibold tracking-tight text-foreground">Revenue by Service</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Share of total revenue, last 6 months.
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
            Ranked by contribution to gross revenue across all booked service lines.
          </p>
        </div>
      </div>

      <DailyLogSection dailyLog={dailyLog} />

    </div>
  );
}