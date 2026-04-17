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

// ── Helper: resolve counselor contact details ─────────────────────────────
async function getCounselorContact(enquiry) {
  const counselorId = enquiry.counselorId || enquiry.student?.counselorId;
  if (!counselorId) return null;
  try {
    return await prisma.user.findUnique({
      where: { id: counselorId },
      select: { name: true, email: true, phone: true },
    });
  } catch { return null; }
}

// ── Helper: resolve agent contact for an enquiry ──────────────────────────
async function getAgentContact(agentId) {
  if (!agentId) return null;
  try {
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      include: { user: { select: { name: true, email: true, phone: true } } },
    });
    return agent?.user || null;
  } catch { return null; }
}

// ── Helper: resolve college contact (portal user or college email) ────────
async function getCollegeContact(collegeId) {
  if (!collegeId) return null;
  try {
    const college = await prisma.college.findUnique({
      where: { id: collegeId },
      select: { email: true, phone: true, name: true },
    });
    // Also check if there's a college portal user
    const portalUser = await prisma.user.findFirst({
      where: { role: 'college', collegeId, isActive: true },
      select: { email: true, phone: true, name: true },
    });
    return { college, portalUser };
  } catch { return null; }
}

const STATUS_EMOJI = {
  New: '📋', Contacted: '📞', Visited: '🏫', Applied: '📝', Enrolled: '✅', Dropped: '❌',
};

// ── New Enquiry ────────────────────────────────────────────────────────────
async function notifyNewEnquiry(enquiry, meta = {}) {
  const student = enquiry.student || {};
  const college = enquiry.college || {};
  const course = enquiry.course || {};
  const scoreColor = (meta.leadScore || 0) >= 60 ? '#16a34a' : (meta.leadScore || 0) >= 30 ? '#ca8a04' : '#6b7280';

  const adminHtml = `
    <h2>New Student Enquiry</h2>
    <p><b>Student:</b> ${student.name}</p>
    <p><b>Phone:</b> ${student.phone || '—'}</p>
    <p><b>Email:</b> ${student.email || '—'}</p>
    <p><b>College:</b> ${college.name || '—'} (${college.city || ''})</p>
    <p><b>Course:</b> ${course.name || '—'}</p>
    <p><b>Category:</b> ${student.preferredCat || '—'}</p>
    <p><b>Lead Score:</b> <span style="color:${scoreColor};font-weight:bold">${meta.leadScore || 0}/100</span> (${meta.qualificationStatus || 'Unqualified'})</p>
    ${meta.source ? `<p><b>Source:</b> ${meta.source}</p>` : ''}
    ${meta.agentName ? `<p><b>Agent:</b> ${meta.agentName}</p>` : ''}
    <hr/><p><a href="${CLIENT()}/admin/enquiries">Open in Admin Panel</a></p>
  `;

  const waText = `📋 New Enquiry\n\n👤 ${student.name}\n📞 ${student.phone || '—'}\n🏫 ${college.name || '—'}\n📚 ${course.name || '—'}\n⭐ Score: ${meta.leadScore || 0}/100${meta.source ? `\n📎 Source: ${meta.source}` : ''}`;

  // 1. Email + WhatsApp to admin
  if (process.env.NOTIFY_EMAIL) {
    sendEmail({
      to: process.env.NOTIFY_EMAIL,
      subject: `New Enquiry — ${student.name} → ${college.name || 'No College'} [Score: ${meta.leadScore || 0}]`,
      html: adminHtml,
      event: 'enquiry.new', entityType: 'Enquiry', entityId: enquiry.id,
    });
  }
  if (process.env.WHATSAPP_TOKEN && process.env.NOTIFY_WHATSAPP) {
    sendWhatsAppText({ to: process.env.NOTIFY_WHATSAPP, text: waText, event: 'enquiry.new', entityType: 'Enquiry', entityId: enquiry.id });
  }

  // 2. Email + WhatsApp to assigned counselor
  const counselor = await getCounselorContact(enquiry);
  if (counselor?.email) {
    sendEmail({
      to: counselor.email,
      subject: `New Lead Assigned — ${student.name} → ${college.name || '—'}`,
      html: `
        <h2>Hi ${counselor.name}, you have a new lead!</h2>
        <p><b>Student:</b> ${student.name} (${student.phone || '—'})</p>
        <p><b>College:</b> ${college.name || '—'}</p>
        <p><b>Course:</b> ${course.name || student.preferredCat || '—'}</p>
        <hr/><p><a href="${CLIENT()}/admin/enquiries">Open in Admin Panel</a></p>
      `,
      event: 'enquiry.new.counselor', entityType: 'Enquiry', entityId: enquiry.id,
    });
  }
  if (counselor?.phone && process.env.WHATSAPP_TOKEN) {
    sendWhatsAppText({
      to: counselor.phone,
      text: `📋 New Lead Assigned\n\n👤 ${student.name}\n📞 ${student.phone || '—'}\n🏫 ${college.name || '—'}\n📚 ${course.name || '—'}`,
      event: 'enquiry.new.counselor', entityType: 'Enquiry', entityId: enquiry.id,
    });
  }

  // 3. Email + WhatsApp to college
  if (college.id) {
    const contacts = await getCollegeContact(college.id);
    const collegeEmail = contacts?.portalUser?.email || contacts?.college?.email;
    const collegePhone = contacts?.portalUser?.phone || contacts?.college?.phone;

    if (collegeEmail) {
      sendEmail({
        to: collegeEmail,
        subject: `New Student Lead — ${student.name} | Campus Search`,
        html: `
          <h2>You have a new student lead!</h2>
          <p><b>Student:</b> ${student.name}</p>
          <p><b>Phone:</b> ${student.phone || '—'}</p>
          <p><b>Course Interest:</b> ${course.name || student.preferredCat || '—'}</p>
          <p><b>City:</b> ${student.city || '—'}</p>
          <p>Log in to your <a href="${CLIENT()}/college-portal/dashboard">College Portal</a> to view details.</p>
        `,
        event: 'enquiry.new.college', entityType: 'Enquiry', entityId: enquiry.id,
      });
    }
    if (collegePhone && process.env.WHATSAPP_TOKEN) {
      sendWhatsAppText({
        to: collegePhone,
        text: `🎓 New Student Lead\n\n👤 ${student.name}\n📞 ${student.phone || '—'}\n📚 ${course.name || student.preferredCat || '—'}\n\nLogin to your College Portal to view details.`,
        event: 'enquiry.new.college', entityType: 'Enquiry', entityId: enquiry.id,
      });
    }
  }
}

// ── Enquiry Status Change ──────────────────────────────────────────────────
async function notifyStatusChange(enquiry, oldStatus, newStatus) {
  const student = enquiry.student || {};
  const college = enquiry.college || {};
  const emoji = STATUS_EMOJI[newStatus] || '🔄';

  // 1. Email + WhatsApp to admin (all status changes)
  if (process.env.NOTIFY_EMAIL) {
    sendEmail({
      to: process.env.NOTIFY_EMAIL,
      subject: `${emoji} Enquiry ${newStatus} — ${student.name} → ${college.name || '—'}`,
      html: `
        <h2>Enquiry Status Updated</h2>
        <p><b>Student:</b> ${student.name} (${student.phone || '—'})</p>
        <p><b>College:</b> ${college.name || '—'}</p>
        <p><b>Status:</b> ${oldStatus} → <b>${newStatus}</b></p>
        <hr/><p><a href="${CLIENT()}/admin/enquiries">Open in Admin Panel</a></p>
      `,
      event: 'enquiry.statusChange', entityType: 'Enquiry', entityId: enquiry.id,
      metadata: { oldStatus, newStatus },
    });
  }
  if (process.env.WHATSAPP_TOKEN && process.env.NOTIFY_WHATSAPP) {
    sendWhatsAppText({
      to: process.env.NOTIFY_WHATSAPP,
      text: `${emoji} Status Update\n\n👤 ${student.name}\n🏫 ${college.name || '—'}\n📊 ${oldStatus} → ${newStatus}`,
      event: 'enquiry.statusChange', entityType: 'Enquiry', entityId: enquiry.id,
    });
  }

  // 2. Notify assigned counselor
  const counselor = await getCounselorContact(enquiry);
  if (counselor?.email) {
    sendEmail({
      to: counselor.email,
      subject: `${emoji} Lead ${newStatus} — ${student.name}`,
      html: `
        <h2>Lead Status Updated</h2>
        <p><b>Student:</b> ${student.name} (${student.phone || '—'})</p>
        <p><b>College:</b> ${college.name || '—'}</p>
        <p><b>Status:</b> ${oldStatus} → <b>${newStatus}</b></p>
        <hr/><p><a href="${CLIENT()}/admin/enquiries">Open in Admin Panel</a></p>
      `,
      event: 'enquiry.statusChange.counselor', entityType: 'Enquiry', entityId: enquiry.id,
    });
  }
  if (counselor?.phone && process.env.WHATSAPP_TOKEN) {
    sendWhatsAppText({
      to: counselor.phone,
      text: `${emoji} Lead Update\n\n👤 ${student.name}\n📊 ${oldStatus} → ${newStatus}\n🏫 ${college.name || '—'}`,
      event: 'enquiry.statusChange.counselor', entityType: 'Enquiry', entityId: enquiry.id,
    });
  }

  // 3. Notify college on important transitions (Applied, Enrolled, Dropped)
  if (['Applied', 'Enrolled', 'Dropped'].includes(newStatus) && college.id) {
    const contacts = await getCollegeContact(college.id);
    const collegeEmail = contacts?.portalUser?.email || contacts?.college?.email;
    const collegePhone = contacts?.portalUser?.phone || contacts?.college?.phone;

    if (collegeEmail) {
      sendEmail({
        to: collegeEmail,
        subject: `${emoji} Student ${newStatus} — ${student.name} | Campus Search`,
        html: `
          <h2>Student Status Update</h2>
          <p><b>Student:</b> ${student.name}</p>
          <p><b>Status:</b> ${oldStatus} → <b>${newStatus}</b></p>
          <p>Log in to your <a href="${CLIENT()}/college-portal/dashboard">College Portal</a> for details.</p>
        `,
        event: 'enquiry.statusChange.college', entityType: 'Enquiry', entityId: enquiry.id,
      });
    }
    if (collegePhone && process.env.WHATSAPP_TOKEN) {
      sendWhatsAppText({
        to: collegePhone,
        text: `${emoji} Student Update\n\n👤 ${student.name}\n📊 ${oldStatus} → ${newStatus}`,
        event: 'enquiry.statusChange.college', entityType: 'Enquiry', entityId: enquiry.id,
      });
    }
  }

  // 4. Notify agent when their referral status changes
  if (enquiry.agentId) {
    const agentContact = await getAgentContact(enquiry.agentId);
    if (agentContact?.email) {
      sendEmail({
        to: agentContact.email,
        subject: `${emoji} Your referral ${student.name} is now ${newStatus} | Campus Search`,
        html: `
          <h2>Hi ${agentContact.name}, your referral has been updated!</h2>
          <p><b>Student:</b> ${student.name}</p>
          <p><b>College:</b> ${college.name || '—'}</p>
          <p><b>Status:</b> ${oldStatus} → <b>${newStatus}</b></p>
          ${newStatus === 'Enrolled' ? '<p>🎉 Commission will be calculated shortly!</p>' : ''}
          <hr/><p><a href="${CLIENT()}/agent-portal/leads">View in Agent Portal</a></p>
        `,
        event: 'enquiry.statusChange.agent', entityType: 'Enquiry', entityId: enquiry.id,
      });
    }
    if (agentContact?.phone && process.env.WHATSAPP_TOKEN) {
      sendWhatsAppText({
        to: agentContact.phone,
        text: `${emoji} Referral Update\n\n👤 ${student.name}\n🏫 ${college.name || '—'}\n📊 ${oldStatus} → ${newStatus}${newStatus === 'Enrolled' ? '\n\n🎉 Commission will be calculated shortly!' : ''}`,
        event: 'enquiry.statusChange.agent', entityType: 'Enquiry', entityId: enquiry.id,
      });
    }
  }
}

// ── Agent Referral ─────────────────────────────────────────────────────────
function notifyAgentReferral(enquiry, agentName) {
  const student = enquiry.student || {};
  const college = enquiry.college || {};

  // Email + WhatsApp to admin
  if (process.env.NOTIFY_EMAIL) {
    sendEmail({
      to: process.env.NOTIFY_EMAIL,
      subject: `🤝 Agent Referral — ${agentName} → ${student.name} → ${college.name || 'No College'}`,
      html: `
        <h2>New Agent Referral</h2>
        <p><b>Agent:</b> ${agentName}</p>
        <p><b>Student:</b> ${student.name} (${student.phone || '—'})</p>
        <p><b>College:</b> ${college.name || 'Pending assignment'}</p>
        <hr/><p><a href="${CLIENT()}/admin/enquiries">Open in Admin Panel</a></p>
      `,
      event: 'agent.referral', entityType: 'Enquiry', entityId: enquiry.id,
    });
  }
  if (process.env.WHATSAPP_TOKEN && process.env.NOTIFY_WHATSAPP) {
    sendWhatsAppText({
      to: process.env.NOTIFY_WHATSAPP,
      text: `🤝 Agent Referral\n\n🧑‍💼 ${agentName}\n👤 ${student.name}\n📞 ${student.phone || '—'}\n🏫 ${college.name || 'Pending assignment'}`,
      event: 'agent.referral', entityType: 'Enquiry', entityId: enquiry.id,
    });
  }
}

// ── Commission Status → Agent ─────────────────────────────────────────────
async function notifyCommissionUpdate(commission) {
  if (!commission.agentId) return;
  const agentContact = await getAgentContact(commission.agentId);
  if (!agentContact) return;

  const amount = commission.agentAmount || commission.amount || 0;
  const emoji = commission.status === 'Received' ? '💰' : commission.status === 'Written Off' ? '❌' : '⏳';

  if (agentContact.email) {
    sendEmail({
      to: agentContact.email,
      subject: `${emoji} Commission ${commission.status} — ₹${amount.toLocaleString('en-IN')} | Campus Search`,
      html: `
        <h2>Hi ${agentContact.name}, commission update!</h2>
        <p><b>Amount:</b> ₹${amount.toLocaleString('en-IN')}</p>
        <p><b>Status:</b> ${commission.status}</p>
        ${commission.status === 'Received' ? '<p>This amount will be included in your next payout.</p>' : ''}
        <hr/><p><a href="${CLIENT()}/agent-portal/commissions">View in Agent Portal</a></p>
      `,
      event: 'commission.update', entityType: 'Commission', entityId: commission.id,
    });
  }
  if (agentContact.phone && process.env.WHATSAPP_TOKEN) {
    sendWhatsAppText({
      to: agentContact.phone,
      text: `${emoji} Commission ${commission.status}\n\nAmount: ₹${amount.toLocaleString('en-IN')}${commission.status === 'Received' ? '\nWill be included in your next payout.' : ''}`,
      event: 'commission.update', entityType: 'Commission', entityId: commission.id,
    });
  }
}

// ── Payout Status → Agent ──────────────────────────────────────────────────
function notifyPayoutUpdate(payout, agentEmail, agentPhone, agentName) {
  if (payout.status === 'Paid' && agentEmail) {
    sendEmail({
      to: agentEmail,
      subject: `💰 Payment of ₹${payout.amount?.toLocaleString('en-IN')} processed | Campus Search`,
      html: `
        <h2>Hi ${agentName},</h2>
        <p>Your payout of <b>₹${payout.amount?.toLocaleString('en-IN')}</b> has been processed.</p>
        ${payout.utrNumber ? `<p><b>UTR:</b> ${payout.utrNumber}</p>` : ''}
        ${payout.paymentMethod ? `<p><b>Method:</b> ${payout.paymentMethod}</p>` : ''}
        <p>Check your bank account for the credit. You can view your full earnings history on your <a href="${CLIENT()}/agent-portal">Agent Dashboard</a>.</p>
        <p>Thank you for partnering with Campus Search!</p>
      `,
      event: 'payout.paid', entityType: 'AgentPayout', entityId: payout.id,
    });
  }

  if (payout.status === 'Paid' && agentPhone && process.env.WHATSAPP_TOKEN) {
    sendWhatsAppText({
      to: agentPhone,
      text: `💰 Payment Processed!\n\nHi ${agentName}, ₹${payout.amount?.toLocaleString('en-IN')} has been transferred to your account.${payout.utrNumber ? `\nUTR: ${payout.utrNumber}` : ''}\n\nThank you for partnering with Campus Search!`,
      event: 'payout.paid', entityType: 'AgentPayout', entityId: payout.id,
    });
  }
}

// ── Follow-up Reminder ────────────────────────────────────────────────────
// Called by cron job to notify counselors/admin about upcoming follow-ups
async function processFollowUpReminders() {
  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  try {
    const dueFollowUps = await prisma.enquiry.findMany({
      where: {
        followUpDate: { lte: endOfDay, gte: now },
        status: { notIn: ['Enrolled', 'Dropped'] },
      },
      select: {
        id: true, status: true, followUpDate: true, notes: true,
        student: { select: { name: true, phone: true } },
        college: { select: { name: true } },
        counselor: { select: { name: true, email: true, phone: true } },
      },
      take: 100,
    });

    for (const enq of dueFollowUps) {
      const student = enq.student || {};
      const college = enq.college || {};
      const counselor = enq.counselor;
      const time = enq.followUpDate ? new Date(enq.followUpDate).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Today';

      // Notify counselor if assigned
      if (counselor?.email) {
        sendEmail({
          to: counselor.email,
          subject: `⏰ Follow-up Due — ${student.name} (${college.name || '—'})`,
          html: `
            <h2>Follow-up Reminder</h2>
            <p><b>Student:</b> ${student.name} (${student.phone || '—'})</p>
            <p><b>College:</b> ${college.name || '—'}</p>
            <p><b>Status:</b> ${enq.status}</p>
            <p><b>Due:</b> ${time}</p>
            ${enq.notes ? `<p><b>Notes:</b> ${enq.notes}</p>` : ''}
            <hr/><p><a href="${CLIENT()}/admin/enquiries">Open in Admin Panel</a></p>
          `,
          event: 'followup.reminder', entityType: 'Enquiry', entityId: enq.id,
        });
      }
      if (counselor?.phone && process.env.WHATSAPP_TOKEN) {
        sendWhatsAppText({
          to: counselor.phone,
          text: `⏰ Follow-up Due\n\n👤 ${student.name}\n📞 ${student.phone || '—'}\n🏫 ${college.name || '—'}\n📊 Status: ${enq.status}\n🕐 ${time}`,
          event: 'followup.reminder', entityType: 'Enquiry', entityId: enq.id,
        });
      }

      // Also notify admin
      if (process.env.NOTIFY_EMAIL) {
        sendEmail({
          to: process.env.NOTIFY_EMAIL,
          subject: `⏰ Follow-up Due — ${student.name} → ${college.name || '—'}`,
          html: `
            <h2>Follow-up Reminder</h2>
            <p><b>Student:</b> ${student.name} (${student.phone || '—'})</p>
            <p><b>College:</b> ${college.name || '—'}</p>
            <p><b>Counselor:</b> ${counselor?.name || 'Unassigned'}</p>
            <p><b>Status:</b> ${enq.status}</p>
            <p><b>Due:</b> ${time}</p>
            <hr/><p><a href="${CLIENT()}/admin/enquiries">Open in Admin Panel</a></p>
          `,
          event: 'followup.reminder', entityType: 'Enquiry', entityId: enq.id,
        });
      }
      if (process.env.WHATSAPP_TOKEN && process.env.NOTIFY_WHATSAPP) {
        sendWhatsAppText({
          to: process.env.NOTIFY_WHATSAPP,
          text: `⏰ Follow-up Due\n\n👤 ${student.name}\n📞 ${student.phone || '—'}\n🏫 ${college.name || '—'}\n🧑‍💼 ${counselor?.name || 'Unassigned'}\n📊 ${enq.status}`,
          event: 'followup.reminder', entityType: 'Enquiry', entityId: enq.id,
        });
      }
    }

    return dueFollowUps.length;
  } catch (err) {
    console.error('[notify] Follow-up reminders failed:', err.message);
    return 0;
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
  notifyCommissionUpdate,
  notifyPayoutUpdate,
  processFollowUpReminders,
};
