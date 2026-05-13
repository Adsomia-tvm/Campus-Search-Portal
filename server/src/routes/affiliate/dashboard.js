const router = require('express').Router();
const prisma = require('../../lib/prisma');
const { requireAffiliate } = require('../../middleware/auth');

// All routes here are affiliate-only.
router.use(requireAffiliate);

// Helpers
function monthRange(monthStr) {
  // monthStr = "YYYY-MM" — produce [start, end) in UTC for the month.
  const d = monthStr ? new Date(`${monthStr}-01T00:00:00.000Z`) : new Date();
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const end   = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  return { start, end, label: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}` };
}

// Count enquiries by status into the 4 buckets we surface.
async function bucketCounts(where) {
  const groups = await prisma.enquiry.groupBy({
    by: ['status'],
    where,
    _count: { id: true },
  });
  const map = Object.fromEntries(groups.map(g => [g.status, g._count.id]));
  const total     = groups.reduce((s, g) => s + g._count.id, 0);
  const enrolled  = map.Enrolled || 0;
  const junk      = map.Junk     || 0;
  // Qualified = anything past "New" that isn't junk. Same logic as the
  // admin monthly report so totals reconcile.
  const qualified = total - (map.New || 0) - junk;
  return { total, qualified, enrolled, junk };
}

// GET /api/affiliate/dashboard — aggregate stats only, no PII
router.get('/', async (req, res, next) => {
  try {
    const affiliateId = req.user.affiliateId;
    const affiliate = await prisma.affiliate.findUnique({
      where: { id: affiliateId },
      select: {
        id: true, name: true, code: true,
        commissionPerLead: true, commissionPerEnrolled: true,
        paymentCadence: true,
      },
    });
    if (!affiliate) return res.status(404).json({ error: 'Affiliate not found' });

    const { start, end, label } = monthRange(req.query.month);

    // All-time + this month
    const [allTime, thisMonth] = await Promise.all([
      bucketCounts({ affiliateId }),
      bucketCounts({ affiliateId, createdAt: { gte: start, lt: end } }),
    ]);

    const commission = {
      perLead:     affiliate.commissionPerLead     || 0,
      perEnrolled: affiliate.commissionPerEnrolled || 0,
      thisMonth: {
        lead:     thisMonth.qualified * (affiliate.commissionPerLead     || 0),
        enrolled: thisMonth.enrolled  * (affiliate.commissionPerEnrolled || 0),
        total:    thisMonth.qualified * (affiliate.commissionPerLead     || 0) +
                  thisMonth.enrolled  * (affiliate.commissionPerEnrolled || 0),
      },
      allTime: {
        lead:     allTime.qualified * (affiliate.commissionPerLead     || 0),
        enrolled: allTime.enrolled  * (affiliate.commissionPerEnrolled || 0),
        total:    allTime.qualified * (affiliate.commissionPerLead     || 0) +
                  allTime.enrolled  * (affiliate.commissionPerEnrolled || 0),
      },
    };

    // 6-month trend (current month + 5 prior) — for the dashboard chart.
    const monthlyTrend = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - i, 1));
      const e = new Date(Date.UTC(d.getUTCFullYear(),   d.getUTCMonth() + 1, 1));
      const counts = await bucketCounts({ affiliateId, createdAt: { gte: d, lt: e } });
      monthlyTrend.push({
        month: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
        ...counts,
      });
    }

    res.json({
      affiliate: { name: affiliate.name, code: affiliate.code, paymentCadence: affiliate.paymentCadence },
      month: label,
      allTime,
      thisMonth,
      commission,
      monthlyTrend,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
