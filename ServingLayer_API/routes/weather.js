const express = require('express');
const router = express.Router();
const { WeatherRealtime, WeatherHistorical } = require('../models');

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

module.exports = router;