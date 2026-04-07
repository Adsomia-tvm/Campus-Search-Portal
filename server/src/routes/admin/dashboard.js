const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { requireTeamMember } = require('../../middleware/auth');
const prisma = new PrismaClient();

router.use(requireTeamMember);

// GET /api/admin/dashboard
// - admin/staff: global stats
// - consultant: scoped to their assigned colleges
router.get('/', async (req, res) => {
  try {
    const today = new Date();
    const startOfDay   = new Date(today.setHours(0,0,0,0));
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // Build scope filter for consultants
    let collegeScope = {};
    if (req.user.role === 'consultant') {
      const assigned = await prisma.consultantCollege.findMany({
        where: { userId: req.user.id }, select: { collegeId: true },
      });
      const ids = assigned.map(r => r.collegeId);
      if (!ids.length) return res.json({
        stats: { totalStudents:0, totalEnquiries:0, totalColleges:0, totalCourses:0,
                 newToday:0, enrolledTotal:0, enrolledMonth:0,
                 commissionPending:0, commissionReceivedMonth:0 },
        recentEnquiries: [], followUps: [], assignedColleges: [],
      });
      collegeScope = { collegeId: { in: ids } };
    }

    const [
      totalStudents, totalEnquiries, totalColleges, totalCourses,
      newToday, enrolledTotal, enrolledMonth,
      commissionPending, commissionReceived,
      recentEnquiries, followUps,
    ] = await Promise.all([
      req.user.role === 'consultant'
        ? prisma.student.count({ where: { enquiries: { some: collegeScope } } })
        : prisma.student.count(),
      prisma.enquiry.count({ where: collegeScope }),
      req.user.role === 'consultant'
        ? prisma.consultantCollege.count({ where: { userId: req.user.id } })
        : prisma.college.count({ where: { isActive: true } }),
      prisma.course.count({ where: { isActive: true, ...( collegeScope.collegeId ? { collegeId: collegeScope.collegeId } : {}) } }),
      prisma.enquiry.count({ where: { ...collegeScope, createdAt: { gte: startOfDay } } }),
      prisma.enquiry.count({ where: { ...collegeScope, status: 'Enrolled' } }),
      prisma.enquiry.count({ where: { ...collegeScope, status: 'Enrolled', updatedAt: { gte: startOfMonth } } }),
      prisma.commission.aggregate({ where: { status: 'Pending', ...collegeScope }, _sum: { amount: true } }),
      prisma.commission.aggregate({ where: { status: 'Received', paymentDate: { gte: startOfMonth }, ...collegeScope }, _sum: { amount: true } }),
      prisma.enquiry.findMany({
        where: collegeScope, orderBy: { createdAt: 'desc' }, take: 8,
        include: { student: { select: { name: true, phone: true } }, college: { select: { name: true, city: true } } },
      }),
      prisma.enquiry.findMany({
        where: { ...collegeScope, followUpDate: { gte: new Date(), lte: new Date(Date.now() + 3*24*60*60*1000) } },
        orderBy: { followUpDate: 'asc' }, take: 10,
        include: { student: { select: { name: true, phone: true } }, college: { select: { name: true } } },
      }),
    ]);

    res.json({
      stats: { totalStudents, totalEnquiries, totalColleges, totalCourses, newToday, enrolledTotal, enrolledMonth,
               commissionPending: commissionPending._sum.amount || 0,
               commissionReceivedMonth: commissionReceived._sum.amount || 0 },
      recentEnquiries,
      followUps,
      userRole: req.user.role,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
