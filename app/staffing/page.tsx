import React, { Suspense } from 'react';
import { StaffingHeatmapSkeleton, TableCardSkeleton } from '@/components/DailyLogSkeleton';
import StaffingForecastClient from '@/components/StaffingForecastClient';
import { getServicesForecastTable, getWeekdayPatternsData, getDailyLog, getMonths } from '@/lib/data';

export const revalidate = 30;

export default async function StaffingPage() {
  const [svcTable, , dailyLog, monthLabels] = await Promise.all([
    getServicesForecastTable(),
    getWeekdayPatternsData(),
    getDailyLog(),
    getMonths(),
  ]);

  return (
    <div className="space-y-6 mx-auto max-w-[1600px] p-4 md:p-6 text-foreground bg-background transition-colors duration-200">
      {/* Header */}
      <div className="border-b border-dashed border-border pb-6">
        <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-primary uppercase mb-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
          Staffing
        </div>
        <h1 className="font-display text-2xl md:text-3xl font-semibold tracking-tight">
          Staffing &amp; Peak Hours
        </h1>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed max-w-xl">
          Plan coverage around forecasted demand. Forecasts are anchored to today
          (not the last imported data point).
        </p>
      </div>

      <Suspense
        fallback={
          <div className="space-y-6">
            <StaffingHeatmapSkeleton />
            <TableCardSkeleton rows={8} />
          </div>
        }
      >
        <StaffingForecastClient
          svcTable={svcTable}
          dailyLog={dailyLog}
          monthLabels={monthLabels}
        />
      </Suspense>
    </div>
  );
}