'use client';

import { useState } from 'react';
import { getConfiguredAdminEmails } from '@/src/lib/adminEmails';

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
  const [newUserForm, setNewUserForm] = useState({ email: '', password: '', name: '', role: 'user' });
  const [newProjectName, setNewProjectName] = useState('');
  const [creatingUser, setCreatingUser] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [changingRoleUserId, setChangingRoleUserId] = useState<string | null>(null);
  const [geminiInput, setGeminiInput] = useState('');
  const [geminiTokenLimitInput, setGeminiTokenLimitInput] = useState(initialKeyStatus.tokenLimit?.toString() ?? '');
  const [supabaseForm, setSupabaseForm] = useState({
    supabaseUrl: initialSupabaseStatus.supabaseUrl ?? '',
    supabasePublishableKey: '',
    supabaseSecretKey: '',
  });
  const [savingGemini, setSavingGemini] = useState(false);
  const [savingSupabase, setSavingSupabase] = useState(false);
  const [runningMigration, setRunningMigration] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [changingUserId, setChangingUserId] = useState<string | null>(null);
  const adminEmails = getConfiguredAdminEmails();

  const handleGeminiSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!geminiInput.trim()) return;

    setSavingGemini(true);
    setFeedback(null);

    try {
      const response = await fetch('/api/admin/gemini-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: geminiInput.trim(), tokenLimit: geminiTokenLimitInput.trim() }),
      });

      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || 'Unable to save the Gemini key.');
      }

      setKeyStatus({
        configured: true,
        maskedKey: body.maskedKey ?? '••••••••',
        lastValidatedAt: body.lastValidatedAt ?? null,
        tokenLimit: body.tokenLimit ?? null,
      });
      setGeminiInput('');
      setGeminiTokenLimitInput(body.tokenLimit ? String(body.tokenLimit) : '');
      setSystemStatus((current) => ({ ...current, geminiConfigured: true, checkedAt: new Date().toISOString() }));
      setFeedback('Gemini key saved and validated.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Unable to save the Gemini key.');
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
      if (!response.ok) {
        throw new Error(body.error || 'Unable to save the Supabase settings.');
      }

      setSupabaseStatus({
        configured: true,
        supabaseUrl: supabaseForm.supabaseUrl.trim(),
        maskedPublishableKey: body.maskedPublishableKey ?? null,
        maskedSecretKey: body.maskedSecretKey ?? null,
        lastSavedAt: body.lastSavedAt ?? null,
      });
      setSupabaseForm({ supabaseUrl: supabaseForm.supabaseUrl.trim(), supabasePublishableKey: '', supabaseSecretKey: '' });
      setSystemStatus((current) => ({ ...current, supabaseConfigured: true, checkedAt: new Date().toISOString() }));
      setFeedback('Supabase settings saved.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Unable to save the Supabase settings.');
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
      if (!response.ok) {
        throw new Error(body.error || 'Unable to record the migration step.');
      }

      setSystemStatus((current) => ({ ...current, migrationLastRunAt: body.lastRunAt ?? null, checkedAt: new Date().toISOString() }));
      setFeedback('Migration checklist recorded.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Unable to record the migration step.');
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

      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || 'Unable to create the account.');
      }

      setSignups((current) => [{
        id: body.id,
        email: body.email ?? null,
        role: body.role ?? 'user',
        business_id: null,
        created_at: body.created_at ?? new Date().toISOString(),
        isSuspended: false,
        totalRequests: 0,
        estimatedTokens: 0,
      }, ...current]);
      setNewUserForm({ email: '', password: '', name: '', role: 'user' });
      setFeedback('Account created successfully.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Unable to create the account.');
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

      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || 'Unable to change the role.');
      }

      setSignups((current) => current.map((user) => (user.id === userId ? { ...user, role: body.role ?? user.role } : user)));
      setFeedback('Role updated.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Unable to change the role.');
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

      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || 'Unable to update access.');
      }

      setSignups((current) => current.map((user) => (user.id === userId ? { ...user, isSuspended: body.isSuspended } : user)));
      setFeedback(body.isSuspended ? 'Account access paused.' : 'Account access restored.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Unable to update access.');
    } finally {
      setChangingUserId(null);
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
      if (!response.ok) {
        throw new Error(body.error || 'Unable to create the project.');
      }

      setProjects((current) => [{
        id: body.id,
        name: body.name,
        owner_id: body.owner_id ?? null,
        ownerEmail: null,
        ownerName: null,
        created_at: body.created_at ?? new Date().toISOString(),
      }, ...current]);
      setNewProjectName('');
      setFeedback('Project created successfully.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Unable to create the project.');
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

      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || 'Unable to assign the owner.');
      }

      setProjects((current) => current.map((project) => (project.id === businessId ? {
        ...project,
        owner_id: body.owner_id ?? null,
        ownerEmail: signups.find((user) => user.id === (body.owner_id ?? null))?.email ?? null,
        ownerName: signups.find((user) => user.id === (body.owner_id ?? null))?.email ?? null,
      } : project)));
      setFeedback('Project owner updated.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Unable to assign the owner.');
    }
  };

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
            This dashboard is reserved for administrators. It keeps setup simple while giving you control over core services.
          </p>
        </div>

        {/* Status Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm p-5 shadow-sm transition-all hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Gemini API</span>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${keyStatus.configured ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${keyStatus.configured ? 'bg-emerald-500' : 'bg-amber-500'}`} />
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
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${supabaseStatus.configured ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${supabaseStatus.configured ? 'bg-emerald-500' : 'bg-amber-500'}`} />
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
                  minute: '2-digit'
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
            {/* Step 1 */}
            <div className="relative rounded-xl border border-border/60 bg-background/50 p-4 transition-all hover:border-primary/20">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    1
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">Supabase Setup</span>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${supabaseStatus.configured ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'}`}>
                        {supabaseStatus.configured ? '✓ Ready' : '⏳ Pending'}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">Configure your Supabase project URL and keys</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="relative rounded-xl border border-border/60 bg-background/50 p-4 transition-all hover:border-primary/20">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    2
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">Gemini API Setup</span>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${keyStatus.configured ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'}`}>
                        {keyStatus.configured ? '✓ Ready' : '⏳ Pending'}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">Add your Google Gemini API key</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="relative rounded-xl border border-border/60 bg-background/50 p-4 transition-all hover:border-primary/20">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    3
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">Database Migration</span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                        Manual
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">Run the migration checklist</p>
                  </div>
                </div>
              </div>
            </div>
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
                onChange={(event) => setNewUserForm((current) => ({ ...current, name: event.target.value }))} 
                placeholder="Salon name" 
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <input 
                type="email" 
                value={newUserForm.email} 
                onChange={(event) => setNewUserForm((current) => ({ ...current, email: event.target.value }))} 
                placeholder="Email address" 
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <input 
                type="password" 
                value={newUserForm.password} 
                onChange={(event) => setNewUserForm((current) => ({ ...current, password: event.target.value }))} 
                placeholder="Temporary password" 
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <select 
                value={newUserForm.role} 
                onChange={(event) => setNewUserForm((current) => ({ ...current, role: event.target.value }))} 
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
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
                onChange={(event) => setNewProjectName(event.target.value)} 
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
              <span className={`h-1.5 w-1.5 rounded-full ${keyStatus.configured ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              <span className="text-muted-foreground">
                {keyStatus.configured ? `Connected` : 'Not configured'}
              </span>
              {keyStatus.configured && keyStatus.tokenLimit && (
                <span className="text-muted-foreground">• {keyStatus.tokenLimit.toLocaleString()} token limit</span>
              )}
            </div>

            <form className="mt-4 space-y-3" onSubmit={handleGeminiSave}>
              <input
                type="password"
                autoComplete="off"
                value={geminiInput}
                onChange={(event) => setGeminiInput(event.target.value)}
                placeholder="Paste Gemini API key"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <input
                type="number"
                min="1"
                inputMode="numeric"
                value={geminiTokenLimitInput}
                onChange={(event) => setGeminiTokenLimitInput(event.target.value)}
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
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Project URL</label>
                <input
                  name="supabaseUrl"
                  value={supabaseForm.supabaseUrl}
                  onChange={(event) => setSupabaseForm((current) => ({ ...current, supabaseUrl: event.target.value }))}
                  className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="https://xyz.supabase.co"
                />
              </div>
              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Publishable Key</label>
                <input
                  name="supabasePublishableKey"
                  value={supabaseForm.supabasePublishableKey}
                  onChange={(event) => setSupabaseForm((current) => ({ ...current, supabasePublishableKey: event.target.value }))}
                  className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="sb_publishable_..."
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Secret Key</label>
                <input
                  name="supabaseSecretKey"
                  value={supabaseForm.supabaseSecretKey}
                  onChange={(event) => setSupabaseForm((current) => ({ ...current, supabaseSecretKey: event.target.value }))}
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
              <p className="text-sm text-muted-foreground">Record that you&apos;ve reviewed the migration checklist</p>
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

        {/* Feedback */}
        {feedback && (
          <div className="rounded-xl border border-border/60 bg-background/80 backdrop-blur-sm px-4 py-3 text-sm text-foreground shadow-sm">
            <div className="flex items-start gap-2">
              <span className="text-primary">•</span>
              <span>{feedback}</span>
            </div>
          </div>
        )}

        {/* Users Table */}
        <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
          <div className="border-b border-border/60 bg-muted/30 px-4 py-4 md:px-6 md:py-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">Registered Users</h3>
              <span className="text-xs text-muted-foreground">{signups.length} account{signups.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-muted/20 text-muted-foreground">
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider">Email</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider">Role</th>
                  <th className="hidden md:table-cell px-4 py-3 text-xs font-medium uppercase tracking-wider">Token Usage</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {signups.map((user) => (
                  <tr key={user.id} className="hover:bg-muted/10 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">
                      <div className="truncate max-w-[120px] sm:max-w-none">
                        {user.email ?? '—'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded border border-border bg-muted/50 px-2 py-0.5 font-mono text-[10px] font-bold text-muted-foreground uppercase">
                        {user.role ?? 'user'}
                      </span>
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-muted-foreground">
                      {(() => {
                        const usageText = `${user.estimatedTokens.toLocaleString()} tok`;
                        if (keyStatus.tokenLimit) {
                          const percent = Math.min(100, Math.round((user.estimatedTokens / keyStatus.tokenLimit) * 100));
                          return (
                            <div className="flex items-center gap-2">
                              <span className="text-xs">{usageText}</span>
                              <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                                <div 
                                  className="h-full rounded-full bg-primary transition-all duration-300"
                                  style={{ width: `${Math.min(percent, 100)}%` }}
                                />
                              </div>
                              <span className="text-[10px] text-muted-foreground">{percent}%</span>
                            </div>
                          );
                        }
                        return <span className="text-xs">{usageText}</span>;
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${user.isSuspended ? 'bg-amber-500/10 text-amber-600' : 'bg-emerald-500/10 text-emerald-600'}`}>
                        <span className={`h-1 w-1 rounded-full ${user.isSuspended ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                        {user.isSuspended ? 'Paused' : 'Active'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={user.role ?? 'user'}
                          onChange={(event) => handleRoleChange(user.id, event.target.value)}
                          className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-medium focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={changingRoleUserId === user.id || adminEmails.includes(user.email?.toLowerCase() ?? '')}
                        >
                          <option value="user">User</option>
                          <option value="admin">Admin</option>
                        </select>
                        <button
                          className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted/30 disabled:opacity-50 disabled:cursor-not-allowed"
                          onClick={() => handleToggleAccess(user.id, user.isSuspended)}
                          disabled={changingUserId === user.id || adminEmails.includes(user.email?.toLowerCase() ?? '')}
                        >
                          {changingUserId === user.id ? '…' : user.isSuspended ? 'Restore' : 'Pause'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {signups.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      No users registered yet.
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
              <span className="text-xs text-muted-foreground">{projects.length} project{projects.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-muted/20 text-muted-foreground">
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider">Project</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider">Owner</th>
                  <th className="hidden md:table-cell px-4 py-3 text-xs font-medium uppercase tracking-wider">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {projects.map((project) => (
                  <tr key={project.id} className="hover:bg-muted/10 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">
                      <div className="truncate max-w-[120px] sm:max-w-none">
                        {project.name}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={project.owner_id ?? ''}
                        onChange={(event) => handleAssignProjectOwner(project.id, event.target.value || null)}
                        className="max-w-[150px] rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-medium focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
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
                        year: 'numeric'
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