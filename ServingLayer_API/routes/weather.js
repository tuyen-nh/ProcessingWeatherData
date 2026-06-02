const express = require('express');
const router = express.Router();
const { RealTimeReading, StreamAvg, ProvinceAggregation, BatchHistorical } = require('../models');

// aqi_alert / temp_alert string values that StreamingAQI emits and that we treat
// as alert-worthy. Anything outside these is "fine" (Good/Moderate/Normal/...).
const ALERT_AQI = ['Unhealthy for Sensitive Groups', 'Unhealthy', 'Very Unhealthy', 'Hazardous'];
const ALERT_TEMP = ['Hot', 'Extreme Heat', 'Too Cold'];

// ============================================================================
// GET /api/weather/realtime
// Speed Layer. Latest reading per station. Optional ?station_id= or ?province=
// narrows to a single station/province (still newest-first).
// ============================================================================
router.get('/realtime', async (req, res) => {
    try {
        const { station_id, province } = req.query;
        const match = {};
        if (station_id) match.station_id = station_id;
        if (province) match.province = province;

        // Newest first, then collapse to one doc per station (the latest).
        const docs = await RealTimeReading.aggregate([
            { $match: match },
            { $sort: { timestamp: -1 } },
            { $group: { _id: '$station_id', doc: { $first: '$$ROOT' } } },
            { $replaceRoot: { newRoot: '$doc' } },
            { $project: { _id: 0, __v: 0 } },
            { $sort: { station_id: 1 } }
        ]);

        res.json(docs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// GET /api/weather/realtime/series
// Speed Layer time-series. Last N readings for one station, oldest-first (for
// charting metric change over time). Query: ?station_id= (required) &limit=30
// ============================================================================
router.get('/realtime/series', async (req, res) => {
    try {
        const { station_id } = req.query;
        if (!station_id) return res.status(400).json({ error: 'station_id is required' });

        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 500);

        const docs = await RealTimeReading.find({ station_id })
            .sort({ timestamp: -1 })
            .limit(limit)
            .select('-_id timestamp temperature humidity pm25 no2 aqi_index')
            .lean();

        res.json(docs.reverse()); // oldest → newest for the x-axis
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// GET /api/weather/hourly
// History day-timeline. Hourly readings (0:00→23:00) for one station, ascending.
// Drives the Realtime page's day chart. Query: ?station_id= (required) &date=
// (optional — defaults to the latest day). Source: RealTimeReadings filtered by
// date (the same collection that holds the live feed + the seeded 30-day history).
// ============================================================================
router.get('/hourly', async (req, res) => {
    try {
        const { station_id } = req.query;
        if (!station_id) return res.status(400).json({ error: 'station_id is required' });

        let { date } = req.query;
        if (!date) {
            const latest = await RealTimeReading.findOne({ station_id }).sort({ timestamp: -1 }).lean();
            date = latest?.date;
        }

        const docs = await RealTimeReading.find(date ? { station_id, date } : { station_id })
            .sort({ timestamp: 1 })
            .select('-_id timestamp temperature humidity pm25 no2 aqi_index')
            .lean();

        // hour 0–23 derived from the timestamp (stored as UTC midnight + hour).
        docs.forEach((d) => { d.hour = new Date(d.timestamp).getUTCHours(); });

        res.json(docs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// GET /api/weather/daily
// Batch Layer. Per-station daily aggregates over a date range, ascending. Drives
// the History page. Query: ?station_id= (required) &start_date= &end_date=
// (optional 'YYYY-MM-DD'). Source: ProvinceAggregations (per-day per-station).
// ============================================================================
router.get('/daily', async (req, res) => {
    try {
        const { station_id, start_date, end_date } = req.query;
        if (!station_id) return res.status(400).json({ error: 'station_id is required' });

        const filter = { station_id };
        if (start_date || end_date) {
            filter.date = {};
            if (start_date) filter.date.$gte = start_date;
            if (end_date) filter.date.$lte = end_date;
        }

        const docs = await ProvinceAggregation.find(filter)
            .sort({ date: 1 })
            .select('-_id date avg_temp max_temp min_temp avg_pm25 avg_aqi peak_aqi_hour')
            .lean();

        res.json(docs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// GET /api/weather/stream-avg
// Speed Layer. 15-minute windowed averages per province. Optional ?province=.
// ============================================================================
router.get('/stream-avg', async (req, res) => {
    try {
        const { province } = req.query;
        const filter = province ? { province } : {};

        const docs = await StreamAvg.find(filter)
            .sort({ 'window.start': -1 })
            .limit(200)
            .select('-_id -__v');

        res.json(docs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// GET /api/weather/provinces
// Batch Layer. Per-station 30-day average summary (one row per station, ~34).
// Source: BatchHistoricalAggregations.
// ============================================================================
router.get('/provinces', async (req, res) => {
    try {
        const docs = await BatchHistorical.find({})
            .sort({ region: 1, province: 1 })
            .select('-_id -__v');

        res.json(docs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// GET /api/weather/stats
// Batch Layer. Top-5 hottest + top-5 most polluted stations + national avg.
// Source: BatchHistoricalAggregations (per-station 30-day summary).
// ============================================================================
router.get('/stats', async (req, res) => {
    try {
        const top = (sortField) => BatchHistorical.aggregate([
            { $sort: { [sortField]: -1 } },
            { $limit: 5 },
            { $project: { _id: 0, station_id: 1, province: 1, region: 1, avg_temp: 1, avg_pm25: 1 } }
        ]);

        const [topHottest, topPolluted, nationalAgg] = await Promise.all([
            top('avg_temp'),
            top('avg_pm25'),
            BatchHistorical.aggregate([
                { $group: {
                    _id: null,
                    national_avg_temp: { $avg: '$avg_temp' },
                    national_avg_pm25: { $avg: '$avg_pm25' }
                }},
                { $project: {
                    _id: 0,
                    national_avg_temp: { $round: ['$national_avg_temp', 2] },
                    national_avg_pm25: { $round: ['$national_avg_pm25', 2] }
                }}
            ])
        ]);

        const national = nationalAgg[0] || { national_avg_temp: null, national_avg_pm25: null };

        res.json({
            top_hottest_stations: topHottest,
            top_polluted_stations: topPolluted,
            national_avg_temp: national.national_avg_temp,
            national_avg_pm25: national.national_avg_pm25
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// GET /api/weather/alerts
// Speed Layer. Latest reading per station, filtered to alert-worthy conditions.
// Query: ?province=  ?severity=aqi|temp|all (default all)
// ============================================================================
router.get('/alerts', async (req, res) => {
    try {
        const { province, severity = 'all' } = req.query;
        const match = {};
        if (province) match.province = province;

        // Collapse to the latest reading per station first.
        const latest = await RealTimeReading.aggregate([
            { $match: match },
            { $sort: { timestamp: -1 } },
            { $group: { _id: '$station_id', doc: { $first: '$$ROOT' } } },
            { $replaceRoot: { newRoot: '$doc' } }
        ]);

        const wantAqi = severity === 'all' || severity === 'aqi';
        const wantTemp = severity === 'all' || severity === 'temp';

        const alerts = latest.flatMap((d) => {
            const out = [];
            if (wantAqi && ALERT_AQI.includes(d.aqi_alert)) {
                out.push({
                    station_id: d.station_id,
                    province: d.province,
                    region: d.region,
                    alert_type: 'Air Quality',
                    level: d.aqi_alert,
                    value: d.aqi_index,
                    timestamp: d.timestamp
                });
            }
            if (wantTemp && ALERT_TEMP.includes(d.temp_alert)) {
                out.push({
                    station_id: d.station_id,
                    province: d.province,
                    region: d.region,
                    alert_type: 'Temperature',
                    level: d.temp_alert,
                    value: d.temperature,
                    timestamp: d.timestamp
                });
            }
            return out;
        });

        res.json(alerts);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// GET /api/weather/compare
// Lambda comparison: latest real-time reading (Speed) vs the station's
// full-history baseline (Batch). Query: ?station_id= (required)
// ============================================================================
router.get('/compare', async (req, res) => {
    try {
        const { station_id } = req.query;
        if (!station_id) return res.status(400).json({ error: 'station_id is required' });

        const [current, baseline] = await Promise.all([
            RealTimeReading.findOne({ station_id }).sort({ timestamp: -1 }),
            BatchHistorical.findOne({ station_id })
        ]);

        if (!current) return res.status(404).json({ error: 'No real-time data for this station' });
        if (!baseline) return res.status(404).json({ error: 'No historical baseline for this station' });

        res.json({
            station_id,
            province: current.province,
            region: current.region,
            current_temp: current.temperature,
            historical_avg_temp: baseline.avg_temp,
            current_pm25: current.pm25,
            historical_avg_pm25: baseline.avg_pm25,
            current_aqi: current.aqi_index,
            temp_deviation: current.temperature != null && baseline.avg_temp != null
                ? Math.round((current.temperature - baseline.avg_temp) * 10) / 10 : null,
            pm25_deviation: current.pm25 != null && baseline.avg_pm25 != null
                ? Math.round((current.pm25 - baseline.avg_pm25) * 100) / 100 : null
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
