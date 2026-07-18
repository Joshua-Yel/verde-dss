export type PeriodGranularity = 'daily' | 'weekly' | 'monthly'

export interface DateRangeSummary {
  startDate: string | null
  endDate: string | null
  granularity: PeriodGranularity
  labels: string[]
}

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

function formatBucketLabel(value: Date, granularity: PeriodGranularity): string {
  if (granularity === 'daily') {
    return value.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  if (granularity === 'weekly') {
    return `${value.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
  }

  return value.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function buildLabels(start: Date, end: Date, granularity: PeriodGranularity): string[] {
  const labels: string[] = []
  const cursor = granularity === 'daily' ? startOfDay(start) : granularity === 'weekly' ? startOfWeek(start) : startOfMonth(start)
  const endBoundary = granularity === 'daily' ? startOfDay(end) : granularity === 'weekly' ? startOfWeek(end) : startOfMonth(end)

  while (cursor <= endBoundary) {
    labels.push(formatBucketLabel(cursor, granularity))
    if (granularity === 'daily') {
      cursor.setDate(cursor.getDate() + 1)
    } else if (granularity === 'weekly') {
      cursor.setDate(cursor.getDate() + 7)
    } else {
      cursor.setMonth(cursor.getMonth() + 1)
    }
  }

  return labels
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
    }
  }

  const start = new Date(Math.min(...dates.map((value) => value.getTime())))
  const end = new Date(Math.max(...dates.map((value) => value.getTime())))
  const spanDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1

  let granularity: PeriodGranularity = 'monthly'
  if (spanDays < 60) granularity = 'daily'
  else if (spanDays < 365) granularity = 'weekly'

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    granularity,
    labels: buildLabels(start, end, granularity),
  }
}

export function bucketLabelForDate(value: string | null | undefined, granularity: PeriodGranularity): string | null {
  const parsed = toDate(value)
  if (!parsed) return null

  if (granularity === 'daily') {
    return formatBucketLabel(startOfDay(parsed), 'daily')
  }

  if (granularity === 'weekly') {
    return formatBucketLabel(startOfWeek(parsed), 'weekly')
  }

  return formatBucketLabel(startOfMonth(parsed), 'monthly')
}
