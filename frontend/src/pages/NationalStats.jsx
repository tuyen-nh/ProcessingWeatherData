import { getStats } from '../api/client.js'
import { useFetch } from '../hooks/useFetch.js'
import { fmt, aqiCategory } from '../utils/aqi.js'
import MetricCard from '../components/MetricCard.jsx'
import RankTable from '../components/RankTable.jsx'
import { Loader, ErrorBox } from '../components/Loader.jsx'

export default function NationalStats() {
  const { data, loading, error } = useFetch(() => getStats(), [])

  if (loading) return <Loader label="Aggregating national index…" />
  if (error) return <ErrorBox error={error} />

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <MetricCard label="National Avg Temp" value={fmt(data.national_avg_temp)} unit="°C" accent="var(--amber)" delay={0} sub="34 provinces" />
        <MetricCard
          label="National Avg AQI"
          value={data.national_avg_aqi}
          unit={aqiCategory(data.national_avg_aqi)}
          accent="#a78bfa"
          delay={60}
          sub="EPA scale"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RankTable title="Top Hottest" rows={data.top_hottest_cities} metric="temp" unit="°C" delay={120} />
        <RankTable title="Top Polluted" rows={data.top_polluted_cities} metric="aqi" unit="AQI" delay={180} />
      </div>

      <p className="label fade-up" style={{ animationDelay: '240ms' }}>
        Batch aggregation · weather_historical
      </p>
    </div>
  )
}
