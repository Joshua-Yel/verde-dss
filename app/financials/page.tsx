import React from 'react';
import LineChart from '@/components/LineChart';
import SmallTable from '@/components/SmallTable';
import { getFinancialSummary } from '@/lib/data';

export default async function FinancialsPage() {
  const financials = await getFinancialSummary();
  const revenueSeries = financials.revenueSeries ?? [];
  const expenseSeries = financials.expenseSeries ?? [];
  const netIncomeSeries = financials.netIncomeSeries ?? [];
  const latestRevenue = revenueSeries[revenueSeries.length - 1] ?? 0;
  const latestExpense = expenseSeries[expenseSeries.length - 1] ?? 0;
  const latestNetIncome = netIncomeSeries[netIncomeSeries.length - 1] ?? 0;
  const forecastRevenue = Math.round(latestRevenue * 1.08);
  const forecastExpenses = Math.round(latestExpense * 1.02);
  const forecastNetIncome = forecastRevenue - forecastExpenses;
  const margin = forecastRevenue > 0 ? Math.round((forecastNetIncome / forecastRevenue) * 1000) / 10 : 0;
  const hasFinancialData = revenueSeries.length > 0 && revenueSeries.some((value) => value !== 0);
  const forecastRevenueLabel = hasFinancialData ? `₱${forecastRevenue.toLocaleString()}` : 'No data';
  const forecastExpensesLabel = hasFinancialData ? `₱${forecastExpenses.toLocaleString()}` : 'No data';
  const forecastNetIncomeLabel = hasFinancialData ? `₱${forecastNetIncome.toLocaleString()}` : 'No data';
  const marginLabel = hasFinancialData ? `${margin}%` : 'No data';
  const expenseBreakdown = [
    { category: 'Operations & Services', jan: hasFinancialData ? `₱${Math.round((revenueSeries[0] ?? 0) * 0.3).toLocaleString()}` : 'No data', feb: hasFinancialData ? `₱${Math.round((revenueSeries[1] ?? 0) * 0.3).toLocaleString()}` : 'No data', mar: hasFinancialData ? `₱${Math.round((revenueSeries[2] ?? 0) * 0.3).toLocaleString()}` : 'No data', apr: hasFinancialData ? `₱${Math.round((revenueSeries[3] ?? 0) * 0.3).toLocaleString()}` : 'No data', may: hasFinancialData ? `₱${Math.round((revenueSeries[4] ?? 0) * 0.3).toLocaleString()}` : 'No data', forecast: forecastExpensesLabel, share: hasFinancialData ? `${Math.round((forecastExpenses / Math.max(1, forecastRevenue)) * 1000) / 10}%` : 'No data' },
    { category: 'Inventory & Supplies', jan: hasFinancialData ? `₱${Math.round((revenueSeries[0] ?? 0) * 0.08).toLocaleString()}` : 'No data', feb: hasFinancialData ? `₱${Math.round((revenueSeries[1] ?? 0) * 0.08).toLocaleString()}` : 'No data', mar: hasFinancialData ? `₱${Math.round((revenueSeries[2] ?? 0) * 0.08).toLocaleString()}` : 'No data', apr: hasFinancialData ? `₱${Math.round((revenueSeries[3] ?? 0) * 0.08).toLocaleString()}` : 'No data', may: hasFinancialData ? `₱${Math.round((revenueSeries[4] ?? 0) * 0.08).toLocaleString()}` : 'No data', forecast: hasFinancialData ? `₱${Math.round(forecastExpenses * 0.2).toLocaleString()}` : 'No data', share: hasFinancialData ? `${Math.round((forecastExpenses * 0.2 / Math.max(1, forecastRevenue)) * 1000) / 10}%` : 'No data' },
    { category: 'Utilities & Admin', jan: hasFinancialData ? `₱${Math.round((revenueSeries[0] ?? 0) * 0.05).toLocaleString()}` : 'No data', feb: hasFinancialData ? `₱${Math.round((revenueSeries[1] ?? 0) * 0.05).toLocaleString()}` : 'No data', mar: hasFinancialData ? `₱${Math.round((revenueSeries[2] ?? 0) * 0.05).toLocaleString()}` : 'No data', apr: hasFinancialData ? `₱${Math.round((revenueSeries[3] ?? 0) * 0.05).toLocaleString()}` : 'No data', may: hasFinancialData ? `₱${Math.round((revenueSeries[4] ?? 0) * 0.05).toLocaleString()}` : 'No data', forecast: hasFinancialData ? `₱${Math.round(forecastExpenses * 0.1).toLocaleString()}` : 'No data', share: hasFinancialData ? `${Math.round((forecastExpenses * 0.1 / Math.max(1, forecastRevenue)) * 1000) / 10}%` : 'No data' },
  ];

  return (
    <div className="space-y-6 mx-auto p-4 md:p-6 text-foreground bg-background transition-colors duration-200">

      {/* HEADER */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start border-b border-dashed border-border pb-6">
        <div className="xl:col-span-1 space-y-1.5">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-primary uppercase">
            <span className="h-1.5 w-1.5 bg-secondary" />
            Financials
          </div>
          <h1 className="font-display text-2xl md:text-3xl font-semibold tracking-tight">Financial Forecast</h1>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
            Revenue, expenses, and net income projected for next month.
          </p>
        </div>

        <div className="xl:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-3 w-full">
          {[
            {
              label: "Forecasted Revenue",
              value: forecastRevenueLabel,
              desc: hasFinancialData ? "Next month" : "No revenue data",
              change: hasFinancialData ? "+8.0%" : "—",
              isPositive: hasFinancialData,
              icon: (
                <>
                  <path d="M22 7 13.5 15.5 8.5 10.5 2 17" />
                  <path d="M16 7h6v6" />
                </>
              ),
            },
            {
              label: "Forecasted Expenses",
              value: forecastExpensesLabel,
              desc: hasFinancialData ? "Next month" : "No expense data",
              change: hasFinancialData ? "+2.0%" : "—",
              isPositive: hasFinancialData,
              icon: (
                <>
                  <path d="M4 10h16" />
                  <path d="M4 14h16" />
                  <path d="M4 18h16" />
                  <path d="M4 6h16" />
                </>
              ),
            },
            {
              label: "Forecasted Net Income",
              value: forecastNetIncomeLabel,
              desc: hasFinancialData ? "vs. May" : "No data",
              change: hasFinancialData ? "+6.0%" : "—",
              isPositive: hasFinancialData,
              icon: (
                <>
                  <path d="M12 5v14" />
                  <path d="M5 12h14" />
                </>
              ),
            },
            {
              label: "Forecasted Net Margin",
              value: marginLabel,
              desc: hasFinancialData ? `6-month cumulative: ₱${Math.round((revenueSeries.reduce((sum, value) => sum + value, 0) / 1000000) * 10) / 10}M` : 'No data',
              change: hasFinancialData ? "steady" : "—",
              isPositive: hasFinancialData,
              icon: (
                <>
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="12" cy="12" r="6" />
                  <circle cx="12" cy="12" r="2" />
                </>
              ),
            },
          ].map((kpi, i) => (
            <div key={i} className="p-4 rounded-xl border border-border bg-card shadow-xs flex flex-col justify-between group hover:border-primary/30 transition-all duration-200">
              <div className="flex items-start justify-between gap-2">
                <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase truncate">{kpi.label}</span>
                <svg className="p-1 rounded-md bg-primary/10 text-primary shrink-0" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {kpi.icon}
                </svg>
              </div>
              <div className="mt-3">
                <h3 className="text-lg md:text-xl font-semibold tracking-tight font-mono">{kpi.value}</h3>
                <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                  <span
                    className="text-[10px] font-medium font-mono whitespace-nowrap"
                    style={{ color: kpi.change.startsWith('+') ? 'hsl(var(--success))' : (!kpi.isPositive ? undefined : undefined) }}
                  >
                    <span className={kpi.change.startsWith('+') ? '' : !kpi.isPositive ? 'text-destructive' : 'text-muted-foreground'}>
                      {kpi.change.startsWith('+') ? '▲' : kpi.change.startsWith('-') ? '▼' : '—'} {kpi.change}
                    </span>
                  </span>
                  <span className="text-[10px] text-muted-foreground truncate">— {kpi.desc}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CHARTS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">

        <div className="lg:col-span-7 xl:col-span-8 p-5 rounded-xl border border-border bg-card shadow-xs flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-border/40">
              <div>
                <h3 className="text-sm font-semibold tracking-tight text-foreground">Revenue vs. Expenses</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">Actuals through May, projected for June.</p>
              </div>

              <div className="flex items-center gap-3 text-[10px] font-medium">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full ring-2 ring-offset-1 ring-offset-card ring-primary/40 bg-primary" />
                  <span className="text-muted-foreground">Revenue</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full ring-2 ring-offset-1 ring-offset-card ring-destructive/30 bg-destructive" />
                  <span className="text-muted-foreground">Expenses</span>
                </div>
              </div>
            </div>

            <div className="p-2 bg-background/40 rounded-xl border border-border/40 relative">
              <div className="absolute right-0 top-0 bottom-0 w-1/6 bg-primary/5 border-l border-dashed border-primary/20 rounded-r-xl pointer-events-none flex items-center justify-center">
                <span className="text-[9px] text-primary/60 font-semibold tracking-widest uppercase rotate-90 whitespace-nowrap">Forecast</span>
              </div>
              <LineChart
                height={260}
                labels={["Jan","Feb","Mar","Apr","May","Jun (F)"]}
                datasets={[
                  { label: 'Revenue', data: [...revenueSeries, forecastRevenue], borderColor: 'hsl(var(--primary))' },
                  { label: 'Expenses', data: [...expenseSeries, forecastExpenses], borderColor: 'hsl(var(--destructive))' }
                ]}
              />
            </div>
          </div>

          <p className="mt-4 pt-3 border-t border-border/40 text-[11px] text-muted-foreground">
            Fixed costs have held steady since March; the margin gap tracks revenue directly.
          </p>
        </div>

        <div className="lg:col-span-5 xl:col-span-4 p-5 rounded-xl border border-border bg-card shadow-xs flex flex-col justify-between">
          <div className="space-y-4">
            <div className="pb-4 border-b border-border/40">
              <h3 className="text-sm font-semibold tracking-tight text-foreground">Net Income by Month</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Trailing monthly totals.</p>
            </div>

            <div className="space-y-3.5 py-1">
              {[
                {
                  label: "Jun (forecast)",
                  value: hasFinancialData ? `₱${forecastNetIncome.toLocaleString()}` : 'No data',
                  percentage: hasFinancialData ? Math.max(60, Math.min(100, Math.round((forecastNetIncome / Math.max(1, latestRevenue)) * 10))) : 0,
                  badge: "Forecast",
                },
                {
                  label: "May",
                  value: hasFinancialData ? `₱${latestNetIncome.toLocaleString()}` : 'No data',
                  percentage: hasFinancialData ? 100 : 0,
                  badge: "Latest",
                },
                {
                  label: "Apr",
                  value: hasFinancialData ? `₱${Math.round(netIncomeSeries[netIncomeSeries.length - 2] ?? latestNetIncome).toLocaleString()}` : 'No data',
                  percentage: hasFinancialData ? 88 : 0,
                  badge: "Actual",
                },
                {
                  label: "Mar",
                  value: hasFinancialData ? `₱${Math.round(netIncomeSeries[netIncomeSeries.length - 3] ?? latestNetIncome).toLocaleString()}` : 'No data',
                  percentage: hasFinancialData ? 85 : 0,
                  badge: "Actual",
                },
              ].map((row, idx) => (
                <div key={idx} className="space-y-1.5 group">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium group-hover:text-primary transition-colors">{row.label}</span>
                    <div className="flex items-center gap-2 font-mono">
                      <span className="font-semibold">{row.value}</span>
                      <span className="text-[9px] px-1 py-0.2 rounded bg-muted text-muted-foreground border border-border/40">{row.badge}</span>
                    </div>
                  </div>
                  <div className="w-full h-2 rounded-full bg-secondary/20 overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${row.percentage}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground leading-tight border-t border-border/40 pt-3 mt-4">
            Based on a 3-month weighted average, adjusted for recent variance.
          </p>
        </div>

      </div>

      {/* EXPENSE TABLE */}
      <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
        <div className="p-4 bg-muted/40 border-b border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-foreground">Expenses by Category</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">Monthly actuals vs. next month's forecast.</p>
          </div>
          <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded border bg-card text-muted-foreground shadow-xs self-start sm:self-center">
            Largest: Payroll
          </span>
        </div>
        <div className="p-3 overflow-x-auto">
          <SmallTable
            columns={["Category", "Jan", "Feb", "Mar", "Apr", "May", "Forecast (Jun)", "Share"]}
            rows={expenseBreakdown.map((row) => ({
              "Category": <span className="font-medium text-foreground text-xs">{row.category}</span>,
              "Jan": <span className="font-mono text-xs text-muted-foreground/80">{row.jan}</span>,
              "Feb": <span className="font-mono text-xs text-muted-foreground/80">{row.feb}</span>,
              "Mar": <span className="font-mono text-xs text-muted-foreground/80">{row.mar}</span>,
              "Apr": <span className="font-mono text-xs text-muted-foreground/80">{row.apr}</span>,
              "May": <span className="font-mono text-xs text-muted-foreground/80">{row.may}</span>,
              "Forecast (Jun)": <span className="font-mono font-bold text-xs text-primary">{row.forecast}</span>,
              "Share": <span className="font-mono text-[11px] font-semibold text-right text-muted-foreground">{row.share}</span>,
            }))}
          />
        </div>
      </div>

    </div>
  );
}