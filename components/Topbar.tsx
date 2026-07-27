"use client"

import React, { useEffect, useState } from "react"
import { Calendar, Upload, Menu } from "lucide-react"

import { useUI } from "./UIContext"
import { Button } from "@/components/ui/button"

type TopbarProps = {
  title?: string
  onMenuClick?: () => void
}

export default function Topbar({
  title = "Dashboard",
  onMenuClick,
}: TopbarProps) {
  const { toggleAI, setImportOpen, aiOpen } = useUI()
  const [dateRangeLabel, setDateRangeLabel] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    async function loadDateRange() {
      try {
        const response = await fetch('/api/dashboard/date-range', { cache: 'no-store' })
        if (!response.ok) return
        const payload = await response.json()
        if (isMounted) {
          setDateRangeLabel(payload?.rangeLabel ?? null)
        }
      } catch {
        if (isMounted) {
          setDateRangeLabel(null)
        }
      }
    }

    loadDateRange()

    return () => {
      isMounted = false
    }
  }, [])

  const rangeText = dateRangeLabel ?? 'No data'

  return (
    <header className="sticky top-0 z-30 w-full border-b bg-background">
      <div className="mx-auto flex h-16 items-center justify-between px-4 md:px-8">
        {/* Left */}
        <div className="flex items-center gap-3">
          {/* Mobile Hamburger */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={onMenuClick}
          >
            <Menu className="h-5 w-5" />
          </Button>

          <h1 className="text-xl md:text-2xl font-semibold tracking-tight">
            {title}
          </h1>
        </div>

        {/* Right */}
        <div className="flex items-center gap-2 md:gap-3">
          {/* Hide date on small screens */}
          <div className="hidden lg:flex items-center gap-2 rounded-full border bg-card px-5 py-2.5 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            {rangeText}
          </div>

          {/* Import */}
          <Button
            variant="outline"
            className="hidden sm:flex gap-2"
            onClick={() => setImportOpen(true)}
          >
            <Upload className="h-4 w-4" />
            Import Data
          </Button>

          {/* Export now lives in the Sidebar under REPORTS → Export */}

          {/* AI */}
          <Button
            onClick={toggleAI}
            className="bg-[#4A5F4A] text-white hover:bg-[#3F5240]"
          >
            {aiOpen ? "Close ARIA" : "Open ARIA"}
          </Button>
        </div>
      </div>
    </header>
  )
}