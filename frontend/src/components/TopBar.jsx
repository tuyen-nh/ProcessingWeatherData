import { useCity } from '../context/CityContext.jsx'
import { CITIES } from '../data/cities.js'

export default function TopBar({ title }) {
  const { cityId, setCityId } = useCity()
  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/40 backdrop-blur sticky top-0 z-10">
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <label className="flex items-center gap-2 text-sm text-slate-300">
        <span>City</span>
        <select
          value={cityId}
          onChange={(e) => setCityId(Number(e.target.value))}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
        >
          {CITIES.map((c) => (
            <option key={c.city_id} value={c.city_id}>
              {c.city_name} ({c.region})
            </option>
          ))}
        </select>
      </label>
    </header>
  )
}
