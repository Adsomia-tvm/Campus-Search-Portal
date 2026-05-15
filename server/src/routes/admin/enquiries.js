const router = require('express').Router();
const prisma = require('../../lib/prisma');
const zoho = require('../../lib/zohoCrm');
const { requireTeamMember } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { createEnquiry, updateEnquiry, idParam, ENQUIRY_STATUSES } = require('../../middleware/schemas');
const { deriveQualification } = require('../../lib/leadScore');
const { notifyNewEnquiry, notifyStatusChange } = require('../../lib/notify');

router.use(requireTeamMember);

// Single source of truth — exported from schemas.js so Zod validation and
// the status-counts filter chips stay in lock-step.
const STATUSES = ENQUIRY_STATUSES;

// GET /api/admin/enquiries
// - admin:      see all
// - staff:      see only enquiries where they are the assigned counselor
//               (counselors are scoped to their own pipeline; admin sees
//               the whole org)
// - consultant: see only enquiries for their assigned colleges
router.get('/', async (req, res, next) => {
  try {
    const { status, counselorId, courseId, collegeId, category, search, page = 1, limit = 30 } = req.query;
    const where = {};

    // Consultant scope — only their colleges
    if (req.user.role === 'consultant') {
      const assigned = await prisma.consultantCollege.findMany({
        where: { userId: req.user.id },
        select: { collegeId: true },
      });
      const collegeIds = assigned.map(r => r.collegeId);
      if (!collegeIds.length) {
        return res.json({ enquiries: [], total: 0, page: 1, pages: 0, statusCounts: [] });
      }
      where.collegeId = { in: collegeIds };
    }

    // Staff scope — only leads assigned to them. Mirrors the affiliate
    // portal pattern: counselors get a focused view of their own pipeline
    // without admin chrome.
    if (req.user.role === 'staff') {
      where.counselorId = req.user.id;
    }

    if (status)   where.status   = status;
    if (courseId) where.courseId = Number(courseId);
    // Filter by Course.category (Nursing / Engineering / Medical / …). Uses
    // the course relation rather than a denormalised column. Specific
    // courseId takes precedence (a course already implies a category).
    if (category && !courseId) where.course = { category };
    // For admin we let collegeId be filtered independently; for consultants
    // the where.collegeId was already set above to `{ in: [...] }`, so we
    // narrow within that subset.
    if (collegeId) {
      if (where.collegeId && typeof where.collegeId === 'object' && Array.isArray(where.collegeId.in)) {
        where.collegeId = where.collegeId.in.includes(Number(collegeId)) ? Number(collegeId) : { in: [] };
      } else {
        where.collegeId = Number(collegeId);
      }
    }
    // counselorId query param is for admin-side filtering only. Staff are
    // already locked to their own id above; ignoring the param here
    // prevents a staff user from passing ?counselorId=other to peek at
    // another counsellor's pipeline.
    if (counselorId && req.user.role !== 'staff') {
      where.counselorId = Number(counselorId);
    }
    if (search) where.OR = [
      { student: { name:  { contains: search, mode: 'insensitive' } } },
      { student: { phone: { contains: search } } },
      { college: { name:  { contains: search, mode: 'insensitive' } } },
    ];

    const take = Math.min(Math.max(Number(limit) || 30, 1), 100);
    const skip = (Math.max(Number(page), 1) - 1) * take;

    // ── N+1 FIX: single groupBy instead of 6 separate COUNT queries ──────────
    const [enquiries, total, statusGroups] = await Promise.all([
      prisma.enquiry.findMany({
        where, skip, take, orderBy: { createdAt: 'desc' },
        include: {
          // notes carries the Career Clarity output (top career match,
          // all matches, stage, stream) so the listing can surface it
          // to counsellors without an extra lookup. email + city help
          // counsellors fill the call quickly.
          student:   { select: { id: true, name: true, phone: true, email: true, city: true, preferredCat: true, notes: true } },
          college:   { select: { id: true, name: true, city: true } },
          course:    { select: { id: true, name: true } },
          counselor: { select: { id: true, name: true } },
          affiliate: { select: { id: true, name: true, code: true } },
        },
      }),
      prisma.enquiry.count({ where }),
      prisma.enquiry.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
      }),
    ]);

    // Map groupBy result to the same shape the frontend expects
    const countMap = Object.fromEntries(statusGroups.map(g => [g.status, g._count.id]));
    const statusCounts = STATUSES.map(s => ({ status: s, count: countMap[s] || 0 }));

    res.json({ enquiries, total, page: Number(page), pages: Math.ceil(total / take), statusCounts });
  } catch (err) {
    next(err);
  }
});

// Whitelist allowed fields to prevent mass assignment
function pickEnquiryCreate(body) {
  return {
    studentId:   Number(body.studentId),
    collegeId:   Number(body.collegeId),
    courseId:     body.courseId ? Number(body.courseId) : null,
    status:      body.status || 'New',
    counselorId: body.counselorId ? Number(body.counselorId) : null,
    notes:       body.notes || null,
  };
}

function pickEnquiryUpdate(body) {
  const allowed = ['status', 'counselorId', 'followUpDate', 'notes'];
  const data = {};
  for (const key of allowed) {
    if (body[key] !== undefined) {
      data[key] = key === 'counselorId' ? (body[key] ? Number(body[key]) : null) : body[key];
    }
  }
  return data;
}

