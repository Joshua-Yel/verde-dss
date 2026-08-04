import { createSupabaseRouteClient } from '@/src/lib/supabaseRoute';
import { resolveBusinessIdForUser, WorkspaceResolutionError } from '@/src/lib/businessAccess';
import { cookies } from 'next/headers';

type CacheEntry = { businessId: string | null; expiresAt: number };

type ResolveAuthenticatedBusinessIdResult = {
  businessId: string | null;
  userId: string | null;
  workspaceResolutionError?: WorkspaceResolutionError;
};

const businessIdCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5000; // short-lived per-process cache to avoid repeated lookups during a single page load

export async function resolveAuthenticatedBusinessId(): Promise<ResolveAuthenticatedBusinessIdResult> {
  // Use the standard route client (chainable) here to avoid breaking query chaining.
  // The instrumented client alters method behavior and can break chained calls.
  const routeClient = await createSupabaseRouteClient();

  // Debug: inspect cookies available in this request context (awaited)
  try {
    const cookieList = await cookies();
    const cookieSummary: Record<string, string> = {};
    cookieList.getAll().forEach((c) => { cookieSummary[c.name] = String(c.value).slice(0, 8) + '...'; });
    console.debug('[ARIA_ACCESS] request cookies:', cookieSummary);
  } catch (err) {
    try { console.debug('[ARIA_ACCESS] could not read cookies', err); } catch {}
  }

  const {
    data: { user },
    error: userError,
  } = await routeClient.auth.getUser();

  // Debug: log auth client result to trace 401 causes
  try {
    console.debug('[ARIA_ACCESS] auth.getUser result', { userId: user?.id ?? null, userError: userError?.message ?? null });
  } catch {}

  if (userError || !user?.id) {
    return { businessId: null as string | null, userId: null as string | null };
  }

  const cacheKey = user.id;
  const now = Date.now();
  const cached = businessIdCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return { businessId: cached.businessId, userId: user.id };
  }

  let businessId: string | null = null;
  let workspaceResolutionError: WorkspaceResolutionError | undefined;
  try {
    businessId = await resolveBusinessIdForUser(routeClient, user);
    businessIdCache.set(cacheKey, { businessId, expiresAt: now + CACHE_TTL_MS });
  } catch (error) {
    if (error instanceof WorkspaceResolutionError) {
      workspaceResolutionError = error;
      console.error('[ARIA_ACCESS] workspace resolution failed', {
        userId: user.id,
        stage: error.stage,
        message: error.message,
      });
    } else {
      throw error;
    }
  }

  return {
    businessId,
    userId: user.id,
    workspaceResolutionError,
  };
}

export function applyNoStoreHeaders(response: Response) {
  response.headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');
  return response;
}
