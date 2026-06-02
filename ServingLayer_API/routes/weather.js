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
// History. Per-station daily aggregates over a date range, ascending. Drives
// the History page. Query: ?station_id= (required) &start_date= &end_date=
// (optional 'YYYY-MM-DD'). Computed on-the-fly by aggregating RealTimeReadings
// per date — no separate daily collection needed.
// ============================================================================
router.get('/daily', async (req, res) => {
    try {
        const { station_id, start_date, end_date } = req.query;
        if (!station_id) return res.status(400).json({ error: 'station_id is required' });

        const match = { station_id };
        if (start_date || end_date) {
            match.date = {};
            if (start_date) match.date.$gte = start_date;
            if (end_date) match.date.$lte = end_date;
        }

        const grouped = await RealTimeReading.aggregate([
            { $match: match },
            { $group: {
                _id: '$date',
                avg_temp: { $avg: '$temperature' },
                max_temp: { $max: '$temperature' },
                min_temp: { $min: '$temperature' },
                avg_pm25: { $avg: '$pm25' },
                avg_aqi:  { $avg: '$aqi_index' },
                hours:    { $push: { hour: { $hour: '$timestamp' }, aqi: '$aqi_index' } }
            }},
            { $sort: { _id: 1 } }
        ]);

        const docs = grouped.map((g) => {
            // peak_aqi_hour = hour of the day's max AQI.
            const peak = (g.hours || []).reduce(
                (m, x) => (x.aqi != null && x.aqi > m.aqi ? x : m),
                { hour: 0, aqi: -Infinity }
            );
            const r = (n, d = 1) => (n == null ? null : Math.round(n * 10 ** d) / 10 ** d);
            return {
                date: g._id,
                avg_temp: r(g.avg_temp),
                max_temp: r(g.max_temp),
                min_temp: r(g.min_temp),
                avg_pm25: r(g.avg_pm25, 2),
                avg_aqi: r(g.avg_aqi, 0),
                peak_aqi_hour: peak.hour
            };
        });

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
// Batch Layer. All per-station aggregates (one row per station, ~34).
// ============================================================================
router.get('/provinces', async (req, res) => {
    try {
        const docs = await ProvinceAggregation.find({})
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
// ============================================================================
router.get('/stats', async (req, res) => {
    try {
        const top = (sortField) => ProvinceAggregation.aggregate([
            { $sort: { [sortField]: -1 } },
            { $limit: 5 },
            { $project: { _id: 0, station_id: 1, province: 1, region: 1, avg_temp: 1, avg_pm25: 1 } }
        ]);

        const [topHottest, topPolluted, nationalAgg] = await Promise.all([
            top('avg_temp'),
            top('avg_pm25'),
            ProvinceAggregation.aggregate([
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
            ProvinceAggregation.findOne({ station_id })
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

// ============================================================================
// GET /api/weather/history
// Batch Layer. Avg PM2.5 per region over time (date series).
// Query: ?region=North|Central|South (optional — omit for all region columns).
//
// NOTE: This is the ONLY date-dimensioned batch view available today
// (BatchHistoricalAggregations is a region pivot). Full per-day-per-station
// history (avg_temp/min_temp/max_temp/avg_aqi per day) requires the batch job
// to emit a per-day-per-station aggregation first — see plan follow-ups.
// ============================================================================
router.get('/history', async (req, res) => {
    try {
        const { region } = req.query;

        const docs = await BatchHistorical.find({})
            .sort({ date: 1 })
            .select('-_id -__v')
            .lean();

        if (!region) return res.json(docs);

        // Project just the requested region column alongside the date.
        const series = docs.map((d) => ({ date: d.date, avg_pm25: d[region] ?? null }));
        res.json(series);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
