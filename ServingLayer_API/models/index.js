const mongoose = require('mongoose');

// ============================================================================
// Schemas mirror EXACTLY what the Spark jobs write to MongoDB (DB: Big_Data).
// Keys are station_id (e.g. "HN01") + province + region — NOT city_id.
// strict:false keeps any extra columns Spark emits (e.g. window struct).
// ============================================================================

// ── Speed Layer: per-station real-time readings (StreamingAQI.realtimeAlerts) ──
const RealTimeReadingSchema = new mongoose.Schema({
    station_id:  { type: String, index: true },
    province:    { type: String, index: true },
    region:      { type: String, index: true },
    date:        { type: String },
    timestamp:   { type: Date, index: true },
    pm25:        { type: Number },
    temperature: { type: Number },
    humidity:    { type: Number },
    no2:         { type: Number },
    aqi_index:   { type: Number },
    aqi_alert:   { type: String },   // Good | Moderate | ... | Hazardous
    temp_alert:  { type: String }    // Too Cold | Normal | Hot | Extreme Heat
}, { collection: 'RealTimeReadings', strict: false });

// ── Speed Layer: 15-min windowed averages per province (StreamingAQI.finalAggregations) ──
const StreamAvgSchema = new mongoose.Schema({
    window:       { type: mongoose.Schema.Types.Mixed },  // { start, end }
    province:     { type: String, index: true },
    avg_pm25:     { type: Number },
    peak_pm25:    { type: Number },
    avg_temp:     { type: Number },
    avg_humidity: { type: Number },
    avg_no2:      { type: Number },
    aqi_index:    { type: Number }
}, { collection: 'AQIStream_avg', strict: false });

// ── Batch Layer: per-station aggregates over full history (BatchWeatherAnalytics.provinceDf) ──
const ProvinceAggregationSchema = new mongoose.Schema({
    station_id:   { type: String, index: true },
    province:     { type: String, index: true },
    region:       { type: String, index: true },
    avg_temp:     { type: Number },
    max_temp:     { type: Number },
    avg_humidity: { type: Number },
    avg_pm25:     { type: Number },
    avg_no2:      { type: Number },
    record_count: { type: Number }
}, { collection: 'ProvinceAggregations', strict: false });

// ── Batch Layer: avg PM2.5 pivoted by region per date (BatchWeatherAnalytics.pivotedDf) ──
// Columns are dynamic region names (North / Central / South) → strict:false.
const BatchHistoricalSchema = new mongoose.Schema({
    date: { type: String, index: true }
}, { collection: 'BatchHistoricalAggregations', strict: false });

// ── History: per-station hourly readings for a recent day (seedDay.js) ──
// Drives the Realtime page's 0:00→23:59 day-timeline chart. Separate from
// RealTimeReadings, which stays reserved for the live Kafka feed.
const HourlyReadingSchema = new mongoose.Schema({
    station_id:  { type: String, index: true },
    province:    { type: String, index: true },
    region:      { type: String, index: true },
    date:        { type: String, index: true },  // YYYY-MM-DD
    timestamp:   { type: Date, index: true },     // 2026-06-01THH:00 (UTC)
    hour:        { type: Number },                // 0–23
    temperature: { type: Number },
    humidity:    { type: Number },
    pm25:        { type: Number },
    no2:         { type: Number },
    aqi_index:   { type: Number }
}, { collection: 'weather_hourly', strict: false });

// ── History: per-station daily aggregates over recent days (seedDay.js) ──
// Drives the History page's daily temp/AQI charts.
const DailyReadingSchema = new mongoose.Schema({
    station_id:    { type: String, index: true },
    province:      { type: String, index: true },
    region:        { type: String, index: true },
    date:          { type: String, index: true },  // YYYY-MM-DD
    avg_temp:      { type: Number },
    max_temp:      { type: Number },
    min_temp:      { type: Number },
    avg_pm25:      { type: Number },
    avg_aqi:       { type: Number },
    peak_aqi_hour: { type: Number }                 // hour 0–23 of max hourly AQI
}, { collection: 'weather_daily', strict: false });

module.exports = {
    RealTimeReading:     mongoose.model('RealTimeReading',     RealTimeReadingSchema),
    StreamAvg:           mongoose.model('StreamAvg',           StreamAvgSchema),
    ProvinceAggregation: mongoose.model('ProvinceAggregation', ProvinceAggregationSchema),
    BatchHistorical:     mongoose.model('BatchHistorical',     BatchHistoricalSchema),
    HourlyReading:       mongoose.model('HourlyReading',       HourlyReadingSchema),
    DailyReading:        mongoose.model('DailyReading',        DailyReadingSchema)
};
