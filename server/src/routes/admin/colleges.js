const router = require('express').Router();
const prisma = require('../../lib/prisma');
const { requireAuth, requireAdmin } = require('../../middleware/auth');

router.use(requireAuth);

// GET /api/admin/colleges
router.get('/', async (req, res) => {
  try {
    const { city, category, search, page = 1, limit = 30 } = req.query;
    const where = {};
    if (city)   where.city = { contains: city, mode: 'insensitive' };
    if (search) where.name = { contains: search, mode: 'insensitive' };
    if (category) where.courses = { some: { category: { contains: category, mode: 'insensitive' } } };

    const skip = (Number(page) - 1) * Number(limit);
    const [colleges, total] = await Promise.all([
      prisma.college.findMany({
        where, skip, take: Number(limit), orderBy: { name: 'asc' },
        include: { _count: { select: { courses: true, enquiries: true } } },
      }),
      prisma.college.count({ where }),
    ]);
    res.json({ colleges, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Whitelist allowed fields to prevent mass assignment
function pickCollegeFields(body) {
  const allowed = ['name','city','state','type','address','phone','email','website',
                    'logoUrl','description','approvedBy','accreditation','isActive'];
  const data = {};
  for (const key of allowed) {
    if (body[key] !== undefined) data[key] = body[key];
  }
  return data;
}

// POST /api/admin/colleges
router.post('/', requireAdmin, async (req, res) => {
  try {
    const college = await prisma.college.create({ data: pickCollegeFields(req.body) });
    res.status(201).json(college);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/admin/colleges/:id
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const college = await prisma.college.update({ where: { id: Number(req.params.id) }, data: pickCollegeFields(req.body) });
    res.json(college);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/admin/colleges/:id (with all courses)
router.get('/:id', async (req, res) => {
  try {
    const college = await prisma.college.findUnique({
      where: { id: Number(req.params.id) },
      include: { courses: { orderBy: [{ category: 'asc' }, { totalFee: 'asc' }] }, contacts: true,
        _count: { select: { enquiries: true } } },
    });
    if (!college) return res.status(404).json({ error: 'Not found' });
    res.json(college);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/colleges/:id/courses
router.post('/:id/courses', requireAdmin, async (req, res) => {
  try {
    const course = await prisma.course.create({ data: { ...req.body, collegeId: Number(req.params.id) } });
    res.status(201).json(course);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/admin/courses/:id
router.put('/courses/:id', requireAdmin, async (req, res) => {
  try {
    const course = await prisma.course.update({ where: { id: Number(req.params.id) }, data: req.body });
    res.json(course);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
