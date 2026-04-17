/**
 * Zod validation schemas for all API endpoints.
 * Centralised here for consistency and easy auditing.
 */

const { z } = require('zod');

// ── Reusable primitives ─────────────────────────────────────────────────────

const indianPhone = z.string().regex(/^[6-9]\d{9}$/, 'Valid 10-digit Indian mobile number required');
const optionalEmail = z.string().email('Invalid email').optional().or(z.literal(''));
const positiveInt = z.coerce.number().int().positive();
const optionalPositiveInt = z.coerce.number().int().positive().optional();
const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30).optional(),
});

// ── Student Auth ─────────────────────────────────────────────────────────────

const studentAuth = z.object({
  body: z.object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
    phone: indianPhone,
    email: optionalEmail,
    preferredCat: z.string().max(50).optional().nullable(),
    collegeId: positiveInt.optional(),
    courseId: positiveInt.optional(),
  }),
});

// ── Admin Auth ───────────────────────────────────────────────────────────────

const adminLogin = z.object({
  body: z.object({
    email: z.string().email('Invalid email'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
  }),
});

const adminSetup = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(100),
    email: z.string().email(),
    password: z.string().min(8, 'Password must be at least 8 characters'),
  }),
});

// ── Enquiry ──────────────────────────────────────────────────────────────────

const createEnquiry = z.object({
  body: z.object({
    studentId: positiveInt,
    collegeId: positiveInt,
    courseId: positiveInt.optional().nullable(),
    status: z.enum(['New', 'Contacted', 'Visited', 'Applied', 'Enrolled', 'Dropped']).default('New').optional(),
    counselorId: positiveInt.optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
  }),
});

const updateEnquiry = z.object({
  params: z.object({ id: positiveInt }),
  body: z.object({
    status: z.enum(['New', 'Contacted', 'Visited', 'Applied', 'Enrolled', 'Dropped']).optional(),
    counselorId: positiveInt.optional().nullable(),
    followUpDate: z.string().datetime().optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
  }),
});

// ── Public Enquiry ───────────────────────────────────────────────────────────

const publicEnquiry = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(100),
    phone: indianPhone,
    email: optionalEmail,
    city: z.string().max(100).optional().nullable(),
    preferredCat: z.string().max(100).optional().nullable(),
    preferredCity: z.string().max(100).optional().nullable(),
    budgetMax: z.coerce.number().int().min(0).optional().nullable(),
    percentage: z.coerce.number().min(0).max(100).optional().nullable(),
    stream: z.string().max(50).optional().nullable(),
    source: z.string().max(50).default('Website').optional(),
    collegeId: positiveInt,
    courseId: positiveInt.optional(),
    // LEAD-02: UTM + referral tracking
    utmSource: z.string().max(100).optional().nullable(),
    utmMedium: z.string().max(100).optional().nullable(),
    utmCampaign: z.string().max(200).optional().nullable(),
    referralCode: z.string().max(20).optional().nullable(),
  }),
});

// ── College ──────────────────────────────────────────────────────────────────

const createCollege = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(200),
    city: z.string().max(100).optional().nullable(),
    state: z.string().max(100).optional().nullable(),
    type: z.string().max(50).optional().nullable(),
    address: z.string().max(500).optional().nullable(),
    phone: z.string().max(20).optional().nullable(),
    email: optionalEmail.nullable(),
    website: z.string().url().optional().or(z.literal('')).nullable(),
    logoUrl: z.string().url().optional().or(z.literal('')).nullable(),
    description: z.string().max(5000).optional().nullable(),
    approvedBy: z.string().max(200).optional().nullable(),
    accreditation: z.string().max(200).optional().nullable(),
    // COL-01: partnership + verification
    verificationLevel: z.enum(['Unverified', 'Basic', 'Verified', 'Premium']).optional(),
    partnershipTier:   z.enum(['Starter', 'Growth', 'Elite', 'Institutional']).optional(),
    monthlyLeadCap:    z.coerce.number().int().min(0).optional().nullable(),
    pricePerLead:      z.coerce.number().int().min(0).optional().nullable(),
    partnershipSince:  z.string().datetime().optional().nullable(),
  }),
});

const updateCollege = z.object({
  params: z.object({ id: positiveInt }),
  body: createCollege.shape.body.partial(),
});

// ── Course ───────────────────────────────────────────────────────────────────

const createCourse = z.object({
  params: z.object({ id: positiveInt }), // collegeId
  body: z.object({
    name: z.string().trim().min(1).max(200),
    category: z.string().max(100).optional().nullable(),
    degreeLevel: z.string().max(50).optional().nullable(),
    durationYrs: z.coerce.number().min(0).max(10).optional().nullable(),
    quota: z.string().max(50).optional().nullable(),
    y1Fee: z.coerce.number().int().min(0).optional().nullable(),
    y2Fee: z.coerce.number().int().min(0).optional().nullable(),
    y3Fee: z.coerce.number().int().min(0).optional().nullable(),
    y4Fee: z.coerce.number().int().min(0).optional().nullable(),
    y5Fee: z.coerce.number().int().min(0).optional().nullable(),
    totalFee: z.coerce.number().int().min(0).optional().nullable(),
    hostelPerYr: z.coerce.number().int().min(0).optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
    isActive: z.boolean().optional(),
  }),
});

const updateCourse = z.object({
  params: z.object({ id: positiveInt }),
  body: createCourse.shape.body.partial(),
});

// ── Student ──────────────────────────────────────────────────────────────────

const createStudent = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(100),
    phone: indianPhone,
    email: optionalEmail.nullable(),
    city: z.string().max(100).optional().nullable(),
    preferredCat: z.string().max(100).optional().nullable(),
    preferredCity: z.string().max(100).optional().nullable(),
    budgetMax: z.coerce.number().int().min(0).optional().nullable(),
    percentage: z.coerce.number().min(0).max(100).optional().nullable(),
    stream: z.string().max(50).optional().nullable(),
    source: z.string().max(50).optional().nullable(),
    counselorId: positiveInt.optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
  }),
});

const updateStudent = z.object({
  params: z.object({ id: positiveInt }),
  body: createStudent.shape.body.partial(),
});

// ── Commission ───────────────────────────────────────────────────────────────

const createCommission = z.object({
  body: z.object({
    enquiryId: positiveInt,
    collegeId: positiveInt,
    amount: z.coerce.number().int().min(0).optional().nullable(),
    status: z.enum(['Pending', 'Received', 'Written Off']).default('Pending').optional(),
    notes: z.string().max(2000).optional().nullable(),
  }),
});

const updateCommission = z.object({
  params: z.object({ id: positiveInt }),
  body: z.object({
    amount: z.coerce.number().int().min(0).optional().nullable(),
    status: z.enum(['Pending', 'Received', 'Written Off']).optional(),
    paymentDate: z.string().datetime().optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
  }),
});

// ── User (Team) ──────────────────────────────────────────────────────────────

const createUser = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(100),
    email: z.string().email(),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    role: z.enum(['staff', 'consultant', 'college', 'agent']),
    phone: z.string().max(20).optional().nullable(),
    collegeIds: z.array(positiveInt).optional(),   // for consultant role
    collegeId: positiveInt.optional(),              // for college role
  }),
});

const updateUser = z.object({
  params: z.object({ id: positiveInt }),
  body: z.object({
    name: z.string().trim().min(2).max(100).optional(),
    email: z.string().email().optional(),
    password: z.string().min(8).optional(),
    phone: z.string().max(20).optional().nullable(),
    isActive: z.boolean().optional(),
  }),
});

// ── Career Leads ─────────────────────────────────────────────────────────────

const careerLead = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(100),
    phone: indianPhone,
    email: optionalEmail,
    stage: z.string().max(100).optional().nullable(),
    stream: z.string().max(100).optional().nullable(),
    topCareer: z.string().max(200).optional().nullable(),
    allMatches: z.array(z.string().max(200)).max(20).optional().nullable(),
  }),
});

// ── ID param (reusable) ─────────────────────────────────────────────────────

const idParam = z.object({
  params: z.object({ id: positiveInt }),
});

module.exports = {
  studentAuth,
  adminLogin,
  adminSetup,
  createEnquiry,
  updateEnquiry,
  publicEnquiry,
  createCollege,
  updateCollege,
  createCourse,
  updateCourse,
  createStudent,
  updateStudent,
  createCommission,
  updateCommission,
  createUser,
  updateUser,
  careerLead,
  idParam,
};
