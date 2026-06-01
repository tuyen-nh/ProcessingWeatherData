import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getRealtimeAll, SPEED_POLL_MS } from '../api/client.js'
import { useFetch } from '../hooks/useFetch.js'
import { aqiBand, fmt, fmtTime } from '../utils/aqi.js'
import { Loader, ErrorBox, Empty } from '../components/Loader.jsx'

const REGIONS = [
  { key: 'all', value: null, dot: 'var(--muted)' },
  { key: 'north', value: 'North', dot: 'var(--teal)' },
  { key: 'central', value: 'Central', dot: 'var(--amber)' },
  { key: 'south', value: 'South', dot: '#a78bfa' },
]
const REGION_DOT = { North: 'var(--teal)', Central: 'var(--amber)', South: '#a78bfa' }

// temp_alert colors (StreamingAQI thresholds). Normal is benign → rendered quiet.
const TEMP_ALERT_COLOR = {
  'Too Cold': 'var(--chart-blue)',
  Hot: '#f97316',
  'Extreme Heat': '#ef4444',
}
// Benign states render quiet (muted text + faint dot) so real alerts pop.
const BENIGN = new Set(['Good', 'Moderate', 'Normal'])
// English value → i18n slug.
const slug = (s) => (s || '').toLowerCase().replace(/[()]/g, '').replace(/\s+/g, '_')

// Status badge: filled colored pill for alerts, quiet dot+text for benign states.
function StatusBadge({ value, color, label }) {
  if (!value) return <span className="text-faint">–</span>
  if (BENIGN.has(value)) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--faint)' }} />
        {label}
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-[2px] text-xs font-medium"
      style={{ background: color, color: '#fff' }}
    >
      {label}
    </span>
  )
}

// column key → row field + numeric flag. province sorts alphabetically.
const COLUMNS = [
  { key: 'province', field: 'province', num: false, align: 'left' },
  { key: 'region', field: 'region', num: false, align: 'left', noSort: true },
  { key: 'temp', field: 'temp', num: true, align: 'right' },
  { key: 'humidity', field: 'humidity', num: true, align: 'right' },
  { key: 'pm25', field: 'pm2_5', num: true, align: 'right' },
  { key: 'aqi', field: 'aqi_value', num: true, align: 'right' },
]

