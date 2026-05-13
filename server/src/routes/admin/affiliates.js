const router = require('express').Router();
const prisma = require('../../lib/prisma');
const { requireTeamMember, requireAdmin } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { createAffiliate, updateAffiliate, idParam } = require('../../middleware/schemas');

router.use(requireTeamMember);

// GET /api/admin/affiliates
router.get('/', async (req, res, next) => {
  try {
    const { search, active, page = 1, limit = 50 } = req.query;
    const where = {};
    if (search) where.OR = [
      { name:  { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { code:  { contains: search.toLowerCase() } },
    ];
    if (active === 'true')  where.isActive = true;
    if (active === 'false') where.isActive = false;

    const take = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const skip = (Math.max(Number(page), 1) - 1) * take;
    const [affiliates, total] = await Promise.all([
      prisma.affiliate.findMany({
        where, skip, take, orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
        include: { _count: { select: { enquiries: true } } },
      }),
      prisma.affiliate.count({ where }),
    ]);
    res.json({ affiliates, total, page: Number(page), pages: Math.ceil(total / take) });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/affiliates/:id
router.get('/:id', validate(idParam), async (req, res, next) => {
  try {
    const affiliate = await prisma.affiliate.findUnique({
      where: { id: Number(req.params.id) },
      include: { _count: { select: { enquiries: true } } },
    });
    if (!affiliate) return res.status(404).json({ error: 'Affiliate not found' });
    res.json(affiliate);
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/affiliates
router.post('/', requireAdmin, validate(createAffiliate), async (req, res, next) => {
  try {
    if (!prisma.affiliate) {
      // Prisma client wasn't regenerated against the new schema — the
      // Affiliate model is missing from the runtime client. Surfacing this
      // clearly beats a generic "Invalid request" from the error handler.
      return res.status(500).json({
        error: 'Affiliate model missing from Prisma client on the server. Redeploy with a clean build (cache cleared) so `prisma generate` re-runs.',
      });
    }
    const affiliate = await prisma.affiliate.create({ data: req.body });
    res.status(201).json(affiliate);
  } catch (err) {
    if (err?.code === 'P2002') {
      return res.status(400).json({ error: `Affiliate code "${req.body.code}" is already taken.` });
    }
    // Surface the real Prisma error to the client so we don't have to dig
    // through Vercel logs every time. Admin-only endpoint, low risk.
    if (err?.name?.startsWith('PrismaClient')) {
      return res.status(400).json({
        error: 'Affiliate create failed',
        prismaCode: err.code,
        detail: err.message,
      });
    }
    next(err);
  }
});

// PUT /api/admin/affiliates/:id
router.put('/:id', requireAdmin, validate(updateAffiliate), async (req, res, next) => {
  try {
    const affiliate = await prisma.affiliate.update({
      where: { id: Number(req.params.id) },
      data: req.body,
    });
    res.json(affiliate);
  } catch (err) {
    if (err?.code === 'P2002') {
      return res.status(400).json({ error: `Affiliate code "${req.body.code}" is already taken.` });
    }
    if (err?.name?.startsWith('PrismaClient')) {
      return res.status(400).json({
        error: 'Affiliate update failed',
        prismaCode: err.code,
        detail: err.message,
      });
    }
    next(err);
  }
});

// DELETE /api/admin/affiliates/:id
// Soft-style: detaches enquiries from the affiliate then hard-deletes.
// Historical enquiry rows are kept (affiliateId set to null) so reporting
// numbers for past months stay accurate even after the affiliate is removed.
router.delete('/:id', requireAdmin, validate(idParam), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await prisma.$transaction([
      prisma.enquiry.updateMany({ where: { affiliateId: id }, data: { affiliateId: null } }),
      prisma.affiliate.delete({ where: { id } }),
    ]);
    res.json({ success: true, deletedId: id });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/admin/affiliates/:id/report ────────────────────────────────────
// Monthly commission report for one affiliate.
//   ?month=YYYY-MM   (defaults to current month)
//   ?format=csv      → CSV download of the lead list
//
// Returns aggregated counts (total / qualified / enrolled / junk) plus the
// commission owed for the month based on commissionPerLead +
// commissionPerEnrolled. Qualified = any status past 'New' that isn't Junk
// (so the affiliate is paid for leads that the counselor at least engaged
// with, not for spam / unworked rows).
router.get('/:id/report', validate(idParam), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const affiliate = await prisma.affiliate.findUnique({ where: { id } });
    if (!affiliate) return res.status(404).json({ error: 'Affiliate not found' });

    const { month = monthString(new Date()), format } = req.query;
    const { start, end } = monthRange(month);

    const enquiries = await prisma.enquiry.findMany({
      where: {
        affiliateId: id,
        createdAt:   { gte: start, lt: end },
      },
      include: {
        student: { select: { name: true, phone: true, email: true, city: true } },
        college: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const counts = {
      total:     enquiries.length,
      qualified: enquiries.filter(e => e.status !== 'New' && e.status !== 'Junk').length,
      enrolled:  enquiries.filter(e => e.status === 'Enrolled').length,
      junk:      enquiries.filter(e => e.status === 'Junk').length,
    };

    const commission = {
      perLeadRate:     affiliate.commissionPerLead     || 0,
      perEnrolledRate: affiliate.commissionPerEnrolled || 0,
      leadCommission:  counts.qualified * (affiliate.commissionPerLead     || 0),
      enrolledCommission: counts.enrolled  * (affiliate.commissionPerEnrolled || 0),
      get total() { return this.leadCommission + this.enrolledCommission; },
    };
    commission.total = commission.leadCommission + commission.enrolledCommission;

    if (format === 'csv') {
      const lines = [
        ['Date', 'Student', 'Phone', 'Email', 'City', 'College', 'Status', 'UTM Source', 'UTM Medium'].join(','),
        ...enquiries.map(e => [
          new Date(e.createdAt).toISOString().slice(0, 10),
          csvEscape(e.student?.name),
          e.student?.phone || '',
          csvEscape(e.student?.email || ''),
          csvEscape(e.student?.city || ''),
          csvEscape(e.college?.name),
          e.status,
          e.utmSource || '',
          e.utmMedium || '',
        ].join(',')),
      ];
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="affiliate-${affiliate.code}-${month}.csv"`);
      return res.send(lines.join('\n'));
    }

    res.json({
      affiliate: { id: affiliate.id, name: affiliate.name, code: affiliate.code, paymentCadence: affiliate.paymentCadence },
      month,
      range: { start, end },
      counts,
      commission,
      enquiries: enquiries.map(e => ({
        id: e.id, createdAt: e.createdAt, status: e.status,
        student: e.student, college: e.college,
        utmSource: e.utmSource, utmMedium: e.utmMedium,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ── Helpers ─────────────────────────────────────────────────────────────────
function monthString(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monthRange(month) {
  // month = "YYYY-MM"; produce [start, end) in UTC.
  const [y, m] = month.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end   = new Date(Date.UTC(y, m,     1));
  return { start, end };
}
function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

module.exports = router;
