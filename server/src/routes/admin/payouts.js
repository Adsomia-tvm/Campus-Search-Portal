const router = require('express').Router();
const prisma = require('../../lib/prisma');
const { requireAdmin } = require('../../middleware/auth');
const { logAudit, getIp } = require('../../lib/audit');
const { notifyPayoutUpdate } = require('../../lib/notify');

router.use(requireAdmin);

// ── GET /api/admin/payouts ──────────────────────────────────────────────────
// List all payouts with filters
router.get('/', async (req, res, next) => {
  try {
    const { status, agentId, page = 1, limit = 30 } = req.query;
    const where = {};
    if (status) where.status = status;
    if (agentId) where.agentId = Number(agentId);

    const take = Math.min(Math.max(Number(limit) || 30, 1), 100);
    const skip = (Math.max(Number(page), 1) - 1) * take;

    const [payouts, total, summary] = await Promise.all([
      prisma.agentPayout.findMany({
        where, skip, take, orderBy: { createdAt: 'desc' },
        include: {
          agent: { select: { referralCode: true, bankName: true, bankAccount: true, ifsc: true, panNumber: true, user: { select: { name: true, phone: true } } } },
        },
      }),
      prisma.agentPayout.count({ where }),
      prisma.agentPayout.groupBy({ by: ['status'], _sum: { amount: true }, _count: { id: true } }),
    ]);

    // Mask bank details in list view (show last 4 only)
    const safePayout = payouts.map(p => ({
      ...p,
      agent: p.agent ? {
        ...p.agent,
        bankAccount: p.agent.bankAccount ? `****${p.agent.bankAccount.slice(-4)}` : null,
        panNumber: p.agent.panNumber ? `****${p.agent.panNumber.slice(-4)}` : null,
      } : null,
    }));

    const totals = {
      totalPaid: summary.find(g => g.status === 'Paid')?._sum.amount || 0,
      totalPending: summary.find(g => g.status === 'Pending')?._sum.amount || 0,
      totalProcessing: summary.find(g => g.status === 'Processing')?._sum.amount || 0,
    };

    res.json({ payouts: safePayout, total, page: Number(page), pages: Math.ceil(total / take), summary, totals });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/admin/payouts/pending-commissions/:agentId ─────────────────────
// Get unpaid commissions for an agent (for creating a payout)
router.get('/pending-commissions/:agentId', async (req, res, next) => {
  try {
    const agentId = Number(req.params.agentId);

    // Get commissions where college has paid (Received) but agent hasn't been paid yet
    // Exclude commissions already included in an existing payout
    const existingPayouts = await prisma.agentPayout.findMany({
      where: { agentId, status: { in: ['Pending', 'Processing', 'Paid'] } },
      select: { commissionIds: true },
    });

    // Collect all commission IDs already in payouts
    const paidCommIds = new Set();
    existingPayouts.forEach(p => {
      p.commissionIds.split(',').forEach(id => paidCommIds.add(Number(id.trim())));
    });

    const commissions = await prisma.commission.findMany({
      where: {
        agentId,
        status: 'Received',   // Only pay agent after college has paid us
        agentAmount: { gt: 0 },
      },
      include: {
        enquiry: { select: { id: true, status: true, student: { select: { name: true } } } },
        college: { select: { name: true } },
      },
      orderBy: { paymentDate: 'desc' },
    });

    // Filter out already-paid commissions
    const pending = commissions.filter(c => !paidCommIds.has(c.id));
    const totalOwed = pending.reduce((s, c) => s + (c.agentAmount || 0), 0);

    res.json({ commissions: pending, totalOwed, count: pending.length });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/admin/payouts ────────────────────────────────────────────────
// Create a new payout (batch commissions into one payout)
router.post('/', async (req, res, next) => {
  try {
    const { agentId, commissionIds, paymentMethod, notes } = req.body;

    if (!agentId || !commissionIds || !Array.isArray(commissionIds) || commissionIds.length === 0) {
      return res.status(400).json({ error: 'agentId and commissionIds[] are required' });
    }

    // Validate commissions belong to this agent and are received
    const commissions = await prisma.commission.findMany({
      where: {
        id: { in: commissionIds.map(Number) },
        agentId: Number(agentId),
        status: 'Received',
      },
    });

    if (commissions.length !== commissionIds.length) {
      return res.status(400).json({
        error: `Only ${commissions.length} of ${commissionIds.length} commissions are valid (must belong to agent and have Received status)`,
      });
    }

    const amount = commissions.reduce((s, c) => s + (c.agentAmount || 0), 0);
    if (amount <= 0) {
      return res.status(400).json({ error: 'No agent amount to pay for these commissions' });
    }

    const payout = await prisma.agentPayout.create({
      data: {
        agentId: Number(agentId),
        amount,
        commissionIds: commissionIds.join(','),
        status: 'Pending',
        paymentMethod: paymentMethod || null,
        notes: notes || null,
        createdBy: req.user.id,
      },
    });

    logAudit(prisma, {
      userId: req.user.id, action: 'payout.create',
      entity: 'AgentPayout', entityId: payout.id,
      details: { agentId, amount, commissionCount: commissions.length },
      ip: getIp(req),
    });

    res.status(201).json(payout);
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/admin/payouts/:id ─────────────────────────────────────────────
// Update payout status, UTR, bank ref
router.put('/:id', async (req, res, next) => {
  try {
    const { status, utrNumber, bankRef, paymentMethod, notes } = req.body;
    const id = Number(req.params.id);

    const existing = await prisma.agentPayout.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Payout not found' });

    // Status flow validation: Pending → Processing → Paid/Failed
    const validTransitions = {
      'Pending': ['Processing', 'Failed'],
      'Processing': ['Paid', 'Failed'],
      'Failed': ['Pending'],  // Allow retry
    };

    if (status && status !== existing.status) {
      const allowed = validTransitions[existing.status];
      if (!allowed || !allowed.includes(status)) {
        return res.status(400).json({
          error: `Cannot move from ${existing.status} to ${status}. Allowed: ${(allowed || []).join(', ')}`,
        });
      }
    }

    const data = {};
    if (status) data.status = status;
    if (utrNumber !== undefined) data.utrNumber = utrNumber;
    if (bankRef !== undefined) data.bankRef = bankRef;
    if (paymentMethod !== undefined) data.paymentMethod = paymentMethod;
    if (notes !== undefined) data.notes = notes;

    // Auto-set dates based on status
    if (status === 'Processing' && !existing.processedDate) data.processedDate = new Date();
    if (status === 'Paid' && !existing.paidDate) data.paidDate = new Date();

    const payout = await prisma.agentPayout.update({ where: { id }, data });

    logAudit(prisma, {
      userId: req.user.id, action: 'payout.update',
      entity: 'AgentPayout', entityId: id,
      details: data,
      ip: getIp(req),
    });

    // Notify agent on payout status change (fire-and-forget)
    if (status === 'Paid' || status === 'Processing') {
      const agent = await prisma.agent.findUnique({
        where: { id: existing.agentId },
        select: { user: { select: { name: true, email: true, phone: true } } },
      });
      if (agent?.user) {
        notifyPayoutUpdate(payout, agent.user.email, agent.user.phone, agent.user.name);
      }
    }

    res.json(payout);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/admin/payouts/:id ──────────────────────────────────────────────
// Single payout detail with full commission breakdown
router.get('/:id', async (req, res, next) => {
  try {
    const payout = await prisma.agentPayout.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        agent: { select: { referralCode: true, bankName: true, bankAccount: true, ifsc: true, panNumber: true, commissionRate: true, user: { select: { name: true, phone: true, email: true } } } },
      },
    });

    if (!payout) return res.status(404).json({ error: 'Payout not found' });

    // Fetch the actual commissions
    const commIds = payout.commissionIds.split(',').map(Number);
    const commissions = await prisma.commission.findMany({
      where: { id: { in: commIds } },
      include: {
        enquiry: { select: { id: true, status: true, student: { select: { name: true, phone: true } } } },
        college: { select: { name: true } },
      },
    });

    res.json({ ...payout, commissions });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
