const router = require('express').Router();
const prisma = require('../../lib/prisma');
const { requireStaff } = require('../../middleware/auth');

router.use(requireStaff);

// ── GET /api/admin/notifications ────────────────────────────────────────────
// View notification log with filters
router.get('/', async (req, res, next) => {
  try {
    const { channel, event, status, from, to, page = 1, limit = 50 } = req.query;
    const where = {};
    if (channel) where.channel = channel;
    if (event) where.event = { contains: event };
    if (status) where.status = status;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const take = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const skip = (Math.max(Number(page), 1) - 1) * take;

    const [logs, total, summary] = await Promise.all([
      prisma.notificationLog.findMany({
        where, skip, take, orderBy: { createdAt: 'desc' },
      }),
      prisma.notificationLog.count({ where }),
      prisma.notificationLog.groupBy({
        by: ['channel', 'status'],
        _count: { id: true },
      }),
    ]);

    // Build summary stats
    const stats = {};
    summary.forEach(g => {
      if (!stats[g.channel]) stats[g.channel] = { sent: 0, failed: 0, total: 0 };
      stats[g.channel][g.status] = (stats[g.channel][g.status] || 0) + g._count.id;
      stats[g.channel].total += g._count.id;
    });

    res.json({ logs, total, page: Number(page), pages: Math.ceil(total / take), stats });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/admin/notifications/stats ──────────────────────────────────────
// Aggregated notification stats for dashboard
router.get('/stats', async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const [totalByChannel, todayCount, weekCount, recentFailures] = await Promise.all([
      prisma.notificationLog.groupBy({
        by: ['channel'],
        _count: { id: true },
      }),
      prisma.notificationLog.count({ where: { createdAt: { gte: today } } }),
      prisma.notificationLog.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.notificationLog.findMany({
        where: { status: 'failed', createdAt: { gte: weekAgo } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    res.json({
      channels: Object.fromEntries(totalByChannel.map(g => [g.channel, g._count.id])),
      today: todayCount,
      thisWeek: weekCount,
      recentFailures,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
