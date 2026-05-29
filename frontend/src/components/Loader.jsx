export function Loader({ label = 'Loading…' }) {
  return (
    <div className="flex flex-col items-center gap-4 py-24">
      <span className="h-6 w-6 border border-line border-t-amber rounded-full animate-spin" />
      <span className="label">{label}</span>
    </div>
  )
}

export function ErrorBox({ error }) {
  return (
    <div className="panel border-l-[3px] p-5 text-sm" style={{ borderLeftColor: '#e0644b' }}>
      <div className="label mb-1" style={{ color: '#e0644b' }}>
        Signal Lost
      </div>
      <span className="text-muted mono text-xs">{String(error)}</span>
    </div>
  )
}

export function Empty({ label = 'No data.' }) {
  return <div className="label text-center py-24">{label}</div>
}
