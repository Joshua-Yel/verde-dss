"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Button } from './ui/button'
import { LogOut } from 'lucide-react'
import { supabase } from "@/src/lib/supabaseClient"
import { useRouter } from "next/navigation"
import { useAuth } from '@/app/auth-provider'


export default function Sidebar() {
  const pathname = usePathname()
  const { session } = useAuth()
  const user = session?.user



  const links = [
    { label: 'Overview', href: '/' },
    { label: 'Service Demand', href: '/service-demand' },
    { label: 'Inventory', href: '/inventory' },
    { label: 'Financials', href: '/financials' },
    { label: 'Staffing', href: '/staffing' },
  ]

  const router = useRouter();
    const handleSignOut = async () => {
      await supabase.auth.signOut();
      router.push("/login");
    };
  

  return (
    <aside className="w-64 min-h-screen border-r bg-card flex flex-col">
      {/* Logo / Header */}
      <div className="p-6 border-b">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold tracking-tight text-foreground">VERDE</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">Decision Support System</p>
      </div>

      {/* Modules */}
      <div className="flex-1 px-3 py-6">
        <div className="text-xs uppercase text-muted-foreground px-3 mb-4 tracking-widest">
          MODULES
        </div>
        
        <nav className="flex flex-col gap-1">
          {links.map(({ label, href }) => {
            const isActive = pathname === href || 
              (href !== '/' && pathname?.startsWith(href))
            
            return (
              <Link
                key={href}
                href={href}
                className={`
                  flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all
                  ${isActive 
                    ? 'bg-primary/10 text-primary font-semibold shadow-sm' 
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }
                `}
              >
                <div className={`w-1.5 h-6 rounded-full transition-colors ${isActive ? 'bg-primary' : 'bg-transparent'}`} />
                {label}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* User Section */}
      <div className="p-6 border-t mt-auto">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-semibold">
            {user?.email?.toUpperCase()?.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate">
              {user?.email}
            </div>
            <div className="text-xs text-muted-foreground">Owner</div>
          </div>
        </div>

         {/* Sign Out */}
        <Button
          variant="outline"
          className="gap-2"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </aside>
  )
}