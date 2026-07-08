export type TimeSeries = number[]

/**
 * Compute a weighted moving average forecast for one-step ahead
 * weights should sum to 1.0 and length n indicates lookback window.
 */
export function weightedMovingAverage(series: TimeSeries, weights: number[]): number {
  const n = weights.length
  if (series.length < n) {
    // fallback: average of available
    const sum = series.reduce((a, b) => a + b, 0)
    return series.length ? sum / series.length : 0
  }

  const slice = series.slice(-n)
  let acc = 0
  for (let i = 0; i < n; i++) {
    acc += slice[i] * weights[i]
  }
  return acc
}

export function wmaForecast(series: TimeSeries, horizon = 1, weights = [0.5, 0.3, 0.2]) {
  const results: number[] = []
  let history = series.slice()
  for (let h = 0; h < horizon; h++) {
    const f = weightedMovingAverage(history, weights)
    results.push(f)
    history = [...history, f]
  }
  return results
}
