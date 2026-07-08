'use client';

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function FilterSpan() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Track what filter is active in the URL string, default to '14'
  const currentVal = searchParams.get('span') || '14';

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('span', e.target.value);
    
    // Safely update the current window view path with standard state pushes
    router.push(`?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="flex items-center gap-2 self-start sm:self-center">
      <label htmlFor="show-range" className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80">
        Filter Span:
      </label>
      <div className="relative">
        <select
          id="show-range"
          value={currentVal}
          onChange={handleChange}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-xs appearance-none focus:outline-hidden focus:ring-1 focus:ring-primary focus:border-primary pr-8 cursor-pointer"
        >
          <option value="14">Last 14 days</option>
          <option value="30">Last 30 days</option>
          <option value="99">Last 99 days</option>
          <option value="all">All Records</option>
        </select>
        <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none text-muted-foreground/60">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="m6 9 6 6 6-6"/>
          </svg>
        </div>
      </div>
    </div>
  );
}