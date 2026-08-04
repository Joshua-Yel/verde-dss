import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { createSupabaseRouteClient } from './supabaseRoute';
import { supabaseServer } from './supabaseServer';
import { getConfiguredAdminEmails } from './adminEmails';
import { getUserRole, normalizeUserRole } from './roleAccess';
import { getAssignedBusinessId } from './businessAccess';
export { getConfiguredAdminEmails } from './adminEmails';

function hasAdminRole(user: { app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> } | null | undefined) {
  if (!user) return false;

  const appRole = user.app_metadata?.role;
  const userRole = user.user_metadata?.role;
  const appAdminFlag = user.app_metadata?.is_admin;
  const userAdminFlag = user.user_metadata?.is_admin;

  return [appRole, userRole, appAdminFlag, userAdminFlag].some((value) => value === 'admin' || value === true);
}

function getRoleMetadata(role: string | undefined | null) {
  const normalizedRole = normalizeUserRole(role);

  switch (normalizedRole) {
    case 'admin':
      return { role: normalizedRole, is_admin: true };
    case 'owner':
      return { role: normalizedRole, is_admin: false };
    case 'finance':
    case 'staff':
    case 'inventory':
      return { role: normalizedRole, is_admin: false };
    default:
      return { role: 'user', is_admin: false };
  }
}

function getUsageStorePath() {
  if (process.env.ADMIN_USAGE_PATH) {
    return process.env.ADMIN_USAGE_PATH;
  }

  if (process.env.VERCEL || process.env.NEXT_RUNTIME) {
    return path.join(os.tmpdir(), 'verde-user-usage.json');
  }

  return path.join(process.cwd(), 'data', 'user-usage.json');
}

const USAGE_PATH = getUsageStorePath();

async function ensureUsageStore() {
  await fs.mkdir(path.dirname(USAGE_PATH), { recursive: true });

  try {
    await fs.access(USAGE_PATH);
  } catch {
    await fs.writeFile(USAGE_PATH, JSON.stringify({}, null, 2), 'utf8');
  }
}

async function readUsageStore() {
  await ensureUsageStore();
  const raw = await fs.readFile(USAGE_PATH, 'utf8');

  try {
    return JSON.parse(raw) as Record<string, { totalRequests: number; estimatedTokens: number; lastUsedAt?: string }>;
  } catch {
    return {} as Record<string, { totalRequests: number; estimatedTokens: number; lastUsedAt?: string }>;
  }
}

async function writeUsageStore(nextStore: Record<string, { totalRequests: number; estimatedTokens: number; lastUsedAt?: string }>) {
  await ensureUsageStore();
  await fs.writeFile(USAGE_PATH, JSON.stringify(nextStore, null, 2), 'utf8');
}

export async function getCurrentUserEmail() {
  const supabase = await createSupabaseRouteClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.email) {
    return null;
  }

  return user.email.toLowerCase();
}

export async function isCurrentUserAdmin() {
  const supabase = await createSupabaseRouteClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return false;
  }

  const email = user.email?.toLowerCase();
  const configuredAdminEmails = getConfiguredAdminEmails();
  const isConfiguredAdmin = Boolean(email && configuredAdminEmails.includes(email));
  return isConfiguredAdmin || hasAdminRole(user);
}

export async function isUserSuspended(userId: string) {
  const { data, error } = await supabaseServer.auth.admin.getUserById(userId);

  if (error || !data?.user) {
    return false;
  }

  return Boolean(data.user.app_metadata?.is_suspended || data.user.user_metadata?.is_suspended);
}

export async function recordUserUsage(userId: string, messageBody: string) {
  const usageStore = await readUsageStore();
  const current = usageStore[userId] ?? { totalRequests: 0, estimatedTokens: 0 };
  const estimatedTokens = Math.max(1, Math.ceil(messageBody.length / 4));
  current.totalRequests += 1;
  current.estimatedTokens += estimatedTokens;
  current.lastUsedAt = new Date().toISOString();
  usageStore[userId] = current;
  await writeUsageStore(usageStore);
  return current;
}

