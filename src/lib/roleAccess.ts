export type UserRole = 'owner' | 'admin' | 'finance' | 'staff' | 'inventory' | 'user';

const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  finance: 'Finance',
  staff: 'Staff',
  inventory: 'Inventory',
  user: 'User',
};

export function normalizeUserRole(role: unknown): UserRole {
  if (typeof role !== 'string') {
    return 'user';
  }

  const value = role.trim().toLowerCase();
  switch (value) {
    case 'owner':
      return 'owner';
    case 'admin':
      return 'admin';
    case 'finance':
      return 'finance';
    case 'staff':
      return 'staff';
    case 'inventory':
      return 'inventory';
    default:
      return 'user';
  }
}

export function getUserRole(user: { app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> } | null | undefined): UserRole {
  if (!user) {
    return 'user';
  }

  const role = normalizeUserRole(user.app_metadata?.role ?? user.user_metadata?.role);
  if (role !== 'user') {
    return role;
  }

  const appAdminFlag = user.app_metadata?.is_admin;
  const userAdminFlag = user.user_metadata?.is_admin;
  if (appAdminFlag === true || userAdminFlag === true) {
    return 'admin';
  }

  return 'user';
}

export function getRoleLabel(role: UserRole | string | null | undefined) {
  return ROLE_LABELS[normalizeUserRole(role)];
}

export function isAdminRole(role: UserRole | string | null | undefined) {
  const normalized = normalizeUserRole(role);
  return normalized === 'admin' || normalized === 'owner';
}

export function canAccessModule(role: UserRole | string | null | undefined, module: 'overview' | 'service-demand' | 'inventory' | 'financials' | 'staffing' | 'admin') {
  const normalized = normalizeUserRole(role);

  if (module === 'overview') {
    return true;
  }

  if (module === 'admin') {
    return normalized === 'admin' || normalized === 'owner';
  }

  if (normalized === 'owner' || normalized === 'user') {
    return true;
  }

  if (normalized === 'admin') {
    return true;
  }

  if (normalized === 'finance') {
    return module === 'financials';
  }

  if (normalized === 'staff') {
    return module === 'staffing';
  }

  if (normalized === 'inventory') {
    return module === 'inventory';
  }

  return true;
}

export function canAccessFeature(role: UserRole | string | null | undefined, feature: 'overview' | 'service-demand' | 'inventory' | 'financials' | 'staffing' | 'admin') {
  return canAccessModule(role, feature);
}
