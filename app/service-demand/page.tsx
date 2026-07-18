import React, { Suspense } from 'react';
import { ChartCardSkeleton, TableCardSkeleton } from '@/components/DailyLogSkeleton';
import { getMonths, getServicesForecastTable } from '@/lib/data';
import ServiceDemandClient from './ServiceDemandClient';

export const revalidate = 30;

export default async function ServiceDemandPage() {
  const labels = await getMonths();

  return (
    <div className="space-y-6 mx-auto p-4 md:p-6 text-foreground bg-background transition-colors duration-200">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start border-b border-dashed border-border pb-6">
        <div className="xl:col-span-1 space-y-1.5">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-primary uppercase">
            <span className="h-1.5 w-1.5 bg-secondary rounded-full" />
            Service Demand
          </div>
          <h1 className="font-display text-2xl md:text-3xl font-semibold tracking-tight">Service Demand Forecast</h1>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
            Historical demand and forecast accuracy by service type.
          </p>
        </div>
      </div>

      <Suspense
        fallback={
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 xl:col-span-8"><ChartCardSkeleton height={230} /></div>
              <div className="lg:col-span-5 xl:col-span-4"><ChartCardSkeleton height={230} /></div>
            </div>
            <TableCardSkeleton rows={8} />
          </div>
        }
      >
        <DataLoader labels={labels} />
      </Suspense>
    </div>
  );
}

async function DataLoader({ labels }: { labels: string[] }) {
  const svcTable = await getServicesForecastTable();
  return <ServiceDemandClient initialData={svcTable} initialLabels={labels} />;
}