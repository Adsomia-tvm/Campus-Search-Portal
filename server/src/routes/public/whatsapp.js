/**
 * WhatsApp Bot — Webhook + Test Endpoint
 *
 * GET  /api/whatsapp/webhook  — Meta verification challenge
 * POST /api/whatsapp/webhook  — Incoming WhatsApp messages → bot engine
 * POST /api/bot/test          — Test bot without WhatsApp (admin chat simulator)
 *
 * Environment:
 *   WHATSAPP_TOKEN        — Meta API bearer token
 *   WHATSAPP_PHONE_ID     — WhatsApp Business phone number ID
 *   WHATSAPP_VERIFY_TOKEN — Webhook verification token (you choose this)
 */
const router = require('express').Router();
const { processMessage } = require('../../lib/bot/engine');
const { sendWhatsAppText, logNotification } = require('../../lib/notify');

// ── Meta Webhook Verification ──────────────────────────────────────────────
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === (process.env.WHATSAPP_VERIFY_TOKEN || 'campussearch_verify_2026')) {
    console.log('[whatsapp] Webhook verified');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// ── Incoming WhatsApp Messages → Bot Engine ────────────────────────────────
router.post('/webhook', async (req, res) => {
  // Always respond 200 quickly to avoid Meta retries
  res.sendStatus(200);

  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    if (!value?.messages?.length) return; // status update, not a message

    const msg = value.messages[0];
    const from = msg.from; // e.g., 919876543210
    const senderName = value.contacts?.[0]?.profile?.name || '';

    // Only handle text messages for now
    if (msg.type !== 'text') {
      await sendWhatsAppText({
        to: from,
        text: 'I can only process text messages right now. Please type your question or send *HI* to start.',
        event: 'bot.unsupported',
      });
      return;
    }

    const text = msg.text?.body || '';
    console.log(`[whatsapp] Message from ${from} (${senderName}): ${text}`);

    // Log incoming message
    logNotification({
      channel: 'whatsapp', recipient: from, event: 'bot.incoming',
      status: 'sent', metadata: { text: text.slice(0, 500), senderName },
    });

    // Process through bot engine
    const reply = await processMessage(from, text);

    // Send reply via WhatsApp
    if (reply) {
      await sendWhatsAppText({ to: from, text: reply, event: 'bot.reply' });
    }
  } catch (err) {
    console.error('[whatsapp] Webhook error:', err.message);
  }
});

// ── Bot Test Endpoint (no WhatsApp needed) ─────────────────────────────────
// Used by admin chat simulator page to test all bot flows locally
router.post('/test', async (req, res) => {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) {
      return res.status(400).json({ error: 'phone and message required' });
    }

    // Use a test prefix to separate from real WhatsApp sessions
    const testPhone = phone.startsWith('TEST_') ? phone : `TEST_${phone}`;
    const reply = await processMessage(testPhone, message);

    res.json({ reply, phone: testPhone });
  } catch (err) {
    console.error('[bot/test] Error:', err.message);
    res.status(500).json({ error: 'Bot error', details: err.message });
  }
});

module.exports = router;
