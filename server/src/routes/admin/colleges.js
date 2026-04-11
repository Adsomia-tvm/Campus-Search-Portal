const router = require('express').Router();
const prisma = require('../../lib/prisma');
const { requireTeamMember, requireAdmin } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { createCollege, updateCollege, createCourse, updateCourse, idParam } = require('../../middleware/schemas');

router.use(requireTeamMember);

// GET /api/admin/colleges
router.get('/', async (req, res, next) => {
  try {
    const { city, category, search, page = 1, limit = 30 } = req.query;
    const where = {};
    if (city)   where.city = { contains: city, mode: 'insensitive' };
    if (search) where.name = { contains: search, mode: 'insensitive' };
    if (category) where.courses = { some: { category: { contains: category, mode: 'insensitive' } } };

    const take = Math.min(Math.max(Number(limit) || 30, 1), 100);
    const skip = (Math.max(Number(page), 1) - 1) * take;
    const [colleges, total] = await Promise.all([
      prisma.college.findMany({
        where, skip, take, orderBy: { name: 'asc' },
        include: { _count: { select: { courses: true, enquiries: true } } },
      }),
      prisma.college.count({ where }),
    ]);
    res.json({ colleges, total, page: Number(page), pages: Math.ceil(total / take) });
  } catch (err) {
    next(err);
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

// Whitelist course fields — prevents mass assignment on course creation/update
function pickCourseFields(body) {
  const allowed = ['name','category','degreeLevel','durationYrs','quota',
    'y1Fee','y2Fee','y3Fee','y4Fee','y5Fee','totalFee','hostelPerYr','notes','isActive'];
  const data = {};
  for (const key of allowed) {
    if (body[key] !== undefined) data[key] = body[key];
  }
  return data;
}

// POST /api/admin/colleges
router.post('/', requireAdmin, validate(createCollege), async (req, res, next) => {
  try {
    const college = await prisma.college.create({ data: pickCollegeFields(req.body) });
    res.status(201).json(college);
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/colleges/:id
router.put('/:id', requireAdmin, validate(updateCollege), async (req, res, next) => {
  try {
    const college = await prisma.college.update({
      where: { id: Number(req.params.id) },
      data: pickCollegeFields(req.body),
    });
    res.json(college);
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/colleges/:id (with all courses)
router.get('/:id', validate(idParam), async (req, res, next) => {
  try {
    const college = await prisma.college.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        courses: { orderBy: [{ category: 'asc' }, { totalFee: 'asc' }] },
        contacts: true,
        _count: { select: { enquiries: true } },
      },
    });
    if (!college) return res.status(404).json({ error: 'College not found' });
    res.json(college);
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/colleges/:id/courses — with mass assignment fix
router.post('/:id/courses', requireAdmin, validate(createCourse), async (req, res, next) => {
  try {
    const collegeId = Number(req.params.id);
    const course = await prisma.course.create({
      data: { ...pickCourseFields(req.body), collegeId },
    });

    // Recalculate college minFee/maxFee
    await _updateCollegeFeeRange(collegeId);

    res.status(201).json(course);
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/courses/:id — with mass assignment fix
router.put('/courses/:id', requireAdmin, validate(updateCourse), async (req, res, next) => {
  try {
    const course = await prisma.course.update({
      where: { id: Number(req.params.id) },
      data: pickCourseFields(req.body),
    });

    // Recalculate college minFee/maxFee
    await _updateCollegeFeeRange(course.collegeId);

    res.json(course);
  } catch (err) {
    next(err);
  }
});

// ── Helper: recalculate college minFee/maxFee after course changes ───────────
async function _updateCollegeFeeRange(collegeId) {
  try {
    const agg = await prisma.course.aggregate({
      where: { collegeId, isActive: true, totalFee: { gt: 0 } },
      _min: { totalFee: true },
      _max: { totalFee: true },
    });
    await prisma.college.update({
      where: { id: collegeId },
      data: {
        minFee: agg._min.totalFee || null,
        maxFee: agg._max.totalFee || null,
      },
    });
  } catch (e) {
    console.error('[updateCollegeFeeRange]', e.message);
  }
}

module.exports = router;
