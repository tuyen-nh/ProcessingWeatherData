import { Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar.jsx'
import TopBar from './components/TopBar.jsx'
import RealtimeDashboard from './pages/RealtimeDashboard.jsx'
import History from './pages/History.jsx'
import ProvincesTable from './pages/ProvincesTable.jsx'
import Compare from './pages/Compare.jsx'
import Alerts from './pages/Alerts.jsx'
import NationalStats from './pages/NationalStats.jsx'

const PAGES = [
  { path: '/', titleKey: 'titles.realtime', subKey: 'sub.speed', el: <RealtimeDashboard /> },
  { path: '/history', titleKey: 'titles.history', subKey: 'sub.batch', el: <History /> },
  { path: '/provinces', titleKey: 'titles.provinces', subKey: 'sub.provincesTable', el: <ProvincesTable /> },
  { path: '/compare', titleKey: 'titles.compare', subKey: 'sub.lambda', el: <Compare /> },
  { path: '/alerts', titleKey: 'titles.alerts', subKey: 'sub.anomaly', el: <Alerts /> },
  { path: '/stats', titleKey: 'titles.national', subKey: 'sub.provinces', el: <NationalStats /> },
]

export default function App() {
  return (
    <div className="flex min-h-screen max-w-[1500px] mx-auto">
      <Sidebar />
      <main className="flex-1 min-w-0 flex flex-col">
        <Routes>
          {PAGES.map((p) => (
            <Route
              key={p.path}
              path={p.path}
              element={
                <>
                  <TopBar titleKey={p.titleKey} subKey={p.subKey} />
                  <div className="px-10 py-8 flex-1">{p.el}</div>
                </>
              }
            />
          ))}
        </Routes>
      </main>
    </div>
  )
}
