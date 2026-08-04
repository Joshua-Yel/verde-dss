import { NextResponse } from 'next/server'
import { resolveAuthenticatedBusinessId, applyNoStoreHeaders } from '@/src/lib/ariaAccess'
import { getFinancialSummary } from '@/lib/data'

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

  const summary = await getFinancialSummary({ businessId })
  const labels = summary.periodLabels ?? []
  const rangeLabel = labels.length === 1
    ? labels[0]
    : labels.length > 1
      ? `${labels[0]} – ${labels[labels.length - 1]}`
      : null

  return applyNoStoreHeaders(
    NextResponse.json({ rangeLabel }, { status: 200 })
  )
}
