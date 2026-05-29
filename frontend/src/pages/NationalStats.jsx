import { getStats } from '../api/client.js'
import { useFetch } from '../hooks/useFetch.js'
import { fmt, aqiCategory } from '../utils/aqi.js'
import MetricCard from '../components/MetricCard.jsx'
import RankTable from '../components/RankTable.jsx'
import { Loader, ErrorBox } from '../components/Loader.jsx'

export default function NationalStats() {
  const { data, loading, error } = useFetch(() => getStats(), [])

  if (loading) return <Loader label="Aggregating national stats…" />
  if (error) return <ErrorBox error={error} />

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <MetricCard label="National Avg Temp" value={fmt(data.national_avg_temp)} unit="°C" icon="🌡️" accent="#fb923c" />
        <MetricCard
          label="National Avg AQI"
          value={data.national_avg_aqi}
          unit={aqiCategory(data.national_avg_aqi)}
          icon="🌫️"
          accent="#a78bfa"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RankTable title="🔥 Top Hottest Cities" rows={data.top_hottest_cities} metric="temp" unit="°C" />
        <RankTable title="🏭 Top Polluted Cities" rows={data.top_polluted_cities} metric="aqi" unit="AQI" />
      </div>

      <p className="text-xs text-slate-500">Batch Layer aggregation over weather_historical · all 34 provinces.</p>
    </div>
  )
}
