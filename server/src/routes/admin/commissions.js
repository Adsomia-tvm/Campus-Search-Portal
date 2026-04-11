const router = require('express').Router();
const prisma = require('../../lib/prisma');
const { requireAuth } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { createCommission, updateCommission, idParam } = require('../../middleware/schemas');

router.use(requireAuth);

// GET /api/admin/commissions
router.get('/', async (req, res, next) => {
  try {
    const { status, page = 1, limit = 30 } = req.query;
    const where = status ? { status } : {};

    const take = Math.min(Math.max(Number(limit) || 30, 1), 100);
    const skip = (Math.max(Number(page), 1) - 1) * take;

    const [commissions, total, summary] = await Promise.all([
      prisma.commission.findMany({
        where, skip, take, orderBy: { createdAt: 'desc' },
        include: {
          enquiry: { include: { student: { select: { name: true, phone: true } } } },
          college: { select: { name: true, city: true } },
        },
      }),
      prisma.commission.count({ where }),
      prisma.commission.groupBy({ by: ['status'], _sum: { amount: true }, _count: { id: true } }),
    ]);

    res.json({ commissions, total, page: Number(page), pages: Math.ceil(total / take), summary });
  } catch (err) {
    next(err);
  }
});

// Whitelist allowed fields
function pickCommissionFields(body) {
  const allowed = ['enquiryId', 'collegeId', 'amount', 'status', 'paymentDate', 'notes'];
  const data = {};
  for (const key of allowed) {
    if (body[key] !== undefined) data[key] = body[key];
  }
  return data;
}

// POST /api/admin/commissions
router.post('/', validate(createCommission), async (req, res, next) => {
  try {
    const commission = await prisma.commission.create({ data: pickCommissionFields(req.body) });
    res.status(201).json(commission);
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/commissions/:id
router.put('/:id', validate(updateCommission), async (req, res, next) => {
  try {
    const data = pickCommissionFields(req.body);
    if (data.status === 'Received' && !data.paymentDate) data.paymentDate = new Date();

    const commission = await prisma.commission.update({
      where: { id: Number(req.params.id) },
      data,
    });
    res.json(commission);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
