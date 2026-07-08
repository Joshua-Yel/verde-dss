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

export function forecastSeries(values: number[], horizon = 3, window = 3, weights?: number[]) {
  const out = [...values]
  for (let h = 0; h < horizon; h++) {
    const last = out.slice(-window)
    const pred = wma(last, weights)
    out.push(pred)
  }
  return out.slice(values.length) // only the forecasted values
}
