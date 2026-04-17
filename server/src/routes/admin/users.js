const router = require('express').Router();
const prisma = require('../../lib/prisma');
const bcrypt = require('bcryptjs');
const { requireAdmin, requireTeamMember } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { createUser, updateUser, idParam } = require('../../middleware/schemas');

// ── Whitelist: prevent privilege escalation on user updates ──────────────────
function pickUserUpdateFields(body) {
  const allowed = ['name', 'email', 'phone', 'isActive'];
  const data = {};
  for (const key of allowed) {
    if (body[key] !== undefined) data[key] = body[key];
  }
  return data;
}

const USER_SELECT = {
  id: true, name: true, email: true, role: true, phone: true, isActive: true, createdAt: true,
  consultantColleges: { select: { id: true, college: { select: { id: true, name: true, city: true } } } },
};

// GET /api/admin/users — admin sees all, others see only themselves
router.get('/', requireTeamMember, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: USER_SELECT,
      });
      return res.json([user]);
    }
    const users = await prisma.user.findMany({
      select: USER_SELECT,
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
    res.json(users);
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/users — admin creates team members
router.post('/', requireAdmin, validate(createUser), async (req, res, next) => {
  try {
    const { name, email, password, role, phone, collegeIds } = req.body;
    const passwordHash = await bcrypt.hash(password, 12);

    const userData = {
      name, email, passwordHash, role: role || 'staff', phone,
    };

    // Consultant: link to assigned colleges
    if (role === 'consultant' && collegeIds?.length) {
      userData.consultantColleges = { create: collegeIds.map(id => ({ collegeId: Number(id) })) };
    }

    // College user: link to their college
    if (role === 'college' && req.body.collegeId) {
      userData.collegeId = Number(req.body.collegeId);
    }

    // Agent: auto-create agent profile with referral code
    if (role === 'agent') {
      const code = 'AGT-' + Math.random().toString(36).substring(2, 6).toUpperCase();
      userData.agent = { create: { referralCode: code, commissionRate: 5.0 } };
    }

    const user = await prisma.user.create({ data: userData, select: USER_SELECT });
    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/users/:id — update user info (role change NOT allowed here)
router.put('/:id', requireAdmin, validate(updateUser), async (req, res, next) => {
  try {
    const data = pickUserUpdateFields(req.body);

    // Only hash password if provided
    if (req.body.password) {
      data.passwordHash = await bcrypt.hash(req.body.password, 12);
    }

    const user = await prisma.user.update({
      where: { id: Number(req.params.id) },
      data,
      select: { id: true, name: true, email: true, role: true, isActive: true, phone: true },
    });
    res.json(user);
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/users/:id/colleges — set consultant's assigned colleges
router.put('/:id/colleges', requireAdmin, async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    const { collegeIds } = req.body;

    if (!Array.isArray(collegeIds)) {
      return res.status(400).json({ error: 'collegeIds must be an array' });
    }

    // Delete existing, then recreate in a transaction
    await prisma.$transaction([
      prisma.consultantCollege.deleteMany({ where: { userId } }),
      ...(collegeIds.length
        ? [prisma.consultantCollege.createMany({
            data: collegeIds.map(id => ({ userId, collegeId: Number(id) })),
            skipDuplicates: true,
          })]
        : []),
    ]);

    const updated = await prisma.consultantCollege.findMany({
      where: { userId },
      select: { college: { select: { id: true, name: true, city: true } } },
    });
    res.json({ assigned: updated.map(r => r.college) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
