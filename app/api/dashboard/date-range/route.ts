import { NextResponse } from 'next/server'
import { resolveAuthenticatedBusinessId, applyNoStoreHeaders } from '@/src/lib/ariaAccess'
import { getFinancialSummary } from '@/lib/data'

export async function GET() {
  const { businessId } = await resolveAuthenticatedBusinessId()

  if (!businessId) {
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
