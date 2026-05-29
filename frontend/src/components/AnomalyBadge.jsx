export default function AnomalyBadge({ anomaly }) {
  const color = anomaly ? '#e0644b' : '#79c7b8'
  return (
    <span
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-sm mono text-[10px] tracking-widest uppercase border"
      style={{ borderColor: `${color}55`, color, background: `${color}12` }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: color, animation: anomaly ? 'pulseDot 1.4s infinite' : 'none' }}
      />
      {anomaly ? 'Anomaly Detected' : 'Nominal'}
    </span>
  )
}
