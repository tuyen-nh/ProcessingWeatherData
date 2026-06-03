// Generate a 30-day × 34-station hourly weather CSV that the Spark batch
// (BatchWeatherAnalytics) can read from HDFS /user/data/raw/weather_data/.
//
// WHY: the original export.csv has NO station_id (+ no pm25/no2) → Spark batch
// collapses everything to station=null → ~8 junk daily docs. This CSV carries
// station_id + pm25 + no2 for every hour so the batch produces real per-station
// daily aggregates (1020 rows) + 30-day summary (34 rows).
//
// Columns match what BatchWeatherAnalytics's historical reader expects:
//   time, temp, rhum  (renamed → timestamp/temperature/humidity)
//   station_id, pm25, no2  (passthrough; station_id drives the station join)
// Times are Vietnam-local (Open-Meteo tz=Asia/Bangkok), re-stamped onto the
// 30-day window ending SEED_DATE — same window as fillBatch.js.
//
// Run:  node scripts/genHdfsCsv.js   → writes /tmp/weather_stations_30d.csv
require('dotenv').config();
const fs = require('fs');

const SEED_Y = 2026, SEED_M = 5, SEED_D = 1; // month 0-based; window ends 2026-06-01
const NUM_DAYS = 30;
const OUT = '/tmp/weather_stations_30d.csv';

function stampedDate(daysAgo) {
  const d = new Date(Date.UTC(SEED_Y, SEED_M, SEED_D));
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

const STATIONS = [
  { station_id: 'HN01',  lat: 21.03, lon: 105.85 },
  { station_id: 'HUE01', lat: 16.46, lon: 107.59 },
  { station_id: 'LC01',  lat: 22.40, lon: 103.46 },
  { station_id: 'DB01',  lat: 21.39, lon: 103.02 },
  { station_id: 'SL01',  lat: 21.33, lon: 103.91 },
  { station_id: 'LS01',  lat: 21.85, lon: 106.76 },
  { station_id: 'QN01',  lat: 20.95, lon: 107.08 },
  { station_id: 'TH01',  lat: 19.81, lon: 105.78 },
  { station_id: 'NA01',  lat: 18.68, lon: 105.68 },
  { station_id: 'HT01',  lat: 18.34, lon: 105.91 },
  { station_id: 'CB01',  lat: 22.67, lon: 106.26 },
  { station_id: 'TQ01',  lat: 21.82, lon: 105.21 },
  { station_id: 'LC02',  lat: 22.49, lon: 103.97 },
  { station_id: 'TN01',  lat: 21.59, lon: 105.85 },
  { station_id: 'PT01',  lat: 21.32, lon: 105.40 },
  { station_id: 'BN01',  lat: 21.18, lon: 106.08 },
  { station_id: 'HY01',  lat: 20.85, lon: 106.05 },
  { station_id: 'HP01',  lat: 20.86, lon: 106.68 },
  { station_id: 'NB01',  lat: 20.25, lon: 105.97 },
  { station_id: 'QT01',  lat: 16.81, lon: 107.10 },
  { station_id: 'DN01',  lat: 16.05, lon: 108.21 },
  { station_id: 'QNG01', lat: 15.12, lon: 108.80 },
  { station_id: 'GL01',  lat: 13.98, lon: 108.00 },
  { station_id: 'KH01',  lat: 12.24, lon: 109.19 },
  { station_id: 'LD01',  lat: 11.94, lon: 108.44 },
  { station_id: 'DL01',  lat: 12.69, lon: 108.05 },
  { station_id: 'HCM01', lat: 10.82, lon: 106.63 },
  { station_id: 'DN02',  lat: 10.95, lon: 106.82 },
  { station_id: 'TN02',  lat: 11.31, lon: 106.10 },
  { station_id: 'CT01',  lat: 10.04, lon: 105.78 },
  { station_id: 'VL01',  lat: 10.25, lon: 105.97 },
  { station_id: 'DT01',  lat: 10.46, lon: 105.63 },
  { station_id: 'CM01',  lat:  9.18, lon: 105.15 },
  { station_id: 'AG01',  lat: 10.39, lon: 105.44 },
];

const round = (n, d = 1) => (n == null ? null : Math.round(n * 10 ** d) / 10 ** d);
async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status} ${res.statusText}`);
  return res.json();
}
const asArray = (j) => (Array.isArray(j) ? j : [j]);

async function main() {
  const lats = STATIONS.map((s) => s.lat).join(',');
  const lons = STATIONS.map((s) => s.lon).join(',');
  const tz = 'Asia/Bangkok';

  console.log('Fetching Open-Meteo observed weather + air quality…');
  const realNow = new Date();
  const isoDay = (d) => d.toISOString().slice(0, 10);
  const startDate = new Date(realNow); startDate.setUTCDate(startDate.getUTCDate() - (NUM_DAYS + 9));
  const archiveUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${lats}&longitude=${lons}`
    + `&start_date=${isoDay(startDate)}&end_date=${isoDay(realNow)}`
    + `&hourly=temperature_2m,relative_humidity_2m&timezone=${tz}`;
  const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}`
    + `&hourly=temperature_2m,relative_humidity_2m&past_days=${NUM_DAYS}&forecast_days=0&timezone=${tz}`;
  const airUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lats}&longitude=${lons}`
    + `&hourly=pm2_5,nitrogen_dioxide&past_days=${NUM_DAYS + 9}&forecast_days=0&timezone=${tz}`;

  const [archive, forecast, air] = await Promise.all([
    fetchJson(archiveUrl).then(asArray),
    fetchJson(forecastUrl).then(asArray),
    fetchJson(airUrl).then(asArray),
  ]);

  const rows = ['station_id,time,temp,rhum,pm25,no2'];
  let count = 0;

  STATIONS.forEach((st, i) => {
    const merged = new Map();
    const putWeather = (block) => {
      if (!block?.time) return;
      block.time.forEach((t, k) => {
        const e = merged.get(t) || {};
        const temp = block.temperature_2m?.[k];
        const hum = block.relative_humidity_2m?.[k];
        if (temp != null && e.temperature == null) e.temperature = round(temp);
        if (hum != null && e.humidity == null) e.humidity = round(hum, 0);
        merged.set(t, e);
      });
    };
    putWeather(forecast[i]?.hourly);
    putWeather(archive[i]?.hourly);
    const a = air[i]?.hourly;
    (a?.time || []).forEach((t, k) => {
      const e = merged.get(t) || {};
      if (a.pm2_5?.[k] != null) e.pm25 = round(a.pm2_5[k]);
      if (a.nitrogen_dioxide?.[k] != null) e.no2 = round(a.nitrogen_dioxide[k], 1);
      merged.set(t, e);
    });

    const readAt = (t) => merged.get(t) || {};
    const byDate = new Map();
    [...merged.keys()].sort().forEach((t) => {
      const day = t.slice(0, 10);
      if (!byDate.has(day)) byDate.set(day, []);
      byDate.get(day).push(t);
    });
    const days = [...byDate.entries()]
      .filter(([, times]) => times.length >= 24 && times.slice(0, 24).every((t) => {
        const r = readAt(t);
        return r.temperature != null && r.pm25 != null;
      }))
      .map(([day, times]) => ({ day, times: times.slice(0, 24) }));
    if (!days.length) { console.warn(`  ! no complete day for ${st.station_id}, skipping`); return; }

    const recent = days.slice(-NUM_DAYS);
    recent.forEach((dayBlock, di) => {
      const daysAgo = recent.length - 1 - di;
      const dateStr = stampedDate(daysAgo);
      dayBlock.times.forEach((tk, hour) => {
        const r = readAt(tk);
        const hh = String(hour).padStart(2, '0');
        rows.push([
          st.station_id,
          `${dateStr} ${hh}:00:00`,
          r.temperature ?? '',
          r.humidity ?? '',
          r.pm25 ?? '',
          r.no2 ?? '',
        ].join(','));
        count++;
      });
    });
  });

  fs.writeFileSync(OUT, rows.join('\n') + '\n');
  console.log(`✅ wrote ${count} rows (${STATIONS.length} stations × ${NUM_DAYS}d × 24h) → ${OUT}`);
  process.exit(0);
}

main().catch((err) => { console.error('❌', err.message); process.exit(1); });
