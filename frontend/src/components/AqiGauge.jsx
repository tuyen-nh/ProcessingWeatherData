import { aqiBand } from '../utils/aqi.js'

// Semi-circular AQI gauge with draw-in animation. value 0..300+ → arc fill + band color.
export default function AqiGauge({ value }) {
  const band = aqiBand(value)
  const max = 300
  const pct = Math.min(1, value / max)
  const radius = 82
  const circ = Math.PI * radius
  const dash = circ * pct

  return (
    <div className="flex flex-col items-center">
      <svg width="220" height="132" viewBox="0 0 220 132">
        {/* tick marks */}
        {Array.from({ length: 13 }).map((_, i) => {
          const a = Math.PI - (i / 12) * Math.PI
          const x1 = 110 + Math.cos(a) * 96
          const y1 = 116 - Math.sin(a) * 96
          const x2 = 110 + Math.cos(a) * 102
          const y2 = 116 - Math.sin(a) * 102
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--line-strong)" strokeWidth="1" />
        })}
        <path
          d="M 28 116 A 82 82 0 0 1 192 116"
          fill="none"
          stroke="var(--chart-grid)"
          strokeWidth="10"
          strokeLinecap="round"
        />
        <path
          d="M 28 116 A 82 82 0 0 1 192 116"
          fill="none"
          stroke={band.color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          style={{
            '--arc-len': `${dash}px`,
            strokeDashoffset: 0,
            animation: 'drawArc 1.1s cubic-bezier(0.22,1,0.36,1)',
            filter: `drop-shadow(0 0 6px ${band.color}66)`,
          }}
        />
        <text x="110" y="100" textAnchor="middle" className="mono" fill="var(--ink)" fontSize="40" fontWeight="500">
          {value}
        </text>
      </svg>
      <span
        className="px-3 py-1 rounded-sm mono text-[10px] tracking-widest uppercase -mt-1"
        style={{ background: band.color, color: band.text }}
      >
        {band.category}
      </span>
    </div>
  )
}
