import { useCity } from '../context/CityContext.jsx'
import { getCompare } from '../api/client.js'
import { useFetch } from '../hooks/useFetch.js'
import DeviationStat from '../components/DeviationStat.jsx'
import { Loader, ErrorBox } from '../components/Loader.jsx'

export default function Compare() {
  const { cityId } = useCity()
  const { data, loading, error } = useFetch(() => getCompare(cityId), [cityId])

  if (loading) return <Loader label="Comparing layers…" />
  if (error) return <ErrorBox error={error} />

  return (
    <div className="space-y-8">
      <div className="fade-up">
        <h3 className="display text-4xl font-semibold tracking-tight text-ink">{data.city_name}</h3>
        <p className="text-sm text-muted mt-2 max-w-xl leading-relaxed">
          Live <span className="text-amber">Speed Layer</span> reading measured against the same-month{' '}
          <span className="text-teal">Batch Layer</span> historical baseline — the Lambda architecture's two views, side by side.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <DeviationStat
          label="Temperature"
          current={data.current_temp}
          baseline={data.historical_avg_temp}
          deviation={data.temp_deviation}
          unit="°C"
          higherIsWorse
          delay={60}
        />
        <DeviationStat
          label="Air Quality Index"
          current={data.current_aqi}
          baseline={data.historical_avg_aqi}
          deviation={data.aqi_deviation}
          unit="AQI"
          higherIsWorse
          delay={120}
        />
      </div>

      <div className="flex gap-6 label fade-up" style={{ animationDelay: '180ms' }}>
        <span className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: '#e0644b' }} /> worse than norm
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: '#79c7b8' }} /> better than norm
        </span>
      </div>
    </div>
  )
}
