'use client';

import { useState, useMemo, useCallback } from 'react';
import { getConfiguredAdminEmails } from '@/src/lib/adminEmails';
import { getRoleLabel } from '@/src/lib/roleAccess';

type Signup = {
  id: string;
  email: string | null;
  role: string | null;
  business_id: string | null;
  created_at: string;
  isSuspended: boolean;
  totalRequests: number;
  estimatedTokens: number;
};

type Project = {
  id: string;
  name: string;
  owner_id: string | null;
  ownerEmail: string | null;
  ownerName: string | null;
  created_at: string;
};

type GeminiStatus = {
  configured: boolean;
  maskedKey: string | null;
  lastValidatedAt: string | null;
  tokenLimit: number | null;
};

type SupabaseStatus = {
  configured: boolean;
  supabaseUrl: string | null;
  maskedPublishableKey: string | null;
  maskedSecretKey: string | null;
  lastSavedAt: string | null;
};

type SystemStatus = {
  geminiConfigured: boolean;
  supabaseConfigured: boolean;
  migrationLastRunAt: string | null;
  checkedAt: string;
};

type AdminDashboardClientProps = {
  initialKeyStatus: GeminiStatus;
  initialSupabaseStatus: SupabaseStatus;
  initialSystemStatus: SystemStatus;
  initialSignups: Signup[];
  initialProjects: Project[];
};

