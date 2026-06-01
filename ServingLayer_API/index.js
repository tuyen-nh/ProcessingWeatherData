require('dotenv').config();
const app = require('./app');
const connectDb = require('./db');

const PORT = process.env.PORT || 3000;

connectDb()
    .then(() => {
        app.listen(PORT, () => console.log(`🚀 Serving Layer API on http://localhost:${PORT}`));
    })
    .catch((err) => {
        console.error('❌ Failed to start: could not connect to MongoDB:', err.message);
        process.exit(1);
    });