// POST /api/admin/enquiries
router.post('/', validate(createEnquiry), async (req, res, next) => {
  try {
    const enquiry = await prisma.enquiry.create({
      data: pickEnquiryCreate(req.body),
      include: { student: true, college: { select: { id: true, name: true, city: true } }, course: { select: { name: true } } },
    });

    // Fire notification (fire-and-forget)
    notifyNewEnquiry(enquiry, { source: req.body.source || 'Admin' });

    res.status(201).json(enquiry);
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/enquiries/:id — update status, notes, follow-up
router.put('/:id', validate(updateEnquiry), async (req, res, next) => {
  try {
    // Auto-update qualification status when status changes
    const updateData = pickEnquiryUpdate(req.body);
    let oldStatus = null;
    const existing = await prisma.enquiry.findUnique({
      where: { id: Number(req.params.id) },
      select: { leadScore: true, status: true, counselorId: true, collegeId: true },
    });
    if (!existing) return res.status(404).json({ error: 'Enquiry not found' });

    // Staff can only update leads assigned to them. Without this check a
    // staff user could call PUT /api/admin/enquiries/:id with another
    // counsellor's enquiry id and change its status/notes/follow-up.
    if (req.user.role === 'staff' && existing.counselorId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden — not your assigned lead' });
    }
    // Consultant can only update leads in their assigned colleges.
    if (req.user.role === 'consultant') {
      const assigned = await prisma.consultantCollege.findFirst({
        where: { userId: req.user.id, collegeId: existing.collegeId },
        select: { id: true },
      });
      if (!assigned) return res.status(403).json({ error: 'Forbidden — not in your assigned colleges' });
    }
    // Staff should not be able to re-assign the counselor field — that
    // would let them hand off (or steal) leads. Strip from payload.
    if (req.user.role === 'staff') delete updateData.counselorId;

    if (req.body.status) {
      oldStatus = existing.status;
      updateData.qualificationStatus = deriveQualification(existing.leadScore || 0, req.body.status);
    }

    const enquiry = await prisma.enquiry.update({
      where: { id: Number(req.params.id) },
      data: updateData,
      include: {
        student: { select: { name: true, phone: true } },
        college: { select: { name: true } },
      },
    });

    // Auto-create commission record when enrolled (with agent info if applicable)
    if (req.body.status === 'Enrolled') {
      const enqFull = await prisma.enquiry.findUnique({
        where: { id: enquiry.id },
        select: { agentId: true, agent: { select: { commissionRate: true } }, college: { select: { pricePerLead: true } } },
      });
      const commData = {
        enquiryId: enquiry.id,
        collegeId: enquiry.collegeId,
        status: 'Pending',
      };
      // Link agent and pre-calculate agent amount if college has a price-per-lead set
      if (enqFull?.agentId) {
        commData.agentId = enqFull.agentId;
        if (enqFull.college?.pricePerLead && enqFull.agent?.commissionRate) {
          commData.amount = enqFull.college.pricePerLead;
          commData.agentAmount = Math.round(enqFull.college.pricePerLead * (enqFull.agent.commissionRate / 100));
        }
      } else if (enqFull?.college?.pricePerLead) {
        commData.amount = enqFull.college.pricePerLead;
      }
      await prisma.commission.upsert({
        where: { enquiryId: enquiry.id },
        update: {},
        create: commData,
      });
    }

    // Fire notification on status change (fire-and-forget)
    if (req.body.status && oldStatus && req.body.status !== oldStatus) {
      notifyStatusChange(enquiry, oldStatus, req.body.status);
    }

    res.json(enquiry);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/admin/enquiries/rebalance ────────────────────────────────────
// Admin-only: redistribute existing non-terminal leads evenly across the
// active staff pool. Built primarily for the "new staff joined" scenario —
// the auto-assignment in /api/enquiries already load-balances new leads,
// but a fresh hire would otherwise have to wait for the next ~N leads to
// catch up to peers. This one-shot rebalance gives them their fair share
// immediately.
//
// Rebalance is done at the *student* level (not the enquiry level) so a
// student's pipeline stays with one counsellor. Only students with at
// least one non-terminal enquiry are reassigned; settled records
// (Enrolled / Dropped / Junk) keep their historical counselor for audit
// continuity.
//
// Returns { studentsReassigned, enquiriesReassigned, perStaff }.
router.post('/rebalance', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden — admin only' });
    }

    // Active staff pool, ordered by id for deterministic rotation.
    const staff = await prisma.user.findMany({
      where: { role: 'staff', isActive: true },
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
    });
    if (staff.length === 0) {
      return res.status(400).json({ error: 'No active staff to assign leads to.' });
    }

    // Terminal statuses — leads in these buckets aren't being worked, so
    // we leave them with their historical counselor.
    const TERMINAL = ['Enrolled', 'Dropped', 'Junk'];

    // Find students that have at least one non-terminal enquiry. We
    // operate at this granularity so a returning student doesn't end up
    // with one counselor for their Nursing enquiry and another for their
    // Engineering enquiry.
    const students = await prisma.student.findMany({
      where: {
        enquiries: { some: { status: { notIn: TERMINAL } } },
      },
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    let enquiriesReassigned = 0;
    const perStaff = Object.fromEntries(staff.map(s => [s.id, { name: s.name, count: 0 }]));

    // Round-robin assignment, one student at a time. Transaction per
    // student keeps the Student + Enquiry updates atomic without holding
    // a giant lock across the whole rebalance.
    for (let i = 0; i < students.length; i++) {
      const newCounselorId = staff[i % staff.length].id;
      const studentId = students[i].id;

      const result = await prisma.$transaction([
        prisma.student.update({
          where: { id: studentId },
          data:  { counselorId: newCounselorId },
        }),
        prisma.enquiry.updateMany({
          where: { studentId, status: { notIn: TERMINAL } },
          data:  { counselorId: newCounselorId },
        }),
      ]);
      enquiriesReassigned += result[1].count;
      perStaff[newCounselorId].count += 1; // students per staff
    }

    res.json({
      studentsReassigned: students.length,
      enquiriesReassigned,
      perStaff: Object.values(perStaff),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
