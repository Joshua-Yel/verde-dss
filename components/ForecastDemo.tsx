"use client"
import { useState } from 'react'

export default function ForecastDemo() {
  const [result, setResult] = useState<number[] | null>(null)
  const [loading, setLoading] = useState(false)

  async function run() {
    setLoading(true)
    const res = await fetch('/api/forecast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ series: [62,58,74,81,79,148,132,165,178,172], horizon: 3 })
    })
    const data = await res.json()
    setResult(data.forecast ?? null)
    setLoading(false)
  }

  return (
    <div className="p-6 rounded-lg border bg-white">
      <h3 className="text-lg font-semibold mb-2">Forecast demo</h3>
      <p className="mb-4 text-sm text-zinc-600">Runs a WMA forecast (demo data).</p>
      <button onClick={run} className="px-4 py-2 bg-amber-500 text-white rounded">
        {loading ? 'Running…' : 'Run Forecast'}
      </button>
      {result && (
        <div className="mt-4 text-sm">
          <strong>Forecast:</strong> {result.map((r, i) => <span key={i} className="ml-2">{r.toFixed(1)}</span>)}
        </div>
      )}
    </div>
  )
}
