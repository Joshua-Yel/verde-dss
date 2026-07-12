import React, { Suspense } from 'react';
import LineChart from '@/components/LineChart';
import SmallTable from '@/components/SmallTable';
import { ChartCardSkeleton, TableCardSkeleton } from '@/components/DailyLogSkeleton';
import { getServicesForecastTable } from '@/lib/data';

export const revalidate = 30;

export default function ServiceDemandPage() {
  return (
    <div className="space-y-6 mx-auto p-4 md:p-6 text-foreground bg-background transition-colors duration-200">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start border-b border-dashed border-border pb-6">
        <div className="xl:col-span-1 space-y-1.5">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-primary uppercase">
            <span className="h-1.5 w-1.5 bg-secondary" />
            Service Demand
          </div>
          <h1 className="font-display text-2xl md:text-3xl font-semibold tracking-tight">Service Demand Forecast</h1>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
            Historical demand and forecast accuracy, by service.
          </p>
        </div>
      </div>

      <Suspense
        fallback={(
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 xl:col-span-8"><ChartCardSkeleton height={230} /></div>
              <div className="lg:col-span-5 xl:col-span-4"><ChartCardSkeleton height={230} /></div>
            </div>
            <TableCardSkeleton rows={8} />
          </div>
        )}
      >
        <ServiceDemandContent />
      </Suspense>
    </div>
  );
}

async function ServiceDemandContent() {
  const svcTable = await getServicesForecastTable();
  const totalServicesTracked = svcTable.length;
  const averageMape = totalServicesTracked > 0
    ? (svcTable.reduce((acc, curr) => acc + Number.parseFloat(curr.mape), 0) / totalServicesTracked).toFixed(1)
    : '0.0';
  const topServices = [...svcTable]
    .sort((left, right) => (right.bookings ?? 0) - (left.bookings ?? 0))
    .slice(0, 2);
  const chartLabels = topServices[0]?.actuals?.length ? Array.from({ length: topServices[0].actuals.length }, (_, index) => `P${index + 1}`) : [];

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
        {[
          {
            label: 'Services Tracked',
            value: `${totalServicesTracked} Active`,
            desc: 'Continuously monitored',
            icon: (
              <>
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </>
            ),
          },
          {
            label: 'Avg. Forecast Error (MAPE)',
            value: `${averageMape}%`,
            desc: Number.parseFloat(averageMape) < 12 ? 'Within target range' : 'Above target range',
            icon: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
          },
          {
            label: 'Top Service by Volume',
            value: topServices[0]?.service ?? 'No data',
            desc: 'Most consistent demand',
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
        ].map((kpi, index) => (
          <div key={index} className="p-4 rounded-xl border border-border bg-card shadow-xs flex flex-col justify-between group hover:border-primary/30 transition-all duration-200">
            <div className="flex items-start justify-between gap-2">
              <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">{kpi.label}</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width={20}
                height={20}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="rounded-md bg-primary/10 p-1 text-primary shrink-0"
              >
                {kpi.icon}
              </svg>
            </div>
            <div className="mt-3">
              <h3 className="text-lg md:text-xl font-semibold tracking-tight font-mono">{kpi.value}</h3>
              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{kpi.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-7 xl:col-span-8 p-5 rounded-xl border border-border bg-card shadow-xs flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-border/40">
              <div>
                <h3 className="text-sm font-semibold tracking-tight text-foreground">Top Services — Historical Demand</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">Monthly sessions for the two highest-volume services.</p>
              </div>

              <div className="flex items-center gap-3 text-[10px] font-medium">
                {topServices.map((service, index) => (
                  <div key={service.service} className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ring-2 ring-offset-1 ring-offset-card ${index === 0 ? 'ring-primary/40 bg-primary' : 'ring-border bg-muted-foreground/60'}`} />
                    <span className="text-muted-foreground">{service.service}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-2 bg-background/40 rounded-xl border border-border/40">
              <LineChart
                height={230}
                labels={chartLabels}
                datasets={topServices.map((service, index) => ({
                  label: service.service,
                  data: service.actuals,
                  borderColor: index === 0 ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground) / 0.5)',
                }))}
              />
            </div>
          </div>

          <p className="mt-4 pt-3 border-t border-border/40 text-[11px] text-muted-foreground">
            Precision Cut & Style holds the most stable month-to-month volume of any service.
          </p>
        </div>

        <div className="lg:col-span-5 xl:col-span-4 p-5 rounded-xl border border-border bg-card shadow-xs flex flex-col justify-between">
          <div className="space-y-4">
            <div className="pb-4 border-b border-border/40">
              <h3 className="text-sm font-semibold tracking-tight text-foreground">How the Forecast Works</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">The two numbers behind every projection on this page.</p>
            </div>

            <div className="space-y-3">
              <div className="p-3.5 rounded-lg border border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors duration-150">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <span className="flex h-1.5 w-1.5 rounded-full bg-primary" />
                  Weighted Moving Average (n=3)
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
                  Forecasts the next month using the last three, giving the most recent month the heaviest weight.
                </p>
              </div>

              <div className="p-3.5 rounded-lg border border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors duration-150">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <span className="flex h-1.5 w-1.5 rounded-full bg-secondary" />
                  Forecast Error (MAPE)
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
                  How far past forecasts were from what actually happened, on average. Lower is more accurate.
                </p>
              </div>
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground leading-tight border-t border-border/40 pt-3 mt-4">
            Recalculated automatically at the end of each month.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
        <div className="p-4 bg-muted/40 border-b border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-foreground">All Services — Forecast</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">Historical actuals against 3-month forward targets.</p>
          </div>
          <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded border bg-card text-muted-foreground shadow-xs self-start sm:self-center">
            F1 = next month
          </span>
        </div>
        <div className="p-3 overflow-x-auto">
          <SmallTable
            columns={["Service", "Category", "Jan", "Feb", "Mar", "Apr", "May", "F1", "F2", "F3", "MAPE"]}
            rows={svcTable.map((s) => ({
              Service: <span className="font-medium text-foreground text-xs">{s.service}</span>,
              Category: <span className="text-muted-foreground text-xs">{s.category}</span>,
              Jan: <span className="font-mono text-xs text-muted-foreground/80">{s.actuals[0]}</span>,
              Feb: <span className="font-mono text-xs text-muted-foreground/80">{s.actuals[1]}</span>,
              Mar: <span className="font-mono text-xs text-muted-foreground/80">{s.actuals[2]}</span>,
              Apr: <span className="font-mono text-xs text-muted-foreground/80">{s.actuals[3]}</span>,
              May: <span className="font-mono text-xs text-muted-foreground/80">{s.actuals[4]}</span>,
              F1: <span className="font-mono font-bold text-xs text-primary">{Math.round(s.forecasts[0] || 0)}</span>,
              F2: <span className="font-mono font-medium text-xs text-foreground/80">{Math.round(s.forecasts[1] || 0)}</span>,
              F3: <span className="font-mono text-xs text-muted-foreground">{Math.round(s.forecasts[2] || 0)}</span>,
              MAPE: (
                <span
                  className="font-mono text-[11px] font-semibold px-1.5 py-0.5 rounded inline-block text-center"
                  style={
                    Number.parseFloat(s.mape) <= 10
                      ? { backgroundColor: 'hsl(var(--success) / 0.1)', color: 'hsl(var(--success))' }
                      : Number.parseFloat(s.mape) <= 15
                        ? undefined
                        : undefined
                  }
                >
                  {s.mape}%
                </span>
              ),
            }))}
          />
        </div>
      </div>
    </>
  );
}