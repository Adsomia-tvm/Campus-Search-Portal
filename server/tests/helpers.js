/**
 * Shared test helpers — creates tokens, builds request helpers, etc.
 */

const jwt = require('jsonwebtoken');
const http = require('http');

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-campus-search-2026';
const STUDENT_SECRET = process.env.STUDENT_JWT_SECRET || JWT_SECRET;

/**
 * Create a signed admin JWT for testing authenticated endpoints.
 */
function adminToken(overrides = {}) {
  return jwt.sign(
    { id: 1, name: 'Test Admin', email: 'admin@test.com', role: 'admin', ...overrides },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

/**
 * Create a signed staff JWT.
 */
function staffToken(overrides = {}) {
  return jwt.sign(
    { id: 2, name: 'Test Staff', email: 'staff@test.com', role: 'staff', ...overrides },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

/**
 * Create a signed student JWT.
 */
function studentToken(overrides = {}) {
  return jwt.sign(
    { studentId: 1, name: 'Test Student', phone: '9876543210', ...overrides },
    STUDENT_SECRET,
    { expiresIn: '1h' },
  );
}

/**
 * Minimal HTTP request helper that uses Node's built-in http module.
 * No external test HTTP library needed.
 */
function request(app) {
  const server = http.createServer(app);

  function makeRequest(method, path, { body, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
      server.listen(0, () => {
        const port = server.address().port;
        const options = {
          hostname: '127.0.0.1',
          port,
          path,
          method: method.toUpperCase(),
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
        };

        const req = http.request(options, res => {
          let data = '';
          res.on('data', chunk => (data += chunk));
          res.on('end', () => {
            server.close();
            try {
              resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) });
            } catch {
              resolve({ status: res.statusCode, headers: res.headers, body: data });
            }
          });
        });

        req.on('error', err => { server.close(); reject(err); });
        if (body) req.write(JSON.stringify(body));
        req.end();
      });
    });
  }

  return {
    get:  (path, opts) => makeRequest('GET', path, opts),
    post: (path, opts) => makeRequest('POST', path, opts),
    put:  (path, opts) => makeRequest('PUT', path, opts),
  };
}

module.exports = { adminToken, staffToken, studentToken, request };
