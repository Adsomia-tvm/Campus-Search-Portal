const router = require('express').Router();
const prisma = require('../../lib/prisma');
const { requireTeamMember, requireAdmin } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { createCollege, updateCollege, createCourse, updateCourse, idParam } = require('../../middleware/schemas');
const { resolveTierSettings, TIERS } = require('../../lib/tierRules');

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
                    'logoUrl','description','approvedBy','accreditation','isActive',
                    // COL-01: partnership + verification fields
                    'verificationLevel','partnershipTier','monthlyLeadCap','pricePerLead','partnershipSince'];
  const data = {};
  for (const key of allowed) {
    if (body[key] !== undefined) data[key] = body[key];
  }
  // Coerce partnershipSince string → Date (Prisma rejects string for DateTime)
  if (data.partnershipSince && typeof data.partnershipSince === 'string') {
    data.partnershipSince = new Date(data.partnershipSince);
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

// ── COL-02: GET /api/admin/colleges/:id/dashboard ────────────────────────────
// Per-college snapshot: leads received, conversion funnel, tier status, cap usage.
// Consultants scoped to their own colleges; admin/staff unrestricted.
router.get('/:id/dashboard', validate(idParam), async (req, res, next) => {
  try {
    const collegeId = Number(req.params.id);

    // Scope check for consultants
    if (req.user.role === 'consultant') {
      const assigned = await prisma.consultantCollege.findFirst({
        where: { userId: req.user.id, collegeId },
        select: { id: true },
      });
      if (!assigned) return res.status(403).json({ error: 'Forbidden — college not assigned' });
    }

    const college = await prisma.college.findUnique({
      where: { id: collegeId },
      select: {
        id: true, name: true, city: true, state: true, isActive: true,
        verificationLevel: true, partnershipTier: true,
        monthlyLeadCap: true, pricePerLead: true, partnershipSince: true,
      },
    });
    if (!college) return res.status(404).json({ error: 'College not found' });

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const start30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const start7d  = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000);

    // Parallel aggregate queries — one roundtrip each
    const [
      leadsThisMonth, leadsPrevMonth, leads30d, leads7d, leadsTotal,
      funnelRaw,
      commissionReceivedMonth, commissionPending,
      recentLeads,
    ] = await Promise.all([
      prisma.enquiry.count({ where: { collegeId, createdAt: { gte: startOfMonth } } }),
      prisma.enquiry.count({ where: { collegeId, createdAt: { gte: startOfPrevMonth, lt: startOfMonth } } }),
      prisma.enquiry.count({ where: { collegeId, createdAt: { gte: start30d } } }),
      prisma.enquiry.count({ where: { collegeId, createdAt: { gte: start7d } } }),
      prisma.enquiry.count({ where: { collegeId } }),
      prisma.enquiry.groupBy({ by: ['status'], where: { collegeId }, _count: { _all: true } }),
      prisma.commission.aggregate({
        where: { collegeId, status: 'Received', paymentDate: { gte: startOfMonth } },
        _sum: { amount: true },
      }),
      prisma.commission.aggregate({
        where: { collegeId, status: 'Pending' },
        _sum: { amount: true },
      }),
      prisma.enquiry.findMany({
        where: { collegeId }, orderBy: { createdAt: 'desc' }, take: 8,
        select: {
          id: true, status: true, createdAt: true, notes: true,
          student: { select: { name: true, phone: true, city: true } },
          course:  { select: { name: true, category: true } },
        },
      }),
    ]);

    // Normalise funnel — ensure all 6 statuses present, count=0 if none
    const statusOrder = ['New', 'Contacted', 'Visited', 'Applied', 'Enrolled', 'Dropped'];
    const funnelMap = Object.fromEntries(funnelRaw.map(r => [r.status, r._count._all]));
    const funnel = statusOrder.map(s => ({ status: s, count: funnelMap[s] || 0 }));
    const enrolledCount = funnelMap.Enrolled || 0;
    const conversionRate = leadsTotal > 0 ? +(enrolledCount / leadsTotal * 100).toFixed(1) : 0;

    // Tier/cap resolution
    const tier = resolveTierSettings(college);
    const capRemaining = tier.monthlyCap === null ? null : Math.max(0, tier.monthlyCap - leadsThisMonth);
    const capUsagePct  = tier.monthlyCap === null || tier.monthlyCap === 0
      ? 0 : +(leadsThisMonth / tier.monthlyCap * 100).toFixed(1);

    // Month-over-month delta
    const momPct = leadsPrevMonth > 0
      ? +((leadsThisMonth - leadsPrevMonth) / leadsPrevMonth * 100).toFixed(1)
      : (leadsThisMonth > 0 ? 100 : 0);

    res.json({
      college,
      tier: {
        ...tier,
        capRemaining,
        capUsagePct,
        tierDescription: TIERS[tier.tier]?.description || '',
      },
      leads: {
        last7Days:  leads7d,
        last30Days: leads30d,
        thisMonth:  leadsThisMonth,
        prevMonth:  leadsPrevMonth,
        momPct,
        total:      leadsTotal,
      },
      funnel,
      conversion: {
        enrolled:  enrolledCount,
        total:     leadsTotal,
        ratePct:   conversionRate,
      },
      revenue: {
        commissionReceivedMonth: commissionReceivedMonth._sum.amount || 0,
        commissionPending:       commissionPending._sum.amount || 0,
      },
      recentLeads,
    });
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
