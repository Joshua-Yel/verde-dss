import { NextResponse } from 'next/server'
import supabaseServer from '@/src/lib/supabaseServer'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { businessId } = body
    if (!businessId) return NextResponse.json({ error: 'businessId required' }, { status: 400 })

    const { data: countData, error: countErr } = await supabaseServer
      .from('daily_operations')
      .select('id', { count: 'exact' })
      .eq('business_id', businessId)

    if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 })

    const { data: firstRows, error: firstErr } = await supabaseServer
      .from('daily_operations')
      .select('date')
      .eq('business_id', businessId)
      .order('date', { ascending: true })
      .limit(1)

    if (firstErr) return NextResponse.json({ error: firstErr.message }, { status: 500 })

    const { data: lastRows, error: lastErr } = await supabaseServer
      .from('daily_operations')
      .select('date')
      .eq('business_id', businessId)
      .order('date', { ascending: false })
      .limit(1)

    if (lastErr) return NextResponse.json({ error: lastErr.message }, { status: 500 })

    return NextResponse.json({
      count: Array.isArray(countData) ? countData.length : 0,
      earliest: firstRows && firstRows[0] ? firstRows[0].date : null,
      latest: lastRows && lastRows[0] ? lastRows[0].date : null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
