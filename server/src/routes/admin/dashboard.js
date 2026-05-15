const router = require('express').Router();
const prisma = require('../../lib/prisma');
const { requireTeamMember } = require('../../middleware/auth');

router.use(requireTeamMember);

// GET /api/admin/dashboard
// - admin:      global stats
// - staff:      scoped to enquiries where they are the assigned counselor
// - consultant: scoped to their assigned colleges
router.get('/', async (req, res, next) => {
  try {
    const now = new Date();
    const startOfDay   = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Per-model scopes — different filters depending on the user's role.
    // We can't use a single `collegeScope` blob because Commission /
    // Student / Course / College models have different field names.
    let enquiryScope    = {};   // → prisma.enquiry.{count,findMany}
    let studentScope    = null; // → prisma.student.count (null = no filter)
    let commissionScope = {};   // → prisma.commission.aggregate
    let consultantIds   = null; // → used by college/course counts

    if (req.user.role === 'consultant') {
      const assigned = await prisma.consultantCollege.findMany({
        where: { userId: req.user.id }, select: { collegeId: true },
      });
      consultantIds = assigned.map(r => r.collegeId);
      if (!consultantIds.length) return res.json({
        stats: { totalStudents: 0, totalEnquiries: 0, totalColleges: 0, totalCourses: 0,
                 newToday: 0, enrolledTotal: 0, enrolledMonth: 0,
                 commissionPending: 0, commissionReceivedMonth: 0 },
        recentEnquiries: [], followUps: [], userRole: req.user.role,
      });
      enquiryScope    = { collegeId: { in: consultantIds } };
      studentScope    = { enquiries: { some: { collegeId: { in: consultantIds } } } };
      commissionScope = { collegeId: { in: consultantIds } };
    }
    if (req.user.role === 'staff') {
      // Staff see only their own pipeline. Student has a direct
      // counselorId column; Commission filters via its enquiry relation.
      enquiryScope    = { counselorId: req.user.id };
      studentScope    = { counselorId: req.user.id };
      commissionScope = { enquiry: { counselorId: req.user.id } };
    }

    const [
      totalStudents, totalEnquiries, totalColleges, totalCourses,
      newToday, enrolledTotal, enrolledMonth,
      commissionPending, commissionReceived,
      recentEnquiries, followUps,
    ] = await Promise.all([
      studentScope ? prisma.student.count({ where: studentScope }) : prisma.student.count(),
      prisma.enquiry.count({ where: enquiryScope }),
      consultantIds
        ? prisma.consultantCollege.count({ where: { userId: req.user.id } })
        : prisma.college.count({ where: { isActive: true } }),
      prisma.course.count({ where: {
        isActive: true,
        ...(consultantIds ? { collegeId: { in: consultantIds } } : {}),
      } }),
      prisma.enquiry.count({ where: { ...enquiryScope, createdAt: { gte: startOfDay } } }),
      prisma.enquiry.count({ where: { ...enquiryScope, status: 'Enrolled' } }),
      prisma.enquiry.count({ where: { ...enquiryScope, status: 'Enrolled', updatedAt: { gte: startOfMonth } } }),
      prisma.commission.aggregate({ where: { status: 'Pending', ...commissionScope }, _sum: { amount: true } }),
      prisma.commission.aggregate({ where: { status: 'Received', paymentDate: { gte: startOfMonth }, ...commissionScope }, _sum: { amount: true } }),
      prisma.enquiry.findMany({
        where: enquiryScope, orderBy: { createdAt: 'desc' }, take: 8,
        include: { student: { select: { name: true, phone: true } }, college: { select: { name: true, city: true } } },
      }),
      prisma.enquiry.findMany({
        where: { ...enquiryScope, followUpDate: { gte: new Date(), lte: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) } },
        orderBy: { followUpDate: 'asc' }, take: 10,
        include: { student: { select: { name: true, phone: true } }, college: { select: { name: true } } },
      }),
    ]);

    res.json({
      stats: {
        totalStudents, totalEnquiries, totalColleges, totalCourses,
        newToday, enrolledTotal, enrolledMonth,
        commissionPending: commissionPending._sum.amount || 0,
        commissionReceivedMonth: commissionReceived._sum.amount || 0,
      },
      recentEnquiries,
      followUps,
      userRole: req.user.role,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
