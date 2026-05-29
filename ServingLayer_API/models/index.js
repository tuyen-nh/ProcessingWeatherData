const mongoose = require('mongoose');

// ──────────────────────────────────────────────
// Speed Layer: dữ liệu real-time từ Kafka/Spark
// ──────────────────────────────────────────────
const WeatherRealtimeSchema = new mongoose.Schema({
    city_id:    { type: Number, required: true, index: true },
    city_name:  { type: String, required: true },
    temp:       { type: Number },          // nhiệt độ (°C)
    humidity:   { type: Number },          // độ ẩm (%)
    aqi_value:  { type: Number },          // chỉ số AQI tổng hợp
    pm25:       { type: Number },          // µg/m³
    pm10:       { type: Number },
    co:         { type: Number },
    no2:        { type: Number },
    so2:        { type: Number },
    o3:         { type: Number },
    is_anomaly: { type: Boolean, default: false },  // Spark Streaming đánh dấu
    timestamp:  { type: Date, default: Date.now, index: true }
}, { collection: 'weather_realtime' });

// ──────────────────────────────────────────────
// Batch Layer: dữ liệu lịch sử đã tổng hợp (Spark Batch)
// ──────────────────────────────────────────────
const WeatherHistoricalSchema = new mongoose.Schema({
    city_id:    { type: Number, required: true, index: true },
    city_name:  { type: String, required: true },
    year:       { type: Number },
    month:      { type: Number, index: true },   // 1–12
    day:        { type: Number },
    avg_temp:   { type: Number },
    min_temp:   { type: Number },
    max_temp:   { type: Number },
    avg_aqi:    { type: Number },
    avg_pm25:   { type: Number },
    avg_pm10:   { type: Number },
    record_count: { type: Number }
}, { collection: 'weather_historical' });

const WeatherRealtime   = mongoose.model('WeatherRealtime',   WeatherRealtimeSchema);
const WeatherHistorical = mongoose.model('WeatherHistorical', WeatherHistoricalSchema);

module.exports = { WeatherRealtime, WeatherHistorical };
