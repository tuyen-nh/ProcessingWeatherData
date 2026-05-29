const express = require('express');
const router = express.Router();
const { WeatherRealtime, WeatherHistorical } = require('../models');

// AQI boundary where air quality becomes "Hazardous" (US EPA standard)
const AQI_HAZARDOUS_THRESHOLD = 300;

// ============================================================================
// GET /api/weather/compare
// Phục vụ: Component 4 (Lambda Comparison Dashboard)
// ============================================================================
router.get('/compare', async (req, res) => {
    try {
        const { city_id } = req.query;
        if (!city_id) return res.status(400).json({ error: 'city_id is required' });

        // 1. Lấy dữ liệu Real-time (Speed Layer)
        const currentData = await WeatherRealtime.findOne({ city_id: Number(city_id) })
            .sort({ timestamp: -1 });

        if (!currentData) return res.status(404).json({ error: 'Current real-time data not found' });

        // 2. Lấy baseline lịch sử (Batch Layer) - Ví dụ: Cùng tháng này
        const currentMonth = new Date().getMonth() + 1;

        // Dùng aggregation để tính trung bình của toàn bộ các ngày trong tháng lịch sử
        const historicalBaseline = await WeatherHistorical.aggregate([
            { $match: { city_id: Number(city_id), month: currentMonth } },
            { $group: {
                _id: null,
                historical_avg_temp: { $avg: "$avg_temp" },
                historical_avg_aqi: { $avg: "$avg_aqi" }
            }}
        ]);

        const baseline = historicalBaseline[0] || { historical_avg_temp: currentData.temp, historical_avg_aqi: currentData.aqi_value };

        // 3. Tính toán lệch (Deviation)
        const temp_deviation = currentData.temp - baseline.historical_avg_temp;
        const aqi_deviation = currentData.aqi_value - baseline.historical_avg_aqi;

        res.json({
            city_id: currentData.city_id,
            city_name: currentData.city_name,
            current_temp: currentData.temp,
            historical_avg_temp: baseline.historical_avg_temp,
            current_aqi: currentData.aqi_value,
            historical_avg_aqi: baseline.historical_avg_aqi,
            temp_deviation,
            aqi_deviation
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// GET /api/weather/alerts
// Phục vụ: Hiển thị bất thường thời tiết và ô nhiễm nguy hiểm đang hoạt động
// Query params: city_id (optional), severity (optional: "anomaly" | "hazardous" | "all")
// ============================================================================
router.get('/alerts', async (req, res) => {
    try {
        const { city_id, severity } = req.query;

        // Build base filter: anomaly flag OR AQI vượt ngưỡng Hazardous
        const orConditions = [];

        if (!severity || severity === 'anomaly' || severity === 'all') {
            orConditions.push({ is_anomaly: true });
        }
        if (!severity || severity === 'hazardous' || severity === 'all') {
            orConditions.push({ aqi_value: { $gt: AQI_HAZARDOUS_THRESHOLD } });
        }

        const query = orConditions.length > 1
            ? { $or: orConditions }
            : orConditions[0] || { is_anomaly: true };

        if (city_id) query.city_id = Number(city_id);

        const records = await WeatherRealtime.find(query).sort({ timestamp: -1 });

        const alerts = records.flatMap(d => {
            const entries = [];

            if (d.is_anomaly) {
                entries.push({
                    city_id: d.city_id,
                    city_name: d.city_name,
                    alert_type: 'Heatwave',
                    value: d.temp,
                    threshold_exceeded: null,
                    timestamp: d.timestamp
                });
            }

            if (d.aqi_value > AQI_HAZARDOUS_THRESHOLD) {
                entries.push({
                    city_id: d.city_id,
                    city_name: d.city_name,
                    alert_type: 'Pollution Spike',
                    value: d.aqi_value,
                    threshold_exceeded: AQI_HAZARDOUS_THRESHOLD,
                    timestamp: d.timestamp
                });
            }

            return entries;
        });

        res.json(alerts);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// GET /api/weather/stats
// Phục vụ: Bảng xếp hạng quốc gia và tổng kết môi trường
// ============================================================================
router.get('/stats', async (req, res) => {
    try {
        // Top 5 thành phố nóng nhất (tính trung bình toàn bộ lịch sử)
        const topHottestCities = await WeatherHistorical.aggregate([
            {
                $group: {
                    _id: { city_id: '$city_id', city_name: '$city_name' },
                    avg_temp: { $avg: '$avg_temp' }
                }
            },
            { $sort: { avg_temp: -1 } },
            { $limit: 5 },
            {
                $project: {
                    _id: 0,
                    city_id: '$_id.city_id',
                    city_name: '$_id.city_name',
                    avg_temp: { $round: ['$avg_temp', 2] }
                }
            }
        ]);

        // Top 5 thành phố ô nhiễm nhất
        const topPollutedCities = await WeatherHistorical.aggregate([
            {
                $group: {
                    _id: { city_id: '$city_id', city_name: '$city_name' },
                    avg_aqi: { $avg: '$avg_aqi' }
                }
            },
            { $sort: { avg_aqi: -1 } },
            { $limit: 5 },
            {
                $project: {
                    _id: 0,
                    city_id: '$_id.city_id',
                    city_name: '$_id.city_name',
                    avg_aqi: { $round: ['$avg_aqi', 2] }
                }
            }
        ]);

        // Trung bình quốc gia
        const nationalAgg = await WeatherHistorical.aggregate([
            {
                $group: {
                    _id: null,
                    national_avg_temp: { $avg: '$avg_temp' },
                    national_avg_aqi: { $avg: '$avg_aqi' }
                }
            },
            {
                $project: {
                    _id: 0,
                    national_avg_temp: { $round: ['$national_avg_temp', 2] },
                    national_avg_aqi: { $round: ['$national_avg_aqi', 2] }
                }
            }
        ]);

        const national = nationalAgg[0] || { national_avg_temp: null, national_avg_aqi: null };

        res.json({
            top_hottest_cities: topHottestCities,
            top_polluted_cities: topPollutedCities,
            national_avg_temp: national.national_avg_temp,
            national_avg_aqi: national.national_avg_aqi
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;