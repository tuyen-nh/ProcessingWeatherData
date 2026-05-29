import { NavLink } from 'react-router-dom'

const LINKS = [
  { to: '/', label: 'Realtime', icon: '📡', end: true },
  { to: '/history', label: 'History', icon: '📈' },
  { to: '/compare', label: 'Compare', icon: '⚖️' },
  { to: '/alerts', label: 'Alerts', icon: '🚨' },
  { to: '/stats', label: 'National Stats', icon: '🇻🇳' },
]

export default function Sidebar() {
  return (
    <aside className="w-60 shrink-0 bg-slate-900/80 border-r border-slate-800 min-h-screen p-4 flex flex-col">
      <div className="mb-8">
        <h1 className="text-lg font-bold text-white leading-tight">VN Weather & AQI</h1>
        <p className="text-xs text-slate-400">Lambda Dashboard</p>
      </div>
      <nav className="flex flex-col gap-1">
        {LINKS.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
                isActive
                  ? 'bg-cyan-500/20 text-cyan-300 font-medium'
                  : 'text-slate-300 hover:bg-slate-800'
              }`
            }
          >
            <span>{l.icon}</span>
            {l.label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto text-[10px] text-slate-500 pt-6">
        Mock data mode · swap via <code>api/client.js</code>
      </div>
    </aside>
  )
}
