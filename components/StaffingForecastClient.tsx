'use client';

import React, { useMemo, useState, useCallback } from 'react';
import Heatmap from '@/components/Heatmap';
import SmallTable from '@/components/SmallTable';
import { forecastSeriesForModel } from '@/lib/forecast/wma';
import { bucketKeyForDate, bucketLabelForDate } from '@/lib/dateRange';

const WEEKDAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
const WEEKDAY_SHORT_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

function getDemandLevel(sessions: number) {
  const normalized = Math.max(0, Math.round(sessions));
  if (normalized >= 70) return 'Critical';
  if (normalized >= 40) return 'High';
  if (normalized >= 20) return 'Normal';
  return 'Low';
}

function getBadgeStyle(demand: string) {
  return demand === 'Critical'
    ? 'text-destructive bg-destructive/10 border-destructive/20'
    : demand === 'High'
      ? 'text-orange-700 dark:text-orange-400 bg-orange-500/10 border-orange-500/20'
      : demand === 'Normal'
        ? 'text-primary bg-primary/10 border-primary/20'
        : 'text-zinc-600 dark:text-zinc-400 bg-zinc-500/10 border-zinc-500/20';
}

export type ForecastPeriod = 'day' | 'wow' | 'mom' | 'yoy';

type StaffingRow = {
  day: string;
  forecastSessions: number;
  demand: string;
  recommended: number;
  badgeStyle: string;
  isForecast?: boolean;
};

type DailyLogRow = {
  date: string;
  day?: string | null;
  sessions?: number | null;
  revenue?: number | null;
};

type ServiceForecastRow = {
  service: string;
  category?: string;
  actuals: number[];
  forecasts: number[];
  forecastsByModel?: Record<string, number[]>;
  mape: string;
  mapeByModel?: Record<string, string>;
};

type DisplayKpi = {
  label: string;
  value: string | number | null;
  desc?: string;
  isDestructive?: boolean;
  icon?: React.ReactNode;
};

