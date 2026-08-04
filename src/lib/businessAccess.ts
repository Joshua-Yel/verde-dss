export type BusinessScopedUser = {
  id?: string | null;
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
};

function readFirstStringValue(values: Array<unknown>) {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const nestedId = record.id;
      if (typeof nestedId === 'string') {
        const trimmed = nestedId.trim();
        if (trimmed) return trimmed;
      }
    }
  }
  return null;
}

export function getAssignedBusinessId(user: BusinessScopedUser | null | undefined) {
  const appMetadata = user?.app_metadata ?? {};
  const userMetadata = user?.user_metadata ?? {};

  const assignedBusinessId = readFirstStringValue([
    appMetadata?.business_id,
    appMetadata?.businessId,
    appMetadata?.workspace_id,
    appMetadata?.workspaceId,
    appMetadata?.project_id,
    appMetadata?.projectId,
    appMetadata?.business?.id,
    appMetadata?.workspace?.id,
    appMetadata?.project?.id,
    userMetadata?.business_id,
    userMetadata?.businessId,
    userMetadata?.workspace_id,
    userMetadata?.workspaceId,
    userMetadata?.project_id,
    userMetadata?.projectId,
    userMetadata?.business?.id,
    userMetadata?.workspace?.id,
    userMetadata?.project?.id,
  ]);

  return assignedBusinessId || null;
}

type BusinessLookupClient = {
  from: (table: string) => any;
};

export class WorkspaceResolutionError extends Error {
  stage: string;

  constructor(stage: string, message: string) {
    super(message);
    this.stage = stage;
    this.name = 'WorkspaceResolutionError';
  }
}

export async function resolveBusinessIdForUser(client: BusinessLookupClient, user: BusinessScopedUser | null | undefined) {
  const start = Date.now();
  const assignedBusinessId = getAssignedBusinessId(user);
  if (assignedBusinessId) {
    const assignedStart = Date.now();
    const { data, error } = await client
      .from('businesses')
      .select('id')
      .eq('id', assignedBusinessId)
      .limit(1);
    const assignedElapsed = Date.now() - assignedStart;
    console.debug('[businessAccess] assignedBusinessId check', { assignedBusinessId, assignedElapsed, hasMatch: !error && Boolean(data?.[0]?.id), error: error?.message ?? null });

    if (error) {
      throw new WorkspaceResolutionError('assignedBusinessId', 'Failed to validate assigned workspace.');
    }

    if (data?.[0]?.id) {
      console.debug('[businessAccess] resolved via assignedBusinessId', { businessId: data[0].id, totalElapsed: Date.now() - start });
      return data[0].id;
    }
  }

  if (!user?.id) {
    console.debug('[businessAccess] no user id available', { totalElapsed: Date.now() - start });
    return null;
  }

  const membershipStart = Date.now();
  const { data: membershipData, error: membershipError } = await client
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .limit(1);
  const membershipElapsed = Date.now() - membershipStart;
  console.debug('[businessAccess] workspace_members lookup', { userId: user.id, membershipElapsed, count: membershipData?.length ?? 0, membershipError: membershipError?.message ?? null, workspaceId: membershipData?.[0]?.workspace_id ?? null });

  if (membershipError) {
    throw new WorkspaceResolutionError('workspace_members', 'Failed to look up workspace membership.');
  }

  if (membershipData?.[0]?.workspace_id) {
    const workspaceStart = Date.now();
    const { data, error } = await client
      .from('businesses')
      .select('id')
      .eq('id', membershipData[0].workspace_id)
      .limit(1);
    const workspaceElapsed = Date.now() - workspaceStart;
    console.debug('[businessAccess] workspace validation', { workspaceId: membershipData[0].workspace_id, workspaceElapsed, hasMatch: !error && Boolean(data?.[0]?.id), error: error?.message ?? null });

    if (error) {
      throw new WorkspaceResolutionError('workspace_validation', 'Failed to validate workspace membership.');
    }

    if (data?.[0]?.id) {
      console.debug('[businessAccess] resolved via workspace_members', { businessId: data[0].id, totalElapsed: Date.now() - start });
      return data[0].id;
    }
  }

  const profileStart = Date.now();
  const { data: profileData, error: profileError } = await client
    .from('user_profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .limit(1);
  const profileElapsed = Date.now() - profileStart;
  console.debug('[businessAccess] user_profiles lookup', { userId: user.id, profileElapsed, workspaceId: profileData?.[0]?.workspace_id ?? null, profileError: profileError?.message ?? null });

  if (profileError) {
    throw new WorkspaceResolutionError('user_profiles', 'Failed to read user profile workspace assignment.');
  }

  if (profileData?.[0]?.workspace_id) {
    const profileWorkspaceStart = Date.now();
    const { data, error } = await client
      .from('businesses')
      .select('id')
      .eq('id', profileData[0].workspace_id)
      .limit(1);
    const profileWorkspaceElapsed = Date.now() - profileWorkspaceStart;
    console.debug('[businessAccess] profile workspace validation', { workspaceId: profileData[0].workspace_id, profileWorkspaceElapsed, hasMatch: !error && Boolean(data?.[0]?.id), error: error?.message ?? null });

    if (error) {
      throw new WorkspaceResolutionError('profile_workspace_validation', 'Failed to validate profile workspace assignment.');
    }

    if (data?.[0]?.id) {
      console.debug('[businessAccess] resolved via user_profiles', { businessId: data[0].id, totalElapsed: Date.now() - start });
      return data[0].id;
    }
  }

  const ownerStart = Date.now();
  const { data: ownedBusinessData, error: ownedBusinessError } = await client
    .from('businesses')
    .select('id')
    .eq('owner_id', user.id)
    .limit(1);
  const ownerElapsed = Date.now() - ownerStart;
  console.debug('[businessAccess] owned business lookup', { userId: user.id, ownerElapsed, businessId: ownedBusinessData?.[0]?.id ?? null, ownedBusinessError: ownedBusinessError?.message ?? null });

  if (ownedBusinessError) {
    throw new WorkspaceResolutionError('owned_business', 'Failed to read owned business.');
  }

  if (ownedBusinessData?.[0]?.id) {
    console.debug('[businessAccess] resolved via owned business', { businessId: ownedBusinessData[0].id, totalElapsed: Date.now() - start });
    return ownedBusinessData[0].id;
  }

  const fallbackStart = Date.now();
  const { data: fallbackBusinessData, error: fallbackBusinessError } = await client
    .from('businesses')
    .select('id')
    .limit(1);
  const fallbackElapsed = Date.now() - fallbackStart;
  console.debug('[businessAccess] fallback business lookup', { fallbackElapsed, businessId: fallbackBusinessData?.[0]?.id ?? null, fallbackError: fallbackBusinessError?.message ?? null });

  if (fallbackBusinessError) {
    throw new WorkspaceResolutionError('fallback_business', 'Failed to execute fallback business lookup.');
  }

  if (fallbackBusinessData?.[0]?.id) {
    console.debug('[businessAccess] resolved via fallback business', { businessId: fallbackBusinessData[0].id, totalElapsed: Date.now() - start });
    return fallbackBusinessData[0].id;
  }

  console.debug('[businessAccess] failed to resolve business id', { totalElapsed: Date.now() - start });
  return null;
}
