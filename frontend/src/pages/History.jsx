import { useState } from 'react'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
} from 'recharts'
import { useCity } from '../context/CityContext.jsx'
import { getHistory } from '../api/client.js'
import { useFetch } from '../hooks/useFetch.js'
import { aqiColor } from '../utils/aqi.js'
import { CHART, axisProps, tooltipStyle, tooltipLabelStyle } from '../utils/chart.js'
import { Loader, ErrorBox, Empty } from '../components/Loader.jsx'

const iso = (d) => d.toISOString().slice(0, 10)
const DEFAULT_START = iso(new Date(Date.now() - 13 * 864e5))
const DEFAULT_END = iso(new Date())

function Panel({ title, children, delay = 0 }) {
  return (
    <div className="panel p-6 fade-up" style={{ animationDelay: `${delay}ms` }}>
      <h3 className="label mb-5">{title}</h3>
      {children}
    </div>
  )
}

const legendStyle = { fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 10, color: 'var(--muted)' }

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
      <div className="panel p-5 flex flex-wrap items-end gap-6 fade-up">
        <label className="flex flex-col gap-1.5">
          <span className="label">Start</span>
          <input
            type="date" value={start} max={end}
            onChange={(e) => setStart(e.target.value)}
            className="bg-transparent border border-line hover:border-linehi focus:border-amber rounded-sm px-3 py-1.5 mono text-sm text-ink outline-none transition-colors"
          />
        </label>
        <span className="text-faint pb-2">→</span>
        <label className="flex flex-col gap-1.5">
          <span className="label">End</span>
          <input
            type="date" value={end} min={start} max={DEFAULT_END}
            onChange={(e) => setEnd(e.target.value)}
            className="bg-transparent border border-line hover:border-linehi focus:border-amber rounded-sm px-3 py-1.5 mono text-sm text-ink outline-none transition-colors"
          />
        </label>
        <span className="label ml-auto pb-2">weather_historical · batch</span>
      </div>

      {loading && <Loader label="Loading history…" />}
      {error && <ErrorBox error={error} />}
      {!loading && !error && (!data || data.length === 0) && <Empty />}

      {!loading && !error && data && data.length > 0 && (
        <>
          <Panel title="Temperature °C — max / avg / min" delay={60}>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={data} margin={{ top: 5, right: 16, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="2 4" stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="date" {...axisProps} />
                <YAxis {...axisProps} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} />
                <Legend wrapperStyle={legendStyle} iconType="plainline" />
                <Line type="monotone" dataKey="max_temp" name="max" stroke={CHART.red} dot={false} strokeWidth={1.5} />
                <Line type="monotone" dataKey="avg_temp" name="avg" stroke={CHART.amber} dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="min_temp" name="min" stroke={CHART.blue} dot={false} strokeWidth={1.5} />
              </LineChart>
            </ResponsiveContainer>
          </Panel>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Panel title="Average AQI" delay={120}>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data} margin={{ top: 5, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke={CHART.grid} vertical={false} />
                  <XAxis dataKey="date" {...axisProps} />
                  <YAxis {...axisProps} />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} cursor={{ fill: CHART.cursor }} />
                  <Bar dataKey="avg_aqi" name="avg aqi" radius={[1, 1, 0, 0]}>
                    {data.map((d) => (
                      <Cell key={d.date} fill={aqiColor(d.avg_aqi)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Panel>

            <Panel title="Peak AQI Hour (0–23)" delay={180}>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={data} margin={{ top: 5, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke={CHART.grid} vertical={false} />
                  <XAxis dataKey="date" {...axisProps} />
                  <YAxis domain={[0, 23]} {...axisProps} />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} />
                  <Line type="stepAfter" dataKey="peak_aqi_hour" name="peak hour" stroke={CHART.teal} dot={{ r: 1.5, fill: CHART.teal }} strokeWidth={1.5} />
                </LineChart>
              </ResponsiveContainer>
            </Panel>
          </div>
        </>
      )}
    </div>
  )
}
