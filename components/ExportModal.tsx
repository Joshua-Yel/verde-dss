"use client"

import { useState } from "react"
import {
  X,
  FileText,
  FileSpreadsheet,
  LayoutDashboard,
  TrendingUp,
  Package,
  PhilippinePeso,
  Users,
  Download,
  Loader2,
} from "lucide-react"
import { Button } from "./ui/button"
import { cn } from "@/lib/utils"

// Keep these ids in sync with the `ExportSection` union in
// app/api/export/report/route.ts
export type ExportSectionId =
  | "overview"
  | "service-demand"
  | "inventory"
  | "financials"
  | "staffing"

type SectionOption = {
  id: ExportSectionId
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const SECTIONS: SectionOption[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "service-demand", label: "Service Demand", icon: TrendingUp },
  { id: "inventory", label: "Inventory", icon: Package },
  { id: "financials", label: "Financials", icon: PhilippinePeso },
  { id: "staffing", label: "Staffing", icon: Users },
]

type ExportModalProps = {
  open: boolean
  onClose: () => void
}

export default function ExportModal({ open, onClose }: ExportModalProps) {
  const [selected, setSelected] = useState<ExportSectionId[]>(
    SECTIONS.map((s) => s.id)
  )
  const [format, setFormat] = useState<"pdf" | "excel">("pdf")
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const toggleSection = (id: ExportSectionId) => {
    setError(null)
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    )
  }

  const allSelected = selected.length === SECTIONS.length
  const toggleAll = () => {
    setError(null)
    setSelected(allSelected ? [] : SECTIONS.map((s) => s.id))
  }

  const handleClose = () => {
    if (isExporting) return
    setError(null)
    onClose()
  }

  const handleExport = async () => {
    if (selected.length === 0) {
      setError("Select at least one section to export.")
      return
    }
    setIsExporting(true)
    setError(null)

    const filename = `VERDE_Report_${new Date().toISOString().slice(0, 10)}`
    const ext = format === "pdf" ? "pdf" : "xlsx"
    const title = document.title || "VERDE Dashboard"
    const location = window.location.pathname || "/"

    try {
      const params = new URLSearchParams({
        format,
        sections: selected.join(","),
        path: location,
        title,
      })
      const response = await fetch(`/api/export/report?${params.toString()}`)
      if (!response.ok) throw new Error("Report export failed")

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${filename}.${ext}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      onClose()
    } catch {
      setError("Export failed. Please try again.")
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
      <div className="fixed inset-0 bg-black/60" onClick={handleClose} />

      <div className="relative w-full max-w-md rounded-2xl border bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold">Export Report</h2>
          <Button variant="ghost" size="icon" onClick={handleClose} disabled={isExporting}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-sm text-muted-foreground mb-5">
          Choose which sections to include in your export.
        </p>

        {/* Section checklist */}
        <div className="mb-5">
          <button
            type="button"
            onClick={toggleAll}
            className="text-xs font-medium text-primary hover:underline mb-2"
          >
            {allSelected ? "Deselect all" : "Select all"}
          </button>
          <div className="space-y-1">
            {SECTIONS.map(({ id, label, icon: Icon }) => {
              const checked = selected.includes(id)
              return (
                <label
                  key={id}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 cursor-pointer border transition-colors",
                    checked
                      ? "border-primary/40 bg-primary/5"
                      : "border-transparent hover:bg-muted"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSection(id)}
                    className="h-4 w-4 rounded accent-[#4A5F4A]"
                  />
                  <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium">{label}</span>
                </label>
              )
            })}
          </div>
        </div>

        {/* Format selector */}
        <div className="mb-5">
          <div className="text-xs uppercase text-muted-foreground tracking-widest mb-2">
            Format
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setFormat("pdf")}
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium transition-colors",
                format === "pdf"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted"
              )}
            >
              <FileText className="h-4 w-4" /> PDF
            </button>
            <button
              type="button"
              onClick={() => setFormat("excel")}
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium transition-colors",
                format === "excel"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted"
              )}
            >
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </button>
          </div>
        </div>

        {error && <p className="text-xs text-destructive mb-3">{error}</p>}

        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleClose}
            disabled={isExporting}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 gap-2 bg-[#4A5F4A] text-white hover:bg-[#3F5240]"
            onClick={handleExport}
            disabled={isExporting}
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {isExporting ? "Exporting…" : "Export"}
          </Button>
        </div>
      </div>
    </div>
  )
}