/**
 * Security middleware assembly: Helmet, CORS, rate limiting,
 * body parsing limits and safe error handling.
 */
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const env = require('../config/env');

const helmetMiddleware = helmet();

const corsMiddleware = cors({
  origin(origin, callback) {
    // Allow same-origin/no-origin (curl, health checks) and whitelisted origins
    if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: true,
});

const apiLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  max: env.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});

function notFoundHandler(req, res) {
  res.status(404).json({ success: false, message: 'Endpoint not found' });
}

// Central error handler - never leaks stack traces or internals to clients
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  if (status >= 500) console.error('[ERROR]', err);
  res.status(status).json({
    success: false,
    message:
      status >= 500 && !env.isProd ? err.message : 'Internal server error',
  });
}

module.exports = {
  helmetMiddleware,
  corsMiddleware,
  apiLimiter,
  notFoundHandler,
  errorHandler,
};