export async function toggleUserAccess(userId: string, suspend: boolean) {
  const { data, error } = await supabaseServer.auth.admin.getUserById(userId);

  if (error || !data?.user) {
    throw new Error('User not found.');
  }

  const nextAppMetadata = {
    ...(data.user.app_metadata ?? {}),
    is_suspended: suspend,
  };

  const { data: updatedUser, error: updateError } = await supabaseServer.auth.admin.updateUserById(userId, {
    app_metadata: nextAppMetadata,
  });

  if (updateError || !updatedUser.user) {
    throw new Error(updateError?.message ?? 'Unable to update access.');
  }

  return {
    id: updatedUser.user.id,
    email: updatedUser.user.email ?? null,
    isSuspended: Boolean(updatedUser.user.app_metadata?.is_suspended || updatedUser.user.user_metadata?.is_suspended),
  };
}

async function syncWorkspaceMembership(userId: string, businessId: string | null, role: string, salonName?: string | null) {
  if (!userId || !businessId) {
    return;
  }

  try {
    const { data: existingUser, error: lookupError } = await supabaseServer.auth.admin.getUserById(userId);

    if (!lookupError && existingUser?.user) {
      const nextUserMetadata = {
        ...(existingUser.user.user_metadata ?? {}),
        business_id: businessId,
        workspace_id: businessId,
        salon_name: salonName ?? (existingUser.user.user_metadata?.salon_name as string | null | undefined) ?? null,
      };

      await supabaseServer.auth.admin.updateUserById(userId, {
        user_metadata: nextUserMetadata,
      });
    }
  } catch {
    // Best effort: continue even if auth metadata sync is unavailable.
  }

  try {
    await supabaseServer.from('user_profiles').upsert({
      id: userId,
      workspace_id: businessId,
      role,
      salon_name: salonName ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
  } catch {
    // The database may not have the user_profiles table yet; ignore and continue.
  }

  try {
    await supabaseServer.from('workspace_members').upsert({
      workspace_id: businessId,
      user_id: userId,
      role,
      is_active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id,user_id' });
  } catch {
    // The database may not have the workspace_members table yet; ignore and continue.
  }
}

async function resolveTargetBusinessId(inputBusinessId?: string | null) {
  if (!inputBusinessId) {
    return null;
  }

  const { data, error } = await supabaseServer
    .from('businesses')
    .select('id')
    .eq('id', inputBusinessId)
    .limit(1)
    .maybeSingle();

  if (!error && data?.id) {
    return data.id as string;
  }

  return null;
}

export async function createUserAccount(input: { email: string; password: string; name: string; role?: string; businessId?: string | null }) {
  const normalizedRole = normalizeUserRole(input.role);
  const roleMetadata = getRoleMetadata(normalizedRole);

  const { data: authData, error: authError } = await supabaseServer.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      salon_name: input.name,
      business_id: null,
    },
    app_metadata: {
      role: roleMetadata.role,
      is_admin: roleMetadata.is_admin,
    },
  });

  if (authError || !authData?.user) {
    throw new Error(authError?.message ?? 'Unable to create account.');
  }

  const targetBusinessId = await resolveTargetBusinessId(input.businessId);

  if (targetBusinessId) {
    await syncWorkspaceMembership(authData.user.id, targetBusinessId, normalizedRole, input.name);
  }

  return {
    id: authData.user.id,
    email: authData.user.email ?? input.email,
    role: roleMetadata.role,
    business_id: targetBusinessId ?? null,
    created_at: authData.user.created_at,
    isSuspended: false,
  };
}

export async function updateUserRole(userId: string, role: string | undefined, workspaceId?: string | null) {
  const normalizedRole = role ? normalizeUserRole(role) : 'user';
  const roleMetadata = getRoleMetadata(normalizedRole);
  const { data, error } = await supabaseServer.auth.admin.getUserById(userId);

  if (error || !data?.user) {
    throw new Error('User not found.');
  }

  const nextAppMetadata = {
    ...(data.user.app_metadata ?? {}),
    role: typeof role === 'string' ? roleMetadata.role : getUserRole(data.user),
    is_admin:
      typeof role === 'string'
        ? roleMetadata.is_admin
        : (data.user.app_metadata?.is_admin as boolean | null | undefined) ??
          (data.user.user_metadata?.is_admin as boolean | null | undefined) ??
          false,
  };

  const nextUserMetadata = {
    ...(data.user.user_metadata ?? {}),
    business_id: getAssignedBusinessId(data.user) ?? (data.user.user_metadata?.business_id as string | null | undefined) ?? null,
  };

  const { data: updatedUser, error: updateError } = await supabaseServer.auth.admin.updateUserById(userId, {
    app_metadata: nextAppMetadata,
    user_metadata: nextUserMetadata,
  });

  if (workspaceId) {
    await syncWorkspaceMembership(userId, workspaceId, normalizedRole, (updatedUser.user?.user_metadata?.salon_name as string | null | undefined) ?? null);
  }

  if (updateError || !updatedUser.user) {
    throw new Error(updateError?.message ?? 'Unable to update role.');
  }

  return {
    id: updatedUser.user.id,
    email: updatedUser.user.email ?? null,
    role: roleMetadata.role,
    isSuspended: Boolean(updatedUser.user.app_metadata?.is_suspended || updatedUser.user.user_metadata?.is_suspended),
  };
}

export async function listBusinesses() {
  const { data: businesses, error } = await supabaseServer
    .from('businesses')
    .select('id, name, owner_id, created_at')
    .order('created_at', { ascending: false });

  if (error || !businesses) {
    return [];
  }

  const { data: usersData } = await supabaseServer.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const ownerMap = new Map<string, { email?: string | null; user_metadata?: Record<string, unknown> }>();

  for (const user of usersData?.users ?? []) {
    if (user.id) {
      ownerMap.set(user.id, {
        email: user.email ?? null,
        user_metadata: user.user_metadata as Record<string, unknown> | undefined,
      });
    }
  }

  return businesses.map((business) => {
    const owner = business.owner_id ? ownerMap.get(business.owner_id) : undefined;

    return {
      id: business.id,
      name: business.name ?? 'Untitled project',
      owner_id: business.owner_id ?? null,
      ownerEmail: owner?.email ?? null,
      ownerName: (owner?.user_metadata?.salon_name as string | null | undefined) ?? null,
      created_at: business.created_at,
    };
  });
}

export async function createBusiness(name: string, ownerId?: string | null) {
  const { data: existingBusiness, error: existingError } = await supabaseServer
    .from('businesses')
    .select('id, name, owner_id, created_at')
    .eq('owner_id', ownerId ?? '')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingBusiness?.id) {
    if (ownerId) {
      await syncWorkspaceMembership(ownerId, existingBusiness.id, 'owner', name);
    }
    return existingBusiness;
  }

  if (existingError) {
    throw new Error(existingError.message ?? 'Unable to resolve the project.');
  }

  const { data, error } = await supabaseServer
    .from('businesses')
    .insert({ name, owner_id: ownerId ?? null })
    .select('id, name, owner_id, created_at')
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Unable to create a project.');
  }

  if (ownerId) {
    await syncWorkspaceMembership(ownerId, data.id, 'owner', name);
  }

  return data;
}

export async function updateBusinessOwner(businessId: string, ownerId: string | null) {
  const { data, error } = await supabaseServer
    .from('businesses')
    .update({ owner_id: ownerId })
    .eq('id', businessId)
    .select('id, name, owner_id, created_at')
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Unable to update the project owner.');
  }

  if (ownerId) {
    await syncWorkspaceMembership(ownerId, data.id, 'owner', data.name ?? null);
  }

  return data;
}

export async function listRegisteredUsers() {
  const { data, error } = await supabaseServer.auth.admin.listUsers({ page: 1, perPage: 1000 });

  if (error || !data?.users) {
    return [];
  }

  const usageStore = await readUsageStore();

  return data.users.map((user) => {
    const usage = usageStore[user.id] ?? { totalRequests: 0, estimatedTokens: 0 };
    const userMetadata = user.user_metadata as Record<string, unknown> | undefined;
    const appMetadata = user.app_metadata as Record<string, unknown> | undefined;
    const business_id =
      (userMetadata?.business_id as string | null | undefined) ??
      (userMetadata?.workspace_id as string | null | undefined) ??
      (appMetadata?.business_id as string | null | undefined) ??
      (appMetadata?.workspace_id as string | null | undefined) ??
      null;

    return {
      id: user.id,
      email: user.email ?? null,
      role: getUserRole(user),
      business_id,
      created_at: user.created_at,
      isSuspended: Boolean(user.app_metadata?.is_suspended || user.user_metadata?.is_suspended),
      totalRequests: usage.totalRequests,
      estimatedTokens: usage.estimatedTokens,
    };
  });
}
