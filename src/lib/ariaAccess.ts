import { createSupabaseRouteClient } from '@/src/lib/supabaseRoute';

export async function resolveAuthenticatedBusinessId() {
  const routeClient = await createSupabaseRouteClient();
  const {
    data: { user },
    error: userError,
  } = await routeClient.auth.getUser();

  if (userError || !user?.id) {
    return { businessId: null as string | null, userId: null as string | null };
  }

  const { data: businesses } = await routeClient
    .from('businesses')
    .select('id')
    .eq('owner_id', user.id)
    .limit(1);

  return {
    businessId: businesses?.[0]?.id ?? null,
    userId: user.id,
  };
}

export function applyNoStoreHeaders(response: Response) {
  response.headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');
  return response;
}
