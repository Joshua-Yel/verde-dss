import React, { Suspense } from 'react';
import SmallTable from '@/components/SmallTable';
import { StaffingHeatmapSkeleton, TableCardSkeleton } from '@/components/DailyLogSkeleton';
import { getServicesForecastTable, getWeekdayPatternsData, getMonths } from '@/lib/data';

export const revalidate = 30;

export default function StaffingPage() {
  return (
    <div className="space-y-6 mx-auto p-4 md:p-6 text-foreground bg-background transition-colors duration-200">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start border-b border-dashed border-border pb-6">
        <div className="xl:col-span-1 space-y-1.5">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-primary uppercase">
            <span className="h-1.5 w-1.5 bg-secondary" />
            Staffing
          </div>
          <h1 className="font-display text-2xl md:text-3xl font-semibold tracking-tight">Staffing &amp; Peak Hours</h1>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
            Plan staff coverage around forecasted demand, hour by hour.
          </p>
        </div>
      </div>

      <Suspense
        fallback={(
          <div className="space-y-6">
            <StaffingHeatmapSkeleton />
            <TableCardSkeleton rows={8} />
          </div>
        )}
      >
        <StaffingContent />
      </Suspense>
    </div>
  );
}

async function StaffingContent() {
  const [svcTable, weekdayPatterns, monthLabels] = await Promise.all([
    getServicesForecastTable(),
    getWeekdayPatternsData(),
    getMonths(),
  ]);

  const displayMonthLabels = monthLabels.length > 0
    ? monthLabels.slice(-5)
    : ['Period 1', 'Period 2', 'Period 3', 'Period 4', 'Period 5'];

  const totalProjectedVolume = svcTable.reduce((sum, service) => {
    const nextMonthForecast = service.forecastsByModel?.wma?.[0] ?? service.forecasts?.[0] ?? 0;
    return sum + Math.round(nextMonthForecast || 0);
  }, 0);

  const weekdayLabels = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
  const weekdayShortLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
  const weekdayLookup = new Map(
    weekdayPatterns.map((entry) => [String(entry.day ?? '').toLowerCase(), entry])
  );

  const recommendedStaffing = weekdayLabels.map((dayName, index) => {
    const entry = weekdayLookup.get(dayName.toLowerCase()) ?? weekdayLookup.get(weekdayShortLabels[index].toLowerCase());
    const actualSessions = Number(entry?.sessions ?? 0);
    const forecastSessions = actualSessions > 0
      ? Math.max(0, Math.round(actualSessions))
      : Math.max(1, Math.round((totalProjectedVolume / 7) * (index === 5 || index === 6 ? 1.08 : 0.94)));
    const demand = forecastSessions > 35 ? 'Critical' : forecastSessions > 25 ? 'Peak' : forecastSessions > 18 ? 'High' : forecastSessions > 10 ? 'Medium' : 'Low';
    const recommended = forecastSessions === 0 ? '0 Staff' : `${Math.max(1, Math.round(forecastSessions / 12))} Staff`;
    const badgeStyle = forecastSessions === 0
      ? 'text-muted-foreground bg-secondary/10 opacity-50'
      : demand === 'Critical'
        ? 'text-destructive bg-destructive/10 border-destructive/20'
        : demand === 'Peak'
          ? 'text-orange-700 dark:text-orange-400 bg-orange-500/10 border-orange-500/20'
          : demand === 'High'
            ? 'text-amber-700 dark:text-amber-400 bg-amber-500/10 border-amber-500/20'
            : 'text-zinc-600 dark:text-zinc-400 bg-zinc-500/10 border-zinc-500/20';

    return {
      day: weekdayShortLabels[index],
      forecastSessions,
      demand,
      recommended,
      badgeStyle,
    };
  });

  const maxDailyDemand = Math.max(1, ...recommendedStaffing.map((row) => row.forecastSessions));
  const heatmapGrid = recommendedStaffing.map((row) => {
    const hourlyWeights = [0.55, 0.66, 0.78, 0.92, 1.08, 1.24, 1.45, 1.62, 1.42, 1.12, 0.84, 0.62];
    const weekendBoost = row.day === 'Sat' || row.day === 'Sun' ? 1.08 : 1;
    const normalizedDemand = row.forecastSessions / maxDailyDemand;
    return Array.from({ length: 12 }, (_, hourIdx) => {
      const loadFactor = 1 + normalizedDemand * 8.5 * hourlyWeights[hourIdx] * weekendBoost;
      return Math.min(10, Math.max(1, Math.round(loadFactor)));
    });
  });

  const heatmapValues = heatmapGrid.flat();
  const peakCell = heatmapGrid
    .flatMap((row, dayIdx) => row.map((value, hourIdx) => ({ dayIdx, hourIdx, value })))
    .reduce((best, current) => (current.value > best.value ? current : best), { dayIdx: 0, hourIdx: 0, value: 0 });
  const peakDayLabel = weekdayShortLabels[peakCell.dayIdx] ?? `D${peakCell.dayIdx + 1}`;
  const peakHourLabel = `${peakCell.hourIdx + 9 > 12 ? `${peakCell.hourIdx + 9 - 12} PM` : peakCell.hourIdx + 9 === 12 ? '12 PM' : `${peakCell.hourIdx + 9} AM`}`;
  const averageUtilization = (heatmapValues.reduce((sum, value) => sum + value, 0) / heatmapValues.length / 10) * 100;
  const scheduleCorrections = recommendedStaffing.filter((row) => row.demand === 'Critical' || row.demand === 'Peak' || row.demand === 'High').length;
  const coverageGapHours = `${(heatmapValues.filter((value) => value >= 8).length / 2).toFixed(1)} hrs`;

  return (
    <>
      <div className="xl:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-3 w-full">
        {[
          {
            label: 'Peak Demand Slot',
            value: `${peakDayLabel} ${peakHourLabel}`,
            desc: 'Highest traffic hour',
            icon: (
              <>
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </>
            ),
          },
          {
            label: 'Avg Utilization',
            value: `${averageUtilization.toFixed(1)}%`,
            desc: 'Booked capacity',
            icon: (
              <>
                <path d="m12 14 4-4" />
                <path d="M3.34 19a10 10 0 1 1 17.32 0" />
              </>
            ),
          },
          {
            label: 'Schedule Corrections',
            value: `${scheduleCorrections} Shifts`,
            desc: 'Under- or over-staffed',
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
            label: 'Coverage Gaps',
            value: coverageGapHours,
            desc: 'Understaffed intervals',
            isDestructive: true,
            icon: (
              <>
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
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
                className={`rounded-md p-1 shrink-0 ${
                  kpi.isDestructive
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-primary/10 text-primary'
                }`}
              >
                {kpi.icon}
              </svg>
            </div>
            <div className="mt-3">
              <h3 className={`text-lg md:text-xl font-semibold tracking-tight font-mono ${kpi.isDestructive ? 'text-destructive' : ''}`}>{kpi.value}</h3>
              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{kpi.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="p-5 rounded-xl border border-border bg-card shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-4 border-b border-border/40">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Session Volume by Hour</h3>
            <p className="mt-1 text-[11px] text-muted-foreground">Mon–Sun, 9:00 AM–8:00 PM.</p>
          </div>

          <div className="flex items-center gap-1 text-[9px] text-muted-foreground font-mono bg-background/60 p-1.5 rounded-lg border border-border/30 self-start sm:self-center">
            <span>Low</span>
            <div className="flex gap-0.5 px-1">
              {['bg-primary/5', 'bg-primary/25', 'bg-primary/50', 'bg-primary/75', 'bg-primary'].map((bg, idx) => (
                <span key={idx} className={`w-2.5 h-2.5 rounded-xs ${bg}`} />
              ))}
            </div>
            <span>Peak</span>
          </div>
        </div>

        <div className="p-3 bg-muted/30 rounded-xl border border-border/40 overflow-x-auto">
          <div className="min-w-[700px] w-full">
            <Heatmap grid={heatmapGrid} />
          </div>
        </div>

        <p className="mt-4 pt-3 border-t border-border/40 text-[11px] text-muted-foreground">
          Demand surges between 12:00 PM and 3:00 PM on weekends — schedule extra coverage into that window.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-5 xl:col-span-4 p-5 rounded-xl border border-border bg-card shadow-xs flex flex-col justify-between">
          <div>
            <div className="pb-4 mb-3 border-b border-border/40">
              <h3 className="text-sm font-semibold tracking-tight flex items-center gap-2 text-foreground">
                Recommended Staff by Day
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Based on next period&apos;s forecast.</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border text-muted-foreground font-medium">
                    <th className="pb-2 font-medium">Day</th>
                    <th className="pb-2 text-right font-medium">Fc. Vol</th>
                    <th className="pb-2 text-center font-medium">Demand</th>
                    <th className="pb-2 text-right font-medium pr-1">Staff</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 text-foreground/90">
                  {recommendedStaffing.map((row) => (
                    <tr key={row.day} className="hover:bg-muted/40 transition-colors group">
                      <td className="py-2.5 font-medium group-hover:text-primary transition-colors">{row.day}</td>
                      <td className="py-2.5 text-right font-mono text-muted-foreground">{row.forecastSessions}</td>
                      <td className="py-2.5 text-center">
                        <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border inline-block min-w-[55px] text-center ${row.badgeStyle}`}>
                          {row.demand}
                        </span>
                      </td>
                      <td className="py-2.5 text-right font-semibold font-mono text-primary pr-1">{row.recommended}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 xl:col-span-8 p-5 rounded-xl border border-border bg-card shadow-xs flex flex-col">
          <div className="pb-4 mb-3 border-b border-border/40">
            <h3 className="text-sm font-semibold tracking-tight text-foreground">Forecast by Service</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Actuals and 3-month forecast, with model error (MAPE).</p>
          </div>
          <div className="overflow-x-auto">
            <SmallTable
              columns={[
                "Service",
                "Category",
                ...displayMonthLabels,
                "Next Month",
                "2 Months Ahead",
                "3 Months Ahead",
                "MAPE",
              ]}
              rows={svcTable.map((service) => {
                const forecastValues = service.forecastsByModel?.wma ?? service.forecasts ?? [];
                const mapeValue = service.mapeByModel?.wma ?? service.mape ?? '0.0%';
                const numericMape = Number.parseFloat(mapeValue);
                const displayedActuals = service.actuals.slice(-displayMonthLabels.length);

                return {
                  Service: <span className="font-medium text-foreground text-xs">{service.service}</span>,
                  Category: <span className="text-muted-foreground text-xs">{service.category}</span>,
                  ...Object.fromEntries(
                    displayMonthLabels.map((label, index) => [
                      label,
                      <span key={label} className="font-mono text-xs text-muted-foreground/80">
                        {displayedActuals[index] ?? '-'}
                      </span>,
                    ])
                  ),
                  'Next Month': <span className="font-mono font-bold text-xs text-primary">{Math.round(forecastValues[0] || 0)}</span>,
                  '2 Months Ahead': <span className="font-mono font-medium text-xs text-foreground/80">{Math.round(forecastValues[1] || 0)}</span>,
                  '3 Months Ahead': <span className="font-mono text-xs text-muted-foreground">{Math.round(forecastValues[2] || 0)}</span>,
                  MAPE: <span className={`font-mono text-[11px] font-semibold px-1.5 py-0.5 rounded ${Number.isFinite(numericMape) && numericMape < 10 ? '' : 'bg-zinc-500/10 text-muted-foreground'}`} style={Number.isFinite(numericMape) && numericMape < 10 ? { backgroundColor: 'hsl(var(--success) / 0.1)', color: 'hsl(var(--success))' } : undefined}>{mapeValue}</span>,
                };
              })}
            />
          </div>
        </div>
      </div>
    </>
  );
}

function Heatmap({ grid }: { grid: number[][] }) {
  const hours = Array.from({ length: 12 }, (_, i) => 9 + i);
  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="space-y-2 mt-1">
      {grid.map((row, rIdx) => (
        <div key={rIdx} className="flex gap-1.5 items-center">
          <span className="w-10 text-[11px] font-semibold text-muted-foreground font-sans tracking-wide">
            {dayNames[rIdx] || `D${rIdx + 1}`}
          </span>
          <div className="flex flex-1 gap-1">
            {row.map((val, cIdx) => {
              let bg = "bg-primary/5";
              if (val > 2) bg = "bg-primary/20";
              if (val > 4) bg = "bg-primary/45";
              if (val > 6) bg = "bg-primary/75";
              if (val > 8) bg = "bg-primary";
              return (
                <div
                  key={cIdx}
                  title={`${dayNames[rIdx]} at ${hours[cIdx]}:00 — ${val}`}
                  className={`flex-1 h-8 rounded-md transition-all duration-150 hover:scale-[1.05] hover:shadow-xs hover:ring-1 hover:ring-primary/60 cursor-pointer ${bg}`}
                />
              );
            })}
          </div>
        </div>
      ))}

      <div className="flex gap-1 pl-[46px] pt-1">
        {hours.map((h) => (
          <span key={h} className="flex-1 text-center text-[10px] font-mono text-muted-foreground/70 tracking-tighter">
            {h > 12 ? `${h - 12}pm` : h === 12 ? '12pm' : `${h}am`}
          </span>
        ))}
      </div>
    </div>
  );
}