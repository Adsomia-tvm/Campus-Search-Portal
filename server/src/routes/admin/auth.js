const router = require('express').Router();
const prisma = require('../../lib/prisma');
const bcrypt = require('bcryptjs');
const { requireAuth } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { adminLogin, adminSetup } = require('../../middleware/schemas');
const { signAccessToken, createRefreshToken, rotateRefreshToken, revokeAllSessions } = require('../../lib/tokens');
const { logAudit, getIp } = require('../../lib/audit');

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

// POST /api/auth/login
router.post('/login', validate(adminLogin), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const ip = getIp(req);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      logAudit({ action: 'login_failed', details: { email, reason: 'not_found' }, ipAddress: ip });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check DB-backed lockout
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      logAudit({ userId: user.id, action: 'login_locked', ipAddress: ip });
      return res.status(429).json({ error: `Account temporarily locked. Try again in ${LOCKOUT_MINUTES} minutes.` });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      const attempts = (user.loginAttempts || 0) + 1;
      const lockUpdate = attempts >= MAX_ATTEMPTS
        ? { loginAttempts: attempts, lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) }
        : { loginAttempts: attempts };
      await prisma.user.update({ where: { id: user.id }, data: lockUpdate });
      logAudit({ userId: user.id, action: 'login_failed', details: { attempt: attempts }, ipAddress: ip });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Success — clear lockout, update lastLoginAt
    await prisma.user.update({
      where: { id: user.id },
      data: { loginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    const accessToken = signAccessToken(user);
    const refreshToken = await createRefreshToken(user.id, req);

    logAudit({ userId: user.id, action: 'login', ipAddress: ip });

    res.json({
      token: accessToken,        // backward compat
      accessToken,
      refreshToken,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, collegeId: user.collegeId },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/refresh — exchange refresh token for new access + refresh pair
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'refreshToken required' });

    const result = await rotateRefreshToken(refreshToken, req);
    if (!result) return res.status(401).json({ error: 'Invalid or expired refresh token' });

    res.json({ accessToken: result.accessToken, refreshToken: result.refreshToken, user: result.user });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout — revoke all sessions for the user
router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    await revokeAllSessions(req.user.id);
    logAudit({ userId: req.user.id, action: 'logout', ipAddress: getIp(req) });
    res.json({ message: 'Logged out' });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, email: true, role: true, phone: true, collegeId: true, lastLoginAt: true, isActive: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/setup — create first admin (only if no users exist)
router.post('/setup', validate(adminSetup), async (req, res, next) => {
  try {
    const count = await prisma.user.count();
    if (count > 0) return res.status(400).json({ error: 'Setup already done' });

    const { name, email, password } = req.body;
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({ data: { name, email, passwordHash, role: 'admin' } });
    logAudit({ userId: user.id, action: 'setup', details: { email }, ipAddress: getIp(req) });
    res.json({ message: 'Admin created', userId: user.id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
