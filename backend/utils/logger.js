/**
 * Minimal dependency-free logger with ISO timestamps.
 * Can be replaced by pino/winston later without touching call sites.
 */
function stamp() {
  return new Date().toISOString();
}

module.exports = {
  info: (...args) => console.log(`[${stamp()}] [INFO]`, ...args),
  warn: (...args) => console.warn(`[${stamp()}] [WARN]`, ...args),
  error: (...args) => console.error(`[${stamp()}] [ERROR]`, ...args),
};
