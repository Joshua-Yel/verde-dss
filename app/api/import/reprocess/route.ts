import { NextResponse } from 'next/server'
import supabaseServer from '../../../../src/lib/supabaseServer'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { id } = body
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const { data: rawRow, error: getErr } = await supabaseServer.from('raw_imports').select('id, filename, data').eq('id', id).single()
    if (getErr) return NextResponse.json({ error: getErr.message }, { status: 500 })
    const rows = rawRow.data
    if (!rows || !Array.isArray(rows)) return NextResponse.json({ error: 'no rows to process' }, { status: 400 })

    // find business
    const { data: businesses } = await supabaseServer.from('businesses').select('id').limit(1)
    const businessId = businesses && businesses[0] ? businesses[0].id : null
    if (!businessId) return NextResponse.json({ error: 'no business found' }, { status: 400 })

    const findKey = (row: any, candidates: string[]) => {
      const keys = Object.keys(row || {})
      for (const c of candidates) {
        const match = keys.find(k => k && k.toString().trim().toLowerCase() === c.toLowerCase())
        if (match) return match
      }
      for (const k of keys) {
        for (const c of candidates) {
          if (k.toString().toLowerCase().includes(c.toLowerCase())) return k
        }
      }
      return null
    }

    const serviceCandidates = ['service','service name','item','description']
    const dateCandidates = ['date','day']
    const qtyCandidates = ['quantity','qty','sessions','count']
    const revCandidates = ['revenue','amount','price','total']

    const serviceNames = new Set<string>()
    for (const r of rows) {
      const sKey = findKey(r, serviceCandidates)
      const sVal = sKey ? (r[sKey] || '').toString().trim() : ''
      if (sVal) serviceNames.add(sVal)
    }

    const serviceNameToId: Record<string, number> = {}
    for (const name of Array.from(serviceNames)) {
      const { data: found } = await supabaseServer.from('services').select('id').match({ business_id: businessId, name }).limit(1)
      if (found && found[0]) {
        serviceNameToId[name] = found[0].id
        continue
      }
      const { data: ins, error: insErr } = await supabaseServer.from('services').insert([{ business_id: businessId, name }]).select('id')
      if (ins && ins[0]) serviceNameToId[name] = ins[0].id
    }

    const ops: any[] = []
    for (const r of rows) {
      const sKey = findKey(r, serviceCandidates)
      const dKey = findKey(r, dateCandidates)
      const qKey = findKey(r, qtyCandidates)
      const revKey = findKey(r, revCandidates)

      const serviceName = sKey ? (r[sKey] || '').toString().trim() : ''
      const rawDate = dKey ? r[dKey] : null
      let dateStr: string | null = null
      if (rawDate) {
        const d = new Date(rawDate)
        if (!isNaN(d.getTime())) dateStr = d.toISOString().slice(0,10)
      }

      const quantity = qKey ? (parseInt(r[qKey]) || null) : null
      const revenue = revKey ? (parseFloat(r[revKey]) || null) : null

      const service_id = serviceName && serviceNameToId[serviceName] ? serviceNameToId[serviceName] : null
      if (!service_id || !dateStr) continue

      ops.push({ business_id: businessId, service_id, date: dateStr, quantity, revenue })
    }

    if (!ops.length) return NextResponse.json({ message: 'no valid rows to insert' })

    const { error: opsErr } = await supabaseServer.from('daily_operations').insert(ops)
    if (opsErr) return NextResponse.json({ error: opsErr.message }, { status: 500 })

    return NextResponse.json({ message: `Inserted ${ops.length} operations` })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 })
  }
}
