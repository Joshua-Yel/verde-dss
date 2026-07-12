import { NextResponse } from 'next/server';
import { resolveAuthenticatedBusinessId, applyNoStoreHeaders } from '@/src/lib/ariaAccess';
import { getAriaContextSummary } from '@/src/lib/ariaContext';

export async function GET() {
  try {
    const { businessId } = await resolveAuthenticatedBusinessId();

    if (!businessId) {
      return applyNoStoreHeaders(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      );
    }

    const cachedSummary = await getAriaContextSummary(businessId);

    return applyNoStoreHeaders(NextResponse.json({ summary: cachedSummary }));
  } catch (err) {
    console.error('Failed to build ARIA context', err);
    return applyNoStoreHeaders(NextResponse.json({ summary: null }, { status: 500 }));
  }
}