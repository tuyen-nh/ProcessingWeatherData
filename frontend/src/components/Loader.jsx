export function Loader({ label = 'Loading…' }) {
  return (
    <div className="flex items-center gap-3 text-slate-400 py-12 justify-center">
      <span className="w-5 h-5 border-2 border-slate-600 border-t-cyan-400 rounded-full animate-spin" />
      {label}
    </div>
  )
}

export function ErrorBox({ error }) {
  return (
    <div className="bg-red-500/10 border border-red-500/40 text-red-300 rounded-xl p-4 text-sm">
      Failed to load: {String(error)}
    </div>
  )
}

export function Empty({ label = 'No data.' }) {
  return <div className="text-slate-500 text-sm py-12 text-center">{label}</div>
}
