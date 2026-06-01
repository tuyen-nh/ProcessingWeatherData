import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

const LINKS = [
  { to: '/', key: 'nav.realtime', code: '01', end: true },
  { to: '/history', key: 'nav.history', code: '02' },
  { to: '/provinces', key: 'nav.provinces', code: '03' },
  { to: '/alerts', key: 'nav.alerts', code: '04' },
  { to: '/stats', key: 'nav.national', code: '05' },
]

export default function Sidebar() {
  const { t } = useTranslation()
  return (
    <aside className="w-64 shrink-0 min-h-screen px-6 py-8 flex flex-col border-r border-line sticky top-0 self-start h-screen">
      <div className="mb-12">
        <div className="label mb-2">{t('brand.eyebrow')}</div>
        <h1 className="display text-[26px] leading-[1.05] text-ink font-semibold">
          {t('brand.line1')}
          <br />
          <span className="text-amber italic">{t('brand.line2')}</span>
        </h1>
        <div className="mt-3 h-px w-12 bg-amber" />
      </div>

      <nav className="flex flex-col">
        {LINKS.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            className={({ isActive }) =>
              `group flex items-baseline gap-4 py-3 border-b border-line transition-colors ${
                isActive ? 'text-ink' : 'text-muted hover:text-ink'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={`mono text-[10px] transition-colors ${
                    isActive ? 'text-amber' : 'text-faint group-hover:text-amber'
                  }`}
                >
                  {l.code}
                </span>
                <span className="display text-lg tracking-tight">{t(l.key)}</span>
                {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-amber self-center" />}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto pt-8">
        <div className="flex items-center gap-2 label">
          <span className="h-1.5 w-1.5 rounded-full bg-teal" style={{ animation: 'pulseDot 2s infinite' }} />
          {t('brand.feed')}
        </div>
        <p className="mt-2 text-[10px] text-faint leading-relaxed">
          {t('brand.swap')} <span className="mono text-muted">api/client.js</span>
        </p>
      </div>
    </aside>
  )
}
