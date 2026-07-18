"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from './ui/button'
import { supabase } from "@/src/lib/supabaseClient"
import { useRouter } from "next/navigation"
import { useAuth } from '@/app/auth-provider'
import {
  X,
  LogOut,
  LayoutDashboard,
  TrendingUp,
  Package,
  PhilippinePeso,
  Users,
  ShieldCheck,
  Download,
} from "lucide-react";
import { getConfiguredAdminEmails } from '@/src/lib/adminEmails';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

type SidebarProps = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

export default function Sidebar({ open, setOpen }: SidebarProps) {
  const pathname = usePathname()
  const { session } = useAuth()
  const user = session?.user
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  // PWA install
  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  }, [])

  const adminEmails = getConfiguredAdminEmails()
  const isAdmin = !!user?.email && adminEmails.includes(user.email.toLowerCase())

  const links = [
    { label: "Overview", href: "/", icon: LayoutDashboard },
    ...(!isAdmin ? [
      { label: "Service Demand", href: "/service-demand", icon: TrendingUp },
      { label: "Inventory", href: "/inventory", icon: Package },
      { label: "Financials", href: "/financials", icon: PhilippinePeso },
      { label: "Staffing", href: "/staffing", icon: Users },
    ] : []),
    ...(isAdmin ? [{ label: "Admin", href: "/admin", icon: ShieldCheck }] : []),
  ]

  const router = useRouter()
  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push("/login")
  }

  const handleInstallPwa = async () => {
    if (!deferredPrompt) {
      alert('Open browser menu → “Install app” / “Add to Home Screen”')
      return
    }
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setDeferredPrompt(null)
  }

  return (
    <>
      {/* Mobile Overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar Drawer */}
      <aside
        className={`
          fixed top-0 left-0 z-50 h-screen w-64 bg-card border-r shadow-xl
          transform transition-transform duration-300 md:static md:translate-x-0 md:shadow-none
          ${open ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Header */}
        <div className="p-6 border-b flex items-center justify-between">
          <div>
            <span className="text-3xl font-bold">VERDE</span>
            <p className="text-xs text-muted-foreground mt-1">AI-assisted Forecasting</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Navigation */}
        <div className="flex-1 px-3 py-6">
          <div className="text-xs uppercase text-muted-foreground px-3 mb-4 tracking-widest">MODULES</div>
          <nav className="flex flex-col gap-1">
            {links.map(({ label, href, icon: Icon }) => {
              const isActive = pathname === href || (href !== "/" && pathname?.startsWith(href))
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={`
                    flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium
                    ${isActive 
                      ? "bg-primary/10 text-primary font-semibold" 
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"}
                  `}
                >
                  <Icon className="h-4.5 w-4.5 shrink-0" />
                  <span>{label}</span>
                </Link>
              )
            })}
          </nav>
        </div>

        {/* User Section */}
        <div className="p-6 border-t mt-auto">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-semibold">
              {user?.email?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{user?.email}</div>
              <div className="text-xs text-muted-foreground">Owner</div>
            </div>
          </div>

          <Button variant="outline" className="w-full gap-2 mb-3 md:hidden" onClick={handleInstallPwa}>
            <Download className="h-4 w-4" /> Download PWA
          </Button>

          <Button variant="outline" className="w-full gap-2" onClick={handleSignOut}>
            <LogOut className="h-4 w-4" /> Sign Out
          </Button>
        </div>
      </aside>
    </>
  )
}