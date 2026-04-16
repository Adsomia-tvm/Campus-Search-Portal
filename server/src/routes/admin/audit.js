const router = require('express').Router();
const prisma = require('../../lib/prisma');
const { requireAdmin } = require('../../middleware/auth');

router.use(requireAdmin);

// ── GET /api/admin/audit — searchable audit log ─────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const {
      action, entity, userId, search,
      dateFrom, dateTo,
      page = 1, limit = 50,
    } = req.query;

    const where = {};
    if (action)  where.action = action;
    if (entity)  where.entity = entity;
    if (userId)  where.userId = Number(userId);

    if (search) {
      where.OR = [
        { action:  { contains: search, mode: 'insensitive' } },
        { entity:  { contains: search, mode: 'insensitive' } },
        { details: { contains: search, mode: 'insensitive' } },
        { ipAddress: { contains: search } },
      ];
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo)   where.createdAt.lte = new Date(dateTo + 'T23:59:59Z');
    }

    const take = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const skip = (Math.max(Number(page), 1) - 1) * take;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where, skip, take,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    // Parse JSON details for easier frontend consumption
    const enrichedLogs = logs.map(log => ({
      ...log,
      details: log.details ? (() => { try { return JSON.parse(log.details); } catch { return log.details; } })() : null,
    }));

    res.json({
      logs: enrichedLogs,
      total,
      page: Number(page),
      pages: Math.ceil(total / take),
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/admin/audit/actions — distinct action types for filter dropdown ─
router.get('/actions', async (req, res, next) => {
  try {
    const actions = await prisma.auditLog.groupBy({
      by: ['action'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });
    res.json(actions.map(a => ({ action: a.action, count: a._count.id })));
  } catch (err) {
    next(err);
  }
});

// ── GET /api/admin/audit/entities — distinct entity types ───────────────────
router.get('/entities', async (req, res, next) => {
  try {
    const entities = await prisma.auditLog.groupBy({
      by: ['entity'],
      where: { entity: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });
    res.json(entities.map(e => ({ entity: e.entity, count: e._count.id })));
  } catch (err) {
    next(err);
  }
});

// ── GET /api/admin/audit/stats — summary statistics ─────────────────────────
router.get('/stats', async (req, res, next) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);

    const [total, today, thisWeek, topActions, topUsers] = await Promise.all([
      prisma.auditLog.count(),
      prisma.auditLog.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.auditLog.count({ where: { createdAt: { gte: weekStart } } }),
      prisma.auditLog.groupBy({
        by: ['action'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
      prisma.$queryRaw`
        SELECT u.name, u.email, COUNT(a.id)::int as count
        FROM audit_logs a
        JOIN users u ON a."userId" = u.id
        WHERE a."createdAt" >= ${weekStart}
        GROUP BY u.id, u.name, u.email
        ORDER BY count DESC
        LIMIT 10
      `,
    ]);

    res.json({
      total,
      today,
      thisWeek,
      topActions: topActions.map(a => ({ action: a.action, count: a._count.id })),
      topUsers,
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/admin/audit/:id — single log detail ───────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const log = await prisma.auditLog.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    });
    if (!log) return res.status(404).json({ error: 'Audit log not found' });

    log.details = log.details ? (() => { try { return JSON.parse(log.details); } catch { return log.details; } })() : null;
    res.json(log);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
