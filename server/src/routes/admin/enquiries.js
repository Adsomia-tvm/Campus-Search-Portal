const router = require('express').Router();
const prisma = require('../../lib/prisma');
const { requireTeamMember } = require('../../middleware/auth');

router.use(requireTeamMember);

const STATUSES = ['New','Contacted','Visited','Applied','Enrolled','Dropped'];

// GET /api/admin/enquiries
// - admin/staff: see all
// - consultant: see only enquiries for their assigned colleges
router.get('/', async (req, res) => {
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
      if (!collegeIds.length) return res.json({ enquiries: [], total: 0, page: 1, pages: 0, statusCounts: [] });
      where.collegeId = { in: collegeIds };
    }

    if (status)      where.status = status;
    if (counselorId) where.counselorId = Number(counselorId);
    if (search) where.OR = [
      { student: { name:  { contains: search, mode: 'insensitive' } } },
      { student: { phone: { contains: search } } },
      { college: { name:  { contains: search, mode: 'insensitive' } } },
    ];

    const skip = (Number(page) - 1) * Number(limit);
    const [enquiries, total, counts] = await Promise.all([
      prisma.enquiry.findMany({
        where, skip, take: Number(limit), orderBy: { createdAt: 'desc' },
        include: {
          student:   { select: { id: true, name: true, phone: true, preferredCat: true } },
          college:   { select: { id: true, name: true, city: true } },
          course:    { select: { id: true, name: true } },
          counselor: { select: { id: true, name: true } },
        },
      }),
      prisma.enquiry.count({ where }),
      Promise.all(STATUSES.map(s =>
        prisma.enquiry.count({ where: { ...where, status: s } })
          .then(c => ({ status: s, count: c }))
      )),
    ]);

    res.json({ enquiries, total, page: Number(page), pages: Math.ceil(total / Number(limit)), statusCounts: counts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Whitelist allowed fields to prevent mass assignment
function pickEnquiryCreate(body) {
  const { studentId, collegeId, courseId, status, counselorId, notes } = body;
  return { studentId: Number(studentId), collegeId: Number(collegeId),
           courseId: courseId ? Number(courseId) : null,
           status: status || 'New', counselorId: counselorId ? Number(counselorId) : null, notes };
}
function pickEnquiryUpdate(body) {
  const allowed = ['status','counselorId','followUpDate','notes'];
  const data = {};
  for (const key of allowed) {
    if (body[key] !== undefined) data[key] = key === 'counselorId' ? Number(body[key]) : body[key];
  }
  return data;
}

// POST /api/admin/enquiries
router.post('/', async (req, res) => {
  try {
    const enquiry = await prisma.enquiry.create({
      data: pickEnquiryCreate(req.body),
      include: { student: true, college: { select: { name: true } } },
    });
    res.status(201).json(enquiry);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/admin/enquiries/:id — update status, notes, follow-up
router.put('/:id', async (req, res) => {
  try {
    const enquiry = await prisma.enquiry.update({
      where: { id: Number(req.params.id) },
      data: pickEnquiryUpdate(req.body),
      include: { student: { select: { name: true, phone: true } }, college: { select: { name: true } } },
    });

    // Auto-create commission record when enrolled
    if (req.body.status === 'Enrolled') {
      await prisma.commission.upsert({
        where: { enquiryId: enquiry.id },
        update: {},
        create: { enquiryId: enquiry.id, collegeId: enquiry.collegeId, status: 'Pending' },
      });
    }

    res.json(enquiry);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
