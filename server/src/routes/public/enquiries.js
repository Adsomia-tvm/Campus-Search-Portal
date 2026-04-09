const router = require('express').Router();
const prisma = require('../../lib/prisma');
const nodemailer = require('nodemailer');

// POST /api/enquiries — student submits enquiry from public website
router.post('/', async (req, res) => {
  try {
    const { name, phone, email, city, preferredCat, preferredCity, budgetMax,
            percentage, stream, collegeId, courseId, source = 'Website' } = req.body;

    // Validate & sanitize input
    const cleanName = (name || '').replace(/<[^>]*>/g, '').trim().slice(0, 100);
    const cleanPhone = (phone || '').replace(/[\s\-\(\)]/g, '');
    if (!cleanName || !cleanPhone) return res.status(400).json({ error: 'Name and phone are required' });
    if (!/^\+?[0-9]{10,13}$/.test(cleanPhone)) return res.status(400).json({ error: 'Enter a valid 10-digit phone number' });
    if (!collegeId) return res.status(400).json({ error: 'College is required' });

    // Upsert student (phone is unique)
    const student = await prisma.student.upsert({
      where: { phone: cleanPhone },
      update: { name: cleanName, email, city, preferredCat, preferredCity, budgetMax: budgetMax ? Number(budgetMax) : null, percentage: percentage ? Number(percentage) : null, stream },
      create: { name: cleanName, phone: cleanPhone, email, city, preferredCat, preferredCity, budgetMax: budgetMax ? Number(budgetMax) : null, percentage: percentage ? Number(percentage) : null, stream, source },
    });

    const enquiry = await prisma.enquiry.create({
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

    // Send email notification to Campus Search team
    sendNotification(enquiry).catch(console.error);

    res.status(201).json({ success: true, enquiryId: enquiry.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    subject: `🎓 New Enquiry — ${enquiry.student.name} → ${enquiry.college.name}`,
    html: `
      <h2>New Student Enquiry</h2>
      <p><b>Student:</b> ${enquiry.student.name}</p>
      <p><b>Phone:</b> ${enquiry.student.phone}</p>
      <p><b>Email:</b> ${enquiry.student.email || '—'}</p>
      <p><b>College:</b> ${enquiry.college.name} (${enquiry.college.city})</p>
      <p><b>Course:</b> ${enquiry.course?.name || '—'}</p>
      <p><b>Preferred Category:</b> ${enquiry.student.preferredCat || '—'}</p>
      <p><b>Budget:</b> ₹${enquiry.student.budgetMax?.toLocaleString('en-IN') || '—'}</p>
      <p><b>12th %:</b> ${enquiry.student.percentage || '—'}</p>
      <hr/>
      <p><a href="${process.env.CLIENT_URL}/admin/enquiries">Open in Admin Panel →</a></p>
    `,
  });
}

module.exports = router;
