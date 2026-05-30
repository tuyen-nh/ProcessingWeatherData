import { fmt } from '../utils/aqi.js'

// Current value, historical baseline, signed deviation with arrow + sparkbar.
export default function DeviationStat({ label, current, baseline, deviation, unit, higherIsWorse = true, delay = 0 }) {
  const up = deviation > 0
  const bad = higherIsWorse ? up : !up
  const color = deviation === 0 ? '#a8a094' : bad ? '#e0644b' : '#79c7b8'
  const arrow = deviation === 0 ? '→' : up ? '↑' : '↓'
  const ratio = baseline ? Math.min(1.5, current / baseline) : 1

  return (
    <div className="panel p-7 fade-up" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center justify-between">
        <div className="label">{label}</div>
        <div className="mono text-sm font-medium flex items-center gap-1" style={{ color }}>
          <span className="text-base">{arrow}</span>
          {fmt(Math.abs(deviation))}
        </div>
      </div>

      <div className="mt-5 flex items-baseline gap-2">
        <span className="mono text-5xl font-medium text-ink leading-none">{fmt(current)}</span>
        <span className="mono text-xs text-muted">{unit}</span>
      </div>

      {/* baseline track */}
      <div className="mt-6">
        <div className="relative h-px bg-line">
          <div className="absolute inset-y-[-3px] left-1/2 w-px bg-faint" title="baseline" />
          <div
            className="absolute -top-[3px] h-[7px] rounded-full"
            style={{ left: 0, width: `${(ratio / 1.5) * 100}%`, background: color }}
          />
        </div>
        <div className="mt-2 flex justify-between label">
          <span>now</span>
          <span>baseline {fmt(baseline)}</span>
        </div>
      </div>
    </div>
  )
}
