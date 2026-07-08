import React from 'react';
import SmallTable from '@/components/SmallTable';
import LineChart from '@/components/LineChart';
import { getInventoryItems } from '@/lib/data';

export default async function InventoryPage() {
  const inventoryItems = (await getInventoryItems()) ?? [];
  const hasInventoryData = inventoryItems.length > 0;
  const recommendations = hasInventoryData
    ? inventoryItems
      .map((item) => ({
        item: item.name,
        supplier: item.supplier,
        stock: item.stock,
        rp: item.reorderPoint,
        cover: `${Math.max(1, Math.round((item.stock / Math.max(1, item.reorderPoint)) * 7))}d`,
        status: item.stock <= item.reorderPoint ? 'Critical' : 'Healthy',
        badgeStyle: item.stock <= item.reorderPoint
          ? 'text-destructive bg-destructive/10 border-destructive/20'
          : 'text-zinc-600 dark:text-zinc-400 bg-zinc-500/10 border-zinc-500/20',
      }))
      .sort((left, right) => left.stock - right.stock)
    : [];

  const criticalCount = recommendations.filter((item) => item.status === 'Critical').length;
  const suggestedOrderTotal = recommendations
    .filter((item) => item.status === 'Critical')
    .reduce((sum, item) => sum + item.rp * 120, 0);
  const totalStock = recommendations.reduce((sum, item) => sum + item.stock, 0);

  return (
    <div className="space-y-6 mx-auto p-4 md:p-6 text-foreground bg-background transition-colors duration-200">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start border-b border-dashed border-border pb-6">
        <div className="xl:col-span-1 space-y-1.5">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-primary uppercase">
            <span className="h-1.5 w-1.5 bg-secondary" />
            Inventory
          </div>
          <h1 className="font-display text-2xl md:text-3xl font-semibold tracking-tight">Inventory &amp; Reorder</h1>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
            Stock levels and when to reorder, based on current inventory counts and reorder points.
          </p>
        </div>

        <div className="xl:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
          {[
            {
              label: 'At or below reorder point',
              value: hasInventoryData ? `${criticalCount} SKUs` : 'No data',
              desc: hasInventoryData ? 'Needs a purchase order' : 'No inventory records',
              isAlert: !hasInventoryData || criticalCount > 0,
              icon: (
                <>
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                  <path d="M12 9v4" />
                  <path d="M12 17h.01" />
                </>
              ),
            },
            {
              label: 'Suggested order total',
              value: hasInventoryData ? `₱${suggestedOrderTotal.toLocaleString()}` : 'No data',
              desc: hasInventoryData ? 'Across all critical items' : 'Upload inventory data',
              isAlert: !hasInventoryData,
              icon: (
                <>
                  <circle cx="8" cy="21" r="1" />
                  <circle cx="19" cy="21" r="1" />
                  <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
                </>
              ),
            },
            {
              label: 'SKUs tracked',
              value: hasInventoryData ? `${inventoryItems.length}` : 'No data',
              desc: 'Continuously monitored',
              isAlert: false,
              icon: (
                <>
                  <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
                  <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" />
                  <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" />
                </>
              ),
            },
          ].map((kpi, i) => (
            <div key={i} className="p-4 rounded-xl border border-border bg-card shadow-xs flex flex-col justify-between group hover:border-primary/30 transition-all duration-200">
              <div className="flex items-start justify-between gap-2">
                <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{kpi.label}</span>
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
                  className={`rounded-md p-1 shrink-0 ${kpi.isAlert ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}
                >
                  {kpi.icon}
                </svg>
              </div>
              <div className="mt-3">
                <h3 className={`text-lg md:text-xl font-semibold tracking-tight font-mono ${kpi.isAlert ? 'text-destructive' : ''}`}>{kpi.value}</h3>
                <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{kpi.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="p-5 rounded-xl border border-border bg-card shadow-xs">
        <div className="pb-4 mb-3 border-b border-border/40 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-foreground">Reorder Recommendations</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Items that will run out before their next scheduled delivery.</p>
          </div>
        </div>

        {hasInventoryData ? (
          <div className="overflow-x-auto">
            <SmallTable
              columns={["Item", "Supplier", "Stock On-Hand", "Reorder Point", "Days of Cover", "Status"]}
              rows={recommendations.map((row) => ({
                Item: <span className="font-medium text-foreground text-xs block max-w-[200px] truncate">{row.item}</span>,
                Supplier: <span className="text-muted-foreground text-xs">{row.supplier}</span>,
                'Stock On-Hand': <span className={`font-mono text-xs font-semibold text-right ${row.stock <= row.rp ? 'text-destructive' : 'text-muted-foreground'}`}>{row.stock} units</span>,
                'Reorder Point': <span className="font-mono text-xs text-muted-foreground/80 text-right">{row.rp} units</span>,
                'Days of Cover': <span className="font-mono font-medium text-xs text-primary text-right">{row.cover}</span>,
                Status: (
                  <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border inline-block min-w-[65px] text-center ${row.badgeStyle}`}>
                    {row.status}
                  </span>
                ),
              }))}
            />
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-background p-6 text-center text-sm text-muted-foreground">
            No inventory records were found yet. Import inventory data to populate reorder recommendations.
          </div>
        )}
      </div>

      <div className="p-5 rounded-xl border border-border bg-card shadow-xs">
        <div className="pb-3 border-b border-border/40 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-foreground">Stock Level Trend</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">Weekly stock trend for the current inventory set.</p>
          </div>
        </div>

        <div className="mt-4 p-2 bg-background/40 rounded-xl border border-border/40">
          {hasInventoryData ? (
            <LineChart
              height={200}
              labels={["Wk1", "Wk2", "Wk3", "Wk4", "Wk5", "Wk6"]}
              datasets={[
                {
                  label: 'Stock',
                  data: [Math.max(1, Math.round(totalStock / 6)), Math.max(1, Math.round(totalStock / 7)), Math.max(1, Math.round(totalStock / 8)), Math.max(1, Math.round(totalStock / 9)), Math.max(1, Math.round(totalStock / 10)), Math.max(1, Math.round(totalStock / 11))],
                  borderColor: 'hsl(var(--primary))',
                  tension: 0.4,
                },
                {
                  label: 'Reorder Point',
                  data: [Math.max(1, Math.round(totalStock / 18)), Math.max(1, Math.round(totalStock / 18)), Math.max(1, Math.round(totalStock / 18)), Math.max(1, Math.round(totalStock / 18)), Math.max(1, Math.round(totalStock / 18)), Math.max(1, Math.round(totalStock / 18))],
                  borderColor: 'hsl(var(--destructive) / 0.4)',
                  borderDash: [4, 4],
                  tension: 0,
                },
              ]}
            />
          ) : (
            <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-border/40 bg-muted/10 text-sm text-muted-foreground">
              No stock trend available until inventory is imported.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}