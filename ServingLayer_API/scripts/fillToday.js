// Seed AQIStream_avg with TODAY's hourly rows (00:00 → current VN hour) so the
// "Diễn biến trong ngày" chart is full without leaving the streaming job running
// all night. Mirrors EXACTLY what StreamingAQI writes:
//   _id        = `${station_id}_${YYYY-MM-DD} HH:00:00`  (VN wall clock)
//   timestamp  = Date whose UTC fields read as VN hour (UTC-labelled +7 trick),
//                so API getUTCHours(timestamp) = VN hour, like the live feed.
//   temperature/humidity/pm25/no2/aqi_index/aqi_alert/temp_alert
// UPSERT by _id → does NOT wipe live docs; if streaming later runs it overwrites
// the same _id with the real reading. Only fills up to the current hour.
//
// Run:  node scripts/fillToday.js   (from ServingLayer_API/)
require('dotenv').config();
const mongoose = require('mongoose');
const connectDb = require('../db');

const STATIONS = [
  { station_id: 'HN01',  province: 'Ha Noi',           region: 'North',   lat: 21.03, lon: 105.85 },
  { station_id: 'HUE01', province: 'Hue',              region: 'Central', lat: 16.46, lon: 107.59 },
  { station_id: 'LC01',  province: 'Lai Chau',         region: 'North',   lat: 22.40, lon: 103.46 },
  { station_id: 'DB01',  province: 'Dien Bien',        region: 'North',   lat: 21.39, lon: 103.02 },
  { station_id: 'SL01',  province: 'Son La',           region: 'North',   lat: 21.33, lon: 103.91 },
  { station_id: 'LS01',  province: 'Lang Son',         region: 'North',   lat: 21.85, lon: 106.76 },
  { station_id: 'QN01',  province: 'Quang Ninh',       region: 'North',   lat: 20.95, lon: 107.08 },
  { station_id: 'TH01',  province: 'Thanh Hoa',        region: 'Central', lat: 19.81, lon: 105.78 },
  { station_id: 'NA01',  province: 'Nghe An',          region: 'Central', lat: 18.68, lon: 105.68 },
  { station_id: 'HT01',  province: 'Ha Tinh',          region: 'Central', lat: 18.34, lon: 105.91 },
  { station_id: 'CB01',  province: 'Cao Bang',         region: 'North',   lat: 22.67, lon: 106.26 },
  { station_id: 'TQ01',  province: 'Tuyen Quang',      region: 'North',   lat: 21.82, lon: 105.21 },
  { station_id: 'LC02',  province: 'Lao Cai',          region: 'North',   lat: 22.49, lon: 103.97 },
  { station_id: 'TN01',  province: 'Thai Nguyen',      region: 'North',   lat: 21.59, lon: 105.85 },
  { station_id: 'PT01',  province: 'Phu Tho',          region: 'North',   lat: 21.32, lon: 105.40 },
  { station_id: 'BN01',  province: 'Bac Ninh',         region: 'North',   lat: 21.18, lon: 106.08 },
  { station_id: 'HY01',  province: 'Hung Yen',         region: 'North',   lat: 20.85, lon: 106.05 },
  { station_id: 'HP01',  province: 'Hai Phong',        region: 'North',   lat: 20.86, lon: 106.68 },
  { station_id: 'NB01',  province: 'Ninh Binh',        region: 'North',   lat: 20.25, lon: 105.97 },
  { station_id: 'QT01',  province: 'Quang Tri',        region: 'Central', lat: 16.81, lon: 107.10 },
  { station_id: 'DN01',  province: 'Da Nang',          region: 'Central', lat: 16.05, lon: 108.21 },
  { station_id: 'QNG01', province: 'Quang Ngai',       region: 'Central', lat: 15.12, lon: 108.80 },
  { station_id: 'GL01',  province: 'Gia Lai',          region: 'Central', lat: 13.98, lon: 108.00 },
  { station_id: 'KH01',  province: 'Khanh Hoa',        region: 'Central', lat: 12.24, lon: 109.19 },
  { station_id: 'LD01',  province: 'Lam Dong',         region: 'Central', lat: 11.94, lon: 108.44 },
  { station_id: 'DL01',  province: 'Dak Lak',          region: 'Central', lat: 12.69, lon: 108.05 },
  { station_id: 'HCM01', province: 'Ho Chi Minh City', region: 'South',   lat: 10.82, lon: 106.63 },
  { station_id: 'DN02',  province: 'Dong Nai',         region: 'South',   lat: 10.95, lon: 106.82 },
  { station_id: 'TN02',  province: 'Tay Ninh',         region: 'South',   lat: 11.31, lon: 106.10 },
  { station_id: 'CT01',  province: 'Can Tho',          region: 'South',   lat: 10.04, lon: 105.78 },
  { station_id: 'VL01',  province: 'Vinh Long',        region: 'South',   lat: 10.25, lon: 105.97 },
  { station_id: 'DT01',  province: 'Dong Thap',        region: 'South',   lat: 10.46, lon: 105.63 },
  { station_id: 'CM01',  province: 'Ca Mau',           region: 'South',   lat:  9.18, lon: 105.15 },
  { station_id: 'AG01',  province: 'An Giang',         region: 'South',   lat: 10.39, lon: 105.44 },
];

function pm25ToAQI(pm25) {
  if (pm25 == null || Number.isNaN(pm25)) return null;
  const c = Number(pm25);
  const lerp = (cLo, cHi, iLo, iHi) => Math.round(((iHi - iLo) / (cHi - cLo)) * (c - cLo) + iLo);
  if (c <= 12.0) return Math.round((50.0 / 12.0) * c);
  if (c <= 35.4) return lerp(12.1, 35.4, 51, 100);
  if (c <= 55.4) return lerp(35.5, 55.4, 101, 150);
  if (c <= 150.4) return lerp(55.5, 150.4, 151, 200);
  if (c <= 250.4) return lerp(150.5, 250.4, 201, 300);
  if (c <= 350.4) return lerp(250.5, 350.4, 301, 400);
  if (c <= 500.4) return lerp(350.5, 500.4, 401, 500);
  return 500;
}
function aqiAlert(aqi) {
  if (aqi == null) return null;
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Unhealthy for Sensitive Groups';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very Unhealthy';
  return 'Hazardous';
}
function tempAlert(t) {
  if (t == null) return null;
  if (t < 10) return 'Too Cold';
  if (t <= 35) return 'Normal';
  if (t <= 40) return 'Hot';
  return 'Extreme Heat';
}
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

  // Current Vietnam wall clock (UTC+7). Fill hours 00:00 .. hourNow of this VN day.
  const vnNow = new Date(Date.now() + 7 * 3600 * 1000);
  const dateStr = vnNow.toISOString().slice(0, 10);
  const hourNow = vnNow.getUTCHours();
  const [Y, M, D] = dateStr.split('-').map(Number);
  console.log(`Filling AQIStream_avg for ${dateStr}, hours 00:00 → ${String(hourNow).padStart(2,'0')}:00 (VN)`);

  console.log('Fetching Open-Meteo (recent hourly) + air quality…');
  const fcUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}`
    + `&hourly=temperature_2m,relative_humidity_2m&past_days=2&forecast_days=1&timezone=${tz}`;
  const airUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lats}&longitude=${lons}`
    + `&hourly=pm2_5,nitrogen_dioxide&past_days=2&forecast_days=1&timezone=${tz}`;
  const [forecast, air] = await Promise.all([
    fetchJson(fcUrl).then(asArray),
    fetchJson(airUrl).then(asArray),
  ]);

  const ops = [];
  STATIONS.forEach((st, i) => {
    // time → values map for this station.
    const merged = new Map();
    const w = forecast[i]?.hourly;
    (w?.time || []).forEach((t, k) => {
      const e = merged.get(t) || {};
      if (w.temperature_2m?.[k] != null) e.temperature = round(w.temperature_2m[k]);
      if (w.relative_humidity_2m?.[k] != null) e.humidity = round(w.relative_humidity_2m[k], 0);
      merged.set(t, e);
    });
    const a = air[i]?.hourly;
    (a?.time || []).forEach((t, k) => {
      const e = merged.get(t) || {};
      if (a.pm2_5?.[k] != null) e.pm25 = round(a.pm2_5[k]);
      if (a.nitrogen_dioxide?.[k] != null) e.no2 = round(a.nitrogen_dioxide[k], 1);
      merged.set(t, e);
    });

    // Most recent complete day (24 slots w/ temp+pm25) → hourly profile.
    const byDate = new Map();
    [...merged.keys()].sort().forEach((t) => {
      const day = t.slice(0, 10);
      if (!byDate.has(day)) byDate.set(day, []);
      byDate.get(day).push(t);
    });
    const complete = [...byDate.entries()]
      .filter(([, ts]) => ts.length >= 24 && ts.slice(0, 24).every((t) => {
        const r = merged.get(t) || {};
        return r.temperature != null && r.pm25 != null;
      }));
    if (!complete.length) { console.warn(`  ! no complete day for ${st.station_id}, skip`); return; }
    const times = complete[complete.length - 1][1].slice(0, 24); // newest complete day

    for (let h = 0; h <= hourNow; h++) {
      const r = merged.get(times[h]) || {};
      const aqi_index = pm25ToAQI(r.pm25);
      const hh = String(h).padStart(2, '0');
      const _id = `${st.station_id}_${dateStr} ${hh}:00:00`;
      // UTC-labelled VN wall clock: getUTCHours(timestamp) === h (VN hour).
      const timestamp = new Date(Date.UTC(Y, M - 1, D, h, 0, 0));
      ops.push({
        updateOne: {
          filter: { _id },
          update: { $set: {
            _id, station_id: st.station_id, province: st.province, region: st.region,
            date: dateStr, timestamp,
            temperature: r.temperature ?? null,
            humidity: r.humidity ?? null,
            pm25: r.pm25 ?? null,
            no2: r.no2 ?? null,
            aqi_index,
            aqi_alert: aqiAlert(aqi_index),
            temp_alert: tempAlert(r.temperature),
          } },
          upsert: true,
        },
      });
    }
  });

  await connectDb();
  const col = mongoose.connection.db.collection('AQIStream_avg');
  const res = await col.bulkWrite(ops, { ordered: false });
  console.log(`✅ AQIStream_avg upserted: ${res.upsertedCount} new + ${res.modifiedCount} updated `
    + `(${STATIONS.length} stations × ${hourNow + 1} hours)`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => { console.error('❌', err.message); process.exit(1); });
