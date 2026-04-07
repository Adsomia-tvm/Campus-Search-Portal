const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { requireAuth } = require('../../middleware/auth');
const prisma = new PrismaClient();

router.use(requireAuth);

// GET /api/admin/students
router.get('/', async (req, res) => {
  try {
    const { search, source, page = 1, limit = 30 } = req.query;
    const where = {};
    if (search) where.OR = [
      { name:  { contains: search, mode: 'insensitive' } },
      { phone: { contains: search } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
    if (source) where.source = source;

    const skip = (Number(page) - 1) * Number(limit);
    const [students, total] = await Promise.all([
      prisma.student.findMany({ where, skip, take: Number(limit), orderBy: { createdAt: 'desc' },
        include: { _count: { select: { enquiries: true } } } }),
      prisma.student.count({ where }),
    ]);
    res.json({ students, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/students
router.post('/', async (req, res) => {
  try {
    const student = await prisma.student.create({ data: req.body });
    res.status(201).json(student);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/admin/students/:id
router.get('/:id', async (req, res) => {
  try {
    const student = await prisma.student.findUnique({
      where: { id: Number(req.params.id) },
      include: { enquiries: { include: { college: { select: { name: true, city: true } }, course: { select: { name: true } } }, orderBy: { createdAt: 'desc' } } },
    });
    if (!student) return res.status(404).json({ error: 'Not found' });
    res.json(student);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/students/:id
router.put('/:id', async (req, res) => {
  try {
    const student = await prisma.student.update({ where: { id: Number(req.params.id) }, data: req.body });
    res.json(student);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
