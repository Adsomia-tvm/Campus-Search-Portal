/**
 * INT-01: Razorpay Payment Gateway Integration
 *
 * Handles:
 * - Creating payment links for commission collection from colleges
 * - Verifying payment signatures
 * - Processing webhooks for payment status updates
 *
 * Setup: Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env
 * Webhook: Set RAZORPAY_WEBHOOK_SECRET for webhook signature verification
 */

const crypto = require('crypto');

const KEY_ID = process.env.RAZORPAY_KEY_ID;
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;
const BASE_URL = 'https://api.razorpay.com/v1';

// ── HTTP helper (no external dependency) ────────────────────────────────────
async function razorpayRequest(method, path, body = null) {
  if (!KEY_ID || !KEY_SECRET) {
    throw new Error('Razorpay credentials not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.');
  }

  const auth = Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64');
  const opts = {
    method,
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE_URL}${path}`, opts);
  const data = await res.json();

  if (!res.ok) {
    const msg = data?.error?.description || data?.message || `Razorpay API error ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.razorpayError = data?.error;
    throw err;
  }
  return data;
}

// ── Create Order (for client-side checkout) ─────────────────────────────────
async function createOrder({ amount, currency = 'INR', receipt, notes = {} }) {
  return razorpayRequest('POST', '/orders', {
    amount: Math.round(amount * 100), // Razorpay expects paise
    currency,
    receipt,
    notes,
  });
}

// ── Create Payment Link (for sending to colleges) ──────────────────────────
async function createPaymentLink({
  amount, currency = 'INR', description,
  customerName, customerEmail, customerPhone,
  receipt, notes = {},
  callbackUrl, expireBy,
}) {
  return razorpayRequest('POST', '/payment_links', {
    amount: Math.round(amount * 100),
    currency,
    description,
    customer: {
      name: customerName,
      email: customerEmail,
      contact: customerPhone,
    },
    notify: { sms: true, email: true },
    reminder_enable: true,
    notes,
    callback_url: callbackUrl,
    callback_method: 'get',
    ...(receipt && { receipt }),
    ...(expireBy && { expire_by: Math.floor(expireBy.getTime() / 1000) }),
  });
}

// ── Fetch Payment Details ──────────────────────────────────────────────────
async function getPayment(paymentId) {
  return razorpayRequest('GET', `/payments/${paymentId}`);
}

// ── Fetch Order Details ─────────────────────────────────────────────────────
async function getOrder(orderId) {
  return razorpayRequest('GET', `/orders/${orderId}`);
}

// ── Verify Payment Signature (after client-side checkout) ───────────────────
function verifyPaymentSignature({ orderId, paymentId, signature }) {
  if (!KEY_SECRET) throw new Error('Razorpay key secret not configured');
  const body = `${orderId}|${paymentId}`;
  const expected = crypto
    .createHmac('sha256', KEY_SECRET)
    .update(body)
    .digest('hex');
  return expected === signature;
}

// ── Verify Webhook Signature ───────────────────────────────────────────────
function verifyWebhookSignature(rawBody, signature) {
  if (!WEBHOOK_SECRET) throw new Error('Razorpay webhook secret not configured');
  const expected = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  return expected === signature;
}

// ── Issue Refund ───────────────────────────────────────────────────────────
async function createRefund(paymentId, { amount, notes = {} }) {
  return razorpayRequest('POST', `/payments/${paymentId}/refunds`, {
    amount: amount ? Math.round(amount * 100) : undefined, // partial or full
    notes,
  });
}

// ── Check if Razorpay is configured ────────────────────────────────────────
function isConfigured() {
  return !!(KEY_ID && KEY_SECRET);
}

module.exports = {
  createOrder,
  createPaymentLink,
  getPayment,
  getOrder,
  verifyPaymentSignature,
  verifyWebhookSignature,
  createRefund,
  isConfigured,
};
