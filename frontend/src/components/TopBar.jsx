import { useCity } from '../context/CityContext.jsx'
import { CITIES } from '../data/cities.js'
import ThemeToggle from './ThemeToggle.jsx'

export default function TopBar({ title, index }) {
  const { cityId, setCityId } = useCity()
  return (
    <header className="flex items-end justify-between gap-6 px-10 pt-10 pb-6 border-b border-line">
      <div>
        {index && <div className="label mb-2">Station — {index}</div>}
        <h2 className="display text-4xl font-semibold tracking-tight text-ink">{title}</h2>
      </div>

      <div className="flex items-end gap-5">
      <label className="flex flex-col items-end gap-1.5">
        <span className="label">Active City</span>
        <div className="relative">
          <select
            value={cityId}
            onChange={(e) => setCityId(Number(e.target.value))}
            className="appearance-none bg-transparent border border-line hover:border-linehi rounded-sm pl-4 pr-9 py-2 mono text-sm text-ink focus:outline-none focus:border-amber transition-colors cursor-pointer"
          >
            {CITIES.map((c) => (
              <option key={c.city_id} value={c.city_id} className="bg-bgsoft text-ink">
                {c.city_name} · {c.region}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-amber text-xs">
            ▾
          </span>
        </div>
      </label>
      <ThemeToggle />
      </div>
    </header>
  )
}
