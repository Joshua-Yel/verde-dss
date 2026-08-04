export function sma(values: number[], window = 3) {
  if (values.length === 0) return 0
  const n = Math.min(window, values.length)
  const slice = values.slice(values.length - n)
  return slice.reduce((s, v) => s + v, 0) / n
}

export function wma(values: number[], weights?: number[]) {
  const n = values.length
  if (n === 0) return 0
  if (!weights) {
    // default: linearly increasing weights
    weights = Array.from({ length: n }, (_, i) => i + 1)
  }
  const wlen = Math.min(weights.length, n)
  const vals = values.slice(n - wlen)
  const usedWeights = weights.slice(weights.length - wlen)
  const totalW = usedWeights.reduce((s, w) => s + w, 0)
  if (totalW === 0) return vals.reduce((s, v) => s + v, 0) / vals.length
  return vals.reduce((s, v, i) => s + v * usedWeights[i], 0) / totalW
}

export type ForecastModel = 'wma' | 'sma' | 'naive'

function cleanedValues(values: number[]) {
  return values.filter((value) => Number.isFinite(value))
}

function seasonallyAdjustedNaive(values: number[], seasonLength: number) {
  if (seasonLength <= 0 || values.length < seasonLength) {
    return values[values.length - 1] ?? 0
  }

  const latestSeasonIndex = values.length - seasonLength
  if (latestSeasonIndex < 0) {
    return values[values.length - 1] ?? 0
  }

  return values[latestSeasonIndex]
}

function predictNext(values: number[], model: ForecastModel, window = 3, weights?: number[], seasonLength = 0) {
  const series = cleanedValues(values)
  if (series.length === 0) return 0
  if (series.length === 1) return series[0]

  const history = series.slice(-Math.max(1, Math.min(window, series.length)))

  if (model === 'naive') {
    if (seasonLength > 0 && series.length >= seasonLength * 2) {
      return seasonallyAdjustedNaive(series, seasonLength)
    }
    return history[history.length - 1] ?? 0
  }

  if (model === 'sma') {
    return sma(history, history.length)
  }

  return wma(history, weights)
}

export function forecastSeriesForModel(values: number[], horizon = 3, window = 3, model: ForecastModel = 'wma', weights?: number[], seasonLength = 0) {
  const out = cleanedValues(values)
  const forecast: number[] = []

  for (let h = 0; h < horizon; h++) {
    const pred = predictNext(out, model, window, weights, seasonLength)
    forecast.push(pred)
    out.push(pred)
  }

  return forecast
}

export function forecastSeries(values: number[], horizon = 3, window = 3, weights?: number[]) {
  return forecastSeriesForModel(values, horizon, window, 'wma', weights)
}
