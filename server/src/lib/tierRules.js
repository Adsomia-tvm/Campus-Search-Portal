/**
 * Partnership tier rules (COL-03, plan Module 04/07)
 *
 * Single source of truth for tier-gated commercial logic:
 *   - default monthly lead cap
 *   - default price per allocated lead (INR)
 *   - allocation priority (higher = earlier allocation)
 *   - exclusivity window in hours (priority access before lower tiers)
 *   - whether tier can receive premium placements
 *
 * Per-college overrides live in `colleges.monthlyLeadCap` / `colleges.pricePerLead`.
 * Fall back to these defaults when the college has no override.
 */

const TIERS = {
  Starter: {
    label: 'Starter',
    order: 1,
    defaultMonthlyCap: 30,
    defaultPricePerLead: 200,
    exclusivityHours: 0,            // no priority access
    canReceivePremium: false,
    description: 'Entry tier — basic lead access, capped volume',
  },
  Growth: {
    label: 'Growth',
    order: 2,
    defaultMonthlyCap: 100,
    defaultPricePerLead: 350,
    exclusivityHours: 48,           // 48h priority before Starter
    canReceivePremium: false,
    description: 'Mid tier — higher cap, 48h exclusivity on new leads',
  },
  Elite: {
    label: 'Elite',
    order: 3,
    defaultMonthlyCap: 300,
    defaultPricePerLead: 600,
    exclusivityHours: 72,           // 72h priority
    canReceivePremium: true,
    description: 'Premium tier — featured placement, 72h exclusivity',
  },
  Institutional: {
    label: 'Institutional',
    order: 4,
    defaultMonthlyCap: null,        // unlimited
    defaultPricePerLead: 1000,
    exclusivityHours: 96,           // 96h priority
    canReceivePremium: true,
    description: 'Top tier — unlimited leads, featured everywhere, 96h exclusivity',
  },
};

const VERIFICATION_LEVELS = ['Unverified', 'Basic', 'Verified', 'Premium'];

/**
 * Resolve the effective commercial settings for a college.
 * Merges the college's own overrides with tier defaults.
 *
 * @param {object} college - Prisma college (must have partnershipTier, monthlyLeadCap, pricePerLead)
 * @returns {object} { tier, verificationLevel, monthlyCap, pricePerLead, exclusivityHours, canReceivePremium, order }
 */
function resolveTierSettings(college) {
  const tierKey = TIERS[college.partnershipTier] ? college.partnershipTier : 'Starter';
  const tier = TIERS[tierKey];
  return {
    tier: tierKey,
    verificationLevel: college.verificationLevel || 'Unverified',
    monthlyCap:        college.monthlyLeadCap   ?? tier.defaultMonthlyCap,
    pricePerLead:      college.pricePerLead     ?? tier.defaultPricePerLead,
    exclusivityHours:  tier.exclusivityHours,
    canReceivePremium: tier.canReceivePremium,
    order:             tier.order,
  };
}

/**
 * True if the college can still receive leads this month given its cap.
 * @param {object} college
 * @param {number} leadsThisMonth
 */
function hasCapacity(college, leadsThisMonth) {
  const { monthlyCap } = resolveTierSettings(college);
  if (monthlyCap === null || monthlyCap === undefined) return true; // unlimited
  return leadsThisMonth < monthlyCap;
}

/**
 * True if the college has passed the verification gate for a given action.
 * e.g. only Verified+ colleges appear in search results.
 */
function meetsVerification(college, minLevel = 'Basic') {
  const order = VERIFICATION_LEVELS.indexOf(college.verificationLevel || 'Unverified');
  const required = VERIFICATION_LEVELS.indexOf(minLevel);
  return order >= required;
}

module.exports = {
  TIERS,
  VERIFICATION_LEVELS,
  resolveTierSettings,
  hasCapacity,
  meetsVerification,
};
