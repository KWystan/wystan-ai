





// ── Centralized error handling ─────────────────────────────────────

/**
 * Application error with an HTTP status code.
 * Throw from any async route handler to produce a structured response.
 */
class AppError extends Error {
  /**
   * @param {string}  message    Human-readable error detail
   * @param {number}  statusCode HTTP status (default 500)
   * @param {object}  [options]
   * @param {string}  [options.log]  Optional label for console.error
   */
  constructor(message, statusCode = 500, { log } = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    if (log) this.logLabel = log;
  }
}

/**
 * Wraps an async route handler so rejected promises are forwarded to
 * the Express error middleware via next(err).
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Express error-handling middleware (4-param signature).
 * Mount LAST in the middleware chain.
 */
function errorHandler(err, req, res, next) {
  // Known application errors
  if (err instanceof AppError) {
    if (err.logLabel) console.error(`${err.logLabel}:`, err.message);
    return res.status(err.statusCode).json({ error: err.message });
  }

  // Unexpected errors — log full stack, return generic message
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Something went wrong.' });
}

module.exports = { AppError, asyncHandler, errorHandler };
