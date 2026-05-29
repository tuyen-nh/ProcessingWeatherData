import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'

const OPTIONS = [
  { key: 'light', glyph: '☀', label: 'Light' },
  { key: 'dark', glyph: '☾', label: 'Dark' },
  { key: 'system', glyph: '⌁', label: 'Auto' },
]

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // avoid theme-mismatch flash before the client knows the stored value
  const active = mounted ? theme : 'dark'

  return (
    <div className="flex flex-col items-end gap-1.5">
      <span className="label">Theme</span>
      <div className="inline-flex border border-line rounded-sm overflow-hidden">
        {OPTIONS.map((o) => {
          const on = active === o.key
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => setTheme(o.key)}
              aria-label={o.label}
              title={o.label}
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