// ---------- helpers anchored to TODAY ----------
const TODAY = new Date();

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function formatMonthLabel(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function formatWeekLabel(d: Date) {
  const mon = new Date(d);
  mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return mon.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function normalizeWeekdayName(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  const directMap: Record<string, string> = {
    monday: 'Monday',
    tuesday: 'Tuesday',
    wednesday: 'Wednesday',
    thursday: 'Thursday',
    friday: 'Friday',
    saturday: 'Saturday',
    sunday: 'Sunday',
    mon: 'Monday',
    tue: 'Tuesday',
    wed: 'Wednesday',
    thu: 'Thursday',
    fri: 'Friday',
    sat: 'Saturday',
    sun: 'Sunday',
    'mon.': 'Monday',
    'tue.': 'Tuesday',
    'wed.': 'Wednesday',
    'thu.': 'Thursday',
    'fri.': 'Friday',
    'sat.': 'Saturday',
    'sun.': 'Sunday',
  };

  return directMap[normalized] ?? null;
}

export default function StaffingForecastClient({
  svcTable,
  dailyLog,
  monthLabels,
}: {
  svcTable: ServiceForecastRow[];
  dailyLog: DailyLogRow[];
  monthLabels: string[];
}) {
  const [selectedPeriod, setSelectedPeriod] = useState<ForecastPeriod>('day');

  // Explicit next 3 months relative to TODAY (Aug / Sep / Oct 2026)
  const nextMonthLabels = useMemo(
    () => [0, 1, 2].map((i) => formatMonthLabel(addMonths(TODAY, i))),
    []
  );

  const displayMonthLabels = useMemo(
    () =>
      monthLabels.length > 0
        ? monthLabels.slice(-5)
        : ['Period 1', 'Period 2', 'Period 3', 'Period 4', 'Period 5'],
    [monthLabels]
  );

  const parsedDailyLog = useMemo(
    () =>
      dailyLog
        .map((row) => {
          const date = row.date;
          const sessions = Number(row.sessions ?? 0);
          const inferredDay =
            typeof row.day === 'string' && row.day
              ? row.day
              : new Date(date).toLocaleDateString('en-US', { weekday: 'long' });
          const day = normalizeWeekdayName(inferredDay) ?? inferredDay;
          return { date, sessions, day };
        })
        .filter((item) => item.date && Number.isFinite(item.sessions))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [dailyLog]
  );

  const getThresholds = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const maxIndex = Math.max(0, sorted.length - 1);
    return {
      normal: sorted[Math.max(0, Math.floor(maxIndex * 0.5))] ?? 0,
      high: sorted[Math.max(0, Math.floor(maxIndex * 0.75))] ?? 0,
      critical: sorted[Math.max(0, Math.floor(maxIndex * 0.9))] ?? 0,
    };
  };

  const dailySessionValues = useMemo(
    () => parsedDailyLog.map((row) => row.sessions),
    [parsedDailyLog]
  );
  const dailyThresholds = useMemo(
    () => getThresholds(dailySessionValues),
    [dailySessionValues]
  );

  const weekdaySeries = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const row of parsedDailyLog) {
      const day = normalizeWeekdayName(row.day) ?? row.day;
      const bucket = map.get(day) ?? [];
      bucket.push(row.sessions);
      map.set(day, bucket);
    }
    return map;
  }, [parsedDailyLog]);

  const weekdayWeeklySeries = useMemo(() => {
    const map = new Map<string, number[]>();
    const weekBuckets = new Map<string, Record<string, number>>();

    for (const row of parsedDailyLog) {
      const weekKey = bucketKeyForDate(row.date, 'weekly');
      const day = normalizeWeekdayName(row.day) ?? row.day;
      if (!weekKey || !day) continue;

      const bucket = weekBuckets.get(weekKey) ?? {};
      bucket[day] = (bucket[day] ?? 0) + row.sessions;
      weekBuckets.set(weekKey, bucket);
    }

    const sortedWeekKeys = Array.from(weekBuckets.keys()).sort();
    for (const dayName of WEEKDAY_LABELS) {
      const values: number[] = [];
      for (const weekKey of sortedWeekKeys) {
        const bucket = weekBuckets.get(weekKey) ?? {};
        values.push(bucket[dayName] ?? 0);
      }
      map.set(dayName, values);
    }

    return map;
  }, [parsedDailyLog]);

  const weekdayThresholds = useMemo(
    () =>
      new Map(
        WEEKDAY_LABELS.map((dayName) => [dayName, getThresholds(weekdayWeeklySeries.get(dayName) ?? [])])
      ),
    [weekdayWeeklySeries]
  );

  const historicalWeekdaySessions = useMemo(
    () =>
      WEEKDAY_LABELS.map((dayName, index) => {
        const sessions =
          weekdaySeries.get(dayName)?.reduce((sum, value) => sum + value, 0) ?? 0;
        return {
          day: dayName,
          shortLabel: WEEKDAY_SHORT_LABELS[index],
          sessions,
        };
      }),
    [weekdaySeries]
  );

  const weeklySeries = useMemo(() => {
    const buckets = new Map<string, { label: string; sessions: number; key: string }>();
    for (const row of parsedDailyLog) {
      const key = bucketKeyForDate(row.date, 'weekly');
      if (!key) continue;
      const label = bucketLabelForDate(row.date, 'weekly') ?? key;
      const current = buckets.get(key) ?? { label, sessions: 0, key };
      current.sessions += row.sessions;
      buckets.set(key, current);
    }
    return Array.from(buckets.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [parsedDailyLog]);

  const monthlySeries = useMemo(() => {
    const buckets = new Map<string, { label: string; sessions: number; key: string }>();
    for (const row of parsedDailyLog) {
      const key = bucketKeyForDate(row.date, 'monthly');
      if (!key) continue;
      const label = bucketLabelForDate(row.date, 'monthly') ?? key;
      const current = buckets.get(key) ?? { label, sessions: 0, key };
      current.sessions += row.sessions;
      buckets.set(key, current);
    }
    return Array.from(buckets.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [parsedDailyLog]);

  const weeklyThresholds = useMemo(
    () => getThresholds(weeklySeries.map((row) => row.sessions)),
    [weeklySeries]
  );
  const monthlyThresholds = useMemo(
    () => getThresholds(monthlySeries.map((row) => row.sessions)),
    [monthlySeries]
  );

  function getRecommendedStaff(sessions: number) {
    if (sessions >= 120) return 6;
    if (sessions >= 90) return 5;
    if (sessions >= 70) return 4;
    if (sessions >= 50) return 3;
    if (sessions >= 25) return 2;
    return 1;
  }

  const buildRow = useCallback(
    (
      label: string,
      sessions: number,
      thresholds: { normal: number; high: number; critical: number },
      isForecast = false
    ) => {
      const demand = getDemandLevel(sessions);
      const forecastSessions = Math.max(0, Math.round(sessions));
      const recommended = getRecommendedStaff(forecastSessions);
      return {
        day: label,
        forecastSessions,
        demand,
        recommended,
        badgeStyle: getBadgeStyle(demand),
        isForecast,
      } satisfies StaffingRow;
    },
    []
  );

  // ---------- Day rows (weekday pattern + 1-step forecast) ----------
  const dayRows = useMemo(
    () =>
      WEEKDAY_LABELS.map((dayName, index) => {
        const series = weekdayWeeklySeries.get(dayName) ?? [];
        const thresholds = weekdayThresholds.get(dayName) ?? dailyThresholds;
        const forecast =
          forecastSeriesForModel(series, 1, Math.min(3, series.length), 'wma')[0] ?? 0;
        return buildRow(WEEKDAY_SHORT_LABELS[index], forecast, thresholds, true);
      }),
    [weekdayWeeklySeries, weekdayThresholds, dailyThresholds, buildRow]
  );

  // ---------- Week rows: last 4 historical + next week (anchored to today) ----------
  const weekRows = useMemo(() => {
    const actualRows = weeklySeries
      .slice(-4)
      .map((entry) => buildRow(entry.label, entry.sessions, weeklyThresholds, false));

    const history = weeklySeries.map((e) => e.sessions);
    const forecast =
      forecastSeriesForModel(history, 1, Math.min(3, history.length), 'wma')[0] ?? 0;

    const nextWeekLabel = formatWeekLabel(new Date(TODAY.getTime() + 7 * 86400000));
    return [...actualRows, buildRow(nextWeekLabel, forecast, weeklyThresholds, true)];
  }, [weeklySeries, weeklyThresholds, buildRow]);

  // ---------- Month rows: last 4 complete months + THIS month + next 2 ----------
  const monthRows = useMemo(() => {
    const completeMonths = monthlySeries.filter((m) => {
      const [y, mm] = m.key.split('-').map(Number);
      return new Date(y, mm - 1, 1) < startOfMonth(TODAY);
    });

    const actualRows = completeMonths
      .slice(-4)
      .map((entry) => buildRow(entry.label, entry.sessions, monthlyThresholds, false));

    const history = monthlySeries.map((e) => e.sessions);
    const forecasts = forecastSeriesForModel(
      history,
      3,
      Math.min(4, history.length),
      'wma'
    );

    const forecastRows = nextMonthLabels.map((label, i) =>
      buildRow(label, forecasts[i] ?? 0, monthlyThresholds, true)
    );

    return [...actualRows, ...forecastRows];
  }, [monthlySeries, monthlyThresholds, buildRow, nextMonthLabels]);

  // ---------- YoY: last 12 months + next 12 months starting from current month ----------
  const yoyRows = useMemo(() => {
    const actualRows = monthlySeries
      .slice(-12)
      .map((entry) => buildRow(entry.label, entry.sessions, monthlyThresholds, false));

    const history = monthlySeries.map((e) => e.sessions);
    const forecasts = forecastSeriesForModel(
      history,
      12,
      Math.min(6, history.length),
      'wma'
    );

    const forecastRows = forecasts.map((v, i) =>
      buildRow(formatMonthLabel(addMonths(TODAY, i)), v, monthlyThresholds, true)
    );

    return [...actualRows, ...forecastRows];
  }, [monthlySeries, monthlyThresholds, buildRow]);

  // ---------- KPIs ----------
  const peakDemandDay = historicalWeekdaySessions.reduce(
    (best, current) => (current.sessions > best.sessions ? current : best),
    historicalWeekdaySessions[0] ?? { day: 'N/A', shortLabel: 'N/A', sessions: 0 }
  );
  const busiestDayLabel = peakDemandDay.shortLabel;
  const averageDailySessions =
    parsedDailyLog.length > 0
      ? Math.round(
          (parsedDailyLog.reduce((sum, row) => sum + row.sessions, 0) /
            Math.max(parsedDailyLog.length, 1)) *
            10
        ) / 10
      : 0;
  const recentRows = parsedDailyLog.slice(-28);
  const scheduleCorrections = recentRows.filter(
    (row) => row.sessions >= dailyThresholds.high
  ).length;
  const coverageGaps = `${recentRows.filter((row) => row.sessions <= dailyThresholds.normal).length} days`;

  const periodForecasts: Record<ForecastPeriod, StaffingRow[]> = useMemo(
    () => ({
      day: dayRows,
      wow: weekRows,
      mom: monthRows,
      yoy: yoyRows,
    }),
    [dayRows, weekRows, monthRows, yoyRows]
  );

  const selectedRows = periodForecasts[selectedPeriod];

  // ---------- Heatmap grid builders ----------
  const buildHeatmapGrid = useCallback(
    (period: ForecastPeriod): number[][] => {
      const sumSessions = (
        predicate: (r: { date: string; day: string; sessions: number }) => boolean
      ) => parsedDailyLog.filter(predicate).reduce((s, r) => s + r.sessions, 0);

      if (period === 'day') {
        // Rows = weekdays, Cols = last 4 weeks + Next week forecast
        const recentWeeks = weeklySeries.slice(-4);
        return WEEKDAY_LABELS.map((weekday, wi) => {
          const cells = recentWeeks.map((wk) =>
            sumSessions(
              (r) =>
                bucketKeyForDate(r.date, 'weekly') === wk.key && r.day === weekday
            )
          );
          const short = WEEKDAY_SHORT_LABELS[wi];
          const forecast =
            dayRows.find((d) => d.day === short)?.forecastSessions ?? 0;
          return [...cells, forecast];
        });
      }

      if (period === 'wow') {
        // Rows = last 4 weeks + Next week, Cols = Mon–Sun
        const recentWeeks = weeklySeries.slice(-4);
        const rows = recentWeeks.map((wk) =>
          WEEKDAY_LABELS.map((weekday) =>
            sumSessions(
              (r) =>
                bucketKeyForDate(r.date, 'weekly') === wk.key && r.day === weekday
            )
          )
        );

        const nextTotal =
          weekRows[weekRows.length - 1]?.forecastSessions ?? 0;
        const weekdayTotals = WEEKDAY_LABELS.map((d) =>
          (weekdaySeries.get(d) ?? []).reduce((s, v) => s + v, 0)
        );
        const total = weekdayTotals.reduce((s, v) => s + v, 0) || 1;
        const forecastRow = weekdayTotals.map((t) =>
          Math.round(nextTotal * (t / total))
        );
        return [...rows, forecastRow];
      }

      if (period === 'mom') {
        // Rows = last 5 complete months + current + next 2
        // Cols = week-of-month 1–5
        const completeMonths = monthlySeries
          .filter((m) => {
            const [y, mm] = m.key.split('-').map(Number);
            return new Date(y, mm - 1, 1) < startOfMonth(TODAY);
          })
          .slice(-5);

        const histRows = completeMonths.map((month) =>
          [1, 2, 3, 4, 5].map((wkNum) =>
            sumSessions(
              (r) =>
                bucketKeyForDate(r.date, 'monthly') === month.key &&
                Math.ceil(new Date(r.date).getDate() / 7) === wkNum
            )
          )
        );

        const history = monthlySeries.map((e) => e.sessions);
        const forecasts = forecastSeriesForModel(
          history,
          3,
          Math.min(4, history.length),
          'wma'
        );

        // Even split across 5 weeks (simple & stable)
        const forecastRows = forecasts.map((total) => {
          const per = Math.round(total / 5);
          return [per, per, per, per, Math.max(0, total - per * 4)];
        });

        return [...histRows, ...forecastRows];
      }

      if (period === 'yoy') {
        // Rows = years present in data + Forecast row
        // Cols = Jan–Dec
        const yearSet = new Map<string, number>();
        for (const entry of monthlySeries) {
          const year = String(entry.key).split('-')[0];
          yearSet.set(year, 1);
        }
        const years = Array.from(yearSet.keys()).sort();

        const rows = years.map((year) =>
          Array.from({ length: 12 }).map((_, i) => {
            const mm = String(i + 1).padStart(2, '0');
            const key = `${year}-${mm}`;
            return monthlySeries.find((m) => m.key === key)?.sessions ?? 0;
          })
        );

        // Forecast row: 12 months starting from current month
        const history = monthlySeries.map((e) => e.sessions);
        const next12 = forecastSeriesForModel(
          history,
          12,
          Math.min(6, history.length),
          'wma'
        );
        return [...rows, next12.map((v) => Math.round(v))];
      }

      return [];
    },
    [
      parsedDailyLog,
      weeklySeries,
      monthlySeries,
      dayRows,
      weekRows,
      weekdaySeries,
    ]
  );

  const heatmapGrid = useMemo(
    () => buildHeatmapGrid(selectedPeriod),
    [selectedPeriod, buildHeatmapGrid]
  );

  const { heatmapRowLabels, heatmapColLabels } = useMemo(() => {
    if (selectedPeriod === 'day') {
      const recentWeeks = weeklySeries.slice(-4);
      const colLabels = recentWeeks.map((w) => w.label).concat(['Next week']);
      return {
        heatmapRowLabels: WEEKDAY_SHORT_LABELS.slice(),
        heatmapColLabels: colLabels,
      };
    }
    if (selectedPeriod === 'wow') {
      const recentWeeks = weeklySeries.slice(-4);
      const nextWeekLabel = formatWeekLabel(
        new Date(TODAY.getTime() + 7 * 86400000)
      );
      return {
        heatmapRowLabels: recentWeeks.map((w) => w.label).concat([nextWeekLabel]),
        heatmapColLabels: WEEKDAY_SHORT_LABELS.slice(),
      };
    }
    if (selectedPeriod === 'mom') {
      const completeMonths = monthlySeries
        .filter((m) => {
          const [y, mm] = m.key.split('-').map(Number);
          return new Date(y, mm - 1, 1) < startOfMonth(TODAY);
        })
        .slice(-5);
      return {
        heatmapRowLabels: [
          ...completeMonths.map((m) => m.label),
          ...nextMonthLabels,
        ],
        heatmapColLabels: ['W1', 'W2', 'W3', 'W4', 'W5'],
      };
    }
    // yoy
    const yearSet = new Map<string, number>();
    for (const entry of monthlySeries) {
      yearSet.set(String(entry.key).split('-')[0], 1);
    }
    const years = Array.from(yearSet.keys()).sort();
    return {
      heatmapRowLabels: [...years, 'Forecast'],
      heatmapColLabels: [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
      ],
    };
  }, [selectedPeriod, weeklySeries, monthlySeries, nextMonthLabels]);

  // ---------- KPIs ----------
  function pctChange(prev: number, curr: number) {
    if (!Number.isFinite(prev) || prev === 0) return null;
    return Math.round(((curr - prev) / Math.abs(prev)) * 1000) / 10;
  }

  const kpis = useMemo(() => {
    if (selectedPeriod === 'day') {
      const busiest = busiestDayLabel;
      const avg = averageDailySessions;
      const peak = Math.max(...(dailySessionValues.length ? dailySessionValues : [0]));
      const forecastAvg = Math.round(
        dayRows.reduce((s, r) => s + r.forecastSessions, 0) /
          Math.max(1, dayRows.length)
      );
      return [
        { label: 'Busiest Day', value: busiest },
        { label: 'Avg Daily Sessions', value: `${avg}` },
        { label: 'Peak Daily Demand', value: `${peak}` },
        { label: 'Forecast (avg)', value: `${forecastAvg}` },
      ];
    }

    if (selectedPeriod === 'wow') {
      const visibleWeeks = weeklySeries.slice(-8);
      const busiest = visibleWeeks.length
        ? visibleWeeks.reduce((a, b) => (b.sessions > a.sessions ? b : a)).label
        : 'N/A';
      const lastWeek = weeklySeries[weeklySeries.length - 1]?.sessions ?? 0;
      const prevWeek = weeklySeries[weeklySeries.length - 2]?.sessions ?? 0;
      const growth = pctChange(prevWeek, lastWeek);
      const nextWeek = weekRows[weekRows.length - 1]?.forecastSessions ?? 0;
      return [
        { label: 'Busiest Week', value: busiest },
        { label: 'Weekly Growth', value: growth !== null ? `${growth}%` : 'N/A' },
        { label: 'Next Week Forecast', value: `${nextWeek}` },
        {
          label: 'Recent Trend',
          value: `${weeklySeries.slice(-4).map((r) => r.sessions).join(', ')}`,
        },
      ];
    }

    if (selectedPeriod === 'mom') {
      const busiest = monthlySeries.length
        ? monthlySeries.reduce((a, b) => (b.sessions > a.sessions ? b : a)).label
        : 'N/A';
      const last = monthlySeries[monthlySeries.length - 1]?.sessions ?? 0;
      const prev = monthlySeries[monthlySeries.length - 2]?.sessions ?? 0;
      const growth = pctChange(prev, last);
      const thisMonth = monthRows.find((r) => r.isForecast)?.forecastSessions ?? 0;
      return [
        { label: 'Busiest Month', value: busiest },
        { label: 'Monthly Growth', value: growth !== null ? `${growth}%` : 'N/A' },
        { label: 'This Month Forecast', value: `${thisMonth}` },
        {
          label: 'Seasonality',
          value: `${Math.round(
            (monthlyThresholds.critical / Math.max(1, monthlyThresholds.normal)) * 100
          )}%`,
        },
      ];
    }

    // yoy
    const yearMap = new Map<string, number>();
    for (const entry of monthlySeries) {
      const year = String(entry.key).split('-')[0];
      yearMap.set(year, (yearMap.get(year) ?? 0) + entry.sessions);
    }
    const years = Array.from(yearMap.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    );
    const lastYear = years[years.length - 1]?.[1] ?? 0;
    const prevYear = years[years.length - 2]?.[1] ?? 0;
    const growth = pctChange(prevYear, lastYear);
    const annualForecast = heatmapGrid.length
      ? heatmapGrid[heatmapGrid.length - 1].reduce((s, v) => s + v, 0)
      : 0;
    const peakYear = years.length
      ? years.reduce((a, b) => (b[1] > a[1] ? b : a))[0]
      : 'N/A';
    return [
      { label: 'Yearly Growth', value: growth !== null ? `${growth}%` : 'N/A' },
      { label: 'Next 12 mo Forecast', value: `${Math.round(annualForecast)}` },
      { label: 'Historical Peak Year', value: peakYear },
      {
        label: 'Long-term Trend',
        value: `${years.map((y) => `${y[0]}:${y[1]}`).join(', ')}`,
      },
    ];
  }, [
    selectedPeriod,
    dayRows,
    weekRows,
    monthRows,
    monthlySeries,
    weeklySeries,
    dailySessionValues,
    monthlyThresholds,
    heatmapGrid,
    busiestDayLabel,
    averageDailySessions,
  ]);

  const displayKpis = useMemo<DisplayKpi[]>(() => {
    const base: DisplayKpi[] = (kpis ?? []).map((item) => ({
      label: item.label,
      value: item.value ?? null,
      desc: 'Based on historical demand and forecast.',
    }));
    base.push({
      label: 'Schedule Corrections',
      value: `${scheduleCorrections} Shifts`,
      desc: 'Staffing adjustments estimated from daily history',
    });
    base.push({
      label: 'Coverage Gaps',
      value: coverageGaps,
      desc: 'Understaffed intervals based on daily session history',
      isDestructive: true,
    });
    return base;
  }, [kpis, scheduleCorrections, coverageGaps]);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {displayKpis.map((kpi, index) => (
          <div
            key={index}
            className="p-4 rounded-xl border border-border bg-card shadow-xs flex flex-col justify-between group hover:border-primary/30 transition-all duration-200"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                {kpi.label}
              </span>
              <div
                className={`rounded-md p-1 shrink-0 ${
                  kpi.isDestructive
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-primary/10 text-primary'
                }`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width={16}
                  height={16}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {kpi.isDestructive ? (
                    <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  ) : (
                    <path d="M3 3v18h18M7 16l4-4 4 4 5-6" />
                  )}
                </svg>
              </div>
            </div>
            <div className="mt-3">
              <h3
                className={`text-lg md:text-xl font-semibold tracking-tight font-mono ${
                  kpi.isDestructive ? 'text-destructive' : ''
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

      {/* Heatmap + Staff table */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Heatmap */}
        <div className="xl:col-span-8 p-5 rounded-xl border border-border bg-card shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-4 border-b border-border/40">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Demand Heatmap
              </h3>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Historical intensity + forward forecast relative to today.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Period
              </label>
              <select
                value={selectedPeriod}
                onChange={(e) =>
                  setSelectedPeriod(e.target.value as ForecastPeriod)
                }
                className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="day">Day pattern</option>
                <option value="wow">Week-over-Week</option>
                <option value="mom">Month-over-Month</option>
                <option value="yoy">Year-over-Year</option>
              </select>
            </div>
          </div>

          {parsedDailyLog.length === 0 ? (
            <div className="p-6 rounded-xl border border-border/40 bg-muted/20 text-center text-sm text-muted-foreground">
              No daily session history available yet.
            </div>
          ) : (
            <Heatmap
              grid={heatmapGrid}
              rowLabels={heatmapRowLabels}
              colLabels={heatmapColLabels}
            />
          )}
        </div>

        {/* Recommended staff */}
        <div className="xl:col-span-4 p-5 rounded-xl border border-border bg-card shadow-xs flex flex-col">
          <div className="pb-4 mb-3 border-b border-border/40">
            <h3 className="text-sm font-semibold tracking-tight text-foreground">
              Recommended Staff
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {selectedPeriod === 'day'
                ? 'By weekday'
                : selectedPeriod === 'wow'
                  ? 'Recent weeks + next week'
                  : selectedPeriod === 'mom'
                    ? 'Recent months + next 3 months'
                    : 'History + next 12 months'}
            </p>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border text-muted-foreground font-medium">
                  <th className="pb-2 font-medium">
                    {selectedPeriod === 'day'
                      ? 'Day'
                      : selectedPeriod === 'wow'
                        ? 'Week'
                        : 'Month'}
                  </th>
                  <th className="pb-2 text-right font-medium">Sessions</th>
                  <th className="pb-2 text-center font-medium">Demand</th>
                  <th className="pb-2 text-right font-medium pr-1">Staff</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 text-foreground/90">
                {selectedRows.map((row) => (
                  <tr
                    key={String(row.day)}
                    className={`hover:bg-muted/40 transition-colors group ${
                      row.isForecast ? 'bg-primary/5' : ''
                    }`}
                  >
                    <td className="py-2.5 font-medium group-hover:text-primary transition-colors">
                      {row.day}
                      {row.isForecast && (
                        <span className="ml-1.5 text-[9px] text-primary font-semibold">
                          F
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 text-right font-mono text-muted-foreground">
                      {row.forecastSessions}
                    </td>
                    <td className="py-2.5 text-center">
                      <span
                        className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border inline-block min-w-[55px] text-center ${row.badgeStyle}`}
                      >
                        {row.demand}
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-semibold font-mono text-primary pr-1">
                      {row.recommended}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Service forecast table */}
      <div className="p-5 rounded-xl border border-border bg-card shadow-xs">
        <div className="pb-4 mb-3 border-b border-border/40">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            Forecast by Service
          </h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Actuals + next 3 months (anchored to today). MAPE shown for model quality.
          </p>
        </div>
        <div className="overflow-x-auto">
          <SmallTable
            columns={[
              'Service',
              'Category',
              ...displayMonthLabels,
              ...nextMonthLabels,
              'MAPE',
            ]}
            rows={svcTable.map((service) => {
              const forecastValues =
                service.forecastsByModel?.wma ?? service.forecasts ?? [];
              const mapeValue =
                service.mapeByModel?.wma ?? service.mape ?? '0.0%';
              const numericMape = Number.parseFloat(mapeValue);
              const displayedActuals = service.actuals.slice(
                -displayMonthLabels.length
              );

              return {
                Service: (
                  <span className="font-medium text-foreground text-xs">
                    {service.service}
                  </span>
                ),
                Category: (
                  <span className="text-muted-foreground text-xs">
                    {service.category}
                  </span>
                ),
                ...Object.fromEntries(
                  displayMonthLabels.map((label, index) => [
                    label,
                    <span
                      key={label}
                      className="font-mono text-xs text-muted-foreground/80"
                    >
                      {displayedActuals[index] ?? '-'}
                    </span>,
                  ])
                ),
                ...Object.fromEntries(
                  nextMonthLabels.map((label, index) => [
                    label,
                    <span
                      key={label}
                      className={`font-mono text-xs ${
                        index === 0
                          ? 'font-bold text-primary'
                          : 'font-medium text-foreground/80'
                      }`}
                    >
                      {Math.round(forecastValues[index] || 0)}
                    </span>,
                  ])
                ),
                MAPE: (
                  <span
                    className={`font-mono text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                      Number.isFinite(numericMape) && numericMape < 10
                        ? ''
                        : 'bg-zinc-500/10 text-muted-foreground'
                    }`}
                    style={
                      Number.isFinite(numericMape) && numericMape < 10
                        ? {
                            backgroundColor: 'hsl(var(--success) / 0.1)',
                            color: 'hsl(var(--success))',
                          }
                        : undefined
                    }
                  >
                    {mapeValue}
                  </span>
                ),
              };
            })}
          />
        </div>
      </div>
    </div>
  );
}