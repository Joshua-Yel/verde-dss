"use client"

import { useMemo, useState } from "react"
import {
  CartesianGrid,
  Line,
  LineChart as RechartsLineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts"

import {
  ChartConfig,
  ChartContainer,
  ChartTooltipContent,
} from "@/components/ui/chart"

type Dataset = {
  label: string
  data: (number | null)[]
  borderColor?: string
  tension?: number
  borderDash?: number[]
}

interface Props {
  labels?: string[]
  datasets?: Dataset[]
  height?: number
}

const PALETTE = ["#2563eb", "#f59e0b", "#10b981", "#ef4444"]

export default function LineChart({
  labels = [],
  datasets = [],
  height = 300,
}: Props) {
  const [hiddenLines, setHiddenLines] = useState<Record<string, boolean>>({})

  const toggleLine = (label: string) => {
    setHiddenLines((prev) => ({ ...prev, [label]: !prev[label] }))
  }

  // 1. Generate standard chart configurations matching shadcn patterns
  const chartConfig = useMemo(() => {
    const config: ChartConfig = {}
    datasets.forEach((dataset, i) => {
      config[dataset.label] = {
        label: dataset.label,
        color: PALETTE[i % PALETTE.length],
      }
    })
    return config
  }, [datasets])

  // 2. Normalize dataset rows cleanly
  const chartData = useMemo(() => {
    const rowCount = labels.length

    return Array.from({ length: rowCount }, (_, index) => {
      const row: Record<string, number | null | string> = {
        label: labels[index],
      }
      datasets.forEach((dataset) => {
        const val = dataset.data[index]
        row[dataset.label] = typeof val === "number" && !isNaN(val) ? val : null
      })
      return row
    })
  }, [labels, datasets])

  return (
    <div 
      className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm" 
      style={{ height }}
    >
      {/* Dynamic Accessible Legend */}
      <div className="flex flex-wrap gap-2">
        {datasets.map((d) => {
          const isHidden = hiddenLines[d.label]
          const configColor = chartConfig[d.label]?.color

          return (
            <button
              key={d.label}
              type="button"
              role="checkbox"
              aria-checked={!isHidden}
              onClick={() => toggleLine(d.label)}
              className={`
                flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-medium 
                transition-all select-none hover:bg-muted/80
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                ${isHidden ? "opacity-40 border-dashed bg-muted/30" : "bg-background shadow-sm"}
              `}
            >
              <span
                className="h-2 w-2 rounded-full shrink-0 transition-transform"
                style={{ backgroundColor: configColor }}
              />
              <span className={isHidden ? "line-through text-muted-foreground" : "text-foreground"}>
                {d.label}
              </span>
            </button>
          )
        })}
      </div>

      {/* Main Chart Area */}
      <div className="w-full flex-1 min-h-0">
        <ChartContainer config={chartConfig} className="h-full w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RechartsLineChart 
              data={chartData} 
              margin={{ top: 5, right: 5, left: -20, bottom: 0 }}
            >
              <CartesianGrid 
                vertical={false} 
                strokeDasharray="4 4" 
                className="stroke-muted/60" 
              />

              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={12}
                className="text-xs fill-muted-foreground"
              />

              <YAxis 
                tickLine={false} 
                axisLine={false} 
                tickMargin={8}
                className="text-xs fill-muted-foreground"
              />

              <Tooltip 
                cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
                content={<ChartTooltipContent />} 
              />

              {datasets.map((dataset) => {
                if (hiddenLines[dataset.label]) return null

                return (
                  <Line
                    key={dataset.label}
                    type="monotone"
                    dataKey={dataset.label}
                    stroke={chartConfig[dataset.label]?.color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ 
                      r: 4, 
                      className: "stroke-background stroke-2" 
                    }}
                    connectNulls={false}
                  />
                )
              })}
            </RechartsLineChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>
    </div>
  )
}