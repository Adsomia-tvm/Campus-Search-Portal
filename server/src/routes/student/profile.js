/**
 * STU-01: Student self-service profile & enquiry API
 * All endpoints require a valid JWT with role=student
 */
const router = require('express').Router();
const prisma = require('../../lib/prisma');
const { requireStudent } = require('../../middleware/auth');
const { logAudit, getIp } = require('../../lib/audit');

router.use(requireStudent);

// ── GET /api/student/profile ─────────────────────────────────────────────────
// Returns the logged-in student's profile + summary stats
router.get('/profile', async (req, res, next) => {
  try {
    // Find the Student record linked to this User
    const student = await prisma.student.findUnique({
      where: { userId: req.user.id },
      select: {
        id: true, name: true, phone: true, email: true, city: true,
        preferredCat: true, preferredCity: true, budgetMax: true,
        percentage: true, stream: true, source: true, createdAt: true,
        _count: { select: { enquiries: true } },
      },
    });

    if (!student) {
      return res.status(404).json({ error: 'Student profile not found. Please contact support.' });
    }

    res.json({
      ...student,
      enquiryCount: student._count.enquiries,
      _count: undefined,
    });
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/student/profile ─────────────────────────────────────────────────
// Update own profile (name, email, city, preferences — NOT phone, that's identity)
router.put('/profile', async (req, res, next) => {
  try {
    const student = await prisma.student.findUnique({ where: { userId: req.user.id } });
    if (!student) return res.status(404).json({ error: 'Student profile not found' });

    // Whitelist editable fields
    const allowed = ['name', 'email', 'city', 'preferredCat', 'preferredCity', 'budgetMax', 'percentage', 'stream'];
    const data = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) data[key] = req.body[key];
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    // Basic validation
    if (data.name !== undefined && data.name.trim().length < 2) {
      return res.status(400).json({ error: 'Name must be at least 2 characters' });
    }
    if (data.email !== undefined && data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    if (data.percentage !== undefined && data.percentage !== null) {
      data.percentage = Number(data.percentage);
      if (isNaN(data.percentage) || data.percentage < 0 || data.percentage > 100) {
        return res.status(400).json({ error: 'Percentage must be between 0 and 100' });
      }
    }
    if (data.budgetMax !== undefined && data.budgetMax !== null) {
      data.budgetMax = Number(data.budgetMax);
      if (isNaN(data.budgetMax) || data.budgetMax < 0) {
        return res.status(400).json({ error: 'Budget must be a positive number' });
      }
    }

    // Trim strings
    if (data.name) data.name = data.name.trim();
    if (data.email) data.email = data.email.trim();

    const updated = await prisma.student.update({
      where: { id: student.id },
      data,
      select: {
        id: true, name: true, phone: true, email: true, city: true,
        preferredCat: true, preferredCity: true, budgetMax: true,
        percentage: true, stream: true,
      },
    });

    // Also sync name/email to User table
    const userUpdate = {};
    if (data.name) userUpdate.name = data.name;
    if (data.email) userUpdate.email = data.email;
    if (Object.keys(userUpdate).length > 0) {
      await prisma.user.update({ where: { id: req.user.id }, data: userUpdate }).catch(() => {});
    }

    logAudit({ userId: req.user.id, action: 'update_profile', entity: 'student', entityId: student.id, ipAddress: getIp(req) });
    res.json(updated);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Email already in use by another account' });
    next(err);
  }
});

// ── GET /api/student/enquiries ───────────────────────────────────────────────
// List own enquiries with college + course details
router.get('/enquiries', async (req, res, next) => {
  try {
    const student = await prisma.student.findUnique({ where: { userId: req.user.id }, select: { id: true } });
    if (!student) return res.status(404).json({ error: 'Student profile not found' });

    const enquiries = await prisma.enquiry.findMany({
      where: { studentId: student.id },
      select: {
        id: true, status: true, notes: true, createdAt: true, updatedAt: true,
        college: {
          select: {
            id: true, name: true, city: true, state: true, type: true,
            slug: true, citySlug: true, logoUrl: true,
          },
        },
        course: {
          select: {
            id: true, name: true, category: true, degreeLevel: true,
            y1Fee: true, totalFee: true, durationYrs: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ enquiries, total: enquiries.length });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/student/enquiries/:id ───────────────────────────────────────────
// Single enquiry detail (only own)
router.get('/enquiries/:id', async (req, res, next) => {
  try {
    const student = await prisma.student.findUnique({ where: { userId: req.user.id }, select: { id: true } });
    if (!student) return res.status(404).json({ error: 'Student profile not found' });

    const enquiry = await prisma.enquiry.findFirst({
      where: { id: Number(req.params.id), studentId: student.id },
      select: {
        id: true, status: true, notes: true, followUpDate: true, createdAt: true, updatedAt: true,
        college: {
          select: {
            id: true, name: true, city: true, state: true, type: true,
            address: true, phone: true, email: true, website: true,
            slug: true, citySlug: true, logoUrl: true, approvedBy: true, accreditation: true,
          },
        },
        course: {
          select: {
            id: true, name: true, category: true, degreeLevel: true,
            durationYrs: true, y1Fee: true, y2Fee: true, y3Fee: true, y4Fee: true, totalFee: true,
            hostelPerYr: true, quota: true,
          },
        },
      },
    });

    if (!enquiry) return res.status(404).json({ error: 'Enquiry not found' });
    res.json(enquiry);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/student/enquiries ──────────────────────────────────────────────
// Student creates a new enquiry (from browsing a college)
router.post('/enquiries', async (req, res, next) => {
  try {
    const student = await prisma.student.findUnique({ where: { userId: req.user.id }, select: { id: true } });
    if (!student) return res.status(404).json({ error: 'Student profile not found' });

    const { collegeId, courseId, notes } = req.body;
    if (!collegeId) return res.status(400).json({ error: 'collegeId is required' });

    // Verify college exists
    const college = await prisma.college.findUnique({
      where: { id: Number(collegeId) },
      select: { id: true, isActive: true },
    });
    if (!college || !college.isActive) {
      return res.status(404).json({ error: 'College not found or inactive' });
    }

    // Verify course if provided
    if (courseId) {
      const course = await prisma.course.findFirst({
        where: { id: Number(courseId), collegeId: college.id, isActive: true },
      });
      if (!course) return res.status(404).json({ error: 'Course not found for this college' });
    }

    const enquiry = await prisma.enquiry.create({
      data: {
        studentId: student.id,
        collegeId: college.id,
        courseId: courseId ? Number(courseId) : null,
        status: 'New',
        notes: notes?.slice(0, 2000) || 'Enquiry from student dashboard',
      },
      select: {
        id: true, status: true, createdAt: true,
        college: { select: { id: true, name: true, city: true } },
        course: { select: { id: true, name: true } },
      },
    });

    logAudit({
      userId: req.user.id, action: 'create_enquiry', entity: 'enquiry',
      entityId: enquiry.id, details: { collegeId: college.id, courseId }, ipAddress: getIp(req),
    });

    res.status(201).json(enquiry);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'You already have an enquiry for this college' });
    next(err);
  }
});

module.exports = router;
