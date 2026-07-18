import { NextResponse } from 'next/server'
import { getSupabaseDashboardData } from '@/lib/data/supabase'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { businessId } = body
    if (!businessId) return NextResponse.json({ error: 'businessId required' }, { status: 400 })
    const data = await getSupabaseDashboardData('', { businessId })
    return NextResponse.json({
      periodLabels: data.periodLabels,
      months: data.months,
      revenueSeriesHead: (data.revenueSeries || []).slice(0, 36),
      sampleDailyLog: (data.dailyLog || []).slice(0, 5),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
