"use client"
import { useState } from 'react'

export default function ReprocessImport({ id }: { id: number }) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function run() {
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch('/api/import/reprocess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
      const data = await res.json()
      setMessage(data.message || data.error || 'Done')
    } catch (err: any) {
      setMessage(String(err.message || err))
    }
    setLoading(false)
  }

  return (
    <div className="mt-3">
      <button onClick={run} disabled={loading} className="px-3 py-1 rounded border text-sm">
        {loading ? 'Processing…' : 'Reprocess'}
      </button>
      {message && <div className="mt-2 text-xs text-zinc-600">{message}</div>}
    </div>
  )
}
