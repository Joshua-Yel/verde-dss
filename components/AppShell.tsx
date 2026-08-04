"use client"

import { useEffect, useState } from "react";
import { usePathname, useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import Topbar from '@/components/Topbar'
import { UIProvider } from '@/components/UIContext'
import AIPanelWrapper from '@/components/AIPanelWrapper'
import ImportModal from '@/components/ImportModal'
import { useAuth } from '@/app/auth-provider'
import { canAccessModule, getUserRole } from '@/src/lib/roleAccess'

const authRoutes = ['/login', '/signup']

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { session, loading } = useAuth()
  const isAuthRoute = pathname ? authRoutes.includes(pathname) : false
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!pathname || isAuthRoute || !session) {
      return;
    }

    const role = getUserRole(session.user as { app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> } | null);
    const accessMap: Record<string, 'overview' | 'service-demand' | 'inventory' | 'financials' | 'staffing' | 'admin'> = {
      '/': 'overview',
      '/service-demand': 'service-demand',
      '/inventory': 'inventory',
      '/financials': 'financials',
      '/staffing': 'staffing',
      '/admin': 'admin',
    };

    const module = accessMap[pathname] ?? 'overview';
    if (!canAccessModule(role, module)) {
      router.replace('/');
    }
  }, [isAuthRoute, pathname, router, session]);

  if (isAuthRoute) {
    return <>{children}</>
  }

  // IMPORTANT: `loading` and `!session` are two different states.
  // `loading` means the auth check hasn't resolved yet — show a lightweight
  // shell (not a full-screen blocker) so it doesn't flash on every route
  // change. `!session` (once loading is false) means the user is genuinely
  // signed out — that's when we actually want to block and redirect.
  //
  // The previous `if (loading || !session)` treated both the same way,
  // which meant ANY transient moment where `session` was falsy (e.g. while
  // useAuth() re-checks on navigation) redrew the whole app as a bare
  // "Redirecting to sign-in…" screen, discarding the already-rendered
  // server content underneath it.
  if (loading) {
    return (
      <div className="flex h-screen overflow-hidden">
        <div className="w-16 shrink-0 bg-muted/30 animate-pulse" />
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="h-14 shrink-0 border-b border-border bg-muted/20 animate-pulse" />
          <main className="flex-1 overflow-auto p-8 bg-background" />
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Redirecting to sign-in…
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        open={sidebarOpen}
        setOpen={setSidebarOpen}
      />

      <UIProvider>
        <div className="flex-1 flex flex-col overflow-hidden">
          <Topbar
            onMenuClick={() => setSidebarOpen(true)}
          />

          <main className="flex-1 overflow-auto p-8 bg-background">
            <div className="max-w-screen-2xl mx-auto">
              {children}
            </div>
          </main>
        </div>

        <AIPanelWrapper />
        <ImportModal />
      </UIProvider>
    </div>
  )
}