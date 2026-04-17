const router = require('express').Router();
const prisma = require('../../lib/prisma');
const { requireAdmin } = require('../../middleware/auth');
const { logAudit, getIp } = require('../../lib/audit');
const zoho = require('../../lib/zohoCrm');

router.use(requireAdmin);

// ── GET /api/admin/crm/status — check Zoho CRM configuration ───────────────
router.get('/status', (req, res) => {
  res.json({ configured: zoho.isConfigured() });
});

// ── POST /api/admin/crm/sync-enquiry/:id — sync single enquiry to CRM ──────
router.post('/sync-enquiry/:id', async (req, res, next) => {
  try {
    if (!zoho.isConfigured()) {
      return res.status(503).json({ error: 'Zoho CRM not configured. Set ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, and ZOHO_REFRESH_TOKEN.' });
    }

    const enquiry = await prisma.enquiry.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        student: { select: { name: true, phone: true, email: true, state: true } },
        college: { select: { name: true, city: true } },
        course: { select: { name: true } },
      },
    });
    if (!enquiry) return res.status(404).json({ error: 'Enquiry not found' });

    const result = await zoho.syncEnquiry(enquiry);

    logAudit({
      userId: req.user.id,
      action: 'crm_sync_enquiry',
      entity: 'enquiry',
      entityId: enquiry.id,
      details: { zohoResult: result?.data?.[0]?.status },
      ipAddress: getIp(req),
    });

    res.json({
      synced: true,
      enquiryId: enquiry.id,
      zohoStatus: result?.data?.[0]?.status || 'sent',
      zohoId: result?.data?.[0]?.details?.id,
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/admin/crm/bulk-sync — sync multiple enquiries to CRM ─────────
router.post('/bulk-sync', async (req, res, next) => {
  try {
    if (!zoho.isConfigured()) {
      return res.status(503).json({ error: 'Zoho CRM not configured' });
    }

    const { enquiryIds, dateFrom, dateTo, status } = req.body;
    const where = {};

    if (enquiryIds?.length) {
      where.id = { in: enquiryIds.map(Number) };
    } else {
      // Filter-based sync
      if (status) where.status = status;
      if (dateFrom || dateTo) {
        where.createdAt = {};
        if (dateFrom) where.createdAt.gte = new Date(dateFrom);
        if (dateTo) where.createdAt.lte = new Date(dateTo + 'T23:59:59Z');
      }
    }

    const enquiries = await prisma.enquiry.findMany({
      where,
      take: 500, // Safety limit
      include: {
        student: { select: { name: true, phone: true, email: true, state: true } },
        college: { select: { name: true, city: true } },
        course: { select: { name: true } },
      },
    });

    if (!enquiries.length) {
      return res.json({ synced: 0, message: 'No enquiries to sync' });
    }

    const results = await zoho.bulkSyncLeads(enquiries);
    const totalSynced = results.reduce((sum, r) => sum + (r?.data?.length || 0), 0);

    logAudit({
      userId: req.user.id,
      action: 'crm_bulk_sync',
      entity: 'enquiry',
      details: { count: enquiries.length, synced: totalSynced },
      ipAddress: getIp(req),
    });

    res.json({ synced: totalSynced, total: enquiries.length });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/admin/crm/sync-college/:id — push college as Zoho Account ────
router.post('/sync-college/:id', async (req, res, next) => {
  try {
    if (!zoho.isConfigured()) {
      return res.status(503).json({ error: 'Zoho CRM not configured' });
    }

    const college = await prisma.college.findUnique({
      where: { id: Number(req.params.id) },
    });
    if (!college) return res.status(404).json({ error: 'College not found' });

    const result = await zoho.pushAccount(college);

    logAudit({
      userId: req.user.id,
      action: 'crm_sync_college',
      entity: 'college',
      entityId: college.id,
      details: { zohoResult: result?.data?.[0]?.status },
      ipAddress: getIp(req),
    });

    res.json({
      synced: true,
      collegeId: college.id,
      zohoId: result?.data?.[0]?.details?.id,
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/admin/crm/lookup/:phone — find lead in Zoho by phone ──────────
router.get('/lookup/:phone', async (req, res, next) => {
  try {
    if (!zoho.isConfigured()) {
      return res.status(503).json({ error: 'Zoho CRM not configured' });
    }

    const lead = await zoho.findLeadByPhone(req.params.phone);
    if (!lead) return res.status(404).json({ error: 'Lead not found in Zoho CRM' });

    res.json({
      zohoId: lead.id,
      name: `${lead.First_Name || ''} ${lead.Last_Name || ''}`.trim(),
      phone: lead.Phone,
      email: lead.Email,
      status: lead.Lead_Status,
      source: lead.Lead_Source,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
