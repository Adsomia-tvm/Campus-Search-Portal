const router = require('express').Router();
const prisma = require('../../lib/prisma');
const jwt = require('jsonwebtoken');
const STUDENT_SECRET = process.env.STUDENT_JWT_SECRET || process.env.JWT_SECRET;
if (!STUDENT_SECRET) {
  console.error('FATAL: STUDENT_JWT_SECRET or JWT_SECRET env var is required');
  process.exit(1);
}

// ── POST /api/student/auth ────────────────────────────────────────────────────
// Passwordless: phone is the unique key. New phone = signup (creates lead).
// Returning phone = login (finds existing student).
router.post('/auth', async (req, res) => {
  try {
    const { name, phone, email, preferredCat, collegeId, courseId } = req.body;

    if (!phone || phone.trim().length < 7) {
      return res.status(400).json({ error: 'Valid phone number required' });
    }
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name required' });
    }

    const cleanPhone = phone.trim().replace(/\s+/g, '');
    const isNew = !(await prisma.student.findUnique({ where: { phone: cleanPhone } }));

    // Upsert student
    const student = await prisma.student.upsert({
      where: { phone: cleanPhone },
      create: {
        name:         name.trim(),
        phone:        cleanPhone,
        email:        email?.trim() || null,
        preferredCat: preferredCat || null,
        source:       'Website',
      },
      update: {
        // Keep existing data, just update email if newly provided
        ...(email?.trim() && { email: email.trim() }),
      },
    });

    // If new student + viewing a specific college → auto-create enquiry
    if (isNew && collegeId) {
      try {
        await prisma.enquiry.create({
          data: {
            studentId: student.id,
            collegeId: Number(collegeId),
            courseId:  courseId ? Number(courseId) : null,
            status:    'New',
            notes:     `Auto-created from fee unlock on portal`,
          },
        });
      } catch (_) { /* skip if enquiry creation fails */ }
    }

    // Issue JWT (7 days)
    const token = jwt.sign(
      { studentId: student.id, name: student.name, phone: student.phone },
      STUDENT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, student: { id: student.id, name: student.name, phone: student.phone, email: student.email }, isNew });
  } catch (err) {
    console.error('[student/auth]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/student/me ───────────────────────────────────────────────────────
router.get('/me', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
    const payload = jwt.verify(auth.slice(7), STUDENT_SECRET);
    const student = await prisma.student.findUnique({
      where: { id: payload.studentId },
      select: { id: true, name: true, phone: true, email: true, preferredCat: true },
    });
    if (!student) return res.status(404).json({ error: 'Not found' });
    res.json(student);
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

module.exports = router;
