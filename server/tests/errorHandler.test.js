/**
 * Integration tests for the centralized error handler.
 * Verifies that internal details are not leaked to clients.
 */

const { describe, it, expect } = require('vitest');
const express = require('express');
const errorHandler = require('../src/middleware/errorHandler');
const { Prisma } = require('@prisma/client');

function createTestApp(errorToThrow) {
  const app = express();
  app.get('/test', (_req, _res, next) => next(errorToThrow));
  app.use(errorHandler);
  return app;
}

function makeRequest(app, path = '/test') {
  const http = require('http');
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      http.get(`http://127.0.0.1:${port}${path}`, res => {
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => {
          server.close();
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        });
      }).on('error', err => { server.close(); reject(err); });
    });
  });
}

describe('Error Handler', () => {
  it('returns 409 for Prisma unique constraint violation', async () => {
    const err = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '5.10.0',
    });
    const app = createTestApp(err);
    const res = await makeRequest(app);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('A record with this data already exists');
    expect(res.body.detail).toBeUndefined(); // no leak in non-dev
  });

  it('returns 404 for Prisma record not found', async () => {
    const err = new Prisma.PrismaClientKnownRequestError('Record not found', {
      code: 'P2025',
      clientVersion: '5.10.0',
    });
    const app = createTestApp(err);
    const res = await makeRequest(app);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Record not found');
  });

  it('returns 400 for Prisma FK violation', async () => {
    const err = new Prisma.PrismaClientKnownRequestError('FK constraint', {
      code: 'P2003',
      clientVersion: '5.10.0',
    });
    const app = createTestApp(err);
    const res = await makeRequest(app);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid reference');
  });

  it('returns 500 with generic message for unknown errors', async () => {
    const err = new Error('Internal DB pool exhausted — connection limit reached');
    const app = createTestApp(err);
    const res = await makeRequest(app);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Something went wrong');
    // CRITICAL: internal error message must NOT leak
    expect(JSON.stringify(res.body)).not.toContain('pool exhausted');
  });

  it('returns 401 for JWT errors', async () => {
    const err = new Error('jwt expired');
    err.name = 'TokenExpiredError';
    const app = createTestApp(err);
    const res = await makeRequest(app);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid or expired token');
  });
});
