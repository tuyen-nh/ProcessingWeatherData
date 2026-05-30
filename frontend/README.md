# VN Weather & AQI — Frontend

React dashboard for the Lambda-architecture weather/AQI pipeline. Runs **standalone on mock data** — no backend required.

## Run
```bash
cd frontend
npm install
npm run dev      # http://localhost:5173
```

## Views (sidebar)
| View | Endpoint mocked |
|---|---|
| Realtime | `GET /api/weather/realtime?city_id` |
| History | `GET /api/weather/history?city_id&start_date&end_date` |
| Compare | `GET /api/weather/compare?city_id` |
| Alerts | `GET /api/weather/alerts` |
| National Stats | `GET /api/weather/stats` |

City selector in the top bar is shared across Realtime / History / Compare.

## Switch to the real API
Edit [src/api/client.js](src/api/client.js):
```js
export const USE_MOCK = false
```
Set base URL via env (default `http://localhost:3000`):
```bash
VITE_API_BASE=http://localhost:3000 npm run dev
```
Mock response shapes in [src/api/mock.js](src/api/mock.js) match the documented schemas exactly, so the rest of the app needs no change.

## Structure
- `src/api/` — client (mock/real switch) + mock generators
- `src/pages/` — one file per view
- `src/components/` — Sidebar, TopBar, AqiGauge, MetricCard, DeviationStat, RankTable, etc.
- `src/data/cities.js` — 34 VN provinces (matches `vietnam_stations.csv`)
- `src/utils/aqi.js` — AQI bands + color/category helpers
