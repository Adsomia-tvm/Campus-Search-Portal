const router = require('express').Router();
const prisma = require('../../lib/prisma');
const { searchCache, staticCache, detailCache } = require('../../cache');

// GET /api/colleges — search & filter
router.get('/', async (req, res) => {
  try {
    const { city, category, degreeLevel, minFee, maxFee, search, page = 1, limit = 20, sortBy = 'name' } = req.query;

    const take = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const skip = (Math.max(Number(page), 1) - 1) * take;
    const trimSearch = (search || '').trim();

    // Cache key from all filter params
    const cacheKey = searchCache.key({ city, category, degreeLevel, minFee, maxFee, search: trimSearch, page, limit: take, sortBy });
    const cached = searchCache.get(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached);
    }

    const where = { isActive: true };
    if (city) where.city = { contains: city.trim(), mode: 'insensitive' };

    const courseFilter = { isActive: true };
    if (category)    courseFilter.category    = { contains: category.trim(),    mode: 'insensitive' };
    if (degreeLevel) courseFilter.degreeLevel = { contains: degreeLevel.trim(), mode: 'insensitive' };
    if (minFee && Number(minFee) > 0) courseFilter.totalFee = { ...(courseFilter.totalFee||{}), gte: Number(minFee) };
    if (maxFee && Number(maxFee) > 0) courseFilter.totalFee = { ...(courseFilter.totalFee||{}), lte: Number(maxFee) };
    const hasCourseFilter = !!(category || degreeLevel || minFee || maxFee);

    if (trimSearch) {
      where.OR = [
        { name: { contains: trimSearch, mode: 'insensitive' } },
        { courses: { some: { isActive: true, name: { contains: trimSearch, mode: 'insensitive' } } } },
      ];
      where.courses = hasCourseFilter ? { some: courseFilter } : { some: { isActive: true } };
    } else if (hasCourseFilter) {
      where.courses = { some: courseFilter };
    } else {
      where.courses = { some: { isActive: true } };
    }

    // Sort mapping
    const orderBy = sortBy === 'fee_asc' || sortBy === 'fee_desc'
      ? [{ name: 'asc' }]  // will re-sort in-memory after fee calculation
      : [{ name: 'asc' }];

    const [colleges, total] = await Promise.all([
      prisma.college.findMany({
        where, skip, take,
        orderBy,
        include: {
          courses: {
            where: { isActive: true },
            orderBy: { totalFee: 'asc' },
            take: 3,
            select: { id: true, name: true, category: true, degreeLevel: true, totalFee: true, durationYrs: true },
          },
        },
      }),
      prisma.college.count({ where }),
    ]);

    // Re-sort by min fee if requested
    let sorted = colleges;
    if (sortBy === 'fee_asc' || sortBy === 'fee_desc') {
      sorted = [...colleges].sort((a, b) => {
        const minA = Math.min(...(a.courses.map(c => c.totalFee).filter(Boolean)), Infinity);
        const minB = Math.min(...(b.courses.map(c => c.totalFee).filter(Boolean)), Infinity);
        const diff = (minA === Infinity ? 999999999 : minA) - (minB === Infinity ? 999999999 : minB);
        return sortBy === 'fee_asc' ? diff : -diff;
      });
    }

    const result = { colleges: sorted, total, page: Number(page), pages: Math.ceil(total / take) };
    searchCache.set(cacheKey, result);
    res.setHeader('X-Cache', 'MISS');
    res.json(result);
  } catch (err) {
    console.error('[colleges]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/colleges/suggest?q=xxx — autocomplete suggestions
router.get('/suggest', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) return res.json([]);

    const cacheKey = `suggest:${q.toLowerCase()}`;
    const cached = searchCache.get(cacheKey);
    if (cached) return res.json(cached);

    const [colleges, courses] = await Promise.all([
      prisma.college.findMany({
        where: { isActive: true, name: { contains: q, mode: 'insensitive' } },
        select: { id: true, name: true, city: true },
        take: 5,
        orderBy: { name: 'asc' },
      }),
      prisma.course.findMany({
        where: { isActive: true, name: { contains: q, mode: 'insensitive' } },
        select: { id: true, name: true, category: true },
        distinct: ['name'],
        take: 5,
        orderBy: { name: 'asc' },
      }),
    ]);

    const suggestions = [
      ...colleges.map(c => ({ type: 'college', id: c.id, label: c.name, sub: c.city || '' })),
      ...courses.map(c => ({ type: 'course', label: c.name, sub: c.category || '' })),
    ];
    searchCache.set(cacheKey, suggestions);
    res.json(suggestions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/colleges/top10
router.get('/top10', async (req, res) => {
  try {
    const { city, category } = req.query;
    const cacheKey = staticCache.key({ route: 'top10', city, category });
    const cached = staticCache.get(cacheKey);
    if (cached) return res.json(cached);

    const courses = await prisma.course.findMany({
      where: {
        isActive: true, totalFee: { gt: 0 },
        ...(category && { category: { contains: category, mode: 'insensitive' } }),
        college: { isActive: true, ...(city && { city: { contains: city, mode: 'insensitive' } }) },
      },
      orderBy: { totalFee: 'asc' },
      take: 10,
      include: { college: { select: { id: true, name: true, city: true } } },
    });
    staticCache.set(cacheKey, courses);
    res.json(courses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/colleges/cities
router.get('/cities', async (req, res) => {
  try {
    const cached = staticCache.get('cities');
    if (cached) return res.json(cached);

    const cities = await prisma.college.groupBy({
      by: ['city'],
      where: { isActive: true, city: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });
    const result = cities.map(c => ({ city: c.city, count: c._count.id }));
    staticCache.set('cities', result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/colleges/compare?ids=1,2,3
router.get('/compare', async (req, res) => {
  try {
    const ids = (req.query.ids || '').split(',').map(Number).filter(Boolean).slice(0, 3);
    if (!ids.length) return res.status(400).json({ error: 'Provide college ids' });
    const colleges = await prisma.college.findMany({
      where: { id: { in: ids } },
      include: { courses: { where: { isActive: true }, orderBy: { category: 'asc' } } },
    });
    res.json(colleges);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/colleges/:id/related — same city + overlapping courses, excludes self
router.get('/:id/related', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    const source = await prisma.college.findUnique({
      where: { id },
      select: { city: true, courses: { select: { category: true }, take: 3 } },
    });
    if (!source) return res.json([]);

    const categories = [...new Set(source.courses.map(c => c.category).filter(Boolean))];

    const related = await prisma.college.findMany({
      where: {
        id: { not: id },
        isActive: true,
        ...(source.city ? { city: { contains: source.city, mode: 'insensitive' } } : {}),
        ...(categories.length ? { courses: { some: { isActive: true, category: { in: categories } } } } : {}),
      },
      take: 4,
      orderBy: { name: 'asc' },
      include: {
        courses: {
          where: { isActive: true },
          orderBy: { totalFee: 'asc' },
          take: 2,
          select: { name: true, category: true, totalFee: true },
        },
      },
    });
    res.json(related);
  } catch (err) {
    console.error('[related]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/colleges/:id/stats — enquiry count last 7 days (social proof)
router.get('/:id/stats', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const count = await prisma.enquiry.count({
      where: { collegeId: id, createdAt: { gte: since } },
    });

    res.json({ enquiriesThisWeek: count });
  } catch (err) {
    res.status(500).json({ enquiriesThisWeek: 3 });
  }
});

// GET /api/colleges/:id
router.get('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    const cached = detailCache.get(`college:${id}`);
    if (cached) return res.json(cached);

    const college = await prisma.college.findUnique({
      where: { id },
      include: {
        courses: { where: { isActive: true }, orderBy: [{ category: 'asc' }, { totalFee: 'asc' }] },
        contacts: true,
      },
    });
    if (!college) return res.status(404).json({ error: 'College not found' });
    detailCache.set(`college:${id}`, college);
    res.json(college);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
