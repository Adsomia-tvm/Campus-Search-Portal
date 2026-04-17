/**
 * COLLEGE RECOMMENDER API
 * POST /api/recommend
 *
 * Takes student preferences and returns ranked college recommendations
 * with match scores. No AI API call needed — pure database + scoring algorithm.
 */

const { Router } = require('express');
const prisma = require('../../lib/prisma');

const router = Router();

// ── Scoring weights (total = 100) ─────────────────────────────────────────
const W = {
  COURSE:       30,  // Has the exact course they want
  CITY:         25,  // Located in preferred city
  BUDGET:       20,  // Within their budget
  ACCRED:       15,  // NAAC / NBA accreditation quality
  VERIFIED:     10,  // Campus Search verification level
};

// ── Accreditation score map ───────────────────────────────────────────────
const ACCRED_SCORE = {
  'NAAC A++': 1.0, 'NAAC A+': 0.9, 'NAAC A': 0.8,
  'NAAC B++': 0.7, 'NAAC B+': 0.6, 'NAAC B': 0.5,
  'NBA': 0.7, 'NIRF': 0.6,
};

function scoreAccreditation(accreditation) {
  if (!accreditation) return 0;
  const upper = accreditation.toUpperCase();
  for (const [key, score] of Object.entries(ACCRED_SCORE)) {
    if (upper.includes(key.toUpperCase())) return score;
  }
  return 0.2; // Has some accreditation but unrecognized
}

// ── Verification level score ──────────────────────────────────────────────
const VERIFY_SCORE = { Premium: 1.0, Verified: 0.7, Basic: 0.4, Unverified: 0.1 };

// ── City aliases (same as bot) ────────────────────────────────────────────
const CITY_ALIASES = {
  'bangalore': 'bengaluru', 'banglore': 'bengaluru', 'blr': 'bengaluru',
  'mangalore': 'mangaluru', 'mangalor': 'mangaluru',
  'mysore': 'mysuru', 'mysor': 'mysuru',
  'trivandrum': 'thiruvananthapuram', 'tvm': 'thiruvananthapuram',
  'calicut': 'kozhikode', 'kozikode': 'kozhikode',
  'cochin': 'kochi', 'ernakulam': 'kochi',
  'madras': 'chennai',
  'hubli': 'hubballi', 'dharwad': 'hubballi',
  'tumkur': 'tumakuru', 'shimoga': 'shivamogga',
};

function resolveCity(input) {
  if (!input) return null;
  const lower = input.toLowerCase().trim();
  return CITY_ALIASES[lower] || lower;
}

// ── Main recommendation endpoint ──────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { course, city, budget, percentage, stream, degreeLevel, name, phone, email } = req.body;

    if (!course && !city) {
      return res.status(400).json({ error: 'Please provide at least a course or city preference.' });
    }

    // Build query — fetch a broad set, then score and rank in JS
    const where = { isActive: true };
    const courseWhere = { isActive: true };

    // Course filter (broad — we score exact match higher)
    if (course) {
      const courseTerm = course.split('/')[0].trim();
      courseWhere.OR = [
        { name: { contains: courseTerm, mode: 'insensitive' } },
        { category: { contains: courseTerm, mode: 'insensitive' } },
      ];
      where.courses = { some: courseWhere };
    }

    // City filter — if specified, get colleges in that city + nearby for comparison
    const resolvedCity = resolveCity(city);

    // Degree level filter
    if (degreeLevel) {
      courseWhere.degreeLevel = { contains: degreeLevel, mode: 'insensitive' };
    }

    const colleges = await prisma.college.findMany({
      where,
      select: {
        id: true, name: true, city: true, state: true, type: true,
        accreditation: true, approvedBy: true, minFee: true, maxFee: true,
        verificationLevel: true, slug: true, citySlug: true,
        description: true,
        courses: {
          where: course ? courseWhere : { isActive: true },
          select: {
            id: true, name: true, category: true, totalFee: true,
            durationYrs: true, degreeLevel: true, hostelPerYr: true,
            y1Fee: true, quota: true,
          },
          orderBy: { totalFee: 'asc' },
          take: 5,
        },
      },
      take: 200, // Fetch broad set for scoring
    });

    // ── Score each college ─────────────────────────────────────────────
    const budgetNum = budget ? parseBudget(budget) : null;

    const scored = colleges.map(college => {
      let score = 0;
      const reasons = [];

      // 1. Course match (30 pts)
      if (course && college.courses.length > 0) {
        score += W.COURSE;
        reasons.push(`Offers ${college.courses[0].name}`);
      }

      // 2. City match (25 pts)
      if (resolvedCity) {
        const collegeCity = (college.city || '').toLowerCase();
        if (collegeCity.includes(resolvedCity)) {
          score += W.CITY;
          reasons.push(`Located in ${college.city}`);
        }
      } else {
        // No city preference — give partial credit to all
        score += W.CITY * 0.5;
      }

      // 3. Budget match (20 pts)
      if (budgetNum && college.courses.length > 0) {
        const cheapest = college.courses[0].totalFee;
        if (cheapest && cheapest <= budgetNum) {
          // Scale: exact match = full score, just under = most, way under = decent
          const ratio = cheapest / budgetNum;
          score += W.BUDGET * (ratio > 0.5 ? 1.0 : 0.7 + ratio * 0.6);
          reasons.push(`Within budget (${formatFee(cheapest)})`);
        } else if (cheapest && cheapest <= budgetNum * 1.2) {
          // Slightly over budget — partial credit
          score += W.BUDGET * 0.3;
          reasons.push(`Slightly above budget (${formatFee(cheapest)})`);
        }
      } else if (!budgetNum) {
        score += W.BUDGET * 0.5; // No budget specified — partial credit
      }

      // 4. Accreditation (15 pts)
      const accredScore = scoreAccreditation(college.accreditation);
      score += W.ACCRED * accredScore;
      if (accredScore >= 0.7) reasons.push(college.accreditation);

      // 5. Verification level (10 pts)
      const verifyScore = VERIFY_SCORE[college.verificationLevel] || 0;
      score += W.VERIFIED * verifyScore;
      if (college.verificationLevel === 'Premium') reasons.push('Premium verified');
      else if (college.verificationLevel === 'Verified') reasons.push('Verified college');

      return {
        id: college.id,
        name: college.name,
        city: college.city,
        state: college.state,
        type: college.type,
        accreditation: college.accreditation,
        approvedBy: college.approvedBy,
        verified: college.verificationLevel,
        slug: college.slug,
        citySlug: college.citySlug,
        url: college.slug && college.citySlug
          ? `/colleges/${college.citySlug}/${college.slug}`
          : `/college/${college.id}`,
        matchScore: Math.round(score),
        reasons: reasons.slice(0, 4),
        courses: college.courses.map(c => ({
          id: c.id,
          name: c.name,
          category: c.category,
          fee: c.totalFee,
          feeFormatted: formatFee(c.totalFee),
          duration: c.durationYrs,
          hostel: c.hostelPerYr,
          hostelFormatted: c.hostelPerYr ? formatFee(c.hostelPerYr) + '/yr' : null,
          y1Fee: c.y1Fee,
          quota: c.quota,
          degreeLevel: c.degreeLevel,
        })),
      };
    });

    // Sort by score descending, then by name
    scored.sort((a, b) => b.matchScore - a.matchScore || a.name.localeCompare(b.name));

    // Take top 15
    const recommendations = scored.slice(0, 15);

    // ── Save lead if contact info provided ─────────────────────────────
    let studentId = null;
    if (phone || email) {
      try {
        const cleanPhone = phone ? phone.replace(/\D/g, '').replace(/^91/, '').slice(-10) : null;
        if (cleanPhone && cleanPhone.length === 10) {
          const studentData = {
            name: name || 'Recommender User',
            preferredCat: course || null,
            preferredCity: city || null,
            source: 'Recommender',
          };
          if (email) studentData.email = email;
          if (budgetNum) studentData.budgetMax = budgetNum;
          if (percentage) studentData.percentage = parseFloat(percentage);
          if (stream) studentData.stream = stream;

          const student = await prisma.student.upsert({
            where: { phone: cleanPhone },
            update: studentData,
            create: { phone: cleanPhone, ...studentData },
          });
          studentId = student.id;
        }
      } catch (err) {
        console.error('[recommend] Lead save error:', err.message);
        // Don't fail the recommendation — just skip lead save
      }
    }

    return res.json({
      total: recommendations.length,
      query: { course, city, budget, degreeLevel },
      recommendations,
      studentId,
    });
  } catch (err) {
    console.error('[recommend] Error:', err.message);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ── Get filter options (cities, courses, degree levels) ───────────────────
router.get('/options', async (req, res) => {
  try {
    const [cities, categories, degreeLevels] = await Promise.all([
      prisma.college.findMany({
        where: { isActive: true, city: { not: null } },
        select: { city: true },
        distinct: ['city'],
        orderBy: { city: 'asc' },
      }),
      prisma.course.findMany({
        where: { isActive: true, category: { not: null } },
        select: { category: true },
        distinct: ['category'],
        orderBy: { category: 'asc' },
      }),
      prisma.course.findMany({
        where: { isActive: true, degreeLevel: { not: null } },
        select: { degreeLevel: true },
        distinct: ['degreeLevel'],
        orderBy: { degreeLevel: 'asc' },
      }),
    ]);

    return res.json({
      cities: cities.map(c => c.city).filter(Boolean),
      categories: categories.map(c => c.category).filter(Boolean),
      degreeLevels: degreeLevels.map(c => c.degreeLevel).filter(Boolean),
    });
  } catch (err) {
    console.error('[recommend/options] Error:', err.message);
    return res.status(500).json({ error: 'Could not load options.' });
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────
function parseBudget(budget) {
  if (typeof budget === 'number') return budget;
  const str = String(budget).toLowerCase().replace(/,/g, '');
  const num = parseFloat(str.replace(/[^\d.]/g, ''));
  if (isNaN(num)) return null;
  if (str.includes('l') || str.includes('lakh')) return num * 100000;
  if (str.includes('k')) return num * 1000;
  if (num < 100) return num * 100000; // Assume lakhs if small number
  return num;
}

function formatFee(amount) {
  if (!amount) return '—';
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(0)}K`;
  return `₹${amount}`;
}

module.exports = router;
