import { aqiBand } from '../utils/aqi.js'

// Semi-circular AQI gauge. value 0..300+ → arc fill + band color.
export default function AqiGauge({ value }) {
  const band = aqiBand(value)
  const max = 300
  const pct = Math.min(1, value / max)
  const radius = 80
  const circ = Math.PI * radius // half circle length
  const dash = circ * pct

  return (
    <div className="flex flex-col items-center">
      <svg width="200" height="120" viewBox="0 0 200 120">
        <path
          d="M 20 110 A 80 80 0 0 1 180 110"
          fill="none"
          stroke="#334155"
          strokeWidth="16"
          strokeLinecap="round"
        />
        <path
          d="M 20 110 A 80 80 0 0 1 180 110"
          fill="none"
          stroke={band.color}
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
        />
        <text x="100" y="95" textAnchor="middle" className="fill-white" fontSize="34" fontWeight="700">
          {value}
        </text>
        <text x="100" y="112" textAnchor="middle" fill="#94a3b8" fontSize="11">
          AQI
        </text>
      </svg>
      <span
        className="px-3 py-1 rounded-full text-xs font-semibold -mt-2"
        style={{ background: band.color, color: band.text }}
      >
        {band.category}
      </span>
    </div>
  )
}
