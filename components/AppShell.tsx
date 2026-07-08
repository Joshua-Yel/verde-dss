"use client"

import { usePathname } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import Topbar from '@/components/Topbar'
import { UIProvider } from '@/components/UIContext'
import AIPanelWrapper from '@/components/AIPanelWrapper'
import ImportModal from '@/components/ImportModal'
import { useAuth } from '@/app/auth-provider'

const authRoutes = ['/login', '/signup']

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { session, loading } = useAuth()
  const isAuthRoute = pathname ? authRoutes.includes(pathname) : false

  if (isAuthRoute) {
    return <>{children}</>
  }

  if (loading || !session) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Redirecting to sign-in…
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />

      <UIProvider>
        <div className="flex-1 flex flex-col overflow-hidden">
          <Topbar />

          <main className="flex-1 overflow-auto p-8 bg-background">
            <div className="max-w-screen-1xl mx-auto">
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
