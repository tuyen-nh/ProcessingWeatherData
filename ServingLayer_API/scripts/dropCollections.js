// One-off: drop AQIStream_avg + HourlyAggregations before repurposing
// AQIStream_avg to hold hourly-aggregated data (VN +7). Run once:
//   node scripts/dropCollections.js
require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI not set (ServingLayer_API/.env)');
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  for (const name of ['AQIStream_avg', 'HourlyAggregations']) {
    try {
      await db.dropCollection(name);
      console.log(`dropped ${name}`);
    } catch (e) {
      console.log(`skip ${name}: ${e.codeName || e.message}`);
    }
  }
  await mongoose.disconnect();
  console.log('done');
})().catch((e) => { console.error(e); process.exit(1); });
