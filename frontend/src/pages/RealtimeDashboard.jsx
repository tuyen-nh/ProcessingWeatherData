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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold text-white">{data.city_name}</h3>
          <p className="text-xs text-slate-400">Last update: {fmtTime(data.timestamp)} · Speed Layer (Spark Streaming)</p>
        </div>
        <AnomalyBadge anomaly={data.is_anomaly} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-6 flex items-center justify-center">
          <AqiGauge value={data.aqi_value} />
        </div>
        <div className="md:col-span-2 grid grid-cols-2 gap-4">
          <MetricCard label="Temperature" value={fmt(data.temp)} unit="°C" icon="🌡️" accent="#fb923c" />
          <MetricCard label="Humidity" value={fmt(data.humidity, 0)} unit="%" icon="💧" accent="#38bdf8" />
          <MetricCard label="PM2.5" value={fmt(data.pm2_5)} unit="µg/m³" icon="🫁" accent="#a78bfa" />
          <MetricCard label="AQI Category" value={data.aqi_category} icon="🏷️" accent="#facc15" />
        </div>
      </div>
    </div>
  )
}
