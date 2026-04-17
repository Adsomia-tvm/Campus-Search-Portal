const router = require('express').Router();
const prisma = require('../../lib/prisma');
const { requireStaff, requireAdmin } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { createCommission, updateCommission, idParam } = require('../../middleware/schemas');
const { logAudit, getIp } = require('../../lib/audit');
const { notifyCommissionUpdate } = require('../../lib/notify');

router.use(requireStaff);

// ── GET /api/admin/commissions ───────────────────────────────────────────────
// Enhanced: supports college/agent/date filters + summary stats
router.get('/', async (req, res, next) => {
  try {
    const { status, collegeId, agentId, from, to, page = 1, limit = 30 } = req.query;
    const where = {};
    if (status) where.status = status;
    if (collegeId) where.collegeId = Number(collegeId);
    if (agentId) where.agentId = Number(agentId);
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const take = Math.min(Math.max(Number(limit) || 30, 1), 100);
    const skip = (Math.max(Number(page), 1) - 1) * take;

    const [commissions, total, summary] = await Promise.all([
      prisma.commission.findMany({
        where, skip, take, orderBy: { createdAt: 'desc' },
        include: {
          enquiry: { include: { student: { select: { name: true, phone: true, email: true } } } },
          college: { select: { name: true, city: true } },
          agent: { select: { id: true, referralCode: true, user: { select: { name: true } } } },
        },
      }),
      prisma.commission.count({ where }),
      prisma.commission.groupBy({ by: ['status'], _sum: { amount: true, agentAmount: true }, _count: { id: true } }),
    ]);

    // Compute totals from summary
    const totals = {
      totalAmount: summary.reduce((s, g) => s + (g._sum.amount || 0), 0),
      totalAgentAmount: summary.reduce((s, g) => s + (g._sum.agentAmount || 0), 0),
      received: summary.find(g => g.status === 'Received')?._sum.amount || 0,
      pending: summary.find(g => g.status === 'Pending')?._sum.amount || 0,
      count: summary.reduce((s, g) => s + g._count.id, 0),
    };

    res.json({ commissions, total, page: Number(page), pages: Math.ceil(total / take), summary, totals });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/admin/commissions/agent-summary ────────────────────────────────
// Aggregate commissions per agent — for payout planning
router.get('/agent-summary', async (req, res, next) => {
  try {
    const results = await prisma.$queryRaw`
      SELECT
        a."id" AS "agentId",
        u."name" AS "agentName",
        a."referralCode",
        a."commissionRate",
        a."bankName",
        a."isVerified",
        COUNT(c."id")::int AS "totalCommissions",
        COALESCE(SUM(c."agentAmount"), 0)::int AS "totalOwed",
        COALESCE(SUM(CASE WHEN c."status" = 'Received' THEN c."agentAmount" ELSE 0 END), 0)::int AS "receivedOwed",
        COALESCE(SUM(CASE WHEN c."status" = 'Pending' THEN c."agentAmount" ELSE 0 END), 0)::int AS "pendingOwed"
      FROM "agents" a
      JOIN "users" u ON u."id" = a."userId"
      LEFT JOIN "commissions" c ON c."agentId" = a."id"
      GROUP BY a."id", u."name", a."referralCode", a."commissionRate", a."bankName", a."isVerified"
      HAVING COUNT(c."id") > 0
      ORDER BY COALESCE(SUM(c."agentAmount"), 0) DESC
    `;
    res.json({ agents: results });
  } catch (err) {
    next(err);
  }
});

// Whitelist allowed fields
function pickCommissionFields(body) {
  const allowed = ['enquiryId', 'collegeId', 'amount', 'agentAmount', 'agentId', 'status', 'paymentDate', 'invoiceNumber', 'notes'];
  const data = {};
  for (const key of allowed) {
    if (body[key] !== undefined) data[key] = body[key];
  }
  return data;
}

// ── POST /api/admin/commissions ─────────────────────────────────────────────
// Enhanced: auto-populate agentId + agentAmount from enquiry if not provided
router.post('/', validate(createCommission), async (req, res, next) => {
  try {
    const data = pickCommissionFields(req.body);

    // Auto-populate agent info from enquiry
    if (data.enquiryId && !data.agentId) {
      const enquiry = await prisma.enquiry.findUnique({
        where: { id: data.enquiryId },
        select: { agentId: true, agent: { select: { commissionRate: true } } },
      });
      if (enquiry?.agentId) {
        data.agentId = enquiry.agentId;
        // Auto-calc agent amount if commission amount is set
        if (data.amount && enquiry.agent?.commissionRate) {
          data.agentAmount = Math.round(data.amount * (enquiry.agent.commissionRate / 100));
        }
      }
    }

    const commission = await prisma.commission.create({ data });

    logAudit(prisma, {
      userId: req.user.id, action: 'commission.create',
      entity: 'Commission', entityId: commission.id,
      details: { enquiryId: data.enquiryId, amount: data.amount },
      ip: getIp(req),
    });

    res.status(201).json(commission);
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/admin/commissions/:id ──────────────────────────────────────────
router.put('/:id', validate(updateCommission), async (req, res, next) => {
  try {
    const data = pickCommissionFields(req.body);
    if (data.status === 'Received' && !data.paymentDate) data.paymentDate = new Date();

    // Recalculate agent amount when commission amount changes
    if (data.amount !== undefined) {
      const existing = await prisma.commission.findUnique({
        where: { id: Number(req.params.id) },
        select: { agentId: true, agent: { select: { commissionRate: true } } },
      });
      if (existing?.agent?.commissionRate) {
        data.agentAmount = Math.round(data.amount * (existing.agent.commissionRate / 100));
      }
    }

    const commission = await prisma.commission.update({
      where: { id: Number(req.params.id) },
      data,
    });

    logAudit(prisma, {
      userId: req.user.id, action: 'commission.update',
      entity: 'Commission', entityId: commission.id,
      details: data,
      ip: getIp(req),
    });

    // Notify agent of commission status change
    if (data.status) {
      notifyCommissionUpdate(commission);
    }

    res.json(commission);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
