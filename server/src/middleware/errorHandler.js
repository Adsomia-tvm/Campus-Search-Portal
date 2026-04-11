/**
 * Centralized error handler — prevents leaking internal details to clients.
 *
 * Usage: In every route, replace:
 *   catch (err) { res.status(500).json({ error: err.message }); }
 * With:
 *   catch (err) { next(err); }
 *
 * This middleware MUST be registered AFTER all routes in index.js.
 */

const { Prisma } = require('@prisma/client');

function errorHandler(err, req, res, _next) {
  const isDev = process.env.NODE_ENV === 'development';

  // Determine HTTP status
  let status = err.status || err.statusCode || 500;
  let clientMessage = 'Something went wrong';

  // Prisma-specific error handling
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002': // Unique constraint violation
        status = 409;
        clientMessage = 'A record with this data already exists';
        break;
      case 'P2025': // Record not found
        status = 404;
        clientMessage = 'Record not found';
        break;
      case 'P2003': // Foreign key constraint violation
        status = 400;
        clientMessage = 'Invalid reference — related record not found';
        break;
      default:
        status = 400;
        clientMessage = 'Invalid request';
    }
  } else if (err instanceof Prisma.PrismaClientValidationError) {
    status = 400;
    clientMessage = 'Invalid data format';
  } else if (err.name === 'ZodError') {
    // Zod validation errors — handled by validate middleware, but just in case
    status = 400;
    clientMessage = 'Validation failed';
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    status = 401;
    clientMessage = 'Invalid or expired token';
  } else if (err.name === 'MulterError') {
    status = 400;
    clientMessage = err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 20MB)' : 'File upload error';
  }

  // Structured log — visible in Vercel function logs
  console.error(JSON.stringify({
    level: 'error',
    method: req.method,
    path: req.path,
    status,
    error: err.message,
    code: err.code,
    userId: req.user?.id,
    timestamp: new Date().toISOString(),
    ...(isDev && { stack: err.stack }),
  }));

  // Safe response to client
  res.status(status).json({
    error: clientMessage,
    ...(isDev && { detail: err.message }),
  });
}

module.exports = errorHandler;
