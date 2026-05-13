const router = require('express').Router();
const prisma = require('../../lib/prisma');
const nodemailer = require('nodemailer');
const zoho = require('../../lib/zohoCrm');
const validate = require('../../middleware/validate');
const { careerLead } = require('../../middleware/schemas');
const { calculateLeadScore, deriveQualification } = require('../../lib/leadScore');

// ── Affiliate auto-attribution (utm_campaign → Affiliate.code) ──────────────
async function resolveAffiliateId(utmCampaign) {
  if (!utmCampaign) return null;
  const code = String(utmCampaign).trim().toLowerCase();
  if (!code) return null;
  const affiliate = await prisma.affiliate.findUnique({
    where: { code },
    select: { id: true, isActive: true },
  });
  return (affiliate && affiliate.isActive) ? affiliate.id : null;
}

// ── Round-robin counselor assignment (same pool as /api/enquiries) ──────────
async function pickNextCounselor() {
  const staff = await prisma.user.findMany({
    where: { role: 'staff', isActive: true },
    select: { id: true, _count: { select: { enquiries: true } } },
  });
  if (staff.length === 0) return null;
  staff.sort((a, b) => a._count.enquiries - b._count.enquiries || a.id - b.id);
  return staff[0].id;
}

// ── Placeholder "Career Clarity" college ────────────────────────────────────
// Career Clarity submissions don't have a target college — but Enquiry.collegeId
// is required. We use a hidden placeholder college so career leads can flow
// through the same Enquiry pipeline (admin listing, UTM badges, round-robin
// counselor, status workflow) without changing the schema.
let cachedCareerCollegeId = null;
async function getCareerClarityCollegeId() {
  if (cachedCareerCollegeId) return cachedCareerCollegeId;
  const existing = await prisma.college.findFirst({
    where: { slug: '_career_clarity' },
    select: { id: true },
  });
  if (existing) { cachedCareerCollegeId = existing.id; return existing.id; }
  const created = await prisma.college.create({
    data: {
      name: 'Career Clarity (no college selected)',
      slug: '_career_clarity',
      isActive: false, // never surfaces in public listings
    },
    select: { id: true },
  });
  cachedCareerCollegeId = created.id;
  return created.id;
}

// POST /api/career-leads — Career Clarity form submission from campussearch.in
router.post('/', validate(careerLead), async (req, res, next) => {
  try {
    const { name: rawName, phone, email, stage, stream, topCareer, allMatches } = req.body;

    // Sanitize user input before storing
    const name = rawName.replace(/<[^>]*>/g, '').trim().slice(0, 100);

    // UTM tracking — accept both camelCase and snake_case to match the
    // website's snake_case convention used in /api/enquiries.
    const utmSource   = req.body.utmSource   || req.body.utm_source   || null;
    const utmMedium   = req.body.utmMedium   || req.body.utm_medium   || null;
    const utmCampaign = req.body.utmCampaign || req.body.utm_campaign || null;

    const notes = [
      topCareer ? `Top Career Match: ${topCareer}` : null,
      allMatches?.length > 1 ? `All Matches: ${allMatches.join(', ')}` : null,
      stage ? `Stage: ${stage}` : null,
    ].filter(Boolean).join(' | ');

    // Upsert student — phone is unique key. Inherit existing counselor if set.
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

    // Counselor assignment — returning students keep their existing counselor,
    // new students get the next-in-rotation least-loaded staff. Persisted on
    // Student so future enquiries from the same phone reuse the same person.
    let counselorId = student.counselorId;
    if (!counselorId) {
      counselorId = await pickNextCounselor();
      if (counselorId) {
        await prisma.student.update({
          where: { id: student.id },
          data: { counselorId },
        });
      }
    }

    // ── Create Enquiry record so this lead shows up in /admin/enquiries ─────
    // We tie it to a hidden placeholder college so the Enquiry.collegeId
    // requirement is satisfied without polluting the public college list.
    const careerCollegeId = await getCareerClarityCollegeId();
    const enquiryCount = await prisma.enquiry.count({ where: { studentId: student.id } });
    const leadScore = calculateLeadScore(
      student,
      { source: 'Career Clarity', collegeId: careerCollegeId, courseId: null, _collegeCity: null },
      enquiryCount + 1,
    );
    const qualificationStatus = deriveQualification(leadScore, 'New');

    const affiliateId = await resolveAffiliateId(utmCampaign);

    try {
      await prisma.enquiry.create({
        data: {
          studentId:   student.id,
          collegeId:   careerCollegeId,
          counselorId: counselorId || null,
          affiliateId,
          status:      'New',
          source:      'Career Clarity',
          utmSource, utmMedium, utmCampaign,
          leadScore,
          qualificationStatus,
        },
      });
    } catch (createErr) {
      // P2002 = unique (studentId, collegeId) — student already submitted
      // Career Clarity once. That's fine; we keep the original enquiry and
      // just refresh the Student row + push to Zoho below.
      if (createErr.code !== 'P2002') throw createErr;
    }

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
      try {
        const zr = await zoho.syncEnquiry({
          ...pseudoEnquiry,
          utm_source: req.body.utm_source, utm_medium: req.body.utm_medium,
          utm_campaign: req.body.utm_campaign,
          gclid: req.body.gclid, fbclid: req.body.fbclid,
          landing_page: req.body.landing_page, referrer: req.body.referrer,
        });
        console.log('[zoho-career] ok', JSON.stringify(zr).slice(0,200));
      } catch (err) {
        console.error('[zoho-career] error:', err.message);
      }
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
