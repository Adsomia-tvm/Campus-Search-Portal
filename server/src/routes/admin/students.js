const router = require('express').Router();
const prisma = require('../../lib/prisma');
const { requireAuth } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { createStudent, updateStudent, idParam } = require('../../middleware/schemas');

router.use(requireAuth);

// GET /api/admin/students
router.get('/', async (req, res, next) => {
  try {
    const { search, source, page = 1, limit = 30 } = req.query;
    const where = {};
    if (search) where.OR = [
      { name:  { contains: search, mode: 'insensitive' } },
      { phone: { contains: search } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
    if (source) where.source = source;

    const take = Math.min(Math.max(Number(limit) || 30, 1), 100);
    const skip = (Math.max(Number(page), 1) - 1) * take;

    const [students, total] = await Promise.all([
      prisma.student.findMany({
        where, skip, take, orderBy: { createdAt: 'desc' },
        include: { _count: { select: { enquiries: true } } },
      }),
      prisma.student.count({ where }),
    ]);
    res.json({ students, total, page: Number(page), pages: Math.ceil(total / take) });
  } catch (err) {
    next(err);
  }
});

// Whitelist allowed fields
function pickStudentFields(body) {
  const allowed = ['name', 'phone', 'email', 'city', 'preferredCat', 'preferredCity',
                    'budgetMax', 'percentage', 'stream', 'source', 'counselorId', 'notes'];
  const data = {};
  for (const key of allowed) {
    if (body[key] !== undefined) data[key] = body[key];
  }
  return data;
}

// POST /api/admin/students
router.post('/', validate(createStudent), async (req, res, next) => {
  try {
    const student = await prisma.student.create({ data: pickStudentFields(req.body) });
    res.status(201).json(student);
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/students/:id
router.get('/:id', validate(idParam), async (req, res, next) => {
  try {
    const student = await prisma.student.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        enquiries: {
          include: {
            college: { select: { name: true, city: true } },
            course:  { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!student) return res.status(404).json({ error: 'Student not found' });
    res.json(student);
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/students/:id
router.put('/:id', validate(updateStudent), async (req, res, next) => {
  try {
    const student = await prisma.student.update({
      where: { id: Number(req.params.id) },
      data: pickStudentFields(req.body),
    });
    res.json(student);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
