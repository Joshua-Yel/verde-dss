import { NextResponse } from 'next/server'
import { wmaForecast } from '../../../src/lib/forecast'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { series, horizon, weights } = body
    if (!Array.isArray(series)) {
      return NextResponse.json({ error: 'series must be an array of numbers' }, { status: 400 })
    }

    const h = typeof horizon === 'number' ? horizon : 1
    const ws = Array.isArray(weights) ? weights : undefined
    const forecast = wmaForecast(series, h, ws)
    return NextResponse.json({ forecast })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 })
  }
}
