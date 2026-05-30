const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// 1. Kết nối MongoDB (sử dụng chuỗi kết nối từ file README của bạn)
const MONGO_URI = "mongodb+srv://tuyen:tuyen@cluster0.tkzrw9q.mongodb.net/Big_Data?appName=Cluster0"; 
mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ Đã kết nối thành công tới MongoDB!"))
  .catch(err => console.error("❌ Lỗi kết nối MongoDB:", err));

// 2. Định nghĩa Schema cho 2 Collection
const realtimeSchema = new mongoose.Schema({
    city_id: String,
    city_name: String,
    temp: Number,
    humidity: Number,
    pm2_5: Number,
    aqi_value: Number,
    aqi_category: String,
    is_anomaly: Boolean,
    timestamp: Date
}, { collection: 'weather_realtime' });

const Realtime = mongoose.model('Realtime', realtimeSchema);

const historySchema = new mongoose.Schema({
    city_id: String,
    date: Date, 
    avg_temp: Number,
    max_temp: Number,
    min_temp: Number,
    avg_aqi: Number,
    peak_aqi_hour: String
}, { collection: 'weather_historical' });

const History = mongoose.model('History', historySchema);

// 3. Viết các API Endpoint

// 3.1. API Realtime
app.get('/api/weather/realtime', async (req, res) => {
    try {
        const cityId = req.query.city_id;
        if (!cityId) return res.status(400).json({ error: "Thiếu tham số city_id" });

        // Lấy record mới nhất
        const data = await Realtime.findOne({ city_id: cityId })
            .sort({ timestamp: -1 })
            .select('-_id city_id city_name temp humidity pm2_5 aqi_value aqi_category is_anomaly timestamp');

        if (!data) return res.status(404).json({ message: "Không có dữ liệu realtime" });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: "Lỗi Server" });
    }
});

// 3.2. API History
app.get('/api/weather/history', async (req, res) => {
    try {
        const { city_id, start_date, end_date } = req.query;
        if (!city_id || !start_date || !end_date) {
            return res.status(400).json({ error: "Thiếu city_id, start_date hoặc end_date" });
        }

        const data = await History.find({
            city_id: city_id,
            date: { $gte: new Date(start_date), $lte: new Date(end_date) }
        })
        .sort({ date: 1 })
        .select('-_id city_id date avg_temp max_temp min_temp avg_aqi peak_aqi_hour');

        res.json(data);
    } catch (error) {
        res.status(500).json({ error: "Lỗi Server" });
    }
});

// 4. Chạy server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 API Server đang chạy tại http://localhost:${PORT}`);
});