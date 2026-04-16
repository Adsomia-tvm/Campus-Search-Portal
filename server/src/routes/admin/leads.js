/**
 * LEAD-02/03: Admin lead CRM endpoints
 * Lead pipeline view, rescoring, dedup scan, and merge
 */
const router = require('express').Router();
const prisma = require('../../lib/prisma');
const { requireTeamMember, requireAdmin } = require('../../middleware/auth');
const { calculateLeadScore, deriveQualification } = require('../../lib/leadScore');
const { findDuplicates, batchDedupScan, mergeStudents } = require('../../lib/dedup');
const { logAudit, getIp } = require('../../lib/audit');

router.use(requireTeamMember);

// ── GET /api/admin/leads ─────────────────────────────────────────────────────
// Lead pipeline view — enquiries with scoring, filterable by qualification
router.get('/', async (req, res, next) => {
  try {
    const { qualification, source, status, minScore, search, sortBy = 'score', page = 1, limit = 30 } = req.query;
    const where = {};

    // Consultant scope
    if (req.user.role === 'consultant') {
      const assigned = await prisma.consultantCollege.findMany({
        where: { userId: req.user.id }, select: { collegeId: true },
      });
      const ids = assigned.map(r => r.collegeId);
      if (!ids.length) return res.json({ leads: [], total: 0, page: 1, pages: 0 });
      where.collegeId = { in: ids };
    }

    if (qualification) where.qualificationStatus = qualification;
    if (source) where.source = source;
    if (status) where.status = status;
    if (minScore) where.leadScore = { gte: Number(minScore) };
    if (search) {
      where.OR = [
        { student: { name: { contains: search, mode: 'insensitive' } } },
        { student: { phone: { contains: search } } },
        { college: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const take = Math.min(Math.max(Number(limit) || 30, 1), 100);
    const skip = (Math.max(Number(page), 1) - 1) * take;

    // Sort options
    const orderBy = sortBy === 'score' ? { leadScore: 'desc' }
      : sortBy === 'date' ? { createdAt: 'desc' }
      : sortBy === 'status' ? { status: 'asc' }
      : { leadScore: 'desc' };

    const [leads, total, qualCounts, sourceCounts] = await Promise.all([
      prisma.enquiry.findMany({
        where, skip, take, orderBy,
        include: {
          student: { select: { id: true, name: true, phone: true, email: true, preferredCat: true, city: true, percentage: true } },
          college: { select: { id: true, name: true, city: true } },
          course: { select: { id: true, name: true, category: true } },
          agent: { select: { id: true, referralCode: true, user: { select: { name: true } } } },
          counselor: { select: { id: true, name: true } },
          commission: { select: { amount: true, status: true } },
        },
      }),
      prisma.enquiry.count({ where }),
      prisma.enquiry.groupBy({ by: ['qualificationStatus'], where, _count: true }),
      prisma.enquiry.groupBy({ by: ['source'], where, _count: true }),
    ]);

    res.json({
      leads,
      total,
      page: Number(page),
      pages: Math.ceil(total / take),
      qualificationCounts: Object.fromEntries(qualCounts.map(q => [q.qualificationStatus, q._count])),
      sourceCounts: Object.fromEntries(sourceCounts.filter(s => s.source).map(s => [s.source, s._count])),
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/admin/leads/rescore ────────────────────────────────────────────
// Batch rescore all enquiries (run after profile data enrichment)
router.post('/rescore', requireAdmin, async (req, res, next) => {
  try {
    const enquiries = await prisma.enquiry.findMany({
      include: {
        student: true,
        college: { select: { city: true } },
      },
    });

    let updated = 0;
    for (const enq of enquiries) {
      const enquiryCount = await prisma.enquiry.count({ where: { studentId: enq.studentId } });
      const scoreData = { ...enq, _collegeCity: enq.college?.city };
      const newScore = calculateLeadScore(enq.student, scoreData, enquiryCount);
      const newQual = deriveQualification(newScore, enq.status);

      if (newScore !== enq.leadScore || newQual !== enq.qualificationStatus) {
        await prisma.enquiry.update({
          where: { id: enq.id },
          data: { leadScore: newScore, qualificationStatus: newQual },
        });
        updated++;
      }
    }

    logAudit({ userId: req.user.id, action: 'rescore_leads', entity: 'enquiry', details: { updated, total: enquiries.length }, ipAddress: getIp(req) });
    res.json({ rescored: updated, total: enquiries.length });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/admin/leads/duplicates ──────────────────────────────────────────
// Batch dedup scan — find potential duplicate students
router.get('/duplicates', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const duplicates = await batchDedupScan(limit);
    res.json(duplicates);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/admin/leads/duplicates/:studentId ───────────────────────────────
// Find duplicates for a specific student
router.get('/duplicates/:studentId', async (req, res, next) => {
  try {
    const duplicates = await findDuplicates(Number(req.params.studentId));
    res.json({ studentId: Number(req.params.studentId), duplicates });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/admin/leads/merge ──────────────────────────────────────────────
// Merge two duplicate students — admin only
router.post('/merge', requireAdmin, async (req, res, next) => {
  try {
    const { primaryId, secondaryId } = req.body;
    if (!primaryId || !secondaryId) {
      return res.status(400).json({ error: 'primaryId and secondaryId are required' });
    }

    const result = await mergeStudents(Number(primaryId), Number(secondaryId));

    logAudit({
      userId: req.user.id, action: 'merge_students', entity: 'student',
      entityId: result.primaryId,
      details: { secondaryId: result.secondaryId, moved: result.enquiriesMoved, skipped: result.enquiriesSkipped },
      ipAddress: getIp(req),
    });

    res.json(result);
  } catch (err) {
    if (err.message?.includes('not found')) return res.status(404).json({ error: err.message });
    next(err);
  }
});

module.exports = router;
