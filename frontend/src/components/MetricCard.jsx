export default function MetricCard({ label, value, unit, sub, accent = 'var(--amber)', delay = 0 }) {
  return (
    <div
      className="panel p-5 fade-up relative overflow-hidden"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div
        className="absolute left-0 top-0 h-full w-[3px]"
        style={{ background: accent, opacity: 0.7 }}
      />
      <div className="label">{label}</div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="mono text-4xl font-medium leading-none text-ink">{value}</span>
        {unit && <span className="mono text-xs text-muted">{unit}</span>}
      </div>
      {sub && <div className="mt-2 text-[11px] text-faint">{sub}</div>}
    </div>
  )
}
