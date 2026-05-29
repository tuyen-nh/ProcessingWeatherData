import { fmt } from '../utils/aqi.js'

// Shows current value, historical baseline, and signed deviation with arrow.
export default function DeviationStat({ label, current, baseline, deviation, unit, higherIsWorse = true }) {
  const up = deviation > 0
  const bad = higherIsWorse ? up : !up
  const color = deviation === 0 ? '#94a3b8' : bad ? '#f87171' : '#34d399'
  const arrow = deviation === 0 ? '→' : up ? '▲' : '▼'
  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5">
      <div className="text-xs uppercase tracking-wide text-slate-400 mb-3">{label}</div>
      <div className="flex items-end justify-between">
        <div>
          <div className="text-3xl font-bold text-white">
            {fmt(current)}
            <span className="text-sm text-slate-400 ml-1">{unit}</span>
          </div>
          <div className="text-xs text-slate-500 mt-1">
            baseline {fmt(baseline)} {unit}
          </div>
        </div>
        <div className="text-right" style={{ color }}>
          <div className="text-xl font-semibold">
            {arrow} {fmt(Math.abs(deviation))}
          </div>
          <div className="text-[10px] uppercase tracking-wide">vs history</div>
        </div>
      </div>
    </div>
  )
}
