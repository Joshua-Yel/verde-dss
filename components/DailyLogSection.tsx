'use client'

import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Pencil, Trash2, X, Save } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type DailyLogRow = {
  /** daily_operations.id — required for edit/delete */
  id?: number | null
  date: string
  day: string
  sessions: number | null
  revenue: number | null
  expenses: number | null
  net: number | null
  topService: string
  service_id?: number | null
  notes?: string | null
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

function parseSpanValue(value: string | null) {
  if (!value || value === 'all') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 14
}

function filterDailyLog(rows: DailyLogRow[], span: string, serviceFilter: string) {
  const spanDays = parseSpanValue(span)
  const threshold =
    spanDays === null ? null : new Date(Date.now() - (spanDays - 1) * MS_PER_DAY)

  return rows.filter((row) => {
    if (threshold) {
      const rowDate = new Date(row.date)
      if (Number.isNaN(rowDate.getTime()) || rowDate < threshold) return false
    }
    if (serviceFilter && serviceFilter !== 'all') {
      if ((row.topService || '').toLowerCase() !== serviceFilter.toLowerCase()) return false
    }
    return true
  })
}

type EditState = {
  id: number
  date: string
  sessions: string
  revenue: string
  topService: string
}

export default function DailyLogSection({ dailyLog }: { dailyLog: DailyLogRow[] }) {
  const searchParams = useSearchParams()
  const currentSpan = searchParams.get('span') || '14'
  const router = useRouter()

  const [serviceFilter, setServiceFilter] = useState<string>('all')
  const [editRow, setEditRow] = useState<EditState | null>(null)
  const [deleteRow, setDeleteRow] = useState<DailyLogRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const serviceOptions = useMemo(() => {
    const names = new Set<string>()
    for (const row of dailyLog) {
      if (row.topService && row.topService !== 'N/A') names.add(row.topService)
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b))
  }, [dailyLog])

  const filteredDailyLog = useMemo(
    () => filterDailyLog(dailyLog, currentSpan, serviceFilter),
    [dailyLog, currentSpan, serviceFilter]
  )

  const handleSpanChange = (span: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('span', span)
    router.push(`?${params.toString()}`, { scroll: false })
  }

  const openEdit = (row: DailyLogRow) => {
    if (row.id == null) return
    setError(null)
    setEditRow({
      id: row.id,
      date: row.date,
      sessions: row.sessions != null ? String(row.sessions) : '',
      revenue: row.revenue != null ? String(row.revenue) : '',
      topService: row.topService === 'N/A' ? '' : row.topService,
    })
  }

  const saveEdit = async () => {
    if (!editRow) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/operations/${editRow.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: editRow.date,
          quantity: editRow.sessions,
          revenue: editRow.revenue,
          service_name: editRow.topService,
        }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(typeof payload.error === 'string' ? payload.error : 'Update failed.')
      }
      setEditRow(null)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed.')
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteRow?.id) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/operations/${deleteRow.id}`, { method: 'DELETE' })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(typeof payload.error === 'string' ? payload.error : 'Delete failed.')
      }
      setDeleteRow(null)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.')
    } finally {
      setSaving(false)
    }
  }

  const canMutate = (row: DailyLogRow) => row.id != null && Number.isFinite(Number(row.id))

  return (
    <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
      <div className="p-4 bg-muted/40 border-b border-border/50 flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-foreground">Daily Log</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Day-by-day sessions and revenue. Edit or delete individual records.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 self-start sm:self-center">
            <div className="flex items-center gap-2">
              <label
                htmlFor="service-filter"
                className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80"
              >
                Service:
              </label>
              <div className="relative">
                <select
                  id="service-filter"
                  value={serviceFilter}
                  onChange={(e) => setServiceFilter(e.target.value)}
                  className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-xs appearance-none focus:outline-hidden focus:ring-1 focus:ring-primary focus:border-primary pr-8 cursor-pointer max-w-[160px]"
                >
                  <option value="all">All services</option>
                  {serviceOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none text-muted-foreground/60">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <label
                htmlFor="show-range"
                className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80"
              >
                Span:
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
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
      </div>

      <div className="p-2 overflow-x-auto">
        <Table>
          <TableCaption className="text-[11px] text-muted-foreground pb-2">
            {filteredDailyLog.length} record{filteredDailyLog.length === 1 ? '' : 's'}
            {serviceFilter !== 'all' ? ` · ${serviceFilter}` : ''}
          </TableCaption>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="w-[120px] text-muted-foreground font-semibold text-xs uppercase tracking-wide">
                Date
              </TableHead>
              <TableHead className="text-muted-foreground font-semibold text-xs uppercase tracking-wide">
                Day
              </TableHead>
              <TableHead className="text-muted-foreground font-semibold text-xs uppercase tracking-wide">
                Sessions
              </TableHead>
              <TableHead className="text-right text-muted-foreground font-semibold text-xs uppercase tracking-wide">
                Revenue
              </TableHead>
              <TableHead className="text-right text-muted-foreground font-semibold text-xs uppercase tracking-wide">
                Expenses
              </TableHead>
              <TableHead className="text-right text-muted-foreground font-semibold text-xs uppercase tracking-wide">
                Net
              </TableHead>
              <TableHead className="text-right text-muted-foreground font-semibold text-xs uppercase tracking-wide">
                Service
              </TableHead>
              <TableHead className="w-[88px] text-right text-muted-foreground font-semibold text-xs uppercase tracking-wide">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredDailyLog.length > 0 ? (
              filteredDailyLog.map((row, index) => (
                <TableRow
                  key={row.id != null ? `op-${row.id}` : `${row.date}-${row.topService}-${index}`}
                  className="border-border hover:bg-muted/40 transition-colors group"
                >
                  <TableCell className="font-mono text-xs font-medium text-foreground group-hover:text-primary transition-colors">
                    {row.date}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.day}</TableCell>
                  <TableCell className="font-mono text-xs text-foreground/90">
                    {row.sessions ?? '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-muted-foreground">
                    {typeof row.revenue === 'number' ? `₱${row.revenue.toLocaleString()}` : '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-muted-foreground">
                    {typeof row.expenses === 'number' ? `₱${row.expenses.toLocaleString()}` : '—'}
                  </TableCell>
                  <TableCell
                    className="text-right font-mono text-xs font-semibold"
                    style={{ color: 'hsl(var(--success))' }}
                  >
                    {typeof row.net === 'number' ? `₱${row.net.toLocaleString()}` : '—'}
                  </TableCell>
                  <TableCell className="text-right text-xs font-medium text-foreground">
                    {row.topService}
                  </TableCell>
                  <TableCell className="text-right">
                    {canMutate(row) ? (
                      <div className="inline-flex items-center justify-end gap-1">
                        <button
                          type="button"
                          title="Edit"
                          onClick={() => openEdit(row)}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Delete"
                          onClick={() => {
                            setError(null)
                            setDeleteRow(row)
                          }}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-[10px] text-muted-foreground/50">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow className="border-border">
                <TableCell className="py-4 text-center text-xs text-muted-foreground" colSpan={8}>
                  No daily log data available.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Edit modal */}
      {editRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => !saving && setEditRow(null)} />
          <div className="relative w-[420px] max-w-[calc(100vw-1.5rem)] rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h4 className="text-sm font-semibold">Edit daily log record</h4>
              <button
                type="button"
                className="rounded-full p-1.5 text-zinc-500 hover:bg-zinc-100"
                onClick={() => !saving && setEditRow(null)}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-3">
              <div>
                <Label htmlFor="edit-date">Date</Label>
                <Input
                  id="edit-date"
                  type="date"
                  value={editRow.date}
                  onChange={(e) => setEditRow({ ...editRow, date: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="edit-service">Service</Label>
                <Input
                  id="edit-service"
                  value={editRow.topService}
                  onChange={(e) => setEditRow({ ...editRow, topService: e.target.value })}
                  placeholder="Service name"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="edit-sessions">Sessions</Label>
                  <Input
                    id="edit-sessions"
                    type="number"
                    min="0"
                    step="any"
                    value={editRow.sessions}
                    onChange={(e) => setEditRow({ ...editRow, sessions: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-revenue">Revenue</Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">
                      ₱
                    </span>
                    <Input
                      id="edit-revenue"
                      type="number"
                      min="0"
                      step="0.01"
                      className="pl-7"
                      value={editRow.revenue}
                      onChange={(e) => setEditRow({ ...editRow, revenue: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </div>

            {error && (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditRow(null)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={() => void saveEdit()} disabled={saving}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? 'Saving...' : 'Save changes'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => !saving && setDeleteRow(null)} />
          <div className="relative w-[400px] max-w-[calc(100vw-1.5rem)] rounded-2xl bg-white p-5 shadow-2xl">
            <h4 className="text-sm font-semibold text-foreground">Delete this record?</h4>
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
              <span className="font-medium text-foreground">{deleteRow.date}</span>
              {' · '}
              {deleteRow.topService}
              {' · '}
              {deleteRow.sessions ?? 0} session(s)
              {' · '}
              ₱{typeof deleteRow.revenue === 'number' ? deleteRow.revenue.toLocaleString() : '0'}
            </p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              This removes the row from daily operations. Charts and KPIs will update after refresh.
            </p>

            {error && (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteRow(null)} disabled={saving}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => void confirmDelete()}
                disabled={saving}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {saving ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}