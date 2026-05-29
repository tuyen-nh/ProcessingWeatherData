import { Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar.jsx'
import TopBar from './components/TopBar.jsx'
import RealtimeDashboard from './pages/RealtimeDashboard.jsx'
import History from './pages/History.jsx'
import Compare from './pages/Compare.jsx'
import Alerts from './pages/Alerts.jsx'
import NationalStats from './pages/NationalStats.jsx'

const PAGES = [
  { path: '/', title: 'Realtime Dashboard', el: <RealtimeDashboard /> },
  { path: '/history', title: 'Historical Trends', el: <History /> },
  { path: '/compare', title: 'Lambda Comparison', el: <Compare /> },
  { path: '/alerts', title: 'Active Alerts', el: <Alerts /> },
  { path: '/stats', title: 'National Statistics', el: <NationalStats /> },
]

export default function App() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 flex flex-col">
        <Routes>
          {PAGES.map((p) => (
            <Route
              key={p.path}
              path={p.path}
              element={
                <>
                  <TopBar title={p.title} />
                  <div className="p-6 flex-1">{p.el}</div>
                </>
              }
            />
          ))}
        </Routes>
      </main>
    </div>
  )
}
