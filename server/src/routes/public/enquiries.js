const router = require('express').Router();
const prisma = require('../../lib/prisma');
const nodemailer = require('nodemailer');
const validate = require('../../middleware/validate');
const { publicEnquiry } = require('../../middleware/schemas');

// POST /api/enquiries — student submits enquiry from public website
router.post('/', validate(publicEnquiry), async (req, res, next) => {
  try {
    const { name, phone, email, city, preferredCat, preferredCity, budgetMax,
            percentage, stream, collegeId, courseId, source = 'Website' } = req.body;

    // Sanitize
    const cleanName = name.replace(/<[^>]*>/g, '').trim().slice(0, 100);
    const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');

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

    // Upsert enquiry — if student already enquired about this college, just return success
    let enquiry;
    try {
      enquiry = await prisma.enquiry.create({
        data: {
          studentId: student.id,
          collegeId: Number(collegeId),
          courseId:  courseId ? Number(courseId) : null,
          status: 'New',
        },
        include: {
          student: true,
          college: { select: { name: true, city: true } },
          course:  { select: { name: true } },
        },
      });
    } catch (createErr) {
      // P2002 = unique constraint (studentId, collegeId) — student already enquired about this college
      if (createErr.code === 'P2002') {
        return res.status(201).json({ success: true, message: 'Enquiry already registered for this college' });
      }
      throw createErr;
    }

    // Send email notification (non-blocking)
    sendNotification(enquiry).catch(console.error);

    res.status(201).json({ success: true, enquiryId: enquiry.id });
  } catch (err) {
    next(err);
  }
});

async function sendNotification(enquiry) {
  if (!process.env.SMTP_USER) return;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transporter.sendMail({
    from: `"Campus Search Portal" <${process.env.SMTP_USER}>`,
    to: process.env.NOTIFY_EMAIL,
    subject: `New Enquiry — ${enquiry.student.name} → ${enquiry.college.name}`,
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
      <hr/>
      <p><a href="${process.env.CLIENT_URL}/admin/enquiries">Open in Admin Panel</a></p>
    `,
  });
}

module.exports = router;
