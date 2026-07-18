'use client'

import { useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export type DailyLogRow = {
  date: string
  day: string
  sessions: number | null
  revenue: number | null
  expenses: number | null
  net: number | null
  topService: string
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

function parseSpanValue(value: string | null) {
  if (!value || value === 'all') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 14
}

function filterDailyLog(rows: DailyLogRow[], span: string) {
  const spanDays = parseSpanValue(span)
  if (spanDays === null) return rows

  const threshold = new Date(Date.now() - (spanDays - 1) * MS_PER_DAY)
  return rows.filter((row) => {
    const rowDate = new Date(row.date)
    return !Number.isNaN(rowDate.getTime()) && rowDate >= threshold
  })
}

export default function DailyLogSection({ dailyLog }: { dailyLog: DailyLogRow[] }) {
  const searchParams = useSearchParams()
  const currentSpan = searchParams.get('span') || 'all'
  const router = useRouter()

  const filteredDailyLog = useMemo(
    () => filterDailyLog(dailyLog, currentSpan),
    [dailyLog, currentSpan]
  )

  const handleSpanChange = (span: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('span', span)
    router.push(`?${params.toString()}`, { scroll: false })
  }

  return (
    <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
      <div className="p-4 bg-muted/40 border-b border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-foreground">Daily Log</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">Day-by-day revenue, expenses, and top service.</p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          <label htmlFor="show-range" className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80">
            Filter Span:
          </label>
          <div className="relative">
            <select
              id="show-range"
              value={currentSpan}
              onChange={(event) => handleSpanChange(event.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-xs appearance-none focus:outline-hidden focus:ring-1 focus:ring-primary focus:border-primary pr-8 cursor-pointer"
            >
              <option value="14">Last 14 days</option>
              <option value="30">Last 30 days</option>
              <option value="99">Last 99 days</option>
              <option value="all">All Records</option>
            </select>
            <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none text-muted-foreground/60">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <div className="p-2 overflow-x-auto">
        <Table>
          <TableCaption className="text-[11px] text-muted-foreground pb-2">End-of-day record.</TableCaption>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="w-[120px] text-muted-foreground font-semibold text-xs uppercase tracking-wide">Date</TableHead>
              <TableHead className="text-muted-foreground font-semibold text-xs uppercase tracking-wide">Day</TableHead>
              <TableHead className="text-muted-foreground font-semibold text-xs uppercase tracking-wide">Sessions</TableHead>
              <TableHead className="text-right text-muted-foreground font-semibold text-xs uppercase tracking-wide">Revenue</TableHead>
              <TableHead className="text-right text-muted-foreground font-semibold text-xs uppercase tracking-wide">Expenses</TableHead>
              <TableHead className="text-right text-muted-foreground font-semibold text-xs uppercase tracking-wide">Net</TableHead>
              <TableHead className="text-right text-muted-foreground font-semibold text-xs uppercase tracking-wide">Top Service</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredDailyLog.length > 0 ? (
              filteredDailyLog.map((row) => (
                <TableRow key={`${row.date}-${row.topService}`} className="border-border hover:bg-muted/40 transition-colors group">
                  <TableCell className="font-mono text-xs font-medium text-foreground group-hover:text-primary transition-colors">{row.date}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.day}</TableCell>
                  <TableCell className="font-mono text-xs text-foreground/90">{row.sessions ?? '—'}</TableCell>
                  <TableCell className="text-right font-mono text-xs text-muted-foreground">{typeof row.revenue === 'number' ? `₱${row.revenue.toLocaleString()}` : '—'}</TableCell>
                  <TableCell className="text-right font-mono text-xs text-muted-foreground">{typeof row.expenses === 'number' ? `₱${row.expenses.toLocaleString()}` : '—'}</TableCell>
                  <TableCell className="text-right font-mono text-xs font-semibold" style={{ color: 'hsl(var(--success))' }}>
                    {typeof row.net === 'number' ? `₱${row.net.toLocaleString()}` : '—'}
                  </TableCell>
                  <TableCell className="text-right text-xs font-medium text-foreground">{row.topService}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow className="border-border">
                <TableCell className="py-4 text-center text-xs text-muted-foreground" colSpan={7}>
                  No daily log data available.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
