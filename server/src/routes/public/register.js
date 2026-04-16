const router = require('express').Router();
const prisma = require('../../lib/prisma');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { signAccessToken, createRefreshToken } = require('../../lib/tokens');
const { logAudit, getIp } = require('../../lib/audit');

// ── AUTH-03: Student self-registration ──────────────────────────────────────
// POST /api/register/student
router.post('/student', async (req, res, next) => {
  try {
    const { name, email, password, phone, city, preferredCat, preferredCity, stream } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email, and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Check if email already taken
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const passwordHash = await bcrypt.hash(password, 12);
    const ip = getIp(req);

    // Create user + student profile in transaction
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { name, email, passwordHash, role: 'student', phone: phone || null },
      });

      const student = await tx.student.create({
        data: {
          name,
          phone: phone || `stu-${user.id}`, // phone is required+unique on Student
          email,
          city: city || null,
          preferredCat: preferredCat || null,
          preferredCity: preferredCity || null,
          stream: stream || null,
          source: 'Website',
          userId: user.id,
        },
      });

      return { user, student };
    });

    const accessToken = signAccessToken(result.user);
    const refreshToken = await createRefreshToken(result.user.id, req);
    logAudit({ userId: result.user.id, action: 'register', entity: 'student', entityId: result.student.id, ipAddress: ip });

    res.status(201).json({
      accessToken,
      refreshToken,
      user: { id: result.user.id, name, email, role: 'student' },
      studentId: result.student.id,
    });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Email or phone already registered' });
    next(err);
  }
});

// ── AUTH-04: Agent self-registration with referral code ─────────────────────
// POST /api/register/agent
router.post('/agent', async (req, res, next) => {
  try {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password || !phone) {
      return res.status(400).json({ error: 'name, email, password, and phone are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const passwordHash = await bcrypt.hash(password, 12);
    const referralCode = 'AGT-' + crypto.randomBytes(3).toString('hex').toUpperCase(); // e.g. AGT-A1B2C3
    const ip = getIp(req);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { name, email, passwordHash, role: 'agent', phone },
      });

      const agent = await tx.agent.create({
        data: { userId: user.id, referralCode },
      });

      return { user, agent };
    });

    const accessToken = signAccessToken(result.user);
    const refreshToken = await createRefreshToken(result.user.id, req);
    logAudit({ userId: result.user.id, action: 'register', entity: 'agent', entityId: result.agent.id, ipAddress: ip });

    res.status(201).json({
      accessToken,
      refreshToken,
      user: { id: result.user.id, name, email, role: 'agent' },
      referralCode: result.agent.referralCode,
    });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Email or phone already registered' });
    next(err);
  }
});

// ── AUTH-05: College self-registration ──────────────────────────────────────
// POST /api/register/college
// College users can self-signup and link to an existing college, or admin creates their login
router.post('/college', async (req, res, next) => {
  try {
    const { name, email, password, phone, collegeName } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email, and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    // Try to find matching college by name (optional auto-link)
    let collegeId = null;
    if (collegeName) {
      const college = await prisma.college.findFirst({
        where: { name: { contains: collegeName, mode: 'insensitive' }, isActive: true },
        select: { id: true },
      });
      if (college) collegeId = college.id;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const ip = getIp(req);

    const user = await prisma.user.create({
      data: { name, email, passwordHash, role: 'college', phone: phone || null, collegeId },
    });

    const accessToken = signAccessToken(user);
    const refreshToken = await createRefreshToken(user.id, req);
    logAudit({ userId: user.id, action: 'register', entity: 'college', entityId: collegeId, details: { collegeName }, ipAddress: ip });

    res.status(201).json({
      accessToken,
      refreshToken,
      user: { id: user.id, name, email, role: 'college', collegeId },
      linked: !!collegeId,
    });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Email already registered' });
    next(err);
  }
});

module.exports = router;
