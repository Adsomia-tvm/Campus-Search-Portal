const router = require('express').Router();
const prisma = require('../../lib/prisma');
const bcrypt = require('bcryptjs');
const { requireAdmin, requireTeamMember } = require('../../middleware/auth');

// GET /api/admin/users — admin sees all, others see only themselves
router.get('/', requireTeamMember, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      // Non-admins can only see their own profile
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { id: true, name: true, email: true, role: true, phone: true, isActive: true,
          consultantColleges: { select: { college: { select: { id: true, name: true, city: true } } } }
        },
      });
      return res.json([user]);
    }
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, phone: true, isActive: true, createdAt: true,
        consultantColleges: { select: { id: true, college: { select: { id: true, name: true, city: true } } } }
      },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/users — admin creates team members
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { name, email, password, role, phone, collegeIds } = req.body;
    if (!['admin', 'staff', 'consultant'].includes(role))
      return res.status(400).json({ error: 'Invalid role. Use: admin, staff, consultant' });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        name, email, passwordHash, role: role || 'staff', phone,
        ...(role === 'consultant' && collegeIds?.length ? {
          consultantColleges: {
            create: collegeIds.map(id => ({ collegeId: Number(id) }))
          }
        } : {}),
      },
      select: { id: true, name: true, email: true, role: true, phone: true,
        consultantColleges: { select: { college: { select: { id: true, name: true } } } }
      },
    });
    res.status(201).json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/admin/users/:id — update user info
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { password, collegeIds, ...rest } = req.body;
    const data = { ...rest };
    if (password) data.passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.update({
      where: { id: Number(req.params.id) }, data,
      select: { id: true, name: true, email: true, role: true, isActive: true, phone: true },
    });
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/admin/users/:id/colleges — set consultant's assigned colleges
router.put('/:id/colleges', requireAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const { collegeIds } = req.body; // array of college IDs

    // Delete existing, then recreate
    await prisma.consultantCollege.deleteMany({ where: { userId } });
    if (collegeIds?.length) {
      await prisma.consultantCollege.createMany({
        data: collegeIds.map(id => ({ userId, collegeId: Number(id) })),
        skipDuplicates: true,
      });
    }
    const updated = await prisma.consultantCollege.findMany({
      where: { userId },
      select: { college: { select: { id: true, name: true, city: true } } },
    });
    res.json({ assigned: updated.map(r => r.college) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
