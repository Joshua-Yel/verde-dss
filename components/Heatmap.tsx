import React from 'react'

export default function Heatmap({
  grid,
  rowLabels,
  colLabels,
  valueFormatter = (v: number) => String(Math.round(v)),
}: {
  grid: number[][]
  rowLabels?: string[]
  colLabels?: string[]
  valueFormatter?: (v: number) => string
}) {
  const flat = grid.flat().filter((v) => Number.isFinite(v))
  const max = Math.max(...flat, 1)
  const min = Math.min(...flat, 0)
  const range = Math.max(1, max - min)

  // Diverging scale: cool (low) → warm (high). Text stays readable.
// VERDE heatmap: light sage → brand accent → deep forest
function colorFor(v: number) {
  const t = Math.max(0, Math.min(1, (v - min) / range))

  // Light: #E8EFE8
  // Mid:   #6B7E6B
  // High:  #4A5F4A

  if (t < 0.5) {
    const p = t * 2

    const r = Math.round(232 - p * (232 - 107))
    const g = Math.round(239 - p * (239 - 126))
    const b = Math.round(232 - p * (232 - 107))

    return `rgb(${r}, ${g}, ${b})`
  }

  const p = (t - 0.5) * 2

  const r = Math.round(107 - p * (107 - 74))
  const g = Math.round(126 - p * (126 - 95))
  const b = Math.round(107 - p * (107 - 74))

  return `rgb(${r}, ${g}, ${b})`
}

function textColor(v: number) {
  const t = (v - min) / range
  return t > 0.6 ? "#F8F7F4" : "#1F1F1F"
}

  const cols = grid[0]?.length ?? 0
  const hasRowLabels = Array.isArray(rowLabels) && rowLabels.length === grid.length

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          <div
            className="grid gap-px bg-border/40 rounded-lg overflow-hidden"
            style={{
              gridTemplateColumns: `${hasRowLabels ? 'minmax(4.5rem,auto) ' : ''}repeat(${cols}, minmax(3.25rem, 1fr))`,
            }}
          >
            {/* Header row */}
            {hasRowLabels && <div className="bg-muted/40" />}
            {Array.from({ length: cols }).map((_, ci) => (
              <div
                key={`col-${ci}`}
                className="bg-muted/40 px-1 py-2 text-[10px] font-semibold text-center text-muted-foreground tracking-wide"
              >
                {colLabels?.[ci] ?? ''}
              </div>
            ))}

            {/* Data rows */}
            {grid.map((row, ri) => (
              <React.Fragment key={`r-${ri}`}>
                {hasRowLabels && (
                  <div className="bg-muted/20 px-2 py-1.5 text-[11px] font-medium flex items-center text-foreground/90">
                    {rowLabels?.[ri]}
                  </div>
                )}
                {row.map((v, ci) => {
                  const isForecastCol =
                    (colLabels?.[ci] ?? '').toLowerCase().includes('forecast') ||
                    (colLabels?.[ci] ?? '').toLowerCase().includes('ahead')
                  return (
                    <div
                      key={`cell-${ri}-${ci}`}
                      title={`${rowLabels?.[ri] ?? ''} · ${colLabels?.[ci] ?? ''}: ${valueFormatter(v)}`}
                      className={`
                        relative flex items-center justify-center py-2.5 px-1 text-[11px] font-semibold tabular-nums
                        ${isForecastCol ? 'ring-1 ring-inset ring-primary/30' : ''}
                      `}
                      style={{
                        background: colorFor(v),
                        color: textColor(v),
                      }}
                    >
                      {valueFormatter(v)}
                    </div>
                  )
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between gap-4 text-[10px] text-muted-foreground">
        <span>Low demand</span>
        <div
          className="flex-1 h-2 rounded-full"
          style={{
           background:
  'linear-gradient(to right, #E8EFE8, #6B7E6B, #4A5F4A)',
          }}
        />
        <span>High demand</span>
        <span className="ml-2 font-mono">
          {Math.round(min)} – {Math.round(max)}
        </span>
      </div>
    </div>
  )
}