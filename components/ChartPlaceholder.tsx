export default function ChartPlaceholder({ label = 'Chart' }: { label?: string }) {
  return (
    <div className="h-56 rounded border bg-zinc-50 flex items-center justify-center text-zinc-500">
      {label} placeholder
    </div>
  )
}
