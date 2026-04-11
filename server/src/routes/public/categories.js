const router = require('express').Router();
const prisma = require('../../lib/prisma');
const { staticCache } = require('../../cache');

// GET /api/categories
router.get('/', async (req, res, next) => {
  try {
    const cached = staticCache.get('categories');
    if (cached) return res.json(cached);

    const cats = await prisma.course.groupBy({
      by: ['category'],
      where: { isActive: true, category: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });
    const result = cats.map(c => ({ category: c.category, count: c._count.id }));
    staticCache.set('categories', result);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