export default function AdminDashboardClient({
  initialKeyStatus,
  initialSupabaseStatus,
  initialSystemStatus,
  initialSignups,
  initialProjects,
}: AdminDashboardClientProps) {
  const [keyStatus, setKeyStatus] = useState(initialKeyStatus);
  const [supabaseStatus, setSupabaseStatus] = useState(initialSupabaseStatus);
  const [systemStatus, setSystemStatus] = useState(initialSystemStatus);
  const [signups, setSignups] = useState(initialSignups);
  const [projects, setProjects] = useState(initialProjects);

  const [newUserForm, setNewUserForm] = useState({
    email: '',
    password: '',
    name: '',
    role: 'user',
    workspaceId: '',
  });
  const [newProjectName, setNewProjectName] = useState('');
  const [creatingUser, setCreatingUser] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [changingRoleUserId, setChangingRoleUserId] = useState<string | null>(null);
  const [changingUserId, setChangingUserId] = useState<string | null>(null);
  const [assigningWorkspaceUserId, setAssigningWorkspaceUserId] = useState<string | null>(null);

  const [geminiInput, setGeminiInput] = useState('');
  const [geminiTokenLimitInput, setGeminiTokenLimitInput] = useState(
    initialKeyStatus.tokenLimit?.toString() ?? ''
  );
  const [supabaseForm, setSupabaseForm] = useState({
    supabaseUrl: initialSupabaseStatus.supabaseUrl ?? '',
    supabasePublishableKey: '',
    supabaseSecretKey: '',
  });
  const [savingGemini, setSavingGemini] = useState(false);
  const [savingSupabase, setSavingSupabase] = useState(false);
  const [runningMigration, setRunningMigration] = useState(false);

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [bulkWorkspaceId, setBulkWorkspaceId] = useState('');

  // Filters for users table
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [workspaceFilter, setWorkspaceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const adminEmails = getConfiguredAdminEmails();

  const showFeedback = useCallback((type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    // Auto-clear after a few seconds
    setTimeout(() => setFeedback(null), 5000);
  }, []);

  // Filtered + sorted users
  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return signups
      .filter((user) => {
        if (q && !(user.email ?? '').toLowerCase().includes(q)) return false;
        if (roleFilter !== 'all' && (user.role ?? 'user') !== roleFilter) return false;
        if (workspaceFilter === 'unassigned' && user.business_id) return false;
        if (workspaceFilter !== 'all' && workspaceFilter !== 'unassigned' && user.business_id !== workspaceFilter)
          return false;
        if (statusFilter === 'active' && user.isSuspended) return false;
        if (statusFilter === 'paused' && !user.isSuspended) return false;
        return true;
      })
      .sort((a, b) => (a.email ?? '').localeCompare(b.email ?? ''));
  }, [signups, userSearch, roleFilter, workspaceFilter, statusFilter]);

  const allFilteredSelected =
    filteredUsers.length > 0 && filteredUsers.every((u) => selectedUserIds.has(u.id));
  const someFilteredSelected = filteredUsers.some((u) => selectedUserIds.has(u.id));

  const toggleSelectUser = (userId: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      // Deselect only the currently filtered ones
      setSelectedUserIds((prev) => {
        const next = new Set(prev);
        filteredUsers.forEach((u) => next.delete(u.id));
        return next;
      });
    } else {
      setSelectedUserIds((prev) => {
        const next = new Set(prev);
        filteredUsers.forEach((u) => next.add(u.id));
        return next;
      });
    }
  };

  const clearSelection = () => setSelectedUserIds(new Set());

  const bulkAssignWorkspace = async (workspaceId: string | null) => {
    if (selectedUserIds.size === 0) return;
    setBulkAssigning(true);
    setFeedback(null);

    try {
      const response = await fetch('/api/admin/workspace_members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          userIds: Array.from(selectedUserIds),
        }),
      });

      let body: Record<string, unknown> = {};
      try {
        body = await response.json();
      } catch {
        const text = await response.text();
        throw new Error(text || 'Unable to parse server response.');
      }

      if (!response.ok) throw new Error((body.error as string) || 'Unable to assign users to workspace.');

      setSignups((current) =>
        current.map((u) =>
          selectedUserIds.has(u.id) ? { ...u, business_id: workspaceId } : u
        )
      );
      const count = selectedUserIds.size;
      clearSelection();
      setBulkWorkspaceId('');
      showFeedback(
        'success',
        workspaceId
          ? `Assigned ${count} user${count !== 1 ? 's' : ''} to workspace.`
          : `Unassigned ${count} user${count !== 1 ? 's' : ''} from workspace.`
      );
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Unable to assign users.');
    } finally {
      setBulkAssigning(false);
    }
  };

  // ─── Existing handlers (lightly improved) ────────────────────────────────

  const handleGeminiSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!geminiInput.trim()) return;

    setSavingGemini(true);
    setFeedback(null);

    try {
      const response = await fetch('/api/admin/gemini-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: geminiInput.trim(),
          tokenLimit: geminiTokenLimitInput.trim(),
        }),
      });

      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to save the Gemini key.');

      setKeyStatus({
        configured: true,
        maskedKey: body.maskedKey ?? '••••••••',
        lastValidatedAt: body.lastValidatedAt ?? null,
        tokenLimit: body.tokenLimit ?? null,
      });
      setGeminiInput('');
      setGeminiTokenLimitInput(body.tokenLimit ? String(body.tokenLimit) : '');
      setSystemStatus((current) => ({
        ...current,
        geminiConfigured: true,
        checkedAt: new Date().toISOString(),
      }));
      showFeedback('success', 'Gemini key saved and validated.');
    } catch (error) {
      showFeedback('error', error instanceof Error ? error.message : 'Unable to save the Gemini key.');
    } finally {
      setSavingGemini(false);
    }
  };

  const handleSupabaseSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingSupabase(true);
    setFeedback(null);

    try {
      const response = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supabaseUrl: supabaseForm.supabaseUrl.trim(),
          supabasePublishableKey: supabaseForm.supabasePublishableKey.trim(),
          supabaseSecretKey: supabaseForm.supabaseSecretKey.trim(),
        }),
      });

      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to save the Supabase settings.');

      setSupabaseStatus({
        configured: true,
        supabaseUrl: supabaseForm.supabaseUrl.trim(),
        maskedPublishableKey: body.maskedPublishableKey ?? null,
        maskedSecretKey: body.maskedSecretKey ?? null,
        lastSavedAt: body.lastSavedAt ?? null,
      });
      setSupabaseForm({
        supabaseUrl: supabaseForm.supabaseUrl.trim(),
        supabasePublishableKey: '',
        supabaseSecretKey: '',
      });
      setSystemStatus((current) => ({
        ...current,
        supabaseConfigured: true,
        checkedAt: new Date().toISOString(),
      }));
      showFeedback('success', 'Supabase settings saved.');
    } catch (error) {
      showFeedback(
        'error',
        error instanceof Error ? error.message : 'Unable to save the Supabase settings.'
      );
    } finally {
      setSavingSupabase(false);
    }
  };

  const handleMigration = async () => {
    setRunningMigration(true);
    setFeedback(null);

    try {
      const response = await fetch('/api/admin/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'migrate' }),
      });

      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to record the migration step.');

      setSystemStatus((current) => ({
        ...current,
        migrationLastRunAt: body.lastRunAt ?? null,
        checkedAt: new Date().toISOString(),
      }));
      showFeedback('success', 'Migration checklist recorded.');
    } catch (error) {
      showFeedback(
        'error',
        error instanceof Error ? error.message : 'Unable to record the migration step.'
      );
    } finally {
      setRunningMigration(false);
    }
  };

  const handleCreateUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newUserForm.email || !newUserForm.password || !newUserForm.name) return;

    setCreatingUser(true);
    setFeedback(null);

    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUserForm),
      });

      let body: Record<string, unknown> = {};
      try {
        body = await response.json();
      } catch {
        const text = await response.text();
        throw new Error(text || 'Unable to parse server response.');
      }

      if (!response.ok) throw new Error((body.error as string) || 'Unable to create the account.');

      setSignups((current) => [
        {
          id: body.id as string,
          email: (body.email as string) ?? null,
          role: (body.role as string) ?? 'user',
          business_id: (body.business_id as string) ?? (newUserForm.workspaceId || null),
          created_at: (body.created_at as string) ?? new Date().toISOString(),
          isSuspended: false,
          totalRequests: 0,
          estimatedTokens: 0,
        },
        ...current,
      ]);
      setNewUserForm({ email: '', password: '', name: '', role: 'user', workspaceId: '' });
      showFeedback('success', 'Account created successfully.');
    } catch (error) {
      showFeedback('error', error instanceof Error ? error.message : 'Unable to create the account.');
    } finally {
      setCreatingUser(false);
    }
  };

  const handleRoleChange = async (userId: string, role: string) => {
    setChangingRoleUserId(userId);
    setFeedback(null);

    try {
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role }),
      });

      let body: Record<string, unknown> = {};
      try {
        body = await response.json();
      } catch {
        const text = await response.text();
        throw new Error(text || 'Unable to parse server response.');
      }

      if (!response.ok) throw new Error((body.error as string) || 'Unable to change the role.');

      setSignups((current) =>
        current.map((user) =>
          user.id === userId ? { ...user, role: (body.role as string) ?? user.role } : user
        )
      );
      showFeedback('success', 'Role updated.');
    } catch (error) {
      showFeedback('error', error instanceof Error ? error.message : 'Unable to change the role.');
    } finally {
      setChangingRoleUserId(null);
    }
  };

  const handleToggleAccess = async (userId: string, currentState: boolean) => {
    setChangingUserId(userId);
    setFeedback(null);

    try {
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, suspend: !currentState }),
      });

      let body: Record<string, unknown> = {};
      try {
        body = await response.json();
      } catch {
        const text = await response.text();
        throw new Error(text || 'Unable to parse server response.');
      }

      if (!response.ok) throw new Error((body.error as string) || 'Unable to update access.');

      setSignups((current) =>
        current.map((user) =>
          user.id === userId ? { ...user, isSuspended: body.isSuspended as boolean } : user
        )
      );
      showFeedback(
        'success',
        body.isSuspended ? 'Account access paused.' : 'Account access restored.'
      );
    } catch (error) {
      showFeedback('error', error instanceof Error ? error.message : 'Unable to update access.');
    } finally {
      setChangingUserId(null);
    }
  };

  const handleAssignWorkspace = async (userId: string, workspaceId: string | null) => {
    setAssigningWorkspaceUserId(userId);
    setFeedback(null);

    try {
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, workspaceId }),
      });

      let body: Record<string, unknown> = {};
      try {
        body = await response.json();
      } catch {
        const text = await response.text();
        throw new Error(text || 'Unable to parse server response.');
      }

      if (!response.ok) throw new Error((body.error as string) || 'Unable to assign workspace.');

      setSignups((current) =>
        current.map((user) =>
          user.id === userId ? { ...user, business_id: workspaceId } : user
        )
      );
      showFeedback('success', 'Workspace assignment updated.');
    } catch (error) {
      showFeedback('error', error instanceof Error ? error.message : 'Unable to assign workspace.');
    } finally {
      setAssigningWorkspaceUserId(null);
    }
  };

  const handleCreateProject = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newProjectName.trim()) return;

    setCreatingProject(true);
    setFeedback(null);

    try {
      const response = await fetch('/api/admin/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newProjectName.trim() }),
      });

      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to create the project.');

      setProjects((current) => [
        {
          id: body.id,
          name: body.name,
          owner_id: body.owner_id ?? null,
          ownerEmail: null,
          ownerName: null,
          created_at: body.created_at ?? new Date().toISOString(),
        },
        ...current,
      ]);
      setNewProjectName('');
      showFeedback('success', 'Project created successfully.');
    } catch (error) {
      showFeedback('error', error instanceof Error ? error.message : 'Unable to create the project.');
    } finally {
      setCreatingProject(false);
    }
  };

  const handleAssignProjectOwner = async (businessId: string, ownerId: string | null) => {
    try {
      const response = await fetch('/api/admin/projects', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId, ownerId }),
      });

      let body: Record<string, unknown> = {};
      try {
        body = await response.json();
      } catch {
        const text = await response.text();
        throw new Error(text || 'Unable to parse server response.');
      }

      if (!response.ok) throw new Error((body.error as string) || 'Unable to assign the owner.');

      const owner = signups.find((u) => u.id === (body.owner_id as string | null));
      setProjects((current) =>
        current.map((project) =>
          project.id === businessId
            ? {
                ...project,
                owner_id: (body.owner_id as string) ?? null,
                ownerEmail: owner?.email ?? null,
                ownerName: owner?.email ?? null,
              }
            : project
        )
      );
      showFeedback('success', 'Project owner updated.');
    } catch (error) {
      showFeedback('error', error instanceof Error ? error.message : 'Unable to assign the owner.');
    }
  };

  const isProtectedUser = (user: Signup) =>
    adminEmails.includes(user.email?.toLowerCase() ?? '');

  const getWorkspaceName = (id: string | null) =>
    id ? projects.find((p) => p.id === id)?.name ?? 'Unknown' : null;

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 px-4 py-4 md:px-6 md:py-8">
      <div className="mx-auto max-w-7xl space-y-6 md:space-y-8">
        {/* Header */}
        <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm p-6 shadow-lg md:p-8">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-pulse" />
            Admin Console
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground md:text-4xl">
            Setup & Management
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground md:text-base">
            This dashboard is reserved for administrators. It keeps setup simple while giving you
            control over core services.
          </p>
        </div>

        {/* Status Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm p-5 shadow-sm transition-all hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Gemini API</span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                  keyStatus.configured
                    ? 'bg-emerald-500/10 text-emerald-600'
                    : 'bg-amber-500/10 text-amber-600'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    keyStatus.configured ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                />
                {keyStatus.configured ? 'Healthy' : 'Not configured'}
              </span>
            </div>
            {keyStatus.configured && keyStatus.maskedKey && (
              <div className="mt-2 text-xs text-muted-foreground font-mono bg-muted/30 px-2 py-1 rounded">
                {keyStatus.maskedKey}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm p-5 shadow-sm transition-all hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Supabase</span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                  supabaseStatus.configured
                    ? 'bg-emerald-500/10 text-emerald-600'
                    : 'bg-amber-500/10 text-amber-600'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    supabaseStatus.configured ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                />
                {supabaseStatus.configured ? 'Healthy' : 'Not configured'}
              </span>
            </div>
            {supabaseStatus.configured && supabaseStatus.supabaseUrl && (
              <div className="mt-2 text-xs text-muted-foreground font-mono bg-muted/30 px-2 py-1 rounded truncate">
                {supabaseStatus.supabaseUrl}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm p-5 shadow-sm transition-all hover:shadow-md md:col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Last Checked</span>
              <span className="text-xs font-medium text-foreground">
                {new Date(systemStatus.checkedAt).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            {systemStatus.migrationLastRunAt && (
              <div className="mt-2 text-xs text-muted-foreground">
                Migration: {new Date(systemStatus.migrationLastRunAt).toLocaleDateString()}
              </div>
            )}
          </div>
        </div>

        {/* Setup Checklist */}
        <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm p-6 shadow-sm md:p-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Setup Checklist</h2>
              <p className="text-sm text-muted-foreground">Complete these steps to get started</p>
            </div>
            <span className="inline-flex rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Guided Flow
            </span>
          </div>

          <div className="mt-6 space-y-4">
            {[
              {
                step: 1,
                title: 'Supabase Setup',
                desc: 'Configure your Supabase project URL and keys',
                ready: supabaseStatus.configured,
              },
              {
                step: 2,
                title: 'Gemini API Setup',
                desc: 'Add your Google Gemini API key',
                ready: keyStatus.configured,
              },
              {
                step: 3,
                title: 'Database Migration',
                desc: 'Run the migration checklist',
                ready: !!systemStatus.migrationLastRunAt,
                manual: true,
              },
            ].map((item) => (
              <div
                key={item.step}
                className="relative rounded-xl border border-border/60 bg-background/50 p-4 transition-all hover:border-primary/20"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    {item.step}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{item.title}</span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          item.ready
                            ? 'bg-emerald-500/10 text-emerald-600'
                            : item.manual
                              ? 'border border-border bg-muted/50 text-muted-foreground'
                              : 'bg-amber-500/10 text-amber-600'
                        }`}
                      >
                        {item.ready ? '✓ Ready' : item.manual ? 'Manual' : '⏳ Pending'}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Create User */}
          <div className="rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-foreground">Create User</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Add a new account</p>
            <form className="mt-4 space-y-3" onSubmit={handleCreateUser}>
              <input
                value={newUserForm.name}
                onChange={(e) => setNewUserForm((c) => ({ ...c, name: e.target.value }))}
                placeholder="Salon name"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <input
                type="email"
                value={newUserForm.email}
                onChange={(e) => setNewUserForm((c) => ({ ...c, email: e.target.value }))}
                placeholder="Email address"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <input
                type="password"
                value={newUserForm.password}
                onChange={(e) => setNewUserForm((c) => ({ ...c, password: e.target.value }))}
                placeholder="Temporary password"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <select
                value={newUserForm.role}
                onChange={(e) => setNewUserForm((c) => ({ ...c, role: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="user">User</option>
                <option value="finance">Finance</option>
                <option value="staff">Staff</option>
                <option value="inventory">Inventory</option>
                <option value="admin">Admin</option>
                <option value="owner">Owner</option>
              </select>
              <select
                value={newUserForm.workspaceId}
                onChange={(e) => setNewUserForm((c) => ({ ...c, workspaceId: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">No workspace assigned</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={creatingUser}
                className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creatingUser ? 'Creating…' : 'Create Account'}
              </button>
            </form>
          </div>

          {/* Create Project */}
          <div className="rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-foreground">Create Project</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Create a new workspace</p>
            <form className="mt-4 space-y-3" onSubmit={handleCreateProject}>
              <input
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Project name"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                type="submit"
                disabled={creatingProject}
                className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creatingProject ? 'Creating…' : 'Create Project'}
              </button>
            </form>
          </div>

          {/* Gemini Key */}
          <div className="rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-foreground">Gemini API Key</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Configure AI assistant</p>

            <div className="mt-3 flex items-center gap-2 text-xs">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  keyStatus.configured ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
              <span className="text-muted-foreground">
                {keyStatus.configured ? 'Connected' : 'Not configured'}
              </span>
              {keyStatus.configured && keyStatus.tokenLimit && (
                <span className="text-muted-foreground">
                  • {keyStatus.tokenLimit.toLocaleString()} token limit
                </span>
              )}
            </div>

            <form className="mt-4 space-y-3" onSubmit={handleGeminiSave}>
              <input
                type="password"
                autoComplete="off"
                value={geminiInput}
                onChange={(e) => setGeminiInput(e.target.value)}
                placeholder="Paste Gemini API key"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <input
                type="number"
                min="1"
                inputMode="numeric"
                value={geminiTokenLimitInput}
                onChange={(e) => setGeminiTokenLimitInput(e.target.value)}
                placeholder="Token quota"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                type="submit"
                disabled={savingGemini || !geminiInput.trim()}
                className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingGemini ? 'Validating…' : 'Save Key'}
              </button>
            </form>
          </div>
        </div>

        {/* Supabase Configuration */}
        <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm p-6 shadow-sm md:p-8">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Supabase Configuration</h2>
              <p className="text-sm text-muted-foreground">Configure your database connection</p>
            </div>
            <span className="inline-flex rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Secure
            </span>
          </div>

          <form className="mt-6 space-y-4" onSubmit={handleSupabaseSave}>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Project URL
                </label>
                <input
                  value={supabaseForm.supabaseUrl}
                  onChange={(e) =>
                    setSupabaseForm((c) => ({ ...c, supabaseUrl: e.target.value }))
                  }
                  className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="https://xyz.supabase.co"
                />
              </div>
              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Publishable Key
                </label>
                <input
                  value={supabaseForm.supabasePublishableKey}
                  onChange={(e) =>
                    setSupabaseForm((c) => ({ ...c, supabasePublishableKey: e.target.value }))
                  }
                  className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="sb_publishable_..."
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Secret Key
                </label>
                <input
                  value={supabaseForm.supabaseSecretKey}
                  onChange={(e) =>
                    setSupabaseForm((c) => ({ ...c, supabaseSecretKey: e.target.value }))
                  }
                  className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="sb_secret_..."
                />
              </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 text-xs text-muted-foreground">
              <button
                type="submit"
                disabled={savingSupabase}
                className="rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingSupabase ? 'Saving…' : 'Save Settings'}
              </button>
              <span>Publishable keys are client-safe; secret keys stay server-side.</span>
            </div>
          </form>
        </div>

        {/* Migration */}
        <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm p-6 shadow-sm md:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Database Migration</h2>
              <p className="text-sm text-muted-foreground">
                Record that you&apos;ve reviewed the migration checklist
              </p>
            </div>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-6 py-2.5 text-sm font-medium transition-all hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleMigration}
              disabled={runningMigration}
            >
              {runningMigration ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  Running…
                </>
              ) : (
                'Run Migration Checklist'
              )}
            </button>
          </div>
        </div>

        {/* Feedback Toast */}
        {feedback && (
          <div
            className={`rounded-xl border px-4 py-3 text-sm shadow-sm ${
              feedback.type === 'success'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                : 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400'
            }`}
          >
            <div className="flex items-start gap-2">
              <span className="font-medium">{feedback.type === 'success' ? '✓' : '!'}</span>
              <span>{feedback.message}</span>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            REGISTERED USERS — major upgrade
        ═══════════════════════════════════════════════════════════════ */}
        <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
          {/* Header */}
          <div className="border-b border-border/60 bg-muted/30 px-4 py-4 md:px-6 md:py-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Registered Users</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {signups.length} total · {filteredUsers.length} shown
                  {selectedUserIds.size > 0 && (
                    <span className="ml-2 text-primary font-medium">
                      · {selectedUserIds.size} selected
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Filters + Search */}
          <div className="px-4 py-3 md:px-6 border-b border-border/60 bg-background/40 space-y-3">
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <div className="relative flex-1">
                <input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search by email…"
                  className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z"
                  />
                </svg>
              </div>

              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="all">All roles</option>
                <option value="user">User</option>
                <option value="finance">Finance</option>
                <option value="staff">Staff</option>
                <option value="inventory">Inventory</option>
                <option value="admin">Admin</option>
                <option value="owner">Owner</option>
              </select>

              <select
                value={workspaceFilter}
                onChange={(e) => setWorkspaceFilter(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="all">All workspaces</option>
                <option value="unassigned">Unassigned</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
              </select>
            </div>
          </div>

          {/* Bulk Actions Bar (appears when selection exists) */}
          {selectedUserIds.size > 0 && (
            <div className="sticky top-0 z-10 px-4 py-3 md:px-6 border-b border-primary/20 bg-primary/5 backdrop-blur-sm">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-semibold text-primary">
                    {selectedUserIds.size} selected
                  </span>
                  <button
                    onClick={clearSelection}
                    className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                  >
                    Clear
                  </button>
                </div>

                <div className="flex flex-1 flex-wrap items-center gap-2 sm:justify-end">
                  <select
                    value={bulkWorkspaceId}
                    onChange={(e) => setBulkWorkspaceId(e.target.value)}
                    disabled={bulkAssigning}
                    className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                  >
                    <option value="">Choose workspace…</option>
                    <option value="__unassign__">— Unassign —</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={() => {
                      if (!bulkWorkspaceId) return;
                      const target =
                        bulkWorkspaceId === '__unassign__' ? null : bulkWorkspaceId;
                      void bulkAssignWorkspace(target);
                    }}
                    disabled={bulkAssigning || !bulkWorkspaceId}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {bulkAssigning ? (
                      <>
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                        Assigning…
                      </>
                    ) : (
                      'Assign to workspace'
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-muted/20 text-muted-foreground">
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someFilteredSelected && !allFilteredSelected;
                      }}
                      onChange={toggleSelectAllFiltered}
                      className="rounded border-border"
                      aria-label="Select all filtered users"
                    />
                  </th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider min-w-[160px]">
                    Workspace
                  </th>
                  <th className="hidden md:table-cell px-4 py-3 text-xs font-medium uppercase tracking-wider">
                    Token Usage
                  </th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filteredUsers.map((user) => {
                  const protectedUser = isProtectedUser(user);
                  const isSelected = selectedUserIds.has(user.id);
                  const workspaceName = getWorkspaceName(user.business_id);

                  return (
                    <tr
                      key={user.id}
                      className={`transition-colors ${
                        isSelected ? 'bg-primary/5' : 'hover:bg-muted/10'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectUser(user.id)}
                          className="rounded border-border"
                          aria-label={`Select ${user.email ?? user.id}`}
                        />
                      </td>

                      {/* Email */}
                      <td className="px-4 py-3 font-medium text-foreground">
                        <div className="truncate max-w-[180px] sm:max-w-[240px]" title={user.email ?? undefined}>
                          {user.email ?? '—'}
                        </div>
                      </td>

                      {/* Role badge */}
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded border border-border bg-muted/50 px-2 py-0.5 font-mono text-[10px] font-bold text-muted-foreground uppercase">
                          {getRoleLabel(user.role ?? 'user')}
                        </span>
                      </td>

                      {/* Workspace select */}
                      <td className="px-4 py-3">
                        <select
                          value={user.business_id ?? ''}
                          onChange={(e) =>
                            handleAssignWorkspace(user.id, e.target.value || null)
                          }
                          disabled={
                            assigningWorkspaceUserId === user.id || protectedUser
                          }
                          className="w-full max-w-[180px] rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-medium focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <option value="">Unassigned</option>
                          {projects.map((project) => (
                            <option key={project.id} value={project.id}>
                              {project.name}
                            </option>
                          ))}
                        </select>
                        {assigningWorkspaceUserId === user.id && (
                          <span className="ml-1 text-[10px] text-muted-foreground">…</span>
                        )}
                      </td>

                      {/* Token usage */}
                      <td className="hidden md:table-cell px-4 py-3 text-muted-foreground">
                        {(() => {
                          const usageText = `${user.estimatedTokens.toLocaleString()} tok`;
                          if (keyStatus.tokenLimit) {
                            const percent = Math.min(
                              100,
                              Math.round((user.estimatedTokens / keyStatus.tokenLimit) * 100)
                            );
                            return (
                              <div className="flex items-center gap-2">
                                <span className="text-xs tabular-nums">{usageText}</span>
                                <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-primary transition-all duration-300"
                                    style={{ width: `${percent}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-muted-foreground tabular-nums">
                                  {percent}%
                                </span>
                              </div>
                            );
                          }
                          return <span className="text-xs tabular-nums">{usageText}</span>;
                        })()}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                            user.isSuspended
                              ? 'bg-amber-500/10 text-amber-600'
                              : 'bg-emerald-500/10 text-emerald-600'
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              user.isSuspended ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                          />
                          {user.isSuspended ? 'Paused' : 'Active'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            value={user.role ?? 'user'}
                            onChange={(e) => handleRoleChange(user.id, e.target.value)}
                            disabled={
                              changingRoleUserId === user.id || protectedUser
                            }
                            className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-medium focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <option value="user">User</option>
                            <option value="finance">Finance</option>
                            <option value="staff">Staff</option>
                            <option value="inventory">Inventory</option>
                            <option value="admin">Admin</option>
                            <option value="owner">Owner</option>
                          </select>

                          <button
                            className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted/30 disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={() => handleToggleAccess(user.id, user.isSuspended)}
                            disabled={changingUserId === user.id || protectedUser}
                          >
                            {changingUserId === user.id
                              ? '…'
                              : user.isSuspended
                                ? 'Restore'
                                : 'Pause'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                      {signups.length === 0
                        ? 'No users registered yet.'
                        : 'No users match the current filters.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Projects Table */}
        <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
          <div className="border-b border-border/60 bg-muted/30 px-4 py-4 md:px-6 md:py-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">Projects</h3>
              <span className="text-xs text-muted-foreground">
                {projects.length} project{projects.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-muted/20 text-muted-foreground">
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider">
                    Project
                  </th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider">
                    Owner
                  </th>
                  <th className="hidden md:table-cell px-4 py-3 text-xs font-medium uppercase tracking-wider">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {projects.map((project) => (
                  <tr key={project.id} className="hover:bg-muted/10 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">
                      <div className="truncate max-w-[160px] sm:max-w-none">{project.name}</div>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={project.owner_id ?? ''}
                        onChange={(e) =>
                          handleAssignProjectOwner(project.id, e.target.value || null)
                        }
                        className="max-w-[180px] rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-medium focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value="">Unassigned</option>
                        {signups.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.email?.split('@')[0] ?? 'Account'}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-muted-foreground text-xs">
                      {new Date(project.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>
                  </tr>
                ))}
                {projects.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                      No projects created yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}