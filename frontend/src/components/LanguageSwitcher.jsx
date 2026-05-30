import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LANGS } from '../i18n/index.js'

export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const current = LANGS.find((l) => i18n.resolvedLanguage === l.code) || LANGS[0]

  // close on outside click / Escape
  useEffect(() => {
    if (!open) return
    const onClick = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const choose = (code) => {
    i18n.changeLanguage(code)
    setOpen(false)
  }

  return (
    <div className="flex flex-col items-end gap-1.5" ref={ref}>
      <span className="label">{t('top.language')}</span>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="flex items-center gap-2 border border-line hover:border-linehi focus:border-amber rounded-sm pl-3 pr-2.5 py-2 text-sm text-ink outline-none transition-colors"
        >
          <span className="text-base leading-none">{current.flag}</span>
          <span className="mono text-xs tracking-wider">{current.label}</span>
          <span className={`text-amber text-[10px] transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
        </button>

        {open && (
          <ul
            role="listbox"
            className="absolute right-0 mt-1.5 min-w-[180px] z-20 panel !bg-bgsoft p-1 fade-up"
            style={{ animationDuration: '0.18s' }}
          >
            {LANGS.map((l) => {
              const on = l.code === current.code
              return (
                <li key={l.code} role="option" aria-selected={on}>
                  <button
                    type="button"
                    onClick={() => choose(l.code)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-sm text-left transition-colors ${
                      on ? 'text-amber' : 'text-muted hover:text-ink'
                    }`}
                  >
                    <span className="text-base leading-none">{l.flag}</span>
                    <span className="text-sm flex-1 whitespace-nowrap">{l.name}</span>
                    {on && <span className="h-1.5 w-1.5 rounded-full bg-amber shrink-0" />}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
