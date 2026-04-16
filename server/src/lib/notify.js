/**
 * NOTIF-01/02: Centralized notification service
 * Handles email (nodemailer SMTP) and WhatsApp (Meta Cloud API) dispatch.
 * All notifications are logged to the notification_logs table.
 *
 * Usage:
 *   const { sendEmail, sendWhatsApp, notifyNewEnquiry, notifyStatusChange } = require('./notify');
 *
 * Environment variables:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS  — email
 *   NOTIFY_EMAIL                                  — default admin notification email
 *   WHATSAPP_TOKEN                                — Meta WhatsApp Cloud API token
 *   WHATSAPP_PHONE_ID                             — WhatsApp Business phone number ID
 *   WHATSAPP_VERIFY_TOKEN                         — Webhook verification token
 *   CLIENT_URL                                    — Frontend URL for links in notifications
 */
const nodemailer = require('nodemailer');
const prisma = require('./prisma');

// ── Email transport (lazy init, reused) ────────────────────────────────────
let _transporter = null;
function getTransporter() {
  if (_transporter) return _transporter;
  if (!process.env.SMTP_USER) return null;
  _transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 587,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return _transporter;
}

// ── Log helper (fire-and-forget) ───────────────────────────────────────────
function logNotification({ channel, recipient, event, entityType, entityId, status, error, metadata }) {
  prisma.notificationLog.create({
    data: {
      channel, recipient, event,
      entityType: entityType || null,
      entityId: entityId || null,
      status: status || 'sent',
      error: error || null,
      metadata: metadata ? JSON.stringify(metadata) : null,
    },
  }).catch(() => {}); // fire-and-forget
}

// ── Send Email ──────────────────────────────────────────────────────────────
async function sendEmail({ to, subject, html, event, entityType, entityId, metadata }) {
  const transporter = getTransporter();
  if (!transporter) return;

  try {
    await transporter.sendMail({
      from: `"Campus Search" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
    });
    logNotification({ channel: 'email', recipient: to, event, entityType, entityId, status: 'sent', metadata });
  } catch (err) {
    console.error('[notify] Email failed:', err.message);
    logNotification({ channel: 'email', recipient: to, event, entityType, entityId, status: 'failed', error: err.message, metadata });
  }
}

// ── Send WhatsApp (Meta Cloud API) ──────────────────────────────────────────
async function sendWhatsApp({ to, templateName, templateLang = 'en', components = [], event, entityType, entityId, metadata }) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!token || !phoneId) return;

  // Normalize phone: ensure country code (default India +91)
  let phone = to.replace(/\D/g, '');
  if (phone.length === 10) phone = '91' + phone;

  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: {
          name: templateName,
          language: { code: templateLang },
          ...(components.length > 0 ? { components } : {}),
        },
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || `HTTP ${res.status}`);
    }

    logNotification({ channel: 'whatsapp', recipient: phone, event, entityType, entityId, status: 'sent', metadata: { ...metadata, messageId: data.messages?.[0]?.id } });
    return data;
  } catch (err) {
    console.error('[notify] WhatsApp failed:', err.message);
    logNotification({ channel: 'whatsapp', recipient: phone, event, entityType, entityId, status: 'failed', error: err.message, metadata });
  }
}

// ── Send free-form WhatsApp text (for webhook replies) ─────────────────────
async function sendWhatsAppText({ to, text, event, entityType, entityId }) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!token || !phoneId) return;

  let phone = to.replace(/\D/g, '');
  if (phone.length === 10) phone = '91' + phone;

  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'text',
        text: { body: text },
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);

    logNotification({ channel: 'whatsapp', recipient: phone, event: event || 'whatsapp.reply', entityType, entityId, status: 'sent' });
    return data;
  } catch (err) {
    console.error('[notify] WhatsApp text failed:', err.message);
    logNotification({ channel: 'whatsapp', recipient: phone, event: event || 'whatsapp.reply', entityType, entityId, status: 'failed', error: err.message });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// HIGH-LEVEL EVENT NOTIFIERS (fire-and-forget)
// ══════════════════════════════════════════════════════════════════════════════

const CLIENT = () => process.env.CLIENT_URL || 'https://campussearch.in';

// ── New Enquiry ────────────────────────────────────────────────────────────
function notifyNewEnquiry(enquiry, meta = {}) {
  const student = enquiry.student || {};
  const college = enquiry.college || {};
  const course = enquiry.course || {};
  const scoreColor = (meta.leadScore || 0) >= 60 ? '#16a34a' : (meta.leadScore || 0) >= 30 ? '#ca8a04' : '#6b7280';

  // Email to admin
  if (process.env.NOTIFY_EMAIL) {
    sendEmail({
      to: process.env.NOTIFY_EMAIL,
      subject: `New Enquiry — ${student.name} → ${college.name} [Score: ${meta.leadScore || 0}]`,
      html: `
        <h2>New Student Enquiry</h2>
        <p><b>Student:</b> ${student.name}</p>
        <p><b>Phone:</b> ${student.phone || '—'}</p>
        <p><b>Email:</b> ${student.email || '—'}</p>
        <p><b>College:</b> ${college.name} (${college.city || ''})</p>
        <p><b>Course:</b> ${course.name || '—'}</p>
        <p><b>Category:</b> ${student.preferredCat || '—'}</p>
        <p><b>Lead Score:</b> <span style="color:${scoreColor};font-weight:bold">${meta.leadScore || 0}/100</span> (${meta.qualificationStatus || 'Unqualified'})</p>
        ${meta.source ? `<p><b>Source:</b> ${meta.source}</p>` : ''}
        ${meta.agentName ? `<p><b>Agent:</b> ${meta.agentName}</p>` : ''}
        <hr/><p><a href="${CLIENT()}/admin/enquiries">Open in Admin Panel</a></p>
      `,
      event: 'enquiry.new',
      entityType: 'Enquiry',
      entityId: enquiry.id,
    });
  }

  // Email to college (if college has an email and user)
  if (college.email) {
    sendEmail({
      to: college.email,
      subject: `New Student Lead — ${student.name} | Campus Search`,
      html: `
        <h2>You have a new student lead!</h2>
        <p><b>Student:</b> ${student.name}</p>
        <p><b>Phone:</b> ${student.phone || '—'}</p>
        <p><b>Course Interest:</b> ${course.name || student.preferredCat || '—'}</p>
        <p><b>City:</b> ${student.city || '—'}</p>
        <p>Log in to your <a href="${CLIENT()}/college-portal/dashboard">College Portal</a> to view details and manage this lead.</p>
      `,
      event: 'enquiry.new.college',
      entityType: 'Enquiry',
      entityId: enquiry.id,
    });
  }

  // WhatsApp to admin
  if (process.env.WHATSAPP_TOKEN && process.env.NOTIFY_WHATSAPP) {
    sendWhatsAppText({
      to: process.env.NOTIFY_WHATSAPP,
      text: `📋 New Enquiry\n\n👤 ${student.name}\n📞 ${student.phone || '—'}\n🏫 ${college.name}\n📚 ${course.name || '—'}\n⭐ Score: ${meta.leadScore || 0}/100`,
      event: 'enquiry.new',
      entityType: 'Enquiry',
      entityId: enquiry.id,
    });
  }
}

// ── Enquiry Status Change ──────────────────────────────────────────────────
function notifyStatusChange(enquiry, oldStatus, newStatus) {
  const student = enquiry.student || {};
  const college = enquiry.college || {};

  // Email admin on important transitions
  if (['Enrolled', 'Dropped'].includes(newStatus)) {
    if (process.env.NOTIFY_EMAIL) {
      const emoji = newStatus === 'Enrolled' ? '✅' : '❌';
      sendEmail({
        to: process.env.NOTIFY_EMAIL,
        subject: `${emoji} Enquiry ${newStatus} — ${student.name} → ${college.name}`,
        html: `
          <h2>Enquiry Status Updated</h2>
          <p><b>Student:</b> ${student.name} (${student.phone || '—'})</p>
          <p><b>College:</b> ${college.name}</p>
          <p><b>Status:</b> ${oldStatus} → <b>${newStatus}</b></p>
          <hr/><p><a href="${CLIENT()}/admin/enquiries">Open in Admin Panel</a></p>
        `,
        event: 'enquiry.statusChange',
        entityType: 'Enquiry',
        entityId: enquiry.id,
        metadata: { oldStatus, newStatus },
      });
    }
  }

  // WhatsApp to admin on enrollment
  if (newStatus === 'Enrolled' && process.env.WHATSAPP_TOKEN && process.env.NOTIFY_WHATSAPP) {
    sendWhatsAppText({
      to: process.env.NOTIFY_WHATSAPP,
      text: `✅ Enrolled!\n\n👤 ${student.name}\n🏫 ${college.name}\n\nCommission record auto-created.`,
      event: 'enquiry.enrolled',
      entityType: 'Enquiry',
      entityId: enquiry.id,
    });
  }
}

// ── Agent Referral ─────────────────────────────────────────────────────────
function notifyAgentReferral(enquiry, agentName) {
  const student = enquiry.student || {};
  const college = enquiry.college || {};

  if (process.env.NOTIFY_EMAIL) {
    sendEmail({
      to: process.env.NOTIFY_EMAIL,
      subject: `Agent Referral — ${agentName} → ${student.name} → ${college.name}`,
      html: `
        <h2>New Agent Referral</h2>
        <p><b>Agent:</b> ${agentName}</p>
        <p><b>Student:</b> ${student.name} (${student.phone || '—'})</p>
        <p><b>College:</b> ${college.name}</p>
        <hr/><p><a href="${CLIENT()}/admin/enquiries">Open in Admin Panel</a></p>
      `,
      event: 'agent.referral',
      entityType: 'Enquiry',
      entityId: enquiry.id,
    });
  }
}

// ── Payout Status → Agent ──────────────────────────────────────────────────
function notifyPayoutUpdate(payout, agentEmail, agentPhone, agentName) {
  if (payout.status === 'Paid' && agentEmail) {
    sendEmail({
      to: agentEmail,
      subject: `Payment of ₹${payout.amount?.toLocaleString('en-IN')} processed | Campus Search`,
      html: `
        <h2>Hi ${agentName},</h2>
        <p>Your payout of <b>₹${payout.amount?.toLocaleString('en-IN')}</b> has been processed.</p>
        ${payout.utrNumber ? `<p><b>UTR:</b> ${payout.utrNumber}</p>` : ''}
        ${payout.paymentMethod ? `<p><b>Method:</b> ${payout.paymentMethod}</p>` : ''}
        <p>Check your bank account for the credit. You can view your full earnings history on your <a href="${CLIENT()}/agent/dashboard">Agent Dashboard</a>.</p>
        <p>Thank you for partnering with Campus Search!</p>
      `,
      event: 'payout.paid',
      entityType: 'AgentPayout',
      entityId: payout.id,
    });
  }

  if (payout.status === 'Paid' && agentPhone && process.env.WHATSAPP_TOKEN) {
    sendWhatsAppText({
      to: agentPhone,
      text: `💰 Payment Processed!\n\nHi ${agentName}, ₹${payout.amount?.toLocaleString('en-IN')} has been transferred to your account.${payout.utrNumber ? `\nUTR: ${payout.utrNumber}` : ''}\n\nThank you for partnering with Campus Search!`,
      event: 'payout.paid',
      entityType: 'AgentPayout',
      entityId: payout.id,
    });
  }
}

module.exports = {
  sendEmail,
  sendWhatsApp,
  sendWhatsAppText,
  logNotification,
  notifyNewEnquiry,
  notifyStatusChange,
  notifyAgentReferral,
  notifyPayoutUpdate,
};
