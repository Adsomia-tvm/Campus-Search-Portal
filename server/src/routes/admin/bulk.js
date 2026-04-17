const router = require('express').Router();
const prisma = require('../../lib/prisma');
const { requireAdmin } = require('../../middleware/auth');
const { logAudit, getIp } = require('../../lib/audit');
const { deriveQualification } = require('../../lib/leadScore');

router.use(requireAdmin);

const STATUSES = ['New', 'Contacted', 'Visited', 'Applied', 'Enrolled', 'Dropped'];

// ── POST /api/admin/bulk/status — mass status update ────────────────────────
router.post('/status', async (req, res, next) => {
  try {
    const { enquiryIds, status } = req.body;
    if (!Array.isArray(enquiryIds) || !enquiryIds.length) {
      return res.status(400).json({ error: 'enquiryIds array required' });
    }
    if (!STATUSES.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${STATUSES.join(', ')}` });
    }
    if (enquiryIds.length > 200) {
      return res.status(400).json({ error: 'Maximum 200 enquiries per batch' });
    }

    const ids = enquiryIds.map(Number).filter(id => id > 0);

    // Get existing enquiries to derive qualification + track changes
    const existing = await prisma.enquiry.findMany({
      where: { id: { in: ids } },
      select: { id: true, status: true, leadScore: true },
    });

    const existingMap = Object.fromEntries(existing.map(e => [e.id, e]));
    const changed = ids.filter(id => existingMap[id] && existingMap[id].status !== status);

    if (!changed.length) {
      return res.json({ updated: 0, message: 'No enquiries needed updating' });
    }

    // Batch update using transaction
    const updates = changed.map(id => {
      const e = existingMap[id];
      return prisma.enquiry.update({
        where: { id },
        data: {
          status,
          qualificationStatus: deriveQualification(e.leadScore || 0, status),
        },
      });
    });

    await prisma.$transaction(updates);

    logAudit({
      userId: req.user.id,
      action: 'bulk_status_update',
      entity: 'enquiry',
      details: { status, count: changed.length, ids: changed.slice(0, 50) },
      ipAddress: getIp(req),
    });

    res.json({ updated: changed.length, skipped: ids.length - changed.length, status });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/admin/bulk/assign — batch assign counselor ────────────────────
router.post('/assign', async (req, res, next) => {
  try {
    const { enquiryIds, counselorId } = req.body;
    if (!Array.isArray(enquiryIds) || !enquiryIds.length) {
      return res.status(400).json({ error: 'enquiryIds array required' });
    }
    if (!counselorId) {
      return res.status(400).json({ error: 'counselorId required' });
    }
    if (enquiryIds.length > 200) {
      return res.status(400).json({ error: 'Maximum 200 enquiries per batch' });
    }

    // Verify counselor exists
    const counselor = await prisma.user.findUnique({
      where: { id: Number(counselorId) },
      select: { id: true, name: true, role: true },
    });
    if (!counselor) {
      return res.status(404).json({ error: 'Counselor not found' });
    }

    const ids = enquiryIds.map(Number).filter(id => id > 0);
    const result = await prisma.enquiry.updateMany({
      where: { id: { in: ids } },
      data: { counselorId: counselor.id },
    });

    logAudit({
      userId: req.user.id,
      action: 'bulk_assign',
      entity: 'enquiry',
      details: { counselorId: counselor.id, counselorName: counselor.name, count: result.count },
      ipAddress: getIp(req),
    });

    res.json({ updated: result.count, counselor: { id: counselor.id, name: counselor.name } });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/admin/bulk/export — CSV export of enquiries ────────────────────
router.get('/export', async (req, res, next) => {
  try {
    const { status, counselorId, collegeId, dateFrom, dateTo, source, format = 'csv' } = req.query;
    const where = {};

    if (status) where.status = status;
    if (counselorId) where.counselorId = Number(counselorId);
    if (collegeId) where.collegeId = Number(collegeId);
    if (source) where.source = source;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo + 'T23:59:59Z');
    }

    const enquiries = await prisma.enquiry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 5000, // Safety limit
      include: {
        student: { select: { name: true, phone: true, email: true, preferredCat: true, state: true } },
        college: { select: { name: true, city: true } },
        course: { select: { name: true } },
        counselor: { select: { name: true } },
      },
    });

    logAudit({
      userId: req.user.id,
      action: 'bulk_export',
      entity: 'enquiry',
      details: { filters: req.query, count: enquiries.length },
      ipAddress: getIp(req),
    });

    if (format === 'json') {
      return res.json({ enquiries, total: enquiries.length });
    }

    // CSV output
    const headers = [
      'ID', 'Student Name', 'Phone', 'Email', 'College', 'City', 'Course',
      'Status', 'Qualification', 'Lead Score', 'Source', 'Counselor',
      'Follow-Up Date', 'Notes', 'Created At',
    ];

    const escCsv = (val) => {
      if (val === null || val === undefined) return '';
      const s = String(val).replace(/"/g, '""');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
    };

    const rows = enquiries.map(e => [
      e.id,
      escCsv(e.student?.name),
      escCsv(e.student?.phone),
      escCsv(e.student?.email),
      escCsv(e.college?.name),
      escCsv(e.college?.city),
      escCsv(e.course?.name),
      e.status,
      e.qualificationStatus,
      e.leadScore || 0,
      escCsv(e.source),
      escCsv(e.counselor?.name),
      e.followUpDate ? new Date(e.followUpDate).toISOString().split('T')[0] : '',
      escCsv(e.notes),
      new Date(e.createdAt).toISOString(),
    ].join(','));

    const csv = [headers.join(','), ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="enquiries-export-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/admin/bulk/export/colleges — CSV export of colleges ────────────
router.get('/export/colleges', async (req, res, next) => {
  try {
    const colleges = await prisma.college.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: {
        courses: { where: { isActive: true }, select: { name: true, totalFee: true, category: true } },
        _count: { select: { enquiries: true } },
      },
    });

    logAudit({
      userId: req.user.id,
      action: 'bulk_export',
      entity: 'college',
      details: { count: colleges.length },
      ipAddress: getIp(req),
    });

    const headers = [
      'ID', 'Name', 'City', 'State', 'Type', 'Accreditation', 'Approved By',
      'Phone', 'Email', 'Website', 'Course Count', 'Enquiry Count',
      'Min Fee', 'Max Fee', 'Price Per Lead',
    ];

    const escCsv = (val) => {
      if (val === null || val === undefined) return '';
      const s = String(val).replace(/"/g, '""');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
    };

    const rows = colleges.map(c => [
      c.id,
      escCsv(c.name),
      escCsv(c.city),
      escCsv(c.state),
      escCsv(c.type),
      escCsv(c.accreditation),
      escCsv(c.approvedBy),
      escCsv(c.phone),
      escCsv(c.email),
      escCsv(c.website),
      c.courses.length,
      c._count.enquiries,
      c.minFee || '',
      c.maxFee || '',
      c.pricePerLead || '',
    ].join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="colleges-export-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/admin/bulk/delete — soft-delete (deactivate) enquiries ────────
router.post('/delete', async (req, res, next) => {
  try {
    const { enquiryIds } = req.body;
    if (!Array.isArray(enquiryIds) || !enquiryIds.length) {
      return res.status(400).json({ error: 'enquiryIds array required' });
    }
    if (enquiryIds.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 enquiries per batch' });
    }

    const ids = enquiryIds.map(Number).filter(id => id > 0);

    // Soft delete = set status to Dropped + add a note
    const result = await prisma.enquiry.updateMany({
      where: { id: { in: ids } },
      data: { status: 'Dropped', notes: '[Bulk archived by admin]' },
    });

    logAudit({
      userId: req.user.id,
      action: 'bulk_archive',
      entity: 'enquiry',
      details: { count: result.count, ids: ids.slice(0, 50) },
      ipAddress: getIp(req),
    });

    res.json({ archived: result.count });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
