const router = require('express').Router();
const prisma = require('../../lib/prisma');
const { requireTeamMember } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { createEnquiry, updateEnquiry, idParam } = require('../../middleware/schemas');
const { deriveQualification } = require('../../lib/leadScore');
const { notifyStatusChange } = require('../../lib/notify');

router.use(requireTeamMember);

const STATUSES = ['New', 'Contacted', 'Visited', 'Applied', 'Enrolled', 'Dropped'];

// GET /api/admin/enquiries
// - admin/staff: see all
// - consultant: see only enquiries for their assigned colleges
router.get('/', async (req, res, next) => {
  try {
    const { status, counselorId, search, page = 1, limit = 30 } = req.query;
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

    if (status)      where.status = status;
    if (counselorId) where.counselorId = Number(counselorId);
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
          student:   { select: { id: true, name: true, phone: true, preferredCat: true } },
          college:   { select: { id: true, name: true, city: true } },
          course:    { select: { id: true, name: true } },
          counselor: { select: { id: true, name: true } },
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
      include: { student: true, college: { select: { name: true } } },
    });
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
    if (req.body.status) {
      const existing = await prisma.enquiry.findUnique({ where: { id: Number(req.params.id) }, select: { leadScore: true, status: true } });
      if (existing) {
        oldStatus = existing.status;
        updateData.qualificationStatus = deriveQualification(existing.leadScore || 0, req.body.status);
      }
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

module.exports = router;