export default function ProvincesTable() {
  const { t } = useTranslation()
  const { data, loading, error } = useFetch(() => getRealtimeAll(), [], { pollMs: SPEED_POLL_MS })

  const [region, setRegion] = useState(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState({ field: 'aqi_value', dir: 'desc' })

  const rows = useMemo(() => {
    if (!data) return []
    const q = query.trim().toLowerCase()
    const filtered = data.filter(
      (d) => (!region || d.region === region) && (!q || d.province?.toLowerCase().includes(q)),
    )
    const { field, dir } = sort
    const mul = dir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      const av = a[field]
      const bv = b[field]
      if (typeof av === 'string') return av.localeCompare(bv) * mul
      return ((av ?? -Infinity) - (bv ?? -Infinity)) * mul
    })
  }, [data, region, query, sort])

  const lastUpdated = useMemo(() => {
    if (!data?.length) return null
    return data.reduce((m, d) => (d.timestamp > m ? d.timestamp : m), data[0].timestamp)
  }, [data])

  if (loading) return <Loader label={t('provincesTable.loading')} />
  if (error) return <ErrorBox error={error} />

  const toggleSort = (col) => {
    if (col.noSort) return
    setSort((s) =>
      s.field === col.field
        ? { field: col.field, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { field: col.field, dir: col.num ? 'desc' : 'asc' },
    )
  }

  return (
    <div className="space-y-6">
      {/* status strip */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 fade-up">
        <div className="flex items-center gap-2 label">
          <span
            className="h-1.5 w-1.5 rounded-full bg-teal"
            style={{ animation: 'pulseDot 2s infinite' }}
          />
          {t('provincesTable.live')}
        </div>
        <div className="label text-faint">
          {t('provincesTable.lastUpdated')}{' '}
          <span className="mono text-muted normal-case tracking-normal">{fmtTime(lastUpdated)}</span>
        </div>
        <div className="label text-faint ml-auto">
          {t('provincesTable.count', { count: rows.length })}
        </div>
      </div>

      {/* controls */}
      <div className="flex flex-wrap items-center gap-3 fade-up" style={{ animationDelay: '60ms' }}>
        <div className="flex flex-wrap gap-2">
          {REGIONS.map((r) => {
            const active = region === r.value
            return (
              <button
                key={r.key}
                onClick={() => setRegion(r.value)}
                className={`group flex items-center gap-2 px-3 py-1.5 border rounded-[2px] text-xs transition-colors ${
                  active ? 'border-linehi text-ink' : 'border-line text-muted hover:text-ink'
                }`}
                style={{ background: active ? 'var(--panel-hi)' : 'transparent' }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: r.dot }} />
                {t(`provincesTable.region.${r.key}`)}
              </button>
            )
          })}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('provincesTable.search')}
          className="ml-auto w-full sm:w-56 bg-transparent border border-line rounded-[2px] px-3 py-1.5 text-sm text-ink placeholder:text-faint focus:border-linehi focus:outline-none transition-colors"
        />
      </div>

      {/* table */}
      <div className="panel overflow-x-auto fade-up" style={{ animationDelay: '120ms' }}>
        {rows.length === 0 ? (
          <Empty />
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-line">
                <th className="label text-left font-semibold px-4 py-3 w-10">
                  {t('provincesTable.col.rank')}
                </th>
                {COLUMNS.map((c) => {
                  const sorted = sort.field === c.field
                  return (
                    <th
                      key={c.key}
                      onClick={() => toggleSort(c)}
                      className={`label font-semibold px-4 py-3 select-none ${
                        c.align === 'right' ? 'text-right' : 'text-left'
                      } ${c.noSort ? '' : 'cursor-pointer hover:text-ink'}`}
                    >
                      <span className={c.align === 'right' ? 'inline-flex flex-row-reverse items-center gap-1' : 'inline-flex items-center gap-1'}>
                        {t(`provincesTable.col.${c.key}`)}
                        {sorted && <span className="text-amber">{sort.dir === 'asc' ? '▲' : '▼'}</span>}
                      </span>
                    </th>
                  )
                })}
                <th className="label text-left font-semibold px-4 py-3">
                  {t('provincesTable.col.aqiAlert')}
                </th>
                <th className="label text-left font-semibold px-4 py-3">
                  {t('provincesTable.col.tempAlert')}
                </th>
                <th className="label text-right font-semibold px-4 py-3">
                  {t('provincesTable.col.updated')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const band = aqiBand(r.aqi_value)
                return (
                  <tr
                    key={r.station_id}
                    className="border-b border-line last:border-0 hover:bg-[var(--panel-hi)] transition-colors fade-up"
                    style={{ animationDelay: `${Math.min(i * 18, 360)}ms` }}
                  >
                    <td className="px-4 py-3 mono text-[10px] text-faint">
                      {String(i + 1).padStart(2, '0')}
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2">
                        {r.is_anomaly && (
                          <span
                            className="h-1.5 w-1.5 rounded-full shrink-0"
                            style={{ background: 'var(--amber)', boxShadow: '0 0 6px var(--amber)' }}
                          />
                        )}
                        <span className="display tracking-tight text-ink">{r.province}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2 text-muted text-xs">
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ background: REGION_DOT[r.region] || 'var(--muted)' }}
                        />
                        {r.region}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right mono text-ink">
                      {fmt(r.temp)}
                      <span className="text-faint text-[10px] ml-1">°C</span>
                    </td>
                    <td className="px-4 py-3 text-right mono text-ink">
                      {fmt(r.humidity, 0)}
                      <span className="text-faint text-[10px] ml-1">%</span>
                    </td>
                    <td className="px-4 py-3 text-right mono text-ink">{fmt(r.pm2_5)}</td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className="mono text-xs font-medium inline-flex items-center gap-2 px-2 py-0.5 rounded-[2px]"
                        style={{ background: band.color, color: band.text }}
                        title={r.aqi_category}
                      >
                        {r.aqi_value ?? '–'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        value={r.aqi_alert}
                        color={band.color}
                        label={t(`provincesTable.aqiAlert.${slug(r.aqi_alert)}`, r.aqi_alert || '')}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        value={r.temp_alert}
                        color={TEMP_ALERT_COLOR[r.temp_alert] || 'var(--muted)'}
                        label={t(`provincesTable.tempAlert.${slug(r.temp_alert)}`, r.temp_alert || '')}
                      />
                    </td>
                    <td className="px-4 py-3 text-right mono text-[11px] text-faint">
                      {fmtTime(r.timestamp)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
