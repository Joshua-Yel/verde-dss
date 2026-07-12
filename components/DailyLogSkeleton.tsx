import React from 'react';

export function KpiRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="p-4 rounded-xl border border-border bg-card shadow-xs h-[92px] animate-pulse">
          <div className="h-2.5 w-2/3 bg-muted rounded" />
          <div className="h-4 w-1/2 bg-muted rounded mt-4" />
          <div className="h-2 w-3/4 bg-muted rounded mt-2" />
        </div>
      ))}
    </div>
  );
}

export function ChartCardSkeleton({ height = 320 }: { height?: number }) {
  return (
    <div className="p-6 rounded-xl border border-border bg-card shadow-xs animate-pulse">
      <div className="h-3 w-1/3 bg-muted rounded mb-2" />
      <div className="h-2 w-1/2 bg-muted rounded mb-6" />
      <div className="w-full bg-muted/60 rounded-xl" style={{ height }} />
    </div>
  );
}

export function TableCardSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden animate-pulse">
      <div className="p-4 bg-muted/40 border-b border-border/50">
        <div className="h-3 w-1/4 bg-muted rounded" />
      </div>
      <div className="p-3 space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-6 bg-muted/60 rounded" />
        ))}
      </div>
    </div>
  );
}

export function StaffingHeatmapSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card shadow-xs p-5 animate-pulse">
      <div className="h-3 w-1/4 bg-muted rounded mb-4" />
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="flex gap-1.5 items-center">
            <div className="h-3 w-10 bg-muted rounded" />
            <div className="flex flex-1 gap-1">
              {Array.from({ length: 12 }).map((__, cellIndex) => (
                <div key={cellIndex} className="h-8 flex-1 rounded-md bg-muted/70" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PageHeaderSkeleton({ eyebrow, title }: { eyebrow: string; title: string }) {
  // Header text can render immediately — it isn't data-dependent — so this
  // isn't strictly a skeleton, it's the real header shown while the rest streams in.
  return (
    <div className="xl:col-span-1 space-y-1.5">
      <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-primary uppercase">
        <span className="h-1.5 w-1.5 bg-secondary" />
        {eyebrow}
      </div>
      <h1 className="font-display text-2xl md:text-3xl font-semibold tracking-tight">{title}</h1>
    </div>
  );
}