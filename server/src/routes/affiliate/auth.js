const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../../lib/prisma');
const { requireAffiliate } = require('../../middleware/auth');

const TOKEN_EXPIRY = '30d';

// POST /api/affiliate/auth/login — login with code OR email + password
router.post('/login', async (req, res, next) => {
  try {
    const { code, password } = req.body || {};
    if (!code || !password) {
      return res.status(400).json({ error: 'Code and password are required' });
    }

    const id = String(code).trim();
    const lower = id.toLowerCase();

    // Affiliates can sign in with either their unique code (e.g. rave_works)
    // or their email — emails are easier to remember and the code field on
    // the login form accepts both. We try code first, then fall back to email.
    let affiliate = await prisma.affiliate.findUnique({ where: { code: lower } });
    if (!affiliate && id.includes('@')) {
      affiliate = await prisma.affiliate.findFirst({ where: { email: id } });
    }

    // Constant-ish response timing — don't leak whether the affiliate exists.
    if (!affiliate || !affiliate.passwordHash || !affiliate.isActive) {
      // Run a dummy hash so timing is similar to a real check
      await bcrypt.compare(password, '$2a$10$invalidsaltinvalidsaltinvalidsaltinvalidsalu');
      const reason = !affiliate ? 'no_match'
                   : !affiliate.passwordHash ? 'no_password_set'
                   : 'inactive';
      return res.status(401).json({
        error: reason === 'no_password_set'
          ? 'Password not set for this affiliate yet. Ask the Campus Search team to set one.'
          : 'Invalid code or password',
      });
    }

    const ok = await bcrypt.compare(password, affiliate.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid code or password' });

    await prisma.affiliate.update({
      where: { id: affiliate.id },
      data: { lastLoginAt: new Date() },
    });

    const token = jwt.sign(
      { role: 'affiliate', affiliateId: affiliate.id, code: affiliate.code },
      process.env.JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );

    res.json({
      token,
      affiliate: {
        id:    affiliate.id,
        name:  affiliate.name,
        code:  affiliate.code,
        type:  affiliate.type,
        paymentCadence: affiliate.paymentCadence,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/affiliate/auth/me — return the logged-in affiliate's own profile
router.get('/me', requireAffiliate, async (req, res, next) => {
  try {
    const a = await prisma.affiliate.findUnique({
      where: { id: req.user.affiliateId },
      select: {
        id: true, name: true, email: true, phone: true, code: true, type: true,
        commissionPerLead: true, commissionPerEnrolled: true, paymentCadence: true,
        upiId: true, panNumber: true, gstNumber: true,
        joinedAt: true, lastLoginAt: true,
      },
    });
    if (!a) return res.status(404).json({ error: 'Affiliate not found' });
    res.json(a);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
