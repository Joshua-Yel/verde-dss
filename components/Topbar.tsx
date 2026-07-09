"use client"

import React from "react"
import { Calendar, Upload, Download, LogOut } from "lucide-react"
import { supabase } from "@/src/lib/supabaseClient"
import { useRouter } from "next/navigation"

import { useUI } from "./UIContext"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { cn } from "@/lib/utils"

export default function Topbar({
  title = "Dashboard",
}: {
  title?: string
}) {
  const { toggleAI, setImportOpen, aiOpen } = useUI()
  const router = useRouter();


  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background">
      <div className="mx-auto flex max-w-screen-1xl items-center justify-between px-8 py-4">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>

        <div className="flex items-center gap-3">
          {/* Date */}
          <div className="flex items-center gap-2 rounded-full border bg-card px-5 py-2.5 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            Jan 01 — May 31, 2025
          </div>

          {/* Import */}
          <Button
            variant="outline"
            className="gap-2"
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
                "gap-2"
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
            className="gap-2 bg-[#4A5F4A] font-medium text-white hover:bg-[#3F5240]"
          >
            {aiOpen ? "Close ARIA" : "Open ARIA"}
          </Button>

          {/* Sign Out */}
          {/* <Button
            variant="outline"
            className="gap-2"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button> */}
        </div>
      </div>
    </header>
  )
}

function handleExport(type: "pdf" | "excel") {
  const filename = `VERDE_Report_${new Date().toISOString().slice(0, 10)}`
  const ext = type === "pdf" ? "pdf" : "xlsx"

  const blob = new Blob([`Mock ${type.toUpperCase()} export from VERDE`], {
    type:
      type === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })

  const url = URL.createObjectURL(blob)

  const a = document.createElement("a")
  a.href = url
  a.download = `${filename}.${ext}`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)

  URL.revokeObjectURL(url)
}