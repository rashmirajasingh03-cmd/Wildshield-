/**
 * Health controller - reports service status, DB connectivity,
 * AI service health and model capabilities.
 */
const os = require('os');
const axios = require('axios');
const pkg = require('../package.json');
const { getConnectionState } = require('../config/db');
const env = require('../config/env');

async function getHealth(req, res) {
  const db = getConnectionState();

  const response = {
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
    aiService: {
      reachable: false,
      modelLoaded: false,
      modelPath: null,
      modelClasses: 0,
      handles: {},
    },
    demoMode: env.demoMode,
    uptimeSeconds: Math.round(process.uptime()),
    host: os.hostname(),
    nodeVersion: process.version,
    timestamp: new Date().toISOString(),
  };

  // Probe AI service lazily (non-fatal)
  try {
    const ai = await axios.get(`${env.aiServiceUrl}/health`, { timeout: 5000 });
    if (ai.data && ai.data.status === 'ok') {
      response.aiService = {
        reachable: true,
        modelLoaded: !!(ai.data.model && ai.data.model.loaded),
        modelPath: ai.data.model ? ai.data.model.path : null,
        modelClasses: ai.data.model ? ai.data.model.classes_count || 0 : 0,
        handles: (ai.data.model && ai.data.model.handles) || {},
      };
    }
  } catch (_) {
    // AI service unreachable - reported as reachable: false
  }

  res.json(response);
}

module.exports = { getHealth };