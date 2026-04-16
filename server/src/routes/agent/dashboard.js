/**
 * AGENT-01: Agent self-service dashboard API
 * All endpoints require a valid JWT with role=agent
 */
const router = require('express').Router();
const prisma = require('../../lib/prisma');
const { requireAgent } = require('../../middleware/auth');
const { logAudit, getIp } = require('../../lib/audit');

router.use(requireAgent);

// ── GET /api/agent/dashboard ─────────────────────────────────────────────────
// Summary stats for the agent's referred leads
router.get('/dashboard', async (req, res, next) => {
  try {
    const agent = await prisma.agent.findUnique({
      where: { userId: req.user.id },
      select: { id: true, referralCode: true, commissionRate: true, isVerified: true },
    });
    if (!agent) return res.status(404).json({ error: 'Agent profile not found' });

    // Count enquiries by status
    const statusCounts = await prisma.enquiry.groupBy({
      by: ['status'],
      where: { agentId: agent.id },
      _count: true,
    });

    const totalLeads = statusCounts.reduce((sum, s) => sum + s._count, 0);
    const enrolled = statusCounts.find(s => s.status === 'Enrolled')?._count || 0;
    const active = statusCounts.filter(s => !['Enrolled', 'Dropped'].includes(s.status))
      .reduce((sum, s) => sum + s._count, 0);

    // Commission summary — use direct agentId on commission
    const commissions = await prisma.commission.aggregate({
      where: { agentId: agent.id },
      _sum: { amount: true, agentAmount: true },
      _count: true,
    });

    const pendingCommissions = await prisma.commission.aggregate({
      where: { agentId: agent.id, status: 'Pending' },
      _sum: { agentAmount: true },
    });

    const receivedCommissions = await prisma.commission.aggregate({
      where: { agentId: agent.id, status: 'Received' },
      _sum: { agentAmount: true },
    });

    // Payout summary
    const payoutSummary = await prisma.agentPayout.aggregate({
      where: { agentId: agent.id, status: 'Paid' },
      _sum: { amount: true },
    });

    // Recent leads (last 5)
    const recentLeads = await prisma.enquiry.findMany({
      where: { agentId: agent.id },
      select: {
        id: true, status: true, createdAt: true,
        student: { select: { name: true, phone: true, preferredCat: true } },
        college: { select: { id: true, name: true, city: true } },
        course: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    res.json({
      referralCode: agent.referralCode,
      commissionRate: agent.commissionRate,
      isVerified: agent.isVerified,
      stats: {
        totalLeads,
        enrolled,
        active,
        dropped: statusCounts.find(s => s.status === 'Dropped')?._count || 0,
        statusBreakdown: Object.fromEntries(statusCounts.map(s => [s.status, s._count])),
      },
      commissions: {
        total: commissions._sum.agentAmount || 0,
        pending: pendingCommissions._sum.agentAmount || 0,
        received: receivedCommissions._sum.agentAmount || 0,
        paid: payoutSummary._sum.amount || 0,
        count: commissions._count || 0,
      },
      recentLeads,
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/agent/leads ─────────────────────────────────────────────────────
// Full list of referred leads with filtering
router.get('/leads', async (req, res, next) => {
  try {
    const agent = await prisma.agent.findUnique({
      where: { userId: req.user.id },
      select: { id: true },
    });
    if (!agent) return res.status(404).json({ error: 'Agent profile not found' });

    const { status, search, page = 1, limit = 30 } = req.query;
    const where = { agentId: agent.id };

    if (status) where.status = status;
    if (search) {
      where.OR = [
        { student: { name: { contains: search, mode: 'insensitive' } } },
        { student: { phone: { contains: search } } },
        { college: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const take = Math.min(Math.max(Number(limit) || 30, 1), 100);
    const skip = (Math.max(Number(page), 1) - 1) * take;

    const [leads, total] = await Promise.all([
      prisma.enquiry.findMany({
        where, skip, take,
        select: {
          id: true, status: true, notes: true, createdAt: true, updatedAt: true,
          student: { select: { id: true, name: true, phone: true, email: true, preferredCat: true, city: true } },
          college: { select: { id: true, name: true, city: true, slug: true, citySlug: true } },
          course: { select: { id: true, name: true, category: true, totalFee: true } },
          commission: { select: { id: true, amount: true, status: true, paymentDate: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.enquiry.count({ where }),
    ]);

    res.json({ leads, total, page: Number(page), pages: Math.ceil(total / take) });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/agent/profile ───────────────────────────────────────────────────
// Agent profile + bank details
router.get('/profile', async (req, res, next) => {
  try {
    const agent = await prisma.agent.findUnique({
      where: { userId: req.user.id },
      include: {
        user: {
          select: { id: true, name: true, email: true, phone: true, createdAt: true },
        },
      },
    });
    if (!agent) return res.status(404).json({ error: 'Agent profile not found' });

    res.json({
      id: agent.id,
      referralCode: agent.referralCode,
      commissionRate: agent.commissionRate,
      isVerified: agent.isVerified,
      bankName: agent.bankName,
      bankAccount: agent.bankAccount ? `****${agent.bankAccount.slice(-4)}` : null, // Mask
      ifsc: agent.ifsc,
      panNumber: agent.panNumber ? `****${agent.panNumber.slice(-4)}` : null, // Mask
      user: agent.user,
      createdAt: agent.createdAt,
    });
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/agent/profile ───────────────────────────────────────────────────
// Update agent profile (name, phone, bank details)
router.put('/profile', async (req, res, next) => {
  try {
    const agent = await prisma.agent.findUnique({ where: { userId: req.user.id } });
    if (!agent) return res.status(404).json({ error: 'Agent profile not found' });

    const { name, phone, bankName, bankAccount, ifsc, panNumber } = req.body;

    // Update agent bank details
    const agentData = {};
    if (bankName !== undefined) agentData.bankName = bankName || null;
    if (bankAccount !== undefined) agentData.bankAccount = bankAccount || null;
    if (ifsc !== undefined) agentData.ifsc = ifsc?.toUpperCase() || null;
    if (panNumber !== undefined) agentData.panNumber = panNumber?.toUpperCase() || null;

    if (Object.keys(agentData).length > 0) {
      await prisma.agent.update({ where: { id: agent.id }, data: agentData });
    }

    // Update user details
    const userData = {};
    if (name?.trim()) userData.name = name.trim();
    if (phone?.trim()) userData.phone = phone.trim();

    if (Object.keys(userData).length > 0) {
      await prisma.user.update({ where: { id: req.user.id }, data: userData });
    }

    logAudit({ userId: req.user.id, action: 'update_profile', entity: 'agent', entityId: agent.id, ipAddress: getIp(req) });

    // Return updated profile
    const updated = await prisma.agent.findUnique({
      where: { id: agent.id },
      include: { user: { select: { name: true, email: true, phone: true } } },
    });

    res.json({
      referralCode: updated.referralCode,
      commissionRate: updated.commissionRate,
      isVerified: updated.isVerified,
      bankName: updated.bankName,
      bankAccount: updated.bankAccount ? `****${updated.bankAccount.slice(-4)}` : null,
      ifsc: updated.ifsc,
      panNumber: updated.panNumber ? `****${updated.panNumber.slice(-4)}` : null,
      user: updated.user,
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/agent/commissions ──────────────────────────────────────────────
// Agent's commission history (what they've earned)
router.get('/commissions', async (req, res, next) => {
  try {
    const agent = await prisma.agent.findUnique({
      where: { userId: req.user.id },
      select: { id: true },
    });
    if (!agent) return res.status(404).json({ error: 'Agent profile not found' });

    const { status, page = 1, limit = 30 } = req.query;
    const where = { agentId: agent.id, agentAmount: { gt: 0 } };
    if (status) where.status = status;

    const take = Math.min(Math.max(Number(limit) || 30, 1), 100);
    const skip = (Math.max(Number(page), 1) - 1) * take;

    const [commissions, total, summary] = await Promise.all([
      prisma.commission.findMany({
        where, skip, take, orderBy: { createdAt: 'desc' },
        select: {
          id: true, amount: true, agentAmount: true, status: true, paymentDate: true, createdAt: true,
          enquiry: { select: { id: true, status: true, student: { select: { name: true } } } },
          college: { select: { name: true, city: true } },
        },
      }),
      prisma.commission.count({ where }),
      prisma.commission.groupBy({
        by: ['status'],
        where: { agentId: agent.id, agentAmount: { gt: 0 } },
        _sum: { agentAmount: true },
        _count: { id: true },
      }),
    ]);

    const totals = {
      totalEarned: summary.reduce((s, g) => s + (g._sum.agentAmount || 0), 0),
      received: summary.find(g => g.status === 'Received')?._sum.agentAmount || 0,
      pending: summary.find(g => g.status === 'Pending')?._sum.agentAmount || 0,
    };

    res.json({ commissions, total, page: Number(page), pages: Math.ceil(total / take), totals });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/agent/payouts ──────────────────────────────────────────────────
// Agent's payout history
router.get('/payouts', async (req, res, next) => {
  try {
    const agent = await prisma.agent.findUnique({
      where: { userId: req.user.id },
      select: { id: true },
    });
    if (!agent) return res.status(404).json({ error: 'Agent profile not found' });

    const payouts = await prisma.agentPayout.findMany({
      where: { agentId: agent.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const summary = await prisma.agentPayout.groupBy({
      by: ['status'],
      where: { agentId: agent.id },
      _sum: { amount: true },
      _count: { id: true },
    });

    const totals = {
      totalPaid: summary.find(g => g.status === 'Paid')?._sum.amount || 0,
      pending: summary.find(g => g.status === 'Pending')?._sum.amount || 0,
      processing: summary.find(g => g.status === 'Processing')?._sum.amount || 0,
    };

    res.json({ payouts, totals });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/agent/refer ────────────────────────────────────────────────────
// Agent submits a new student referral (creates student + enquiry linked to agent)
router.post('/refer', async (req, res, next) => {
  try {
    const agent = await prisma.agent.findUnique({ where: { userId: req.user.id }, select: { id: true } });
    if (!agent) return res.status(404).json({ error: 'Agent profile not found' });

    const { studentName, studentPhone, studentEmail, collegeId, courseId, preferredCat, notes } = req.body;

    if (!studentName || !studentPhone || !collegeId) {
      return res.status(400).json({ error: 'studentName, studentPhone, and collegeId are required' });
    }

    const cleanPhone = studentPhone.trim().replace(/\s+/g, '');

    // Verify college exists
    const college = await prisma.college.findUnique({
      where: { id: Number(collegeId) },
      select: { id: true, isActive: true },
    });
    if (!college || !college.isActive) {
      return res.status(404).json({ error: 'College not found or inactive' });
    }

    // Upsert student (phone is the unique key)
    const student = await prisma.student.upsert({
      where: { phone: cleanPhone },
      create: {
        name: studentName.trim(),
        phone: cleanPhone,
        email: studentEmail?.trim() || null,
        preferredCat: preferredCat || null,
        source: 'Agent',
      },
      update: {
        // Update email if provided
        ...(studentEmail?.trim() && { email: studentEmail.trim() }),
      },
    });

    // Create enquiry linked to agent
    const enquiry = await prisma.enquiry.create({
      data: {
        studentId: student.id,
        collegeId: college.id,
        courseId: courseId ? Number(courseId) : null,
        agentId: agent.id,
        status: 'New',
        notes: notes?.slice(0, 2000) || 'Referred by agent',
      },
      select: {
        id: true, status: true, createdAt: true,
        student: { select: { name: true, phone: true } },
        college: { select: { name: true, city: true } },
      },
    });

    logAudit({
      userId: req.user.id, action: 'agent_refer', entity: 'enquiry',
      entityId: enquiry.id, details: { collegeId: college.id, studentPhone: cleanPhone },
      ipAddress: getIp(req),
    });

    res.status(201).json(enquiry);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'This student already has an enquiry for this college' });
    }
    next(err);
  }
});

module.exports = router;
