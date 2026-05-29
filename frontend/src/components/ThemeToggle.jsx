import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { useTranslation } from 'react-i18next'

const OPTIONS = [
  { key: 'light', glyph: '☀' },
  { key: 'dark', glyph: '☾' },
]

export default function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const { t } = useTranslation()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // resolvedTheme keeps a button highlighted even if an old "system" value was stored
  const active = mounted ? theme || resolvedTheme : 'dark'

  return (
    <div className="flex flex-col items-end gap-1.5">
      <span className="label">{t('top.theme')}</span>
      <div className="inline-flex border border-line rounded-sm overflow-hidden">
        {OPTIONS.map((o) => {
          const on = active === o.key
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => setTheme(o.key)}
              aria-label={t(`theme.${o.key}`)}
              title={t(`theme.${o.key}`)}
              className={`px-2.5 py-2 mono text-sm transition-colors border-l border-line first:border-l-0 ${
                on ? 'bg-amber text-bg' : 'text-muted hover:text-ink'
              }`}
              style={on ? { color: 'var(--bg)', background: 'var(--amber)' } : undefined}
            >
              {o.glyph}
            </button>
          )
        })}
      </div>
    </div>
  )
}
