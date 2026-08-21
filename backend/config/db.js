/**
 * MongoDB connection layer (Mongoose).
 * Phase 1 scope: connectivity + graceful failure so services can start
 * without a running database. Models are added in Phase 3+.
 *
 * The storage abstraction is designed so the local Mongo instance can later
 * be swapped for Atlas or another managed instance via MONGODB_URI only.
 */
const mongoose = require('mongoose');
const env = require('./env');
const logger = require('../utils/logger');

mongoose.set('strictQuery', true);

const STATE_NAMES = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

function getConnectionState() {
  const state = mongoose.connection.readyState;
  return {
    code: state,
    name: STATE_NAMES[state] || 'unknown',
  };
}

async function connectDB() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  try {
    logger.info(`Connecting to MongoDB...`);
    await mongoose.connect(env.mongodbUri, {
      serverSelectionTimeoutMS: 5000,
    });
    logger.info('MongoDB connected');
    return mongoose.connection;
  } catch (err) {
    logger.warn(
      `MongoDB unavailable (${err.message}). ` +
        'Backend continues in degraded mode - run "docker compose up mongo" ' +
        'or start a local mongod to enable full functionality.'
    );
    return null;
  }
}

async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    logger.info('MongoDB disconnected');
  }
}

module.exports = { connectDB, disconnectDB, getConnectionState };
