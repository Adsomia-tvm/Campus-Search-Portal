/**
 * LEAD-01: Lead scoring engine
 *
 * Calculates a 0–100 composite score based on student profile completeness,
 * engagement signals, and qualification indicators.
 *
 * Score breakdown:
 *   Profile completeness (0–30): name, phone, email, city, percentage, stream
 *   Engagement signals   (0–40): source quality, has course, has college, enquiry count
 *   Qualification hints  (0–30): budget set, preferred city matches college city, percentage > 60
 */

function calculateLeadScore(student, enquiry, enquiryCount = 1) {
  let score = 0;

  // ── Profile completeness (max 30) ──────────────────────────────────────────
  if (student.name)         score += 5;
  if (student.phone)        score += 5;
  if (student.email)        score += 5;
  if (student.city)         score += 5;
  if (student.percentage)   score += 5;
  if (student.stream)       score += 5;

  // ── Engagement signals (max 40) ────────────────────────────────────────────
  // Source quality
  const sourceScores = {
    'Walk-in': 15,
    'Agent': 12,
    'Career Clarity': 10,
    'Fee Gate': 8,
    'WhatsApp': 8,
    'Website': 5,
  };
  score += sourceScores[enquiry.source] || 5;

  // Has specific college + course selected (shows intent)
  if (enquiry.collegeId) score += 5;
  if (enquiry.courseId)  score += 10;

  // Multiple enquiries = higher engagement
  if (enquiryCount >= 3) score += 10;
  else if (enquiryCount >= 2) score += 5;

  // ── Qualification hints (max 30) ───────────────────────────────────────────
  if (student.budgetMax && student.budgetMax > 0) score += 10;
  if (student.preferredCat) score += 5;
  if (student.percentage && student.percentage >= 60) score += 10;
  else if (student.percentage && student.percentage >= 45) score += 5;

  // Preferred city matches college city (strong intent signal)
  if (student.preferredCity && enquiry._collegeCity &&
      student.preferredCity.toLowerCase() === enquiry._collegeCity.toLowerCase()) {
    score += 5;
  }

  return Math.min(score, 100);
}

/**
 * Determine qualification status based on score + status
 */
function deriveQualification(score, status) {
  if (status === 'Enrolled') return 'Won';
  if (status === 'Dropped')  return 'Lost';
  if (score >= 60) return 'SQL';  // Sales Qualified Lead
  if (score >= 30) return 'MQL';  // Marketing Qualified Lead
  return 'Unqualified';
}

module.exports = { calculateLeadScore, deriveQualification };
