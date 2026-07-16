import { getGeminiKeyStatus, getSupabaseConfigStatus, getSystemStatus } from '@/src/lib/adminConfig';
import { isCurrentUserAdmin, listBusinesses, listRegisteredUsers } from '@/src/lib/adminAccess';
import AdminDashboardClient from './AdminDashboardClient';

async function getSignups() {
  const users = await listRegisteredUsers();
  return users.sort((left, right) => (left.created_at > right.created_at ? -1 : 1));
}

async function getProjects() {
  const projects = await listBusinesses();
  return projects.sort((left, right) => (left.created_at > right.created_at ? -1 : 1));
}

export default async function AdminPage() {
  const allowed = await isCurrentUserAdmin();

  if (!allowed) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground shadow-sm">
        Access to the admin console is restricted to the designated owner account.
      </div>
    );
  }

  const [keyStatus, supabaseStatus, systemStatus, signups, projects] = await Promise.all([
    getGeminiKeyStatus(),
    getSupabaseConfigStatus(),
    getSystemStatus(),
    getSignups(),
    getProjects(),
  ]);

  return (
    <AdminDashboardClient
      initialKeyStatus={keyStatus}
      initialSupabaseStatus={supabaseStatus}
      initialSystemStatus={systemStatus}
      initialSignups={signups}
      initialProjects={projects}
    />
  );
}