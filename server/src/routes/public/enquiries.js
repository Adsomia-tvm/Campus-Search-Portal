const router = require('express').Router();
const prisma = require('../../lib/prisma');
const validate = require('../../middleware/validate');
const { publicEnquiry } = require('../../middleware/schemas');
const { calculateLeadScore, deriveQualification } = require('../../lib/leadScore');
const { notifyNewEnquiry } = require('../../lib/notify');

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
    notifyNewEnquiry(enquiry, { leadScore, qualificationStatus, source: enquiry.source });

    res.status(201).json({ success: true, enquiryId: enquiry.id, leadScore, qualificationStatus });
  } catch (err) {
    next(err);
  }
});

// Old inline sendNotification removed — now uses centralized notify service

module.exports = router;
