export default function Heatmap({ grid }: { grid: number[][] }) {
  const max = Math.max(...grid.flat())
  const min = Math.min(...grid.flat())
  const range = Math.max(1, max - min)

  function colorFor(v: number) {
    const t = (v - min) / range
    const r = Math.round(255 - t * 60)
    const g = Math.round(230 - t * 90)
    const b = Math.round(220 - t * 60)
    return `rgb(${r},${g},${b})`
  }

  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${grid[0].length}, 1fr)` }}>
      {grid.flat().map((v, i) => (
        <div key={i} className="p-4 rounded text-center text-white font-semibold" style={{ background: colorFor(v) }}>
          {v}
        </div>
      ))}
    </div>
  )
}
