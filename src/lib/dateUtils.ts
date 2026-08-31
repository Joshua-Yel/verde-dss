export function normalizeDate(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null

  const pad = (n: number) => String(n).padStart(2, '0')

  const daysInMonth = (year: number, month: number): number => {
    return new Date(Date.UTC(year, month, 0)).getUTCDate()
  }

  const isValidDateParts = (year: number, month: number, day: number): boolean => {
    if (month < 1 || month > 12) return false
    if (day < 1 || day > daysInMonth(year, month)) return false
    return true
  }

  const fromParts = (
    year: number,
    month: number,
    day: number
  ): string | null => {
    if (!isValidDateParts(year, month, day)) return null

    return `${year}-${pad(month)}-${pad(day)}`
  }

  // Excel serial date.
  //
  // Excel's serial 1 = 1900-01-01.
  // Using UTC here avoids any timezone conversion.
  const fromExcelSerial = (serial: number): string | null => {
    if (!Number.isFinite(serial) || serial < 1) return null

    const wholeDays = Math.floor(serial)

    // Excel's epoch including its 1900 leap-year bug.
    const excelEpoch = Date.UTC(1899, 11, 30)

    const date = new Date(
      excelEpoch + wholeDays * 24 * 60 * 60 * 1000
    )

    if (Number.isNaN(date.getTime())) return null

    return fromParts(
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      date.getUTCDate()
    )
  }

  // JavaScript Date.
  //
  // IMPORTANT:
  // Read the UTC calendar components, not local components.
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null

    return fromParts(
      value.getUTCFullYear(),
      value.getUTCMonth() + 1,
      value.getUTCDate()
    )
  }

  if (typeof value === 'number') {
    return fromExcelSerial(value)
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()

    if (!trimmed) return null

    // YYYY-MM-DD
    //
    // This is already a calendar date.
    // NEVER pass it through new Date().
    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)

    if (isoMatch) {
      return fromParts(
        Number(isoMatch[1]),
        Number(isoMatch[2]),
        Number(isoMatch[3])
      )
    }

    // Excel serial represented as a string.
    if (/^\d+(\.\d+)?$/.test(trimmed)) {
      return fromExcelSerial(Number(trimmed))
    }

    // Handle common date formats explicitly.
    const slashMatch = trimmed.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
    )

    if (slashMatch) {
      return fromParts(
        Number(slashMatch[3]),
        Number(slashMatch[1]),
        Number(slashMatch[2])
      )
    }

    // Last resort for values containing a timestamp.
    const parsed = new Date(trimmed)

    if (!Number.isNaN(parsed.getTime())) {
      return fromParts(
        parsed.getUTCFullYear(),
        parsed.getUTCMonth() + 1,
        parsed.getUTCDate()
      )
    }
  }

  return null
}

