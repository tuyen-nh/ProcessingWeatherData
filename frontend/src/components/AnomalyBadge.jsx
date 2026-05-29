export default function AnomalyBadge({ anomaly }) {
  if (anomaly) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-500/20 text-red-300 border border-red-500/40">
        <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
        Anomaly detected
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
      <span className="w-2 h-2 rounded-full bg-emerald-400" />
      Normal
    </span>
  )
}
