"use client"

import React from "react"
import { Calendar, Upload, Download, Menu } from "lucide-react"

import { useUI } from "./UIContext"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { cn } from "@/lib/utils"

type TopbarProps = {
  title?: string
  onMenuClick?: () => void
}

export default function Topbar({
  title = "Dashboard",
  onMenuClick,
}: TopbarProps) {
  const { toggleAI, setImportOpen, aiOpen } = useUI()

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
            Jan 01 — May 31, 2025
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

          {/* Export */}
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                buttonVariants({ variant: "outline" }),
                "hidden sm:flex gap-2"
              )}
            >
              <Download className="h-4 w-4" />
              Export Report
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExport("pdf")}>
                Download as PDF
              </DropdownMenuItem>

              <DropdownMenuItem onClick={() => handleExport("excel")}>
                Download as Excel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

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

async function handleExport(type: "pdf" | "excel") {
  const filename = `VERDE_Report_${new Date().toISOString().slice(0, 10)}`
  const ext = type === "pdf" ? "pdf" : "xlsx"
  const location = window.location.pathname || "/"
  const title = document.title || "VERDE Dashboard"

  try {
    const response = await fetch(`/api/export/report?format=${type}&path=${encodeURIComponent(location)}&title=${encodeURIComponent(title)}`)
    if (!response.ok) {
      throw new Error('Report export failed')
    }

    const blob = await response.blob()
    downloadBlob(blob, `${filename}.${ext}`)
  } catch {
    console.error('Export failed')
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}