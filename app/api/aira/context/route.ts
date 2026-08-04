import { NextResponse } from 'next/server';
import { resolveAuthenticatedBusinessId, applyNoStoreHeaders } from '@/src/lib/ariaAccess';
import { getAriaContextSummary } from '@/src/lib/ariaContext';

export async function GET() {
  try {
    const { businessId, userId, workspaceResolutionError } = await resolveAuthenticatedBusinessId();
    try { console.debug('[AIRA context] resolved businessId', { businessId }); } catch {}

    if (!businessId) {
      if (userId && workspaceResolutionError) {
        console.error('[AIRA context] workspace resolution service failure', { stage: workspaceResolutionError.stage, message: workspaceResolutionError.message });
        return applyNoStoreHeaders(
          NextResponse.json({ error: 'Workspace service is currently unavailable. Please try again later.' }, { status: 502 })
        );
      }

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