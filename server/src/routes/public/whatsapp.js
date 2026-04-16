/**
 * NOTIF-02: WhatsApp Bot — Webhook handler for Meta WhatsApp Cloud API
 *
 * Supports:
 * - Webhook verification (GET /api/whatsapp/webhook)
 * - Incoming message handling (POST /api/whatsapp/webhook)
 * - Auto-replies with college info, enquiry status, and lead capture
 *
 * Environment:
 *   WHATSAPP_TOKEN       — Meta API bearer token
 *   WHATSAPP_PHONE_ID    — WhatsApp Business phone number ID
 *   WHATSAPP_VERIFY_TOKEN — Webhook verification token (you choose this)
 */
const router = require('express').Router();
const prisma = require('../../lib/prisma');
const { sendWhatsAppText, logNotification } = require('../../lib/notify');

// ── Webhook verification (Meta sends GET to verify endpoint) ───────────────
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('[whatsapp] Webhook verified');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// ── Incoming messages ──────────────────────────────────────────────────────
router.post('/webhook', async (req, res) => {
  // Always respond 200 quickly to avoid Meta retries
  res.sendStatus(200);

  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    if (!value?.messages?.length) return; // Not a message event (could be status update)

    const msg = value.messages[0];
    const from = msg.from; // Phone number with country code
    const text = msg.text?.body?.trim().toLowerCase() || '';
    const senderName = value.contacts?.[0]?.profile?.name || '';

    logNotification({
      channel: 'whatsapp',
      recipient: from,
      event: 'whatsapp.incoming',
      status: 'sent',
      metadata: { text: text.slice(0, 500), senderName },
    });

    // Route to handler
    await handleMessage(from, text, senderName);
  } catch (err) {
    console.error('[whatsapp] Webhook error:', err.message);
  }
});

// ── Message router ─────────────────────────────────────────────────────────
async function handleMessage(phone, text, senderName) {
  // Greeting / Menu
  if (['hi', 'hello', 'hey', 'start', 'menu'].includes(text)) {
    return sendMenu(phone, senderName);
  }

  // Check enquiry status
  if (text === '1' || text.includes('status') || text.includes('enquiry')) {
    return sendEnquiryStatus(phone);
  }

  // College search
  if (text === '2' || text.startsWith('search ') || text.startsWith('find ')) {
    const query = text.replace(/^(2|search|find)\s*/i, '').trim();
    return sendCollegeSearch(phone, query);
  }

  // Talk to counselor
  if (text === '3' || text.includes('counselor') || text.includes('help') || text.includes('call')) {
    return sendCounselorConnect(phone);
  }

  // Categories
  if (text === '4' || text.includes('category') || text.includes('course')) {
    return sendCategories(phone);
  }

  // Default: show menu
  return sendMenu(phone, senderName);
}

// ── Menu ───────────────────────────────────────────────────────────────────
function sendMenu(phone, name) {
  const greeting = name ? `Hi ${name}! ` : 'Hi! ';
  return sendWhatsAppText({
    to: phone,
    text: `${greeting}Welcome to *Campus Search* 🎓\n\nHow can I help you today?\n\n1️⃣ Check my enquiry status\n2️⃣ Search for colleges\n3️⃣ Talk to a counselor\n4️⃣ Browse categories\n\nJust reply with a number or type your question!`,
    event: 'whatsapp.menu',
  });
}

// ── Enquiry Status ─────────────────────────────────────────────────────────
async function sendEnquiryStatus(phone) {
  // Find student by phone
  const cleanPhone = phone.replace(/^91/, ''); // Remove country code for DB lookup
  const student = await prisma.student.findUnique({
    where: { phone: cleanPhone },
    select: {
      name: true,
      enquiries: {
        select: { status: true, college: { select: { name: true } }, course: { select: { name: true } }, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
    },
  });

  if (!student || student.enquiries.length === 0) {
    return sendWhatsAppText({
      to: phone,
      text: `We couldn't find any enquiries linked to this number.\n\nVisit campussearch.in to explore colleges and submit an enquiry, or reply *3* to talk to a counselor.`,
      event: 'whatsapp.status.notfound',
    });
  }

  let msg = `Hi ${student.name}! Here are your recent enquiries:\n`;
  student.enquiries.forEach((e, i) => {
    const statusEmoji = { New: '🆕', Contacted: '📞', Visited: '🏫', Applied: '📝', Enrolled: '✅', Dropped: '❌' }[e.status] || '📋';
    msg += `\n${i + 1}. ${statusEmoji} *${e.college.name}*\n   Course: ${e.course?.name || '—'}\n   Status: ${e.status}\n`;
  });
  msg += `\nQuestions? Reply *3* to connect with a counselor.`;

  return sendWhatsAppText({ to: phone, text: msg, event: 'whatsapp.status.found' });
}

// ── College Search ─────────────────────────────────────────────────────────
async function sendCollegeSearch(phone, query) {
  if (!query || query.length < 2) {
    return sendWhatsAppText({
      to: phone,
      text: `Please type *search* followed by a college name or city.\n\nExample: *search nursing bangalore*`,
      event: 'whatsapp.search.prompt',
    });
  }

  const colleges = await prisma.college.findMany({
    where: {
      isActive: true,
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { city: { contains: query, mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, city: true, type: true },
    take: 5,
    orderBy: { enquiryCount: 'desc' },
  });

  if (colleges.length === 0) {
    return sendWhatsAppText({
      to: phone,
      text: `No colleges found for "${query}". Try a different search, or visit campussearch.in for the full list.`,
      event: 'whatsapp.search.empty',
    });
  }

  let msg = `🏫 Top results for "${query}":\n`;
  colleges.forEach((c, i) => {
    msg += `\n${i + 1}. *${c.name}*\n   📍 ${c.city || '—'} | ${c.type || '—'}\n   🔗 campussearch.in/colleges/${c.id}\n`;
  });
  msg += `\nReply *3* to get expert guidance on the right college for you!`;

  return sendWhatsAppText({ to: phone, text: msg, event: 'whatsapp.search.results' });
}

// ── Connect with Counselor ─────────────────────────────────────────────────
function sendCounselorConnect(phone) {
  const csPhone = '+917407556677'; // Master phone number
  return sendWhatsAppText({
    to: phone,
    text: `Our counselors are here to help! 🤝\n\n📞 Call us: ${csPhone}\n🌐 Visit: campussearch.in\n\nOr reply with your *name* and *preferred course/city* and we'll have a counselor reach out to you.`,
    event: 'whatsapp.counselor',
  });
}

// ── Categories ─────────────────────────────────────────────────────────────
async function sendCategories(phone) {
  const categories = await prisma.college.groupBy({
    by: ['type'],
    where: { isActive: true, type: { not: null } },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 10,
  });

  if (categories.length === 0) {
    return sendWhatsAppText({ to: phone, text: `Visit campussearch.in to explore all categories.`, event: 'whatsapp.categories' });
  }

  let msg = `📚 College Categories:\n`;
  categories.forEach((c, i) => {
    msg += `\n${i + 1}. ${c.type} (${c._count.id} colleges)`;
  });
  msg += `\n\nType *search [category]* to find colleges, or reply *3* for counselor help.`;

  return sendWhatsAppText({ to: phone, text: msg, event: 'whatsapp.categories' });
}

module.exports = router;
