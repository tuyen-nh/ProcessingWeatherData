import { aqiColor } from '../utils/aqi.js'

// Ranked list for national stats. metric = 'temp' | 'aqi'.
export default function RankTable({ title, rows, metric, unit, delay = 0 }) {
  const maxVal = Math.max(...rows.map((r) => r[metric]))
  return (
    <div className="panel p-6 fade-up" style={{ animationDelay: `${delay}ms` }}>
      <h3 className="label mb-5">{title}</h3>
      <ol className="space-y-3.5">
        {rows.map((r, i) => {
          const val = r[metric]
          const color = metric === 'aqi' ? aqiColor(val) : '#e8a04b'
          return (
            <li key={r.city_id} className="group">
              <div className="flex items-center gap-3">
                <span className="mono text-[10px] text-faint w-4">{String(i + 1).padStart(2, '0')}</span>
                <span className="display text-base text-ink flex-1 tracking-tight">{r.city_name}</span>
                <span className="mono text-sm font-medium" style={{ color }}>
                  {val}
                  <span className="text-faint text-[10px] ml-1">{unit}</span>
                </span>
              </div>
              <div className="mt-1.5 ml-7 h-px bg-line relative">
                <div
                  className="absolute inset-y-0 left-0 h-px"
                  style={{ width: `${(val / maxVal) * 100}%`, background: color, boxShadow: `0 0 6px ${color}88` }}
                />
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
