"use client"

import { useEffect, useMemo, useRef } from "react"
import type { Chart as ChartJS, TooltipItem } from "chart.js"

type RevenuePieChartProps = {
  data: number[]
  labels: string[]
  height?: number
}

const PIE_COLORS = [
  "rgb(15 118 110)",
  "rgb(37 99 235)",
  "rgb(147 51 234)",
  "rgb(245 158 11)",
  "rgb(220 38 38)",
  "rgb(13 148 136)",
  "rgb(79 70 229)",
  "rgb(168 85 247)",
]

export default function RevenuePieChart({
  data,
  labels,
  height = 320,
}: RevenuePieChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const chartRef = useRef<ChartJS | null>(null)

  const serializedData = useMemo(() => data.join(","), [data])
  const serializedLabels = useMemo(() => labels.join(","), [labels])

  useEffect(() => {
    let mounted = true

    async function init() {
      if (!canvasRef.current || !mounted) return

      const Chart = (await import("chart.js/auto")).default
      const ctx = canvasRef.current.getContext("2d")

      if (!ctx) return

      if (chartRef.current) {
        chartRef.current.destroy()
      }

      chartRef.current = new Chart(ctx, {
        type: "doughnut",

        data: {
          labels,

          datasets: [
            {
              data,
              backgroundColor: data.map(
                (_, i) => PIE_COLORS[i % PIE_COLORS.length]
              ),
              borderColor: "transparent",
              borderWidth: 0,
              hoverOffset: 6,
            },
          ],
        },

        options: {
          responsive: true,
          maintainAspectRatio: false,

          cutout: "68%",

          layout: {
            padding: 10,
          },

          plugins: {
            legend: {
              position: "right",

              labels: {
                boxWidth: 10,
                boxHeight: 10,
                padding: 14,

                font: {
                  size: 10,
                },

                color: "hsl(var(--muted-foreground))",
              },
            },

            tooltip: {
              callbacks: {
                label: (context: TooltipItem<'doughnut'>) => {
                  const label = context.label ?? ''
                  const formattedValue = context.formattedValue ?? ''
                  return `${label}: ${formattedValue}`
                },
              },
            },
          },
        },
      })
    }

    init()

    return () => {
      mounted = false

      if (chartRef.current) {
        chartRef.current.destroy()
      }
    }
  }, [data, labels, serializedData, serializedLabels])

  return (
    <div
      style={{ height }}
      className="w-full"
    >
      <canvas ref={canvasRef} />
    </div>
  )
}