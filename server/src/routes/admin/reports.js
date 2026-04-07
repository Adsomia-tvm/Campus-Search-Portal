const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { requireAuth } = require('../../middleware/auth');
const prisma = new PrismaClient();

router.use(requireAuth);

// GET /api/admin/reports?type=monthly|category|city|counselor
router.get('/', async (req, res) => {
  try {
    const { type = 'monthly' } = req.query;

    if (type === 'monthly') {
      // Enquiries per month (last 12 months)
      const rows = await prisma.$queryRaw`
        SELECT DATE_TRUNC('month', "created_at") AS month,
               COUNT(*)::int AS enquiries,
               COUNT(*) FILTER (WHERE status = 'Enrolled')::int AS enrolled
        FROM enquiries
        WHERE "created_at" > NOW() - INTERVAL '12 months'
        GROUP BY month ORDER BY month ASC`;
      return res.json(rows);
    }

    if (type === 'category') {
      const rows = await prisma.$queryRaw`
        SELECT c2.category,
               COUNT(e.id)::int AS enquiries,
               COUNT(e.id) FILTER (WHERE e.status = 'Enrolled')::int AS enrolled
        FROM enquiries e
        JOIN courses c2 ON c2.id = e.course_id
        WHERE c2.category IS NOT NULL
        GROUP BY c2.category ORDER BY enquiries DESC LIMIT 15`;
      return res.json(rows);
    }

    if (type === 'city') {
      const rows = await prisma.$queryRaw`
        SELECT col.city,
               COUNT(e.id)::int AS enquiries,
               COUNT(e.id) FILTER (WHERE e.status = 'Enrolled')::int AS enrolled
        FROM enquiries e
        JOIN colleges col ON col.id = e.college_id
        WHERE col.city IS NOT NULL
        GROUP BY col.city ORDER BY enquiries DESC LIMIT 15`;
      return res.json(rows);
    }

    if (type === 'counselor') {
      const rows = await prisma.$queryRaw`
        SELECT u.name AS counselor,
               COUNT(e.id)::int AS enquiries,
               COUNT(e.id) FILTER (WHERE e.status = 'Enrolled')::int AS enrolled
        FROM enquiries e
        JOIN users u ON u.id = e.counselor_id
        GROUP BY u.name ORDER BY enrolled DESC`;
      return res.json(rows);
    }

    res.status(400).json({ error: 'Invalid report type' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
