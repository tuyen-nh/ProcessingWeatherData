import { useCity } from '../context/CityContext.jsx'
import { getRealtime } from '../api/client.js'
import { useFetch } from '../hooks/useFetch.js'
import { fmt, fmtTime } from '../utils/aqi.js'
import MetricCard from '../components/MetricCard.jsx'
import AqiGauge from '../components/AqiGauge.jsx'
import AnomalyBadge from '../components/AnomalyBadge.jsx'
import { Loader, ErrorBox } from '../components/Loader.jsx'

export default function RealtimeDashboard() {
  const { cityId } = useCity()
  const { data, loading, error } = useFetch(() => getRealtime(cityId), [cityId])

  if (loading) return <Loader label="Fetching realtime metrics…" />
  if (error) return <ErrorBox error={error} />

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between fade-up">
        <div>
          <h3 className="display text-5xl font-semibold tracking-tight text-ink">{data.city_name}</h3>
          <p className="label mt-2">Last reading · {fmtTime(data.timestamp)}</p>
        </div>
        <AnomalyBadge anomaly={data.is_anomaly} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 panel p-8 flex flex-col items-center justify-center fade-up" style={{ animationDelay: '60ms' }}>
          <div className="label mb-4">Air Quality Index</div>
          <AqiGauge value={data.aqi_value} />
        </div>

        <div className="lg:col-span-8 grid grid-cols-2 gap-6">
          <MetricCard label="Temperature" value={fmt(data.temp)} unit="°C" accent="var(--amber)" delay={120} />
          <MetricCard label="Humidity" value={fmt(data.humidity, 0)} unit="%" accent="var(--teal)" delay={180} />
          <MetricCard label="PM2.5" value={fmt(data.pm2_5)} unit="µg/m³" accent="#a78bfa" delay={240} />
          <MetricCard label="Category" value={data.aqi_category} accent="#e8a04b" delay={300} sub="EPA scale" />
        </div>
      </div>
    </div>
  )
}
