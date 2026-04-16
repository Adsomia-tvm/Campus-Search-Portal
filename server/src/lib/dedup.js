/**
 * LEAD-03: Lead deduplication engine
 *
 * Detects potential duplicate students and provides merge capabilities.
 * Matching rules (in priority order):
 *   1. Exact phone match — already handled by DB unique constraint
 *   2. Exact email match — different phone but same email
 *   3. Fuzzy name + city match — same name (case-insensitive) in same city
 *
 * The dedup engine is designed to be run:
 *   - On-demand via admin API (batch dedup scan)
 *   - At capture time (real-time, lightweight check)
 */

const prisma = require('./prisma');

/**
 * Find potential duplicates for a given student
 * Returns array of { student, matchType, confidence }
 */
async function findDuplicates(studentId) {
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) return [];

  const candidates = [];

  // Rule 2: Same email, different phone
  if (student.email) {
    const emailMatches = await prisma.student.findMany({
      where: {
        email: { equals: student.email, mode: 'insensitive' },
        id: { not: student.id },
      },
      select: { id: true, name: true, phone: true, email: true, city: true, createdAt: true,
        _count: { select: { enquiries: true } } },
    });
    for (const match of emailMatches) {
      candidates.push({ student: match, matchType: 'email', confidence: 90 });
    }
  }

  // Rule 3: Fuzzy name + city match
  if (student.name && student.city) {
    const nameMatches = await prisma.student.findMany({
      where: {
        name: { equals: student.name, mode: 'insensitive' },
        city: { equals: student.city, mode: 'insensitive' },
        id: { not: student.id },
        // Exclude already matched by email
        ...(student.email ? { email: { not: student.email } } : {}),
      },
      select: { id: true, name: true, phone: true, email: true, city: true, createdAt: true,
        _count: { select: { enquiries: true } } },
    });
    for (const match of nameMatches) {
      candidates.push({ student: match, matchType: 'name_city', confidence: 70 });
    }
  }

  return candidates;
}

/**
 * Batch scan for all duplicates in the system
 * Returns groups of potential duplicates
 */
async function batchDedupScan(limit = 50) {
  // Find students with the same email (most reliable dedup signal)
  const emailDupes = await prisma.$queryRaw`
    SELECT email, COUNT(*)::int as count, array_agg(id ORDER BY "createdAt") as ids
    FROM students
    WHERE email IS NOT NULL AND email != ''
    GROUP BY LOWER(email)
    HAVING COUNT(*) > 1
    LIMIT ${limit}
  `;

  // Find students with same name + city (lower confidence)
  const nameCityDupes = await prisma.$queryRaw`
    SELECT LOWER(name) as name_key, LOWER(city) as city_key, COUNT(*)::int as count,
           array_agg(id ORDER BY "createdAt") as ids
    FROM students
    WHERE city IS NOT NULL AND city != '' AND name IS NOT NULL
    GROUP BY LOWER(name), LOWER(city)
    HAVING COUNT(*) > 1
    LIMIT ${limit}
  `;

  return {
    emailDuplicates: emailDupes.map(d => ({
      matchType: 'email',
      confidence: 90,
      email: d.email,
      count: d.count,
      studentIds: d.ids,
    })),
    nameCityDuplicates: nameCityDupes.map(d => ({
      matchType: 'name_city',
      confidence: 70,
      name: d.name_key,
      city: d.city_key,
      count: d.count,
      studentIds: d.ids,
    })),
  };
}

/**
 * Merge duplicate students: keep the primary, move all enquiries to it, delete secondary
 * @param {number} primaryId — the student to keep
 * @param {number} secondaryId — the student to merge into primary
 */
async function mergeStudents(primaryId, secondaryId) {
  if (primaryId === secondaryId) throw new Error('Cannot merge student with itself');

  const [primary, secondary] = await Promise.all([
    prisma.student.findUnique({ where: { id: primaryId }, include: { _count: { select: { enquiries: true } } } }),
    prisma.student.findUnique({ where: { id: secondaryId }, include: { enquiries: true } }),
  ]);

  if (!primary) throw new Error(`Primary student ${primaryId} not found`);
  if (!secondary) throw new Error(`Secondary student ${secondaryId} not found`);

  const result = await prisma.$transaction(async (tx) => {
    // Fill in any missing fields on primary from secondary
    const updates = {};
    if (!primary.email && secondary.email)             updates.email = secondary.email;
    if (!primary.city && secondary.city)               updates.city = secondary.city;
    if (!primary.preferredCat && secondary.preferredCat) updates.preferredCat = secondary.preferredCat;
    if (!primary.preferredCity && secondary.preferredCity) updates.preferredCity = secondary.preferredCity;
    if (!primary.budgetMax && secondary.budgetMax)     updates.budgetMax = secondary.budgetMax;
    if (!primary.percentage && secondary.percentage)   updates.percentage = secondary.percentage;
    if (!primary.stream && secondary.stream)           updates.stream = secondary.stream;

    if (Object.keys(updates).length > 0) {
      await tx.student.update({ where: { id: primaryId }, data: updates });
    }

    // Move enquiries from secondary to primary (skip if duplicate college)
    let moved = 0;
    let skipped = 0;
    for (const enquiry of secondary.enquiries) {
      try {
        await tx.enquiry.update({
          where: { id: enquiry.id },
          data: { studentId: primaryId },
        });
        moved++;
      } catch (err) {
        // P2002 = unique constraint (studentId, collegeId) — primary already has enquiry for this college
        if (err.code === 'P2002') {
          // Delete the duplicate enquiry from secondary
          await tx.enquiry.delete({ where: { id: enquiry.id } });
          skipped++;
        } else {
          throw err;
        }
      }
    }

    // Delete the secondary student
    await tx.student.delete({ where: { id: secondaryId } });

    return { primaryId, secondaryId, fieldsEnriched: Object.keys(updates), enquiriesMoved: moved, enquiriesSkipped: skipped };
  });

  return result;
}

module.exports = { findDuplicates, batchDedupScan, mergeStudents };
