const express = require('express');
const cors = require('cors');
const weatherRoutes = require('./routes/weather');

// Builds the Express app without starting a listener — keeps it importable for tests.
const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/weather', weatherRoutes);

module.exports = app;
