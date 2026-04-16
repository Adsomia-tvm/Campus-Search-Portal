const router = require('express').Router();
const prisma = require('../../lib/prisma');
const nodemailer = require('nodemailer');
const validate = require('../../middleware/validate');
const { publicEnquiry } = require('../../middleware/schemas');
const { calculateLeadScore, deriveQualification } = require('../../lib/leadScore');

// POST /api/enquiries — student submits enquiry from public website
router.post('/', validate(publicEnquiry), async (req, res, next) => {
  try {
    const { name, phone, email, city, preferredCat, preferredCity, budgetMax,
            percentage, stream, collegeId, courseId, source = 'Website',
            utmSource, utmMedium, utmCampaign, referralCode } = req.body;

    // Sanitize
    const cleanName = name.replace(/<[^>]*>/g, '').trim().slice(0, 100);
    const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');

    // ── LEAD-03: Dedup — resolve agent from referral code ────────────────────
    let agentId = null;
    if (referralCode) {
      const agent = await prisma.agent.findUnique({
        where: { referralCode: referralCode.toUpperCase() },
        select: { id: true },
      });
      if (agent) agentId = agent.id;
    }

    // Upsert student (phone is unique)
    const student = await prisma.student.upsert({
      where: { phone: cleanPhone },
      update: {
        name: cleanName,
        email: email || undefined,
        city, preferredCat, preferredCity,
        budgetMax: budgetMax ? Number(budgetMax) : null,
        percentage: percentage ? Number(percentage) : null,
        stream,
      },
      create: {
        name: cleanName,
        phone: cleanPhone,
        email: email || null,
        city, preferredCat, preferredCity,
        budgetMax: budgetMax ? Number(budgetMax) : null,
        percentage: percentage ? Number(percentage) : null,
        stream, source,
      },
    });

    // Get college city for lead scoring
    const college = await prisma.college.findUnique({
      where: { id: Number(collegeId) },
      select: { city: true },
    });

    // Count existing enquiries for engagement scoring
    const enquiryCount = await prisma.enquiry.count({ where: { studentId: student.id } });

    // Calculate lead score
    const enquiryData = {
      source: source || 'Website',
      collegeId: Number(collegeId),
      courseId: courseId ? Number(courseId) : null,
      _collegeCity: college?.city || null,
    };
    const leadScore = calculateLeadScore(student, enquiryData, enquiryCount + 1);
    const qualificationStatus = deriveQualification(leadScore, 'New');

    // ── LEAD-03: Dedup — upsert enquiry ──────────────────────────────────────
    // If student already enquired about this college, update with better data
    let enquiry;
    let isNew = true;
    try {
      enquiry = await prisma.enquiry.create({
        data: {
          studentId: student.id,
          collegeId: Number(collegeId),
          courseId:  courseId ? Number(courseId) : null,
          agentId,
          status: 'New',
          source: source || 'Website',
          utmSource: utmSource || null,
          utmMedium: utmMedium || null,
          utmCampaign: utmCampaign || null,
          referralCode: referralCode?.toUpperCase() || null,
          leadScore,
          qualificationStatus,
        },
        include: {
          student: true,
          college: { select: { name: true, city: true } },
          course:  { select: { name: true } },
        },
      });
    } catch (createErr) {
      // P2002 = unique constraint (studentId, collegeId) — student already enquired
      if (createErr.code === 'P2002') {
        isNew = false;
        // Update existing enquiry with better scoring and UTM data if missing
        const existing = await prisma.enquiry.findFirst({
          where: { studentId: student.id, collegeId: Number(collegeId) },
        });
        if (existing) {
          await prisma.enquiry.update({
            where: { id: existing.id },
            data: {
              leadScore: Math.max(existing.leadScore || 0, leadScore),
              ...(courseId && !existing.courseId ? { courseId: Number(courseId) } : {}),
              ...(agentId && !existing.agentId ? { agentId } : {}),
              ...(utmSource && !existing.utmSource ? { utmSource } : {}),
              ...(utmMedium && !existing.utmMedium ? { utmMedium } : {}),
              ...(utmCampaign && !existing.utmCampaign ? { utmCampaign } : {}),
              ...(referralCode && !existing.referralCode ? { referralCode: referralCode.toUpperCase() } : {}),
            },
          });
        }
        return res.status(201).json({ success: true, message: 'Enquiry already registered for this college', deduplicated: true });
      }
      throw createErr;
    }

    // Send email notification (non-blocking)
    sendNotification(enquiry, { leadScore, qualificationStatus, isNew }).catch(console.error);

    res.status(201).json({ success: true, enquiryId: enquiry.id, leadScore, qualificationStatus });
  } catch (err) {
    next(err);
  }
});

async function sendNotification(enquiry, meta = {}) {
  if (!process.env.SMTP_USER) return;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  const scoreColor = meta.leadScore >= 60 ? '#16a34a' : meta.leadScore >= 30 ? '#ca8a04' : '#6b7280';
  const qualLabel = meta.qualificationStatus || 'Unqualified';

  await transporter.sendMail({
    from: `"Campus Search Portal" <${process.env.SMTP_USER}>`,
    to: process.env.NOTIFY_EMAIL,
    subject: `New Enquiry — ${enquiry.student.name} → ${enquiry.college.name} [Score: ${meta.leadScore}]`,
    html: `
      <h2>New Student Enquiry</h2>
      <p><b>Student:</b> ${enquiry.student.name}</p>
      <p><b>Phone:</b> ${enquiry.student.phone}</p>
      <p><b>Email:</b> ${enquiry.student.email || '—'}</p>
      <p><b>College:</b> ${enquiry.college.name} (${enquiry.college.city})</p>
      <p><b>Course:</b> ${enquiry.course?.name || '—'}</p>
      <p><b>Preferred Category:</b> ${enquiry.student.preferredCat || '—'}</p>
      <p><b>Budget:</b> ${enquiry.student.budgetMax?.toLocaleString('en-IN') || '—'}</p>
      <p><b>12th %:</b> ${enquiry.student.percentage || '—'}</p>
      <p><b>Lead Score:</b> <span style="color:${scoreColor};font-weight:bold">${meta.leadScore}/100</span> (${qualLabel})</p>
      <hr/>
      <p><a href="${process.env.CLIENT_URL}/admin/enquiries">Open in Admin Panel</a></p>
    `,
  });
}

module.exports = router;
