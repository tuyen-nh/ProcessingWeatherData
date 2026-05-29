import { Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar.jsx'
import TopBar from './components/TopBar.jsx'
import RealtimeDashboard from './pages/RealtimeDashboard.jsx'
import History from './pages/History.jsx'
import Compare from './pages/Compare.jsx'
import Alerts from './pages/Alerts.jsx'
import NationalStats from './pages/NationalStats.jsx'

const PAGES = [
  { path: '/', title: 'Realtime', index: 'Speed Layer', el: <RealtimeDashboard /> },
  { path: '/history', title: 'Historical Trends', index: 'Batch Layer', el: <History /> },
  { path: '/compare', title: 'Lambda Comparison', index: 'Speed × Batch', el: <Compare /> },
  { path: '/alerts', title: 'Active Alerts', index: 'Anomaly Watch', el: <Alerts /> },
  { path: '/stats', title: 'National Index', index: '34 Provinces', el: <NationalStats /> },
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
                  <TopBar title={p.title} index={p.index} />
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
