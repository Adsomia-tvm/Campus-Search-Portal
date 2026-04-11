/**
 * Integration tests for the validate middleware.
 * Tests that the middleware correctly parses Zod schemas and returns structured errors.
 */

const { describe, it, expect } = require('vitest');
const express = require('express');
const http = require('http');
const validate = require('../src/middleware/validate');
const { adminLogin } = require('../src/middleware/schemas');

function requestApp(app, method, path, body) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      const options = {
        hostname: '127.0.0.1', port, path,
        method: method.toUpperCase(),
        headers: { 'Content-Type': 'application/json' },
      };
      const req = http.request(options, res => {
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => {
          server.close();
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        });
      });
      req.on('error', err => { server.close(); reject(err); });
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  });
}

describe('Validate Middleware', () => {
  it('passes valid request through', async () => {
    const app = express();
    app.use(express.json());
    app.post('/test', validate(adminLogin), (_req, res) => res.json({ ok: true }));

    const res = await requestApp(app, 'POST', '/test', { email: 'a@b.com', password: '123456' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('rejects invalid request with structured errors', async () => {
    const app = express();
    app.use(express.json());
    app.post('/test', validate(adminLogin), (_req, res) => res.json({ ok: true }));

    const res = await requestApp(app, 'POST', '/test', { email: 'not-email', password: '12' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(Array.isArray(res.body.issues)).toBe(true);
    expect(res.body.issues.length).toBeGreaterThan(0);
    // Should have field-level error messages
    const fields = res.body.issues.map(i => i.field);
    expect(fields).toContain('email');
  });

  it('strips body/query/params prefix from field paths', async () => {
    const app = express();
    app.use(express.json());
    app.post('/test', validate(adminLogin), (_req, res) => res.json({ ok: true }));

    const res = await requestApp(app, 'POST', '/test', {});
    expect(res.status).toBe(400);
    // Field should be "email" not "body.email"
    const emailIssue = res.body.issues.find(i => i.field === 'email');
    expect(emailIssue).toBeDefined();
  });
});
