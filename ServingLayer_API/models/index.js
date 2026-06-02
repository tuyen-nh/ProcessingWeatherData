const mongoose = require('mongoose');

// ============================================================================
// Schemas mirror EXACTLY what the Spark jobs write to MongoDB (DB: Big_Data).
// Keys are station_id (e.g. "HN01") + province + region — NOT city_id.
// strict:false keeps any extra columns Spark emits.
// ============================================================================

// ── Speed Layer: per-station real-time readings (StreamingAQI.realtimeAlerts) ──
const RealTimeReadingSchema = new mongoose.Schema({
    _id:         { type: String },   // = station_id (Spark override key); String, not ObjectId
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

// ── Speed Layer: per-station reading history / day-series (StreamingAQI append) ──
// Same row shape as RealTimeReadings, but APPENDED (never overwritten) so the full
// per-station time-series survives. Source for the home chart (/hourly) + /realtime/series.
const DaySeriesSchema = new mongoose.Schema({
    station_id:  { type: String, index: true },
    province:    { type: String, index: true },
    region:      { type: String, index: true },
    date:        { type: String, index: true },
    timestamp:   { type: Date, index: true },
    pm25:        { type: Number },
    temperature: { type: Number },
    humidity:    { type: Number },
    no2:         { type: Number },
    aqi_index:   { type: Number },
    aqi_alert:   { type: String },
    temp_alert:  { type: String }
}, { collection: 'AQIStream_avg', strict: false });

// ── Batch Layer: per-day per-station daily stats (BatchWeatherAnalytics.provinceDf) ──
// One row per station per date (date × 34 ≈ 1020). Drives the History page.
const ProvinceAggregationSchema = new mongoose.Schema({
    date:          { type: String, index: true },  // YYYY-MM-DD
    station_id:    { type: String, index: true },
    province:      { type: String, index: true },
    region:        { type: String, index: true },
    avg_temp:      { type: Number },
    max_temp:      { type: Number },
    min_temp:      { type: Number },
    avg_humidity:  { type: Number },
    avg_pm25:      { type: Number },
    avg_no2:       { type: Number },
    avg_aqi:       { type: Number },
    peak_aqi_hour: { type: Number },                // hour 0–23 of the day's max AQI
    record_count:  { type: Number }
}, { collection: 'ProvinceAggregations', strict: false });

// ── Batch Layer: per-station 30-day average summary (BatchWeatherAnalytics.stationAvgDf) ──
// One averaged row per station (~34). Baseline for ranking + Lambda compare.
const BatchHistoricalSchema = new mongoose.Schema({
    station_id:   { type: String, index: true },
    province:     { type: String, index: true },
    region:       { type: String, index: true },
    avg_temp:     { type: Number },
    max_temp:     { type: Number },
    avg_humidity: { type: Number },
    avg_pm25:     { type: Number },
    avg_no2:      { type: Number },
    record_count: { type: Number }
}, { collection: 'BatchHistoricalAggregations', strict: false });

module.exports = {
    RealTimeReading:     mongoose.model('RealTimeReading',     RealTimeReadingSchema),
    DaySeries:           mongoose.model('DaySeries',           DaySeriesSchema),
    ProvinceAggregation: mongoose.model('ProvinceAggregation', ProvinceAggregationSchema),
    BatchHistorical:     mongoose.model('BatchHistorical',     BatchHistoricalSchema)
};
