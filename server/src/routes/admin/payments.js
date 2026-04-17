const router = require('express').Router();
const prisma = require('../../lib/prisma');
const { requireAdmin } = require('../../middleware/auth');
const { logAudit, getIp } = require('../../lib/audit');
const razorpay = require('../../lib/razorpay');

router.use(requireAdmin);

// ── GET /api/admin/payments/status — check Razorpay configuration ───────────
router.get('/status', (req, res) => {
  res.json({ configured: razorpay.isConfigured() });
});

// ── POST /api/admin/payments/create-link — send payment link to college ─────
router.post('/create-link', async (req, res, next) => {
  try {
    if (!razorpay.isConfigured()) {
      return res.status(503).json({ error: 'Razorpay not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.' });
    }

    const { commissionId, collegeId } = req.body;
    if (!commissionId && !collegeId) {
      return res.status(400).json({ error: 'commissionId or collegeId required' });
    }

    let amount, description, receipt, customerName, customerEmail, customerPhone, notes;

    if (commissionId) {
      // Single commission payment link
      const commission = await prisma.commission.findUnique({
        where: { id: Number(commissionId) },
        include: {
          college: { select: { name: true, email: true, phone: true } },
          enquiry: { include: { student: { select: { name: true } } } },
        },
      });
      if (!commission) return res.status(404).json({ error: 'Commission not found' });

      amount = commission.amount;
      description = `Campus Search — Commission for ${commission.enquiry?.student?.name || 'student'} at ${commission.college.name}`;
      receipt = `COMM-${commission.id}`;
      customerName = commission.college.name;
      customerEmail = commission.college.email;
      customerPhone = commission.college.phone;
      notes = { type: 'commission', commissionId: String(commission.id), collegeId: String(commission.collegeId) };
    } else {
      // Bulk payment link for all pending commissions of a college
      const college = await prisma.college.findUnique({
        where: { id: Number(collegeId) },
        select: { id: true, name: true, email: true, phone: true },
      });
      if (!college) return res.status(404).json({ error: 'College not found' });

      const pendingCommissions = await prisma.commission.findMany({
        where: { collegeId: college.id, status: 'Pending' },
        select: { id: true, amount: true },
      });

      if (!pendingCommissions.length) {
        return res.status(400).json({ error: 'No pending commissions for this college' });
      }

      amount = pendingCommissions.reduce((sum, c) => sum + (c.amount || 0), 0);
      description = `Campus Search — ${pendingCommissions.length} commission(s) for ${college.name}`;
      receipt = `BULK-${college.id}-${Date.now()}`;
      customerName = college.name;
      customerEmail = college.email;
      customerPhone = college.phone;
      notes = {
        type: 'bulk_commission',
        collegeId: String(college.id),
        commissionIds: pendingCommissions.map(c => String(c.id)).join(','),
      };
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const link = await razorpay.createPaymentLink({
      amount,
      description,
      receipt,
      customerName,
      customerEmail,
      customerPhone,
      notes,
      callbackUrl: `${process.env.CLIENT_URL || 'https://campussearch.in'}/payment/callback`,
    });

    logAudit({
      userId: req.user.id,
      action: 'payment_link_created',
      entity: 'payment',
      details: { amount, receipt, razorpayLinkId: link.id, shortUrl: link.short_url },
      ipAddress: getIp(req),
    });

    res.json({
      linkId: link.id,
      shortUrl: link.short_url,
      amount: amount,
      status: link.status,
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/admin/payments/create-order — for checkout integration ────────
router.post('/create-order', async (req, res, next) => {
  try {
    if (!razorpay.isConfigured()) {
      return res.status(503).json({ error: 'Razorpay not configured' });
    }

    const { amount, commissionId, collegeId } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount required' });
    }

    const order = await razorpay.createOrder({
      amount,
      receipt: `ORD-${commissionId || collegeId || Date.now()}`,
      notes: {
        ...(commissionId && { commissionId: String(commissionId) }),
        ...(collegeId && { collegeId: String(collegeId) }),
      },
    });

    res.json({
      orderId: order.id,
      amount: order.amount / 100,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/admin/payments/verify — verify payment after checkout ─────────
router.post('/verify', async (req, res, next) => {
  try {
    const { orderId, paymentId, signature, commissionIds } = req.body;
    if (!orderId || !paymentId || !signature) {
      return res.status(400).json({ error: 'orderId, paymentId, and signature required' });
    }

    const isValid = razorpay.verifyPaymentSignature({ orderId, paymentId, signature });
    if (!isValid) {
      return res.status(400).json({ error: 'Payment signature verification failed' });
    }

    // Get payment details from Razorpay
    const payment = await razorpay.getPayment(paymentId);

    // Update commission statuses if provided
    if (commissionIds?.length) {
      const ids = commissionIds.map(Number).filter(id => id > 0);
      await prisma.commission.updateMany({
        where: { id: { in: ids } },
        data: {
          status: 'Received',
          invoiceNumber: `RZP-${paymentId}`,
        },
      });
    }

    logAudit({
      userId: req.user.id,
      action: 'payment_verified',
      entity: 'payment',
      details: { orderId, paymentId, amount: payment.amount / 100, method: payment.method },
      ipAddress: getIp(req),
    });

    res.json({
      verified: true,
      paymentId,
      amount: payment.amount / 100,
      method: payment.method,
      status: payment.status,
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/admin/payments/:paymentId — fetch payment details ──────────────
router.get('/:paymentId', async (req, res, next) => {
  try {
    if (!razorpay.isConfigured()) {
      return res.status(503).json({ error: 'Razorpay not configured' });
    }
    const payment = await razorpay.getPayment(req.params.paymentId);
    res.json({
      id: payment.id,
      amount: payment.amount / 100,
      currency: payment.currency,
      status: payment.status,
      method: payment.method,
      email: payment.email,
      contact: payment.contact,
      createdAt: new Date(payment.created_at * 1000).toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
