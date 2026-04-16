/**
 * COL-04/05: College self-service portal
 * All endpoints require a valid JWT with role=college and linked collegeId
 */
const router = require('express').Router();
const prisma = require('../../lib/prisma');
const { requireCollege } = require('../../middleware/auth');
const { logAudit, getIp } = require('../../lib/audit');

router.use(requireCollege);

// ── GET /api/college/dashboard ───────────────────────────────────────────────
// College's own dashboard: lead stats, conversion funnel, recent enquiries
router.get('/dashboard', async (req, res, next) => {
  try {
    const collegeId = req.user.collegeId;

    const college = await prisma.college.findUnique({
      where: { id: collegeId },
      select: {
        id: true, name: true, city: true, state: true,
        verificationLevel: true, partnershipTier: true,
        monthlyLeadCap: true, logoUrl: true,
      },
    });
    if (!college) return res.status(404).json({ error: 'College not found' });

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const start7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      leadsTotal, leadsThisMonth, leads7d,
      funnelRaw, recentLeads,
    ] = await Promise.all([
      prisma.enquiry.count({ where: { collegeId } }),
      prisma.enquiry.count({ where: { collegeId, createdAt: { gte: startOfMonth } } }),
      prisma.enquiry.count({ where: { collegeId, createdAt: { gte: start7d } } }),
      prisma.enquiry.groupBy({ by: ['status'], where: { collegeId }, _count: { _all: true } }),
      prisma.enquiry.findMany({
        where: { collegeId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true, status: true, createdAt: true, leadScore: true, qualificationStatus: true, source: true,
          student: { select: { name: true, phone: true, email: true, city: true, preferredCat: true } },
          course: { select: { name: true, category: true } },
        },
      }),
    ]);

    const statusOrder = ['New', 'Contacted', 'Visited', 'Applied', 'Enrolled', 'Dropped'];
    const funnelMap = Object.fromEntries(funnelRaw.map(r => [r.status, r._count._all]));
    const funnel = statusOrder.map(s => ({ status: s, count: funnelMap[s] || 0 }));
    const enrolled = funnelMap.Enrolled || 0;
    const conversionRate = leadsTotal > 0 ? +(enrolled / leadsTotal * 100).toFixed(1) : 0;

    res.json({
      college,
      leads: { total: leadsTotal, thisMonth: leadsThisMonth, last7Days: leads7d },
      funnel,
      conversion: { enrolled, total: leadsTotal, ratePct: conversionRate },
      recentLeads,
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/college/enquiries ───────────────────────────────────────────────
// List all enquiries for this college with filters
router.get('/enquiries', async (req, res, next) => {
  try {
    const collegeId = req.user.collegeId;
    const { status, search, page = 1, limit = 30 } = req.query;
    const where = { collegeId };

    if (status) where.status = status;
    if (search) {
      where.OR = [
        { student: { name: { contains: search, mode: 'insensitive' } } },
        { student: { phone: { contains: search } } },
      ];
    }

    const take = Math.min(Math.max(Number(limit) || 30, 1), 100);
    const skip = (Math.max(Number(page), 1) - 1) * take;

    const [enquiries, total, statusCounts] = await Promise.all([
      prisma.enquiry.findMany({
        where, skip, take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, status: true, createdAt: true, updatedAt: true,
          leadScore: true, qualificationStatus: true, source: true, notes: true,
          student: {
            select: { id: true, name: true, phone: true, email: true, city: true,
                      preferredCat: true, percentage: true, stream: true },
          },
          course: { select: { id: true, name: true, category: true, totalFee: true } },
        },
      }),
      prisma.enquiry.count({ where }),
      prisma.enquiry.groupBy({ by: ['status'], where: { collegeId }, _count: true }),
    ]);

    res.json({
      enquiries, total,
      page: Number(page),
      pages: Math.ceil(total / take),
      statusCounts: Object.fromEntries(statusCounts.map(s => [s.status, s._count])),
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/college/enquiries/:id ───────────────────────────────────────────
// Single enquiry detail
router.get('/enquiries/:id', async (req, res, next) => {
  try {
    const enquiry = await prisma.enquiry.findFirst({
      where: { id: Number(req.params.id), collegeId: req.user.collegeId },
      select: {
        id: true, status: true, createdAt: true, updatedAt: true,
        leadScore: true, qualificationStatus: true, source: true, notes: true, followUpDate: true,
        student: {
          select: { id: true, name: true, phone: true, email: true, city: true,
                    preferredCat: true, preferredCity: true, budgetMax: true,
                    percentage: true, stream: true },
        },
        course: {
          select: { id: true, name: true, category: true, degreeLevel: true,
                    y1Fee: true, totalFee: true, durationYrs: true },
        },
        counselor: { select: { id: true, name: true } },
      },
    });
    if (!enquiry) return res.status(404).json({ error: 'Enquiry not found' });
    res.json(enquiry);
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/college/enquiries/:id ───────────────────────────────────────────
// COL-05: College can update status (accept/reject), add notes, set follow-up
// Allowed transitions for college: New → Contacted, Contacted → Visited, etc.
// College CANNOT set status to Enrolled (that's admin-only)
router.put('/enquiries/:id', async (req, res, next) => {
  try {
    const enquiry = await prisma.enquiry.findFirst({
      where: { id: Number(req.params.id), collegeId: req.user.collegeId },
    });
    if (!enquiry) return res.status(404).json({ error: 'Enquiry not found' });

    const { status, notes, followUpDate } = req.body;
    const data = {};

    // Status validation — colleges can move through the funnel but not mark Enrolled
    if (status) {
      const collegeAllowed = ['New', 'Contacted', 'Visited', 'Applied', 'Dropped'];
      if (!collegeAllowed.includes(status)) {
        return res.status(400).json({ error: `College cannot set status to "${status}". Only admin can mark as Enrolled.` });
      }
      data.status = status;
    }

    if (notes !== undefined) data.notes = notes?.slice(0, 2000) || null;
    if (followUpDate !== undefined) data.followUpDate = followUpDate ? new Date(followUpDate) : null;

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const updated = await prisma.enquiry.update({
      where: { id: enquiry.id },
      data,
      select: {
        id: true, status: true, notes: true, followUpDate: true, updatedAt: true,
        student: { select: { name: true, phone: true } },
      },
    });

    logAudit({
      userId: req.user.id, action: 'college_update_enquiry', entity: 'enquiry',
      entityId: enquiry.id, details: { changes: data }, ipAddress: getIp(req),
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/college/profile ─────────────────────────────────────────────────
// College's own profile info
router.get('/profile', async (req, res, next) => {
  try {
    const college = await prisma.college.findUnique({
      where: { id: req.user.collegeId },
      select: {
        id: true, name: true, city: true, state: true, type: true,
        address: true, phone: true, email: true, website: true,
        logoUrl: true, description: true, approvedBy: true, accreditation: true,
        verificationLevel: true, partnershipTier: true,
        monthlyLeadCap: true, pricePerLead: true, partnershipSince: true,
        isActive: true,
        _count: { select: { courses: true, enquiries: true } },
      },
    });
    if (!college) return res.status(404).json({ error: 'College not found' });

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { name: true, email: true, phone: true, createdAt: true },
    });

    res.json({ college, user });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/college/courses ─────────────────────────────────────────────────
// List courses for this college
router.get('/courses', async (req, res, next) => {
  try {
    const courses = await prisma.course.findMany({
      where: { collegeId: req.user.collegeId },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      select: {
        id: true, name: true, category: true, degreeLevel: true,
        durationYrs: true, y1Fee: true, totalFee: true,
        hostelPerYr: true, isActive: true,
        _count: { select: { enquiries: true } },
      },
    });
    res.json({ courses, total: courses.length });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
