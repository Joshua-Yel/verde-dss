import './globals.css'
import { Inter } from "next/font/google"
import { cn } from "@/lib/utils"
import { AuthProvider } from './auth-provider'
import AppShell from '@/components/AppShell'

const siteMetadata = {
  title: 'VERDE | Decision Support System',
  description: 'AI-Assisted Demand Forecasting & Salon Operations',
  icons: {
    icon: '/logo.svg',
    shortcut: '/logo.svg',
    apple: '/logo.svg',
  },
}

const inter = Inter({ 
  subsets: ['latin'], 
  variable: '--font-sans' 
})

export const metadata = siteMetadata

export default function RootLayout({ 
  children 
}: { 
  children: React.ReactNode 
}) {
  return (
    <html lang="en" className={cn("font-sans", inter.variable)} data-scroll-behavior="smooth">
      <body className="bg-background text-foreground min-h-screen antialiased">
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  )
}