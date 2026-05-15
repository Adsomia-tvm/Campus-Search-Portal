const router = require('express').Router();
const bcrypt = require('bcryptjs');
const prisma = require('../../lib/prisma');
const { requireTeamMember, requireAdmin } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { createAffiliate, updateAffiliate, idParam } = require('../../middleware/schemas');

// Strip + transform the writeable affiliate fields. Hashes `password` into
// `passwordHash` so callers can set/reset the affiliate portal password
// from the admin UI without ever sending the plaintext back out.
async function pickAffiliateFields(body) {
  const allowed = ['name','email','phone','code','type','commissionPerLead','commissionPerEnrolled',
                    'paymentCadence','upiId','bankAccount','ifsc','panNumber','gstNumber','notes','isActive'];
  const data = {};
  for (const k of allowed) if (body[k] !== undefined) data[k] = body[k];
  if (body.password) {
    data.passwordHash = await bcrypt.hash(body.password, 12);
  }
  return data;
}

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
    const data = await pickAffiliateFields(req.body);
    const affiliate = await prisma.affiliate.create({ data });
    // Don't echo passwordHash back to clients.
    delete affiliate.passwordHash;
    res.status(201).json(affiliate);
  } catch (err) {
    if (err?.code === 'P2002') {
      return res.status(400).json({ error: `Affiliate code "${req.body.code}" is already taken.` });
    }
    next(err);
  }
});

// PUT /api/admin/affiliates/:id
router.put('/:id', requireAdmin, validate(updateAffiliate), async (req, res, next) => {
  try {
    const data = await pickAffiliateFields(req.body);
    const affiliate = await prisma.affiliate.update({
      where: { id: Number(req.params.id) },
      data,
    });
    delete affiliate.passwordHash;
    res.json(affiliate);
  } catch (err) {
    if (err?.code === 'P2002') {
      return res.status(400).json({ error: `Affiliate code "${req.body.code}" is already taken.` });
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
// commissionPerEnrolled. Qualified = the counsellor actually engaged the
// lead — i.e. status is past 'New', past 'Attempted' (which means we
// tried to call but didn't connect), and not 'Junk'. Without this filter
// affiliates would be paid per RNR call, not per real conversation.
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

    // Statuses that don't count as "qualified" for affiliate commission:
    //   New       — counsellor hasn't touched the lead yet
    //   Attempted — counsellor called but didn't connect (RNR/busy)
    //   Junk      — fake/spam/invalid lead
    // Everything else (Connected, Counselling Done, Visited, Applied,
    // Enrolled, Follow-up, Dropped) represents a real conversation
    // happened, so it counts toward per-lead commission.
    const UNQUALIFIED = new Set(['New', 'Attempted', 'Junk']);
    const counts = {
      total:     enquiries.length,
      qualified: enquiries.filter(e => !UNQUALIFIED.has(e.status)).length,
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
