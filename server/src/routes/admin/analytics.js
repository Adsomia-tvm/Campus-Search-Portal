/**
 * RPT-01/02/03: Analytics & Reporting endpoints
 * Advanced analytics beyond the basic reports — conversion funnels,
 * cohort analysis, source attribution, college performance, agent leaderboards.
 */
const router = require('express').Router();
const prisma = require('../../lib/prisma');
const { requireStaff } = require('../../middleware/auth');

router.use(requireStaff);

// ── RPT-01: Admin Analytics Dashboard ──────────────────────────────────────

// GET /api/admin/analytics/overview
// KPI summary: leads, conversion rate, revenue, growth trends
router.get('/overview', async (req, res, next) => {
  try {
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const [
      totalEnquiries, thisMonthEnquiries, lastMonthEnquiries,
      totalEnrolled, thisMonthEnrolled,
      totalStudents, totalColleges, totalAgents,
      commissionTotal, commissionThisMonth,
      sourceBreakdown, qualBreakdown,
    ] = await Promise.all([
      prisma.enquiry.count(),
      prisma.enquiry.count({ where: { createdAt: { gte: thisMonth } } }),
      prisma.enquiry.count({ where: { createdAt: { gte: lastMonth, lt: thisMonth } } }),
      prisma.enquiry.count({ where: { status: 'Enrolled' } }),
      prisma.enquiry.count({ where: { status: 'Enrolled', updatedAt: { gte: thisMonth } } }),
      prisma.student.count(),
      prisma.college.count({ where: { isActive: true } }),
      prisma.agent.count(),
      prisma.commission.aggregate({ where: { status: 'Received' }, _sum: { amount: true } }),
      prisma.commission.aggregate({ where: { status: 'Received', paymentDate: { gte: thisMonth } }, _sum: { amount: true } }),
      prisma.enquiry.groupBy({ by: ['source'], _count: { id: true }, orderBy: { _count: { id: 'desc' } } }),
      prisma.enquiry.groupBy({ by: ['qualificationStatus'], _count: { id: true } }),
    ]);

    const conversionRate = totalEnquiries > 0 ? ((totalEnrolled / totalEnquiries) * 100).toFixed(1) : 0;
    const growthRate = lastMonthEnquiries > 0
      ? (((thisMonthEnquiries - lastMonthEnquiries) / lastMonthEnquiries) * 100).toFixed(1)
      : thisMonthEnquiries > 0 ? 100 : 0;

    res.json({
      kpis: {
        totalEnquiries, thisMonthEnquiries, lastMonthEnquiries,
        totalEnrolled, thisMonthEnrolled,
        conversionRate: Number(conversionRate),
        growthRate: Number(growthRate),
        totalStudents, totalColleges, totalAgents,
        revenueTotal: commissionTotal._sum.amount || 0,
        revenueThisMonth: commissionThisMonth._sum.amount || 0,
      },
      sourceBreakdown: sourceBreakdown.map(s => ({ source: s.source || 'Unknown', count: s._count.id })),
      qualificationPipeline: qualBreakdown.map(q => ({ status: q.qualificationStatus, count: q._count.id })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/analytics/trends
// Daily/weekly/monthly enquiry + enrollment trends
router.get('/trends', async (req, res, next) => {
  try {
    const { period = 'daily', months = 3 } = req.query;
    const interval = period === 'monthly' ? 'month' : period === 'weekly' ? 'week' : 'day';
    const lookback = Math.min(Number(months) || 3, 12);

    const rows = await prisma.$queryRaw`
      SELECT DATE_TRUNC(${interval}::text, "created_at") AS period,
             COUNT(*)::int AS enquiries,
             COUNT(*) FILTER (WHERE status = 'Enrolled')::int AS enrolled,
             COUNT(*) FILTER (WHERE status = 'Dropped')::int AS dropped,
             ROUND(AVG("leadScore"))::int AS "avgScore"
      FROM enquiries
      WHERE "created_at" > NOW() - (${lookback}::int || ' months')::interval
      GROUP BY period ORDER BY period ASC`;

    res.json({ period: interval, data: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/analytics/funnel
// Full conversion funnel with time-in-stage
router.get('/funnel', async (req, res, next) => {
  try {
    const statusOrder = ['New', 'Contacted', 'Visited', 'Applied', 'Enrolled', 'Dropped'];

    const counts = await prisma.enquiry.groupBy({
      by: ['status'],
      _count: { id: true },
    });

    const countMap = Object.fromEntries(counts.map(c => [c.status, c._count.id]));
    const total = Object.values(countMap).reduce((s, v) => s + v, 0) || 1;

    const funnel = statusOrder.map((status, i) => {
      const count = countMap[status] || 0;
      const pct = ((count / total) * 100).toFixed(1);
      return { status, count, pct: Number(pct) };
    });

    // Stage progression rates
    const progressionRates = [];
    for (let i = 0; i < statusOrder.length - 2; i++) {
      const from = statusOrder[i];
      const to = statusOrder[i + 1];
      const fromCount = countMap[from] || 0;
      const toCount = countMap[to] || 0;
      if (fromCount > 0) {
        progressionRates.push({
          from, to,
          rate: Number(((toCount / (fromCount + toCount)) * 100).toFixed(1)),
        });
      }
    }

    res.json({ funnel, progressionRates, total });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/analytics/source-attribution
// Lead source effectiveness with conversion rates
router.get('/source-attribution', async (req, res, next) => {
  try {
    const rows = await prisma.$queryRaw`
      SELECT
        COALESCE(source, 'Unknown') AS source,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'Enrolled')::int AS enrolled,
        COUNT(*) FILTER (WHERE status = 'Dropped')::int AS dropped,
        ROUND(AVG("leadScore"))::int AS "avgScore",
        ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'Enrolled') / NULLIF(COUNT(*), 0), 1) AS "conversionRate"
      FROM enquiries
      GROUP BY source
      ORDER BY total DESC`;

    res.json({ sources: rows });
  } catch (err) {
    next(err);
  }
});

// ── RPT-02: College Performance Report ─────────────────────────────────────

// GET /api/admin/analytics/college-performance
// Per-college: leads, conversion, revenue, response time
router.get('/college-performance', async (req, res, next) => {
  try {
    const { limit = 30, sort = 'enquiries' } = req.query;
    const take = Math.min(Number(limit) || 30, 100);

    const sortCol = {
      enquiries: 'total',
      enrolled: 'enrolled',
      conversion: '"conversionRate"',
      revenue: '"totalRevenue"',
    }[sort] || 'total';

    const rows = await prisma.$queryRaw`
      SELECT
        col.id,
        col.name,
        col.city,
        col.type,
        col."partnershipTier",
        COUNT(e.id)::int AS total,
        COUNT(e.id) FILTER (WHERE e.status = 'Enrolled')::int AS enrolled,
        COUNT(e.id) FILTER (WHERE e.status = 'Dropped')::int AS dropped,
        COUNT(e.id) FILTER (WHERE e.status = 'New')::int AS "newLeads",
        ROUND(100.0 * COUNT(e.id) FILTER (WHERE e.status = 'Enrolled') / NULLIF(COUNT(e.id), 0), 1) AS "conversionRate",
        ROUND(AVG(e."leadScore"))::int AS "avgLeadScore",
        COALESCE(SUM(c.amount) FILTER (WHERE c.status = 'Received'), 0)::int AS "totalRevenue",
        COALESCE(SUM(c.amount) FILTER (WHERE c.status = 'Pending'), 0)::int AS "pendingRevenue",
        COUNT(DISTINCT e."agentId") FILTER (WHERE e."agentId" IS NOT NULL)::int AS "agentLeads"
      FROM colleges col
      LEFT JOIN enquiries e ON e.college_id = col.id
      LEFT JOIN commissions c ON c."enquiryId" = e.id
      WHERE col."isActive" = true
      GROUP BY col.id, col.name, col.city, col.type, col."partnershipTier"
      ORDER BY ${sortCol} DESC NULLS LAST
      LIMIT ${take}`;

    // Summary stats
    const summary = await prisma.$queryRaw`
      SELECT
        COUNT(DISTINCT col.id)::int AS "totalColleges",
        COUNT(e.id)::int AS "totalEnquiries",
        COUNT(e.id) FILTER (WHERE e.status = 'Enrolled')::int AS "totalEnrolled",
        COALESCE(SUM(c.amount) FILTER (WHERE c.status = 'Received'), 0)::int AS "totalRevenue"
      FROM colleges col
      LEFT JOIN enquiries e ON e.college_id = col.id
      LEFT JOIN commissions c ON c."enquiryId" = e.id
      WHERE col."isActive" = true`;

    res.json({ colleges: rows, summary: summary[0] || {} });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/analytics/college-performance/:id
// Single college deep-dive
router.get('/college-performance/:id', async (req, res, next) => {
  try {
    const collegeId = Number(req.params.id);

    const [college, statusCounts, monthlyTrend, topCourses, sourceBreakdown] = await Promise.all([
      prisma.college.findUnique({
        where: { id: collegeId },
        select: { id: true, name: true, city: true, type: true, partnershipTier: true, pricePerLead: true, monthlyLeadCap: true },
      }),
      prisma.enquiry.groupBy({ by: ['status'], where: { collegeId }, _count: { id: true } }),
      prisma.$queryRaw`
        SELECT DATE_TRUNC('month', "created_at") AS month,
               COUNT(*)::int AS enquiries,
               COUNT(*) FILTER (WHERE status = 'Enrolled')::int AS enrolled
        FROM enquiries WHERE college_id = ${collegeId}
          AND "created_at" > NOW() - INTERVAL '12 months'
        GROUP BY month ORDER BY month ASC`,
      prisma.$queryRaw`
        SELECT c2.name AS course, c2.category,
               COUNT(e.id)::int AS enquiries,
               COUNT(e.id) FILTER (WHERE e.status = 'Enrolled')::int AS enrolled
        FROM enquiries e
        JOIN courses c2 ON c2.id = e.course_id
        WHERE e.college_id = ${collegeId}
        GROUP BY c2.name, c2.category ORDER BY enquiries DESC LIMIT 10`,
      prisma.enquiry.groupBy({
        by: ['source'],
        where: { collegeId },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),
    ]);

    if (!college) return res.status(404).json({ error: 'College not found' });

    res.json({
      college,
      statusCounts: Object.fromEntries(statusCounts.map(s => [s.status, s._count.id])),
      monthlyTrend,
      topCourses,
      sourceBreakdown: sourceBreakdown.map(s => ({ source: s.source || 'Unknown', count: s._count.id })),
    });
  } catch (err) {
    next(err);
  }
});

// ── RPT-03: Agent Leaderboard ──────────────────────────────────────────────

// GET /api/admin/analytics/agent-leaderboard
router.get('/agent-leaderboard', async (req, res, next) => {
  try {
    const { period = 'all' } = req.query;
    let dateFilter = '';
    if (period === 'month') dateFilter = "AND e.\"created_at\" >= DATE_TRUNC('month', NOW())";
    else if (period === 'quarter') dateFilter = "AND e.\"created_at\" >= DATE_TRUNC('quarter', NOW())";
    else if (period === 'year') dateFilter = "AND e.\"created_at\" >= DATE_TRUNC('year', NOW())";

    // Using raw SQL for complex aggregation
    const agents = await prisma.$queryRawUnsafe(`
      SELECT
        a.id AS "agentId",
        u.name AS "agentName",
        a."referralCode",
        a."commissionRate",
        a."isVerified",
        COUNT(e.id)::int AS "totalReferrals",
        COUNT(e.id) FILTER (WHERE e.status = 'Enrolled')::int AS enrolled,
        COUNT(e.id) FILTER (WHERE e.status NOT IN ('Enrolled', 'Dropped'))::int AS active,
        COUNT(e.id) FILTER (WHERE e.status = 'Dropped')::int AS dropped,
        ROUND(100.0 * COUNT(e.id) FILTER (WHERE e.status = 'Enrolled') / NULLIF(COUNT(e.id), 0), 1) AS "conversionRate",
        ROUND(AVG(e."leadScore"))::int AS "avgLeadScore",
        COALESCE(SUM(c."agentAmount") FILTER (WHERE c.status = 'Received'), 0)::int AS "totalEarnings",
        COALESCE(SUM(c."agentAmount") FILTER (WHERE c.status = 'Pending'), 0)::int AS "pendingEarnings",
        COUNT(DISTINCT e.college_id)::int AS "uniqueColleges",
        MIN(e."created_at") AS "firstReferral",
        MAX(e."created_at") AS "lastReferral"
      FROM agents a
      JOIN users u ON u.id = a."userId"
      LEFT JOIN enquiries e ON e."agentId" = a.id ${dateFilter}
      LEFT JOIN commissions c ON c."enquiryId" = e.id
      GROUP BY a.id, u.name, a."referralCode", a."commissionRate", a."isVerified"
      HAVING COUNT(e.id) > 0
      ORDER BY "totalReferrals" DESC
    `);

    // Overall stats
    const totals = {
      totalAgents: agents.length,
      totalReferrals: agents.reduce((s, a) => s + a.totalReferrals, 0),
      totalEnrolled: agents.reduce((s, a) => s + a.enrolled, 0),
      totalEarnings: agents.reduce((s, a) => s + (a.totalEarnings || 0), 0),
    };

    res.json({ agents, totals, period });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/analytics/agent-leaderboard/:agentId
// Single agent performance deep-dive
router.get('/agent-leaderboard/:agentId', async (req, res, next) => {
  try {
    const agentId = Number(req.params.agentId);

    const [agent, statusCounts, monthlyTrend, topColleges] = await Promise.all([
      prisma.agent.findUnique({
        where: { id: agentId },
        select: {
          id: true, referralCode: true, commissionRate: true, isVerified: true, createdAt: true,
          user: { select: { name: true, email: true, phone: true } },
        },
      }),
      prisma.enquiry.groupBy({ by: ['status'], where: { agentId }, _count: { id: true } }),
      prisma.$queryRaw`
        SELECT DATE_TRUNC('month', "created_at") AS month,
               COUNT(*)::int AS referrals,
               COUNT(*) FILTER (WHERE status = 'Enrolled')::int AS enrolled
        FROM enquiries WHERE "agentId" = ${agentId}
          AND "created_at" > NOW() - INTERVAL '12 months'
        GROUP BY month ORDER BY month ASC`,
      prisma.$queryRaw`
        SELECT col.name AS college, col.city,
               COUNT(e.id)::int AS referrals,
               COUNT(e.id) FILTER (WHERE e.status = 'Enrolled')::int AS enrolled
        FROM enquiries e
        JOIN colleges col ON col.id = e.college_id
        WHERE e."agentId" = ${agentId}
        GROUP BY col.name, col.city ORDER BY referrals DESC LIMIT 10`,
    ]);

    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    res.json({
      agent,
      statusCounts: Object.fromEntries(statusCounts.map(s => [s.status, s._count.id])),
      monthlyTrend,
      topColleges,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
