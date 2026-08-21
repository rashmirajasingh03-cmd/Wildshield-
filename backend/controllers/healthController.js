/**
 * Health controller - Phase 1 verification endpoint.
 * Reports service status, DB connectivity and basic runtime info.
 */
const os = require('os');
const pkg = require('../package.json');
const { getConnectionState } = require('../config/db');
const env = require('../config/env');

async function getHealth(req, res) {
  const db = getConnectionState();
  res.json({
    success: true,
    service: 'wildshield-backend',
    version: pkg.version,
    status: 'ok',
    environment: env.nodeEnv,
    database: {
      engine: 'mongodb',
      state: db.name,
      connected: db.code === 1,
    },
    aiServiceUrl: env.aiServiceUrl,
    demoMode: env.demoMode,
    uptimeSeconds: Math.round(process.uptime()),
    host: os.hostname(),
    nodeVersion: process.version,
    timestamp: new Date().toISOString(),
  });
}

module.exports = { getHealth };
