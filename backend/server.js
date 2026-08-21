/**
 * WildShield AI - Backend API server (Phase 1)
 *
 * Responsibilities in this phase:
 *  - Express app with security middleware (Helmet, CORS, rate limiting)
 *  - Health check endpoint (/api/health)
 *  - Auth stub endpoints (real JWT auth arrives in Phase 3)
 *  - MongoDB connection layer (graceful degraded mode if DB is down)
 *  - Optional static hosting of the frontend for single-origin demos
 *
 * Video upload, analysis jobs and AI integration arrive in Phases 4-7.
 */
const path = require('path');
const express = require('express');

const env = require('./config/env');
const logger = require('./utils/logger');
const { connectDB, disconnectDB } = require('./config/db');
const {
  helmetMiddleware,
  corsMiddleware,
  apiLimiter,
  notFoundHandler,
  errorHandler,
} = require('./middleware/security');
const routes = require('./routes');

const app = express();

// --- Security & parsing -----------------------------------------------------
app.disable('x-powered-by');
app.use(helmetMiddleware);
app.use(corsMiddleware);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// --- API --------------------------------------------------------------------
app.use('/api', apiLimiter, routes);

// --- Static frontend (single-origin demo mode) ------------------------------
if (env.staticFrontend) {
  const frontendDir = path.join(__dirname, '..', 'frontend');
  app.use(express.static(frontendDir));
  logger.info(`Serving static frontend from ${frontendDir}`);
}

// --- Errors -----------------------------------------------------------------
app.use(notFoundHandler);
app.use(errorHandler);

// --- Boot -------------------------------------------------------------------
let server;

async function start() {
  // DB connect is non-blocking: Phase 1 must start even without MongoDB
  await connectDB();

  server = app.listen(env.port, () => {
    logger.info(
      `WildShield backend listening on http://localhost:${env.port} ` +
        `(env=${env.nodeEnv}, demoMode=${env.demoMode})`
    );
  });
  return server;
}

async function shutdown(signal) {
  logger.info(`${signal} received - shutting down...`);
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await disconnectDB();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

if (require.main === module) {
  start().catch((err) => {
    logger.error('Fatal startup error:', err);
    process.exit(1);
  });
}

module.exports = app;
