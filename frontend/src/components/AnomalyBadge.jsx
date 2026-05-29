import { useTranslation } from 'react-i18next'

export default function AnomalyBadge({ anomaly }) {
  const { t } = useTranslation()
  // theme-aware tokens: --teal/--chart-red darken in light mode for contrast
  const color = anomaly ? 'var(--chart-red)' : 'var(--teal)'
  return (
    <span
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-sm mono text-[10px] font-semibold tracking-widest uppercase border"
      style={{
        color,
        borderColor: `color-mix(in srgb, ${color} 55%, transparent)`,
        background: `color-mix(in srgb, ${color} 16%, transparent)`,
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: color, animation: anomaly ? 'pulseDot 1.4s infinite' : 'none' }}
      />
      {anomaly ? t('status.anomaly') : t('status.nominal')}
    </span>
  )
}
