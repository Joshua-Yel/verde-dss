export type PeriodGranularity = 'daily' | 'weekly' | 'monthly'

export interface DateRangeSummary {
  startDate: string | null
  endDate: string | null
  granularity: PeriodGranularity
  labels: string[]
  /**
   * Bucket keys parallel to `labels` (same order/length). Cheap,
   * locale-independent strings (e.g. "2026-07-14", "2026-07") suitable
   * for grouping raw rows without paying for Intl formatting per row.
   * Use `bucketKeyForDate` to compute the same key for a single row's date.
   */
  keys: string[]
}

// Reuse single Intl.DateTimeFormat instances. `date.toLocaleDateString(...)`
// effectively constructs one of these internally on every call — doing that
// per-row (thousands of times for a multi-year dataset) is one of the more
// expensive operations in the hot path. Two shared instances cost nothing
// and are reused for every label we ever format.
const dayLabelFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const monthLabelFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' })

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function startOfDay(value: Date): Date {
  const copy = new Date(value)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function startOfWeek(value: Date): Date {
  const copy = new Date(value)
  const day = copy.getDay()
  const diff = (day + 6) % 7
  copy.setDate(copy.getDate() - diff)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function startOfMonth(value: Date): Date {
  const copy = new Date(value)
  copy.setDate(1)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function bucketStartForDate(parsed: Date, granularity: PeriodGranularity): Date {
  if (granularity === 'daily') return startOfDay(parsed)
  if (granularity === 'weekly') return startOfWeek(parsed)
  return startOfMonth(parsed)
}

/**
 * Cheap, locale-independent grouping key for a bucket-start date.
 * No Intl formatting involved — safe to call per-row in a hot loop.
 */
function keyForBucketStart(value: Date, granularity: PeriodGranularity): string {
  if (granularity === 'monthly') {
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}`
  }
  // daily and weekly both key off their (already-snapped) bucket start date
  return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`
}

function formatBucketLabel(value: Date, granularity: PeriodGranularity): string {
  if (granularity === 'monthly') {
    return monthLabelFormatter.format(value)
  }
  // daily and weekly share the same "Mon D, YYYY" display shape
  return dayLabelFormatter.format(value)
}

function buildLabelsAndKeys(start: Date, end: Date, granularity: PeriodGranularity): { labels: string[]; keys: string[] } {
  const labels: string[] = []
  const keys: string[] = []
  const cursor = bucketStartForDate(start, granularity)
  const endBoundary = bucketStartForDate(end, granularity)

  while (cursor <= endBoundary) {
    // Only ever called once per bucket (e.g. ~24 times for a 2-year monthly
    // range) — this is where Intl formatting is allowed to happen, never
    // per raw row.
    labels.push(formatBucketLabel(cursor, granularity))
    keys.push(keyForBucketStart(cursor, granularity))
    if (granularity === 'daily') {
      cursor.setDate(cursor.getDate() + 1)
    } else if (granularity === 'weekly') {
      cursor.setDate(cursor.getDate() + 7)
    } else {
      cursor.setMonth(cursor.getMonth() + 1)
    }
  }

  return { labels, keys }
}

export function resolveDateRange(values: Array<string | null | undefined>): DateRangeSummary {
  const dates = values
    .map(toDate)
    .filter((value): value is Date => Boolean(value))

  if (dates.length === 0) {
    return {
      startDate: null,
      endDate: null,
      granularity: 'monthly',
      labels: [],
      keys: [],
    }
  }

  // Linear min/max instead of Math.min(...spread)/Math.max(...spread):
  // spreading a large array into Math.min/max risks a call-stack overflow
  // once the array gets large enough (engine-dependent, roughly 60k+
  // elements), and is also slower than a single pass regardless of size.
  let start = dates[0]
  let end = dates[0]
  for (const d of dates) {
    if (d < start) start = d
    if (d > end) end = d
  }

  const spanDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1

  let granularity: PeriodGranularity = 'monthly'
  if (spanDays < 60) granularity = 'daily'
  else if (spanDays < 365) granularity = 'weekly'

  const { labels, keys } = buildLabelsAndKeys(start, end, granularity)

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    granularity,
    labels,
    keys,
  }
}

/**
 * Display label for a single date (Intl-formatted). Prefer
 * `bucketKeyForDate` when bucketing many rows — this one is fine for
 * one-off / low-volume use but shouldn't run inside a per-row loop.
 */
export function bucketLabelForDate(value: string | null | undefined, granularity: PeriodGranularity): string | null {
  const parsed = toDate(value)
  if (!parsed) return null
  return formatBucketLabel(bucketStartForDate(parsed, granularity), granularity)
}

/**
 * Cheap grouping key for a single row's date — use this (not
 * `bucketLabelForDate`) whenever bucketing many rows, e.g. inside a
 * reduce/loop over `daily_operations` or expense rows. Keys returned here
 * line up 1:1 with `DateRangeSummary.keys` for the same granularity.
 */
export function bucketKeyForDate(value: string | null | undefined, granularity: PeriodGranularity): string | null {
  const parsed = toDate(value)
  if (!parsed) return null
  return keyForBucketStart(bucketStartForDate(parsed, granularity), granularity)
}