const router = require('express').Router();
const prisma = require('../../lib/prisma');
const nodemailer = require('nodemailer');
const zoho = require('../../lib/zohoCrm');
const validate = require('../../middleware/validate');
const { careerLead } = require('../../middleware/schemas');

// POST /api/career-leads — Career Clarity form submission from campussearch.in
router.post('/', validate(careerLead), async (req, res, next) => {
  try {
    const { name: rawName, phone, email, stage, stream, topCareer, allMatches } = req.body;

    // Sanitize user input before storing
    const name = rawName.replace(/<[^>]*>/g, '').trim().slice(0, 100);

    const notes = [
      topCareer ? `Top Career Match: ${topCareer}` : null,
      allMatches?.length > 1 ? `All Matches: ${allMatches.join(', ')}` : null,
      stage ? `Stage: ${stage}` : null,
    ].filter(Boolean).join(' | ');

    // Upsert student — phone is unique key
    const student = await prisma.student.upsert({
      where: { phone },
      update: {
        name,
        email: email || undefined,
        stream: stream || undefined,
        notes,
        source: 'Career Clarity',
      },
      create: {
        name,
        phone,
        email: email || null,
        stream: stream || null,
        source: 'Career Clarity',
        notes,
      },
    });

    // Fire email notification (non-blocking)
    sendNotification({ student, topCareer, allMatches, stage, stream }).catch(console.error);

    // Push to Zoho CRM (Career Clarity)
    if (zoho.isConfigured()) {
      const pseudoEnquiry = {
        id: `career-${student.id}`,
        student,
        source: 'Career Clarity',
        status: 'New',
        notes: [topCareer && `Top Career: ${topCareer}`, stage && `Stage: ${stage}`, stream && `Stream: ${stream}`].filter(Boolean).join(' | '),
      };
      zoho.syncEnquiry(pseudoEnquiry).catch(err => console.error('[zoho-career]', err.message));
    }

    res.status(201).json({ success: true, studentId: student.id });
  } catch (err) {
    next(err);
  }
});

async function sendNotification({ student, topCareer, allMatches, stage, stream }) {
  if (!process.env.SMTP_USER) return;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transporter.sendMail({
    from: `"Campus Search" <${process.env.SMTP_USER}>`,
    to: process.env.NOTIFY_EMAIL,
    subject: `Career Clarity Lead — ${student.name} (${topCareer || 'Unknown'})`,
    html: `
      <h2 style="color:#E8593C">New Career Clarity Lead</h2>
      <table style="border-collapse:collapse;width:100%;max-width:500px">
        <tr><td style="padding:8px;border:1px solid #eee;font-weight:bold">Name</td><td style="padding:8px;border:1px solid #eee">${student.name}</td></tr>
        <tr><td style="padding:8px;border:1px solid #eee;font-weight:bold">Phone</td><td style="padding:8px;border:1px solid #eee">${student.phone}</td></tr>
        <tr><td style="padding:8px;border:1px solid #eee;font-weight:bold">Email</td><td style="padding:8px;border:1px solid #eee">${student.email || '—'}</td></tr>
        <tr><td style="padding:8px;border:1px solid #eee;font-weight:bold">Stage</td><td style="padding:8px;border:1px solid #eee">${stage || '—'}</td></tr>
        <tr><td style="padding:8px;border:1px solid #eee;font-weight:bold">Stream</td><td style="padding:8px;border:1px solid #eee">${stream || '—'}</td></tr>
        <tr><td style="padding:8px;border:1px solid #eee;font-weight:bold">Top Career Match</td><td style="padding:8px;border:1px solid #eee;color:#E8593C;font-weight:bold">${topCareer || '—'}</td></tr>
        <tr><td style="padding:8px;border:1px solid #eee;font-weight:bold">All Matches</td><td style="padding:8px;border:1px solid #eee">${allMatches?.join(', ') || '—'}</td></tr>
      </table>
      <p style="margin-top:16px">
        <a href="${process.env.CLIENT_URL || 'https://campussearch.in'}/admin/students"
           style="background:#E8593C;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold">
          View in Admin Panel
        </a>
      </p>
    `,
  });
}

module.exports = router;
