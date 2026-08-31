import { NextResponse } from 'next/server'
import { resolveAuthenticatedBusinessId, applyNoStoreHeaders } from '@/src/lib/ariaAccess'
import { supabaseServer } from '@/src/lib/supabaseServer'

export async function GET() {
  const { businessId, userId, workspaceResolutionError } = await resolveAuthenticatedBusinessId()

  if (!businessId) {
    if (userId && workspaceResolutionError) {
      console.error('[DATE_RANGE] workspace resolution service failure', { stage: workspaceResolutionError.stage, message: workspaceResolutionError.message });
      return applyNoStoreHeaders(
        NextResponse.json({ error: 'Workspace service is currently unavailable. Please try again later.' }, { status: 502 })
      )
    }

    return applyNoStoreHeaders(
      NextResponse.json({ rangeLabel: null }, { status: 200 })
    )
  }

  // Fetch date range from daily_operations only (Overview/Daily Logs)
  // This excludes inventory dates and focuses on actual business operations
  const { data, error } = await supabaseServer
    .from('daily_operations')
    .select('date')
    .eq('business_id', businessId)
    .order('date', { ascending: true })
    .range(0, 0)  // Get just the first row to check if data exists

  if (error || !data || data.length === 0) {
    return applyNoStoreHeaders(
      NextResponse.json({ rangeLabel: null }, { status: 200 })
    )
  }

  // Get min and max dates
  const { data: minMaxData } = await supabaseServer
    .from('daily_operations')
    .select('date')
    .eq('business_id', businessId)
    .order('date', { ascending: true })

  if (!minMaxData || minMaxData.length === 0) {
    return applyNoStoreHeaders(
      NextResponse.json({ rangeLabel: null }, { status: 200 })
    )
  }

  const dates = minMaxData.map(row => new Date(row.date))
  const minDate = dates.reduce((min, d) => d < min ? d : min)
  const maxDate = dates.reduce((max, d) => d > max ? d : max)

  // Format as "Mon DD, YYYY – Mon DD, YYYY"
  const formatter = new Intl.DateTimeFormat('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric' 
  })
  
  const rangeLabel = minDate.getTime() === maxDate.getTime()
    ? formatter.format(minDate)
    : `${formatter.format(minDate)} – ${formatter.format(maxDate)}`

  return applyNoStoreHeaders(
    NextResponse.json({ rangeLabel }, { status: 200 })
  )
}
