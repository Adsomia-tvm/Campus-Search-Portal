const router = require('express').Router();
const prisma = require('../../lib/prisma');
const { verifyWebhookSignature, isConfigured } = require('../../lib/razorpay');
const { logAudit } = require('../../lib/audit');

/**
 * INT-01: Razorpay Webhook Handler
 *
 * Receives payment events from Razorpay and auto-updates commission statuses.
 * Setup: In Razorpay Dashboard → Webhooks → Add endpoint:
 *   URL: https://app.campussearch.in/api/razorpay/webhook
 *   Events: payment.captured, payment_link.paid
 *   Secret: same as RAZORPAY_WEBHOOK_SECRET in .env
 */

// POST /api/razorpay/webhook
router.post('/webhook', async (req, res) => {
  try {
    if (!isConfigured()) return res.status(200).json({ ok: true }); // Silently ignore if not configured

    const signature = req.headers['x-razorpay-signature'];
    const rawBody = JSON.stringify(req.body);

    // Verify signature
    if (signature) {
      try {
        const valid = verifyWebhookSignature(rawBody, signature);
        if (!valid) {
          console.warn('Razorpay webhook: invalid signature');
          return res.status(400).json({ error: 'Invalid signature' });
        }
      } catch {
        // If webhook secret not configured, proceed without verification in dev
        if (process.env.NODE_ENV === 'production') {
          return res.status(400).json({ error: 'Webhook secret not configured' });
        }
      }
    }

    const event = req.body.event;
    const payload = req.body.payload;

    switch (event) {
      case 'payment.captured': {
        const payment = payload?.payment?.entity;
        if (!payment) break;

        const notes = payment.notes || {};
        const commissionId = notes.commissionId ? Number(notes.commissionId) : null;
        const commissionIds = notes.commissionIds?.split(',').map(Number).filter(Boolean) || [];

        // Single commission
        if (commissionId) {
          await prisma.commission.update({
            where: { id: commissionId },
            data: { status: 'Received', invoiceNumber: `RZP-${payment.id}` },
          }).catch(() => {}); // Ignore if already updated
        }

        // Bulk commissions
        if (commissionIds.length) {
          await prisma.commission.updateMany({
            where: { id: { in: commissionIds } },
            data: { status: 'Received', invoiceNumber: `RZP-${payment.id}` },
          });
        }

        logAudit({
          action: 'payment_webhook_captured',
          entity: 'payment',
          details: { paymentId: payment.id, amount: payment.amount / 100, commissionId, commissionIds },
        });
        break;
      }

      case 'payment_link.paid': {
        const link = payload?.payment_link?.entity;
        const payment = payload?.payment?.entity;
        if (!link) break;

        const notes = link.notes || {};
        const commissionIds = notes.commissionIds?.split(',').map(Number).filter(Boolean) || [];
        const commissionId = notes.commissionId ? Number(notes.commissionId) : null;

        if (commissionId) {
          await prisma.commission.update({
            where: { id: commissionId },
            data: { status: 'Received', invoiceNumber: `RZP-${payment?.id || link.id}` },
          }).catch(() => {});
        }

        if (commissionIds.length) {
          await prisma.commission.updateMany({
            where: { id: { in: commissionIds } },
            data: { status: 'Received', invoiceNumber: `RZP-${payment?.id || link.id}` },
          });
        }

        logAudit({
          action: 'payment_webhook_link_paid',
          entity: 'payment',
          details: { linkId: link.id, amount: link.amount / 100 },
        });
        break;
      }

      case 'refund.created': {
        const refund = payload?.refund?.entity;
        if (!refund) break;
        logAudit({
          action: 'payment_webhook_refund',
          entity: 'payment',
          details: { refundId: refund.id, paymentId: refund.payment_id, amount: refund.amount / 100 },
        });
        break;
      }

      default:
        // Ignore unhandled events
        break;
    }

    // Always return 200 to Razorpay
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Razorpay webhook error:', err.message);
    res.status(200).json({ ok: true }); // Don't retry on our errors
  }
});

module.exports = router;
