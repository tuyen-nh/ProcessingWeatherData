import { aqiColor } from '../utils/aqi.js'

// Ranked list for national stats. metric = 'temp' | 'aqi'.
export default function RankTable({ title, rows, metric, unit }) {
  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-slate-200 mb-3">{title}</h3>
      <ol className="space-y-2">
        {rows.map((r, i) => {
          const val = r[metric]
          const color = metric === 'aqi' ? aqiColor(val) : '#fb923c'
          return (
            <li key={r.city_id} className="flex items-center gap-3">
              <span className="w-6 h-6 grid place-items-center rounded-full bg-slate-700 text-xs font-bold text-slate-300">
                {i + 1}
              </span>
              <span className="flex-1 text-sm text-slate-200">{r.city_name}</span>
              <span className="text-sm font-semibold" style={{ color }}>
                {val} {unit}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
