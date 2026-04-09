const router = require('express').Router();
const prisma = require('../../lib/prisma');
const { requireAuth } = require('../../middleware/auth');

router.use(requireAuth);

// GET /api/admin/commissions
router.get('/', async (req, res) => {
  try {
    const { status, page = 1, limit = 30 } = req.query;
    const where = status ? { status } : {};
    const skip = (Number(page) - 1) * Number(limit);

    const [commissions, total, summary] = await Promise.all([
      prisma.commission.findMany({
        where, skip, take: Number(limit), orderBy: { createdAt: 'desc' },
        include: {
          enquiry: { include: { student: { select: { name: true, phone: true } } } },
          college: { select: { name: true, city: true } },
        },
      }),
      prisma.commission.count({ where }),
      prisma.commission.groupBy({ by: ['status'], _sum: { amount: true }, _count: { id: true } }),
    ]);

    res.json({ commissions, total, page: Number(page), pages: Math.ceil(total / Number(limit)), summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Whitelist allowed fields
function pickCommissionFields(body) {
  const allowed = ['enquiryId','collegeId','amount','status','paymentDate','notes'];
  const data = {};
  for (const key of allowed) {
    if (body[key] !== undefined) data[key] = body[key];
  }
  return data;
}

// POST /api/admin/commissions
router.post('/', async (req, res) => {
  try {
    const commission = await prisma.commission.create({ data: pickCommissionFields(req.body) });
    res.status(201).json(commission);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/admin/commissions/:id
router.put('/:id', async (req, res) => {
  try {
    const data = pickCommissionFields(req.body);
    if (data.status === 'Received' && !data.paymentDate) data.paymentDate = new Date();
    const commission = await prisma.commission.update({ where: { id: Number(req.params.id) }, data });
    res.json(commission);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
