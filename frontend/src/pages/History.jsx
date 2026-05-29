import { useState } from 'react'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
} from 'recharts'
import { useCity } from '../context/CityContext.jsx'
import { getHistory } from '../api/client.js'
import { useFetch } from '../hooks/useFetch.js'
import { aqiColor } from '../utils/aqi.js'
import { Loader, ErrorBox, Empty } from '../components/Loader.jsx'

const iso = (d) => d.toISOString().slice(0, 10)
const DEFAULT_START = iso(new Date(Date.now() - 13 * 864e5))
const DEFAULT_END = iso(new Date())

const tooltipStyle = {
  background: '#0f172a',
  border: '1px solid #334155',
  borderRadius: 8,
  color: '#e2e8f0',
}

export default function History() {
  const { cityId } = useCity()
  const [start, setStart] = useState(DEFAULT_START)
  const [end, setEnd] = useState(DEFAULT_END)
  const { data, loading, error } = useFetch(
    () => getHistory(cityId, start, end),
    [cityId, start, end],
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4 bg-slate-800/40 border border-slate-700 rounded-xl p-4">
        <label className="text-sm text-slate-300 flex flex-col gap-1">
          Start date
          <input
            type="date" value={start} max={end}
            onChange={(e) => setStart(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white"
          />
        </label>
        <label className="text-sm text-slate-300 flex flex-col gap-1">
          End date
          <input
            type="date" value={end} min={start} max={DEFAULT_END}
            onChange={(e) => setEnd(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white"
          />
        </label>
        <span className="text-xs text-slate-500 ml-auto">Batch Layer · weather_historical</span>
      </div>

      {loading && <Loader label="Loading history…" />}
      {error && <ErrorBox error={error} />}
      {!loading && !error && (!data || data.length === 0) && <Empty />}

      {!loading && !error && data && data.length > 0 && (
        <>
          <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-200 mb-4">Temperature (°C) — avg / max / min</h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                <Line type="monotone" dataKey="max_temp" name="Max" stroke="#f87171" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="avg_temp" name="Avg" stroke="#fbbf24" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="min_temp" name="Min" stroke="#60a5fa" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-200 mb-4">Average AQI</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" stroke="#64748b" fontSize={11} />
                  <YAxis stroke="#64748b" fontSize={11} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="avg_aqi" name="Avg AQI">
                    {data.map((d) => (
                      <Cell key={d.date} fill={aqiColor(d.avg_aqi)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-200 mb-4">Peak AQI Hour (0–23)</h3>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" stroke="#64748b" fontSize={11} />
                  <YAxis domain={[0, 23]} stroke="#64748b" fontSize={11} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="stepAfter" dataKey="peak_aqi_hour" name="Peak hour" stroke="#34d399" dot={{ r: 2 }} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
