const mongoose = require('mongoose');

// Single Mongo connection helper. Reads the URI from the environment so creds
// stay out of source. Returns the connect promise for the caller to await.
function connectDb() {
    const uri = process.env.MONGO_URI;
    if (!uri) {
        throw new Error('MONGO_URI is not set (check ServingLayer_API/.env)');
    }

    mongoose.connection.on('connected', () => console.log('✅ MongoDB connected'));
    mongoose.connection.on('error', (err) => console.error('❌ MongoDB error:', err.message));

    return mongoose.connect(uri);
}

module.exports = connectDb;
