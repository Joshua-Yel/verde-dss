'use client';

import React, { useState, useMemo } from 'react';
import LineChart from '@/components/LineChart';
import SmallTable from '@/components/SmallTable';
import type { ForecastModel } from '@/lib/forecast/wma';

type ServiceData = {
  service: string;
  category?: string;
  actuals: number[];
  forecasts: number[];
  forecastsByModel?: Record<ForecastModel, number[]>;
  mape: string;
  mapeByModel?: Record<ForecastModel, string>;
  bookings?: number;
  price?: number;
  forecastRevenue?: number;
  forecastRevenueByModel?: Record<ForecastModel, number>;
};

interface ServiceDemandClientProps {
  initialData: ServiceData[];
  initialLabels: string[];
}

export default function ServiceDemandClient({ initialData, initialLabels }: ServiceDemandClientProps) {
  const svcTable = initialData;
  const totalServicesTracked = svcTable.length;
  const historicalMonths = initialLabels;
  const [forecastModel, setForecastModel] = useState<ForecastModel>('wma');

  const averageMape = useMemo(() => {
    if (totalServicesTracked === 0) return '0.0';
    const total = svcTable.reduce((acc, curr) => {
      const value = curr.mapeByModel?.[forecastModel] ?? curr.mape ?? '0';
      return acc + Number.parseFloat(value);
    }, 0);
    return (total / totalServicesTracked).toFixed(1);
  }, [forecastModel, svcTable, totalServicesTracked]);

  const topServices = [...svcTable]
    .sort((a, b) => (b.bookings ?? 0) - (a.bookings ?? 0))
    .slice(0, 2);

  const forecastModels = [
    {
      value: 'wma' as const,
      label: 'Weighted Moving Average (3)',
      description: 'Gives greater weight to recent historical demand.'
    },
    {
      value: 'sma' as const,
      label: 'Simple Moving Average',
      description: 'Uses the average of the previous periods.'
    },
    {
      value: 'naive' as const,
      label: 'Last Month (Naive)',
      description: 'Uses the previous month\'s demand as the forecast.'
    }
  ];
  const forecastLabels = useMemo(() => ['Next Month', '2 Months Ahead', '3 Months Ahead'], []);

  const [selectedService, setSelectedService] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');

  const selectedServiceData = useMemo(() => {
    return svcTable.find((service) => service.service === selectedService) ?? topServices[0] ?? svcTable[0];
  }, [selectedService, svcTable, topServices]);

  const selectedForecastValues = useMemo(() => {
    if (!selectedServiceData) return [];
    return selectedServiceData.forecastsByModel?.[forecastModel] ?? selectedServiceData.forecasts ?? [];
  }, [forecastModel, selectedServiceData]);

  const filteredTable = useMemo(() => {
    return svcTable
      .filter(s =>
        s.service.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.category || '').toLowerCase().includes(searchTerm.toLowerCase())
      )
      .sort((a, b) => {
        if (a.service === selectedService) return -1;
        if (b.service === selectedService) return 1;
        return 0;
      });
  }, [svcTable, searchTerm, selectedService]);

  const chartDatasets = useMemo(() => {
    const servicesToShow = selectedService
      ? svcTable.filter(s => s.service === selectedService)
      : topServices;

    return servicesToShow.map((service, index) => {
      const forecastValues = service.forecastsByModel?.[forecastModel] ?? service.forecasts ?? [];
      return {
        label: service.service,
        data: [...service.actuals, ...forecastValues],
        borderColor: selectedService || index === 0
          ? 'hsl(var(--primary))'
          : 'hsl(var(--muted-foreground) / 0.6)',
        borderWidth: selectedService ? 3 : 2,
      };
    });
  }, [forecastModel, topServices, svcTable, selectedService]);

  const forecastSummaryValues = useMemo(() => {
    return [selectedForecastValues[0] ?? 0, selectedForecastValues[1] ?? 0, selectedForecastValues[2] ?? 0];
  }, [selectedForecastValues]);

  const chartLabels = useMemo(() => {
    return [
      ...initialLabels,
      ...forecastLabels,
    ];
  }, [forecastLabels, initialLabels]);

  return (
    <>
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
        {[
          { label: 'Services Tracked', icon: (
              <>
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </>
            ), value: `${totalServicesTracked} Active`, desc: 'Continuously monitored' },
          { 
            label: 'Avg. Forecast Error (MAPE)', 
            icon: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
            value: `${averageMape}%`, 
            desc: Number.parseFloat(averageMape) < 12 ? 'Within target range' : 'Above target range' 
          },
          { 
            label: 'Top Service by Volume', 
            icon: (
              <>
                <circle cx="6" cy="6" r="3" />
                <path d="M8.12 8.12 12 12" />
                <path d="M20 4 8.12 15.88" />
                <circle cx="6" cy="18" r="3" />
                <path d="M14.8 14.8 20 20" />
              </>
            ),
            value: topServices[0]?.service ?? 'No data', 
            desc: 'Highest demand' 
          },
        ].map((kpi, index) => (
          <div key={index} className="p-5 rounded-2xl border border-border bg-card shadow-sm flex flex-col justify-between hover:border-primary/30 transition-all duration-200">
            <div className="flex items-start justify-between">
              <span className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">{kpi.label}</span>
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
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
            </div>
            <div className="mt-4">
              <h3 className="text-2xl font-semibold tracking-tight font-mono">{kpi.value}</h3>
              <p className="text-xs text-muted-foreground mt-1">{kpi.desc}</p>
            </div>
          </div>
        ))}
      </div>

    {/* Demand Trends */}
<div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
  {/* Chart */}
  <div className="xl:col-span-9 rounded-2xl border border-border bg-card shadow-sm">
    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 p-6 border-b border-border">
      <div>
        <div className="flex items-center gap-3">
          <h3 className="text-xl font-semibold">Historical Demand</h3>

          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            {selectedService || "Top Services"}
          </span>
        </div>

        <p className="mt-1 text-sm text-muted-foreground">
          Historical bookings with projected demand for the next three periods.
        </p>
      </div>

      <select
        value={selectedService}
        onChange={(e) => setSelectedService(e.target.value)}
        className="w-full lg:w-72 rounded-xl border border-border bg-background px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <option value="">Top Services</option>

        {svcTable.map((s) => (
          <option key={s.service} value={s.service}>
            {s.service}
          </option>
        ))}
      </select>
    </div>

    <div className="p-6">
      <LineChart
        height={360}
        labels={chartLabels}
        datasets={chartDatasets}
      />
    </div>
  </div>

  {/* Forecast Summary */}
  <div className="xl:col-span-3 rounded-2xl border border-border bg-card shadow-sm">
    <div className="p-6 border-b border-border">
      <h3 className="text-lg font-semibold">
        Forecast Summary
      </h3>

      <p className="text-sm text-muted-foreground">
        {selectedServiceData?.service ?? 'No data'} | {selectedServiceData?.category ?? 'General'}
      </p>
    </div>

    <div className="space-y-4 p-6">

      {/* <div className="rounded-xl border border-border p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          Category
        </div>

        <div className="mt-2 font-medium">
          {selectedService
            ? svcTable.find(s => s.service === selectedService)?.category
            : topServices[0]?.category}
        </div>
      </div> */}

      <div className="grid grid-cols-3 gap-2">

        <div className="rounded-xl bg-primary/5 p-3 text-center">
          <div className="text-xs text-muted-foreground">
            Next
          </div>

          <div className="mt-2 font-mono text-lg font-bold text-primary">
            {Math.round(forecastSummaryValues[0] ?? 0)}
          </div>
        </div>

        <div className="rounded-xl bg-muted/40 p-3 text-center">
          <div className="text-xs text-muted-foreground">
            +2
          </div>

          <div className="mt-2 font-mono text-lg font-semibold">
            {Math.round(forecastSummaryValues[1] ?? 0)}
          </div>
        </div>

        <div className="rounded-xl bg-muted/40 p-3 text-center">
          <div className="text-xs text-muted-foreground">
            +3
          </div>

          <div className="mt-2 font-mono text-lg font-semibold">
            {Math.round(forecastSummaryValues[2] ?? 0)}
          </div>
        </div>

      </div>

      <div className="rounded-xl border border-border p-4">
        <div className="flex justify-between">
          <span className="text-sm text-muted-foreground">
            Forecast Accuracy
          </span>

          <span className="font-semibold text-emerald-600">
            {selectedServiceData?.mapeByModel?.[forecastModel] ?? selectedServiceData?.mape ?? '-'}
          </span>
        </div>

        <p className="mt-2 text-xs text-muted-foreground">
          Lower MAPE indicates better forecasting performance.
        </p>
      </div>

      <div className="rounded-xl border border-border p-4">
  <div className="flex items-center justify-between mb-3">
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        Forecast Model
      </div>

      <p className="text-xs text-muted-foreground mt-1">
        Select the forecasting algorithm.
      </p>
    </div>
  </div>

  <select
    value={forecastModel}
    onChange={(e) =>
      setForecastModel(e.target.value as ForecastModel)
    }
    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
  >
    {forecastModels.map((model) => (
      <option key={model.value} value={model.value}>
        {model.label}
      </option>
    ))}
  </select>

  <div className="mt-4 rounded-lg bg-muted/40 p-3">
    <p className="font-medium">
      {
        forecastModels.find(
          (m) => m.value === forecastModel
        )?.label
      }
    </p>

    <p className="mt-1 text-xs text-muted-foreground">
      {
        forecastModels.find(
          (m) => m.value === forecastModel
        )?.description
      }
    </p>
  </div>
</div>
    </div>
  </div>
</div>

      {/* Full Table */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="p-5 border-b border-border bg-muted/40 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div>
            <h3 className="font-semibold tracking-tight">All Services — Forecast</h3>
            <p className="text-sm text-muted-foreground">Historical vs Projected Demand</p>
          </div>

          <input
            type="text"
            placeholder="Search services or categories..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full sm:w-80 bg-background border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="overflow-x-auto p-3">
          <SmallTable
            columns={[
              "Service",
              "Category",
              ...historicalMonths,
              ...forecastLabels,
              "MAPE"
            ]}
            rows={filteredTable.map((s) => {
              const forecastValues = s.forecastsByModel?.[forecastModel] ?? s.forecasts ?? [];
              const forecastRevenue = s.forecastRevenueByModel?.[forecastModel] ?? s.forecastRevenue ?? 0;
              return ({
                Service: (
                  <span className={`font-medium ${s.service === selectedService ? 'text-primary' : ''}`}>
                    {s.service}
                  </span>
                ),
                Category: <span className="text-muted-foreground">{s.category}</span>,
                ...Object.fromEntries(
                  historicalMonths.map((month, i) => [
                      month,
                      <span
                      key={month}
                      className="font-mono text-sm text-muted-foreground/80"
                      >
                      {s.actuals[i] ?? '-'}
                      </span>,
                  ])
                  ),
                  ...Object.fromEntries(
                  forecastLabels.map((label, i) => [
                      label,
                      <span key={label} className={`font-mono text-sm ${
                        s.service === selectedService ? 'text-primary' : 'text-muted-foreground/80'
                      }`}>
                        {forecastValues[i] ?? '-'}
                      </span>,
                  ])
                  ),
                "Next Month": <span className="font-mono font-bold text-primary">{Math.round(forecastValues[0] ?? 0)}</span>,
                "2 Months Ahead": <span className="font-mono text-foreground/80">{Math.round(forecastValues[1] ?? 0)}</span>,
                "3 Months Ahead": <span className="font-mono text-muted-foreground">{Math.round(forecastValues[2] ?? 0)}</span>,
                'Forecast Revenue': <span className="font-mono text-sm text-emerald-600">₱{Math.round(forecastRevenue).toLocaleString()}</span>,
                MAPE: (
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                    Number(s.mapeByModel?.[forecastModel] ?? s.mape) <= 10 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' :
                    Number(s.mapeByModel?.[forecastModel] ?? s.mape) <= 15 ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400' :
                    'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400'
                  }`}>
                    {s.mapeByModel?.[forecastModel] ?? s.mape}
                  </span>
                ),
              })
            })}
          />
        </div>
      </div>
    </>
  );
}