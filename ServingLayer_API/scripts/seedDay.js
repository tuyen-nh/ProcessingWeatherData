// One-shot flow: fetch 30 recent days of REAL hourly weather (Open-Meteo, no key)
// for all 34 stations, re-stamp onto a 30-day window ending 2026-06-01, and load
// into Mongo using ONLY the 4 collections the project defines:
//
//   RealTimeReadings           ← every hourly reading (30d × 24h × 34 stations).
//                                Also the live Kafka feed's target; seeding it
//                                means history persists even with streaming off.
//   ProvinceAggregations       ← per-day per-station daily rollup (~1020 rows),
//                                with avg_aqi + peak_aqi_hour. Drives History page.
//   BatchHistoricalAggregations← per-station 30-day average summary (34 rows).
//                                Baseline for ranking (/stats) + compare.
//   AQIStream_avg              ← left untouched (Spark Streaming windowed output).
//
// Shapes mirror BatchWeatherAnalytics.java (provinceDf / stationAvgDf).
// Also DROPS the legacy weather_hourly / weather_daily collections.
//
// Run:  npm run seed   (from ServingLayer_API/)
require('dotenv').config();
const mongoose = require('mongoose');
const connectDb = require('../db');
const { RealTimeReading, ProvinceAggregation, BatchHistorical } = require('../models');

const SEED_DATE = '2026-06-01';          // newest day of the stamped window
const SEED_Y = 2026, SEED_M = 5, SEED_D = 1; // month is 0-based for Date.UTC
const NUM_DAYS = 30;                     // history depth

// Date string `daysAgo` days before SEED_DATE, e.g. daysAgo=0 → '2026-06-01'.
function stampedDate(daysAgo) {
  const d = new Date(Date.UTC(SEED_Y, SEED_M, SEED_D));
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

// UTC Date for a given day-offset + hour, used as the reading timestamp.
function stampedTimestamp(daysAgo, hour) {
  const d = new Date(Date.UTC(SEED_Y, SEED_M, SEED_D, hour, 0, 0));
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d;
}

// aqi_alert / temp_alert — ported EXACTLY from StreamingAQI.java so seeded
// RealTimeReadings carry the same alert strings the streaming job would emit.
function aqiAlert(aqi) {
  if (aqi == null) return null;
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Unhealthy for Sensitive Groups';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very Unhealthy';
  return 'Hazardous';
}
function tempAlert(temp) {
  if (temp == null) return null;
  if (temp < 10) return 'Too Cold';
  if (temp <= 35) return 'Normal';
  if (temp <= 40) return 'Hot';
  return 'Extreme Heat';
}

// 34 cities — matches frontend/src/data/cities.js (+ approximate province coords).
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

// PM2.5 (µg/m³) → US EPA AQI. Ported from StreamingAQI.java calculateAQI UDF.
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

const round = (n, d = 1) => (n == null ? null : Math.round(n * 10 ** d) / 10 ** d);

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status} ${res.statusText}`);
  return res.json();
}

// Open-Meteo returns an array when multiple coords are passed; a single object
// for one coord. Normalize to an array aligned with STATIONS order.
const asArray = (j) => (Array.isArray(j) ? j : [j]);

async function main() {
  const lats = STATIONS.map((s) => s.lat).join(',');
  const lons = STATIONS.map((s) => s.lon).join(',');
  const tz = 'Asia/Bangkok';

  // All observed (no forecast). Temp/humidity comes from two sources merged:
  //  - archive (ERA5): reliable for older days, but lags ~5 days.
  //  - forecast past_days: covers the most recent ~25 days incl. today.
  // Their union covers a clean NUM_DAYS window. pm2.5/no2 from the air-quality API.
  console.log('Fetching Open-Meteo observed weather (archive + recent) + air quality…');
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

  const avg = (arr) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null);

  const readings = [];     // → RealTimeReadings (every hour of every day)
  const dailyRows = [];    // → ProvinceAggregations (per-day per-station, ~1020)
  const summaryRows = [];  // → BatchHistoricalAggregations (per-station 30-day avg, 34)

  STATIONS.forEach((st, i) => {
    // Merge all sources into one time → values map (prefer non-null).
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
    putWeather(forecast[i]?.hourly); // recent days take priority
    putWeather(archive[i]?.hourly);  // fills older days
    const a = air[i]?.hourly;
    (a?.time || []).forEach((t, k) => {
      const e = merged.get(t) || {};
      if (a.pm2_5?.[k] != null) e.pm25 = round(a.pm2_5[k]);
      if (a.nitrogen_dioxide?.[k] != null) e.no2 = round(a.nitrogen_dioxide[k], 1);
      merged.set(t, e);
    });

    const readAt = (t) => merged.get(t) || {};

    // Complete days = 24 hourly slots all with a non-null temperature + pm25.
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

    // Take the last NUM_DAYS complete days, newest last.
    const recent = days.slice(-NUM_DAYS);
    const winTemps = [], winPms = [], winHums = [], winNo2 = [];

    recent.forEach((dayBlock, di) => {
      const daysAgo = recent.length - 1 - di; // 0 = most recent → 2026-06-01
      const dateStr = stampedDate(daysAgo);

      // Per-day accumulators → one ProvinceAggregations daily row.
      const dTemps = [], dPms = [], dHums = [], dNo2 = [], dAqis = [];
      let peak = { hour: 0, aqi: -1 };

      dayBlock.times.forEach((tk, hour) => {
        const r = readAt(tk);
        const aqi_index = pm25ToAQI(r.pm25);

        if (r.temperature != null) { dTemps.push(r.temperature); winTemps.push(r.temperature); }
        if (r.pm25 != null) { dPms.push(r.pm25); winPms.push(r.pm25); }
        if (r.humidity != null) { dHums.push(r.humidity); winHums.push(r.humidity); }
        if (r.no2 != null) { dNo2.push(r.no2); winNo2.push(r.no2); }
        if (aqi_index != null) {
          dAqis.push(aqi_index);
          if (aqi_index > peak.aqi) peak = { hour, aqi: aqi_index };
        }

        // Every hour of every day becomes a RealTimeReadings row.
        readings.push({
          station_id: st.station_id, province: st.province, region: st.region,
          date: dateStr,
          timestamp: stampedTimestamp(daysAgo, hour),
          temperature: r.temperature ?? null,
          humidity: r.humidity ?? null,
          pm25: r.pm25 ?? null,
          no2: r.no2 ?? null,
          aqi_index,
          aqi_alert: aqiAlert(aqi_index),
          temp_alert: tempAlert(r.temperature),
        });
      });

      // Daily rollup for this station/day (matches BatchWeatherAnalytics.provinceDf).
      dailyRows.push({
        date: dateStr,
        station_id: st.station_id, province: st.province, region: st.region,
        avg_temp: round(avg(dTemps)),
        max_temp: round(dTemps.length ? Math.max(...dTemps) : null),
        min_temp: round(dTemps.length ? Math.min(...dTemps) : null),
        avg_humidity: round(avg(dHums), 0),
        avg_pm25: round(avg(dPms), 2),
        avg_no2: round(avg(dNo2), 2),
        avg_aqi: dAqis.length ? Math.round(avg(dAqis)) : null,
        peak_aqi_hour: peak.hour,
        record_count: dTemps.length,
      });
    });

    // Per-station 30-day summary (matches BatchWeatherAnalytics.stationAvgDf).
    summaryRows.push({
      station_id: st.station_id, province: st.province, region: st.region,
      avg_temp: round(avg(winTemps)),
      max_temp: round(winTemps.length ? Math.max(...winTemps) : null),
      avg_humidity: round(avg(winHums), 0),
      avg_pm25: round(avg(winPms), 2),
      avg_no2: round(avg(winNo2), 2),
      record_count: winTemps.length,
    });
  });

  await connectDb();
  console.log('Writing to MongoDB…');

  await RealTimeReading.deleteMany({});
  await RealTimeReading.insertMany(readings, { ordered: false });

  await ProvinceAggregation.deleteMany({});
  await ProvinceAggregation.insertMany(dailyRows, { ordered: false });

  await BatchHistorical.deleteMany({});
  await BatchHistorical.insertMany(summaryRows);

  // Drop the redundant collections the old seed created.
  const dropIfExists = async (name) => {
    try {
      await mongoose.connection.db.dropCollection(name);
      console.log(`🗑️  dropped ${name}`);
    } catch (e) {
      if (e.codeName !== 'NamespaceNotFound') throw e;
    }
  };
  await dropIfExists('weather_hourly');
  await dropIfExists('weather_daily');

  console.log(`✅ RealTimeReadings: ${readings.length} docs (${NUM_DAYS}d × 24h × stations)`);
  console.log(`✅ ProvinceAggregations: ${dailyRows.length} docs (per-day × station)`);
  console.log(`✅ BatchHistoricalAggregations: ${summaryRows.length} stations (30-day summary)`);
  console.log('   AQIStream_avg left untouched (Spark Streaming output).');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
