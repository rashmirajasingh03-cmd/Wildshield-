/**
 * Centralized environment configuration.
 * All env access happens here so no other module reads process.env directly.
 */
require('dotenv').config();

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',

  port: parseInt(process.env.PORT || '5000', 10),

  // MongoDB (Phase 1: connection layer only; models arrive in Phase 3)
  mongodbUri:
    process.env.MONGODB_URI || 'mongodb://localhost:27017/wildshield',

  // CORS origins allowed to call the API (comma separated)
  corsOrigins: (
    process.env.CORS_ORIGIN ||
    'http://localhost:5000,http://127.0.0.1:5000'
  )
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  rateLimitWindowMs: parseInt(
    process.env.RATE_LIMIT_WINDOW_MS || '900000',
    10
  ), // 15 minutes
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),

  // Serve the frontend folder from the backend origin (single-origin demo mode)
  staticFrontend: process.env.STATIC_FRONTEND !== 'false',

  // AI microservice location (used starting Phase 7 integration)
  aiServiceUrl: process.env.AI_SERVICE_URL || 'http://localhost:8000',

  // Reserved for Phase 3 authentication - do NOT put real secrets in code
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',

  // Reserved for Phase 4 file storage
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB || '200', 10),

  // Demo mode (Phase 1 flag only; sample data generation arrives later,
  // and any demo output must be clearly labeled "DEMO DATA")
  demoMode: process.env.DEMO_MODE === 'true',
};

if (env.isProd && !env.jwtSecret) {
  // Fail loudly in production; development continues until auth lands in Phase 3
  console.warn(
    '[config] WARNING: JWT_SECRET is not set in production mode.'
  );
}

module.exports = env;
