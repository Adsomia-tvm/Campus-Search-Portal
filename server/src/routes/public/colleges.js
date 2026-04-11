const router = require('express').Router();
const prisma = require('../../lib/prisma');
const { searchCache, staticCache, detailCache } = require('../../cache');

// GET /api/colleges — search & filter (uses minFee/maxFee materialized columns for sort)
router.get('/', async (req, res, next) => {
  try {
    const { city, category, degreeLevel, minFee, maxFee, search, page = 1, limit = 20, sortBy = 'name' } = req.query;

    const take = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const pageNum = Math.max(Math.floor(Number(page)) || 1, 1);
    const skip = (pageNum - 1) * take;
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
    if (minFee && Number(minFee) > 0) courseFilter.totalFee = { ...(courseFilter.totalFee || {}), gte: Number(minFee) };
    if (maxFee && Number(maxFee) > 0) courseFilter.totalFee = { ...(courseFilter.totalFee || {}), lte: Number(maxFee) };
    const hasCourseFilter = !!(category || degreeLevel || minFee || maxFee);

    // Fee-range filter on the materialized columns
    if (minFee && Number(minFee) > 0) where.maxFee = { gte: Number(minFee) };
    if (maxFee && Number(maxFee) > 0) where.minFee = { lte: Number(maxFee) };

    if (trimSearch) {
      // Build search variants: "sea" also matches "S.E.A.", and "s.e.a" also matches "SEA"
      const variants = [trimSearch];
      const noDots = trimSearch.replace(/\./g, '');
      if (noDots !== trimSearch && noDots.length > 0) variants.push(noDots);
      const dotted = noDots.split('').join('.');
      if (dotted !== trimSearch && dotted !== noDots) variants.push(dotted);

      where.OR = variants.flatMap(s => [
        { name: { contains: s, mode: 'insensitive' } },
        { courses: { some: { isActive: true, name: { contains: s, mode: 'insensitive' } } } },
      ]);
      where.courses = hasCourseFilter ? { some: courseFilter } : { some: { isActive: true } };
    } else if (hasCourseFilter) {
      where.courses = { some: courseFilter };
    } else {
      where.courses = { some: { isActive: true } };
    }

    // ── FIX: use materialized minFee column for DB-level fee sorting ─────────
    let orderBy;
    switch (sortBy) {
      case 'fee_asc':  orderBy = [{ minFee: { sort: 'asc',  nulls: 'last' } }, { name: 'asc' }]; break;
      case 'fee_desc': orderBy = [{ maxFee: { sort: 'desc', nulls: 'last' } }, { name: 'asc' }]; break;
      default:         orderBy = [{ name: 'asc' }];
    }

    const [colleges, total] = await Promise.all([
      prisma.college.findMany({
        where, skip, take, orderBy,
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

    const result = { colleges, total, page: pageNum, pages: Math.ceil(total / take) };
    searchCache.set(cacheKey, result);
    res.setHeader('X-Cache', 'MISS');
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/colleges/suggest?q=xxx — autocomplete suggestions
router.get('/suggest', async (req, res, next) => {
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
    next(err);
  }
});

// GET /api/colleges/top10
router.get('/top10', async (req, res, next) => {
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
    next(err);
  }
});

// GET /api/colleges/cities
router.get('/cities', async (req, res, next) => {
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
    next(err);
  }
});

// GET /api/colleges/compare?ids=1,2,3
router.get('/compare', async (req, res, next) => {
  try {
    const ids = (req.query.ids || '').split(',').map(Number).filter(Boolean).slice(0, 3);
    if (!ids.length) return res.status(400).json({ error: 'Provide college ids' });
    const colleges = await prisma.college.findMany({
      where: { id: { in: ids } },
      include: { courses: { where: { isActive: true }, orderBy: { category: 'asc' } } },
    });
    res.json(colleges);
  } catch (err) {
    next(err);
  }
});

// GET /api/colleges/by-slug/:citySlug/:slug — lookup by SEO slug
router.get('/by-slug/:citySlug/:slug', async (req, res, next) => {
  try {
    const { citySlug, slug } = req.params;
    const college = await prisma.college.findFirst({
      where: { slug, citySlug, isActive: true },
      include: {
        courses: { where: { isActive: true }, orderBy: [{ category: 'asc' }, { totalFee: 'asc' }] },
        contacts: true,
      },
    });
    if (!college) return res.status(404).json({ error: 'College not found' });
    detailCache.set(`college:${college.id}`, college);
    res.json(college);
  } catch (err) {
    next(err);
  }
});

// GET /api/colleges/city/:citySlug — all colleges in a city
router.get('/city/:citySlug', async (req, res, next) => {
  try {
    const { citySlug } = req.params;
    const { category } = req.query;
    const cacheKey = `city:${citySlug}:${category || 'all'}`;
    const cached = searchCache.get(cacheKey);
    if (cached) return res.json(cached);

    const where = { isActive: true, citySlug, courses: { some: { isActive: true } } };
    if (category) where.courses = { some: { isActive: true, category: { contains: category, mode: 'insensitive' } } };

    const colleges = await prisma.college.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        courses: {
          where: { isActive: true },
          orderBy: { totalFee: 'asc' },
          take: 5,
          select: { id: true, name: true, category: true, degreeLevel: true, totalFee: true },
        },
      },
    });

    const allCats = [...new Set(colleges.flatMap(c => c.courses.map(co => co.category).filter(Boolean)))].sort();
    const result = { colleges, total: colleges.length, categories: allCats, citySlug };
    searchCache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/colleges/seo/all-slugs — returns all college slugs for sitemap/linking
router.get('/seo/all-slugs', async (req, res, next) => {
  try {
    const cached = staticCache.get('all-slugs');
    if (cached) return res.json(cached);

    const colleges = await prisma.college.findMany({
      where: { isActive: true, slug: { not: null }, citySlug: { not: null } },
      select: { id: true, name: true, slug: true, citySlug: true, city: true, minFee: true },
      orderBy: { name: 'asc' },
    });

    const cities = {};
    for (const c of colleges) {
      if (!cities[c.citySlug]) cities[c.citySlug] = { citySlug: c.citySlug, city: c.city, colleges: [] };
      cities[c.citySlug].colleges.push(c);
    }

    const result = { colleges, cities: Object.values(cities) };
    staticCache.set('all-slugs', result);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/colleges/:id/related — same city + overlapping courses, excludes self
router.get('/:id/related', async (req, res, next) => {
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
      select: {
        id: true, name: true, city: true, slug: true, citySlug: true,
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
    next(err);
  }
});

// GET /api/colleges/:id/stats — enquiry count last 7 days (social proof)
router.get('/:id/stats', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const count = await prisma.enquiry.count({
      where: { collegeId: id, createdAt: { gte: since } },
    });

    res.json({ enquiriesThisWeek: count });
  } catch (err) {
    res.json({ enquiriesThisWeek: 0 });
  }
});

// GET /api/colleges/:id
router.get('/:id', async (req, res, next) => {
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
    next(err);
  }
});

module.exports = router;
