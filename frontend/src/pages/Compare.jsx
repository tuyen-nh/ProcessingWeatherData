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
    <div className="space-y-6">
      <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-4 text-sm text-slate-300">
        <span className="font-semibold text-white">{data.city_name}</span> — Lambda comparison:
        live <span className="text-cyan-300">Speed Layer</span> value vs same-month{' '}
        <span className="text-amber-300">Batch Layer</span> historical baseline.
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <DeviationStat
          label="Temperature"
          current={data.current_temp}
          baseline={data.historical_avg_temp}
          deviation={data.temp_deviation}
          unit="°C"
          higherIsWorse
        />
        <DeviationStat
          label="Air Quality Index"
          current={data.current_aqi}
          baseline={data.historical_avg_aqi}
          deviation={data.aqi_deviation}
          unit="AQI"
          higherIsWorse
        />
      </div>

      <p className="text-xs text-slate-500">
        Red = worse than historical norm (hotter / more polluted). Green = better.
      </p>
    </div>
  )
}
