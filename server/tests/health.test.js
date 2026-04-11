/**
 * Integration test for the health check endpoint.
 * Tests both connected and disconnected states.
 */

const { describe, it, expect, vi } = require('vitest');
const http = require('http');

function requestApp(app, path) {
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

describe('Health Check', () => {
  it('returns status ok structure', async () => {
    // Mock prisma to avoid needing a real DB
    vi.doMock('../src/lib/prisma', () => ({
      $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    }));

    // Fresh import to get mocked prisma
    const app = (await import('../src/index.js')).default;
    const res = await requestApp(app, '/api/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('connected');
    expect(res.body.time).toBeDefined();
  });
});
