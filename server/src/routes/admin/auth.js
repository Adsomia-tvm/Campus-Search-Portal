const router = require('express').Router();
const prisma = require('../../lib/prisma');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { requireAuth } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { adminLogin, adminSetup } = require('../../middleware/schemas');

// ── Per-account lockout (in-memory — resets on cold start, good enough for serverless) ──
const loginAttempts = new Map(); // email → { count, lockedUntil }
const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

function checkLockout(email) {
  const record = loginAttempts.get(email);
  if (!record) return false;
  if (record.lockedUntil && record.lockedUntil > Date.now()) return true;
  if (record.lockedUntil && record.lockedUntil <= Date.now()) {
    loginAttempts.delete(email); // lockout expired
    return false;
  }
  return false;
}

function recordFailedAttempt(email) {
  const record = loginAttempts.get(email) || { count: 0, lockedUntil: null };
  record.count += 1;
  if (record.count >= MAX_ATTEMPTS) {
    record.lockedUntil = Date.now() + LOCKOUT_MINUTES * 60 * 1000;
  }
  loginAttempts.set(email, record);
}

function clearAttempts(email) {
  loginAttempts.delete(email);
}

// POST /api/auth/login
router.post('/login', validate(adminLogin), async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Check account lockout
    if (checkLockout(email)) {
      return res.status(429).json({ error: `Account temporarily locked. Try again in ${LOCKOUT_MINUTES} minutes.` });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      recordFailedAttempt(email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      recordFailedAttempt(email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Successful login — clear any failed attempts
    clearAttempts(email);

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '4h' }
    );

    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => res.json(req.user));

// POST /api/auth/setup — create first admin (only if no users exist)
router.post('/setup', validate(adminSetup), async (req, res, next) => {
  try {
    const count = await prisma.user.count();
    if (count > 0) return res.status(400).json({ error: 'Setup already done' });

    const { name, email, password } = req.body;
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({ data: { name, email, passwordHash, role: 'admin' } });
    res.json({ message: 'Admin created', userId: user.id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
