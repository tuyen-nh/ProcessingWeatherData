import { useTranslation } from 'react-i18next'
import { useCity } from '../context/CityContext.jsx'
import { getRealtime, SPEED_POLL_MS } from '../api/client.js'
import { useFetch } from '../hooks/useFetch.js'
import { fmt, fmtTime } from '../utils/aqi.js'
import MetricCard from '../components/MetricCard.jsx'
import AqiGauge from '../components/AqiGauge.jsx'
import AnomalyBadge from '../components/AnomalyBadge.jsx'
import RealtimeTrendChart from '../components/RealtimeTrendChart.jsx'
import { Loader, ErrorBox } from '../components/Loader.jsx'

export default function RealtimeDashboard() {
  const { t } = useTranslation()
  const { cityId } = useCity()
  const { data, loading, error } = useFetch(() => getRealtime(cityId), [cityId], { pollMs: SPEED_POLL_MS })

  if (loading) return <Loader label={t('realtime.loading')} />
  if (error) return <ErrorBox error={error} />

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between fade-up">
        <div>
          <h3 className="display text-5xl font-semibold tracking-tight text-ink">{data.city_name}</h3>
          <p className="label mt-2">{t('realtime.lastReading')} · {fmtTime(data.timestamp)}</p>
        </div>
        <AnomalyBadge anomaly={data.is_anomaly} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 panel p-8 flex flex-col items-center justify-center fade-up" style={{ animationDelay: '60ms' }}>
          <div className="label mb-4">{t('metric.aqi')}</div>
          <AqiGauge value={data.aqi_value} />
        </div>

        <div className="lg:col-span-8 grid grid-cols-2 gap-6">
          <MetricCard label={t('metric.temp')} value={fmt(data.temp)} unit="°C" accent="var(--amber)" delay={120} />
          <MetricCard label={t('metric.humidity')} value={fmt(data.humidity, 0)} unit="%" accent="var(--teal)" delay={180} />
          <MetricCard label={t('metric.pm25')} value={fmt(data.pm2_5)} unit="µg/m³" accent="#a78bfa" delay={240} />
          <MetricCard label={t('metric.category')} value={data.aqi_category} accent="#e8a04b" delay={300} sub={t('realtime.epa')} />
        </div>
      </div>

      <RealtimeTrendChart cityId={cityId} />
    </div>
  )
}
