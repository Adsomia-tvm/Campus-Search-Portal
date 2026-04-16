const router = require('express').Router();
const { requireTeamMember } = require('../../middleware/auth');
const { TIERS, VERIFICATION_LEVELS } = require('../../lib/tierRules');

router.use(requireTeamMember);

// ── COL-03: GET /api/admin/tiers ─────────────────────────────────────────────
// Lookup endpoint for partnership tiers + verification levels.
// UI reads this to populate tier dropdowns + show rule previews.
router.get('/', (req, res) => {
  // Shape to [{ key, label, defaultMonthlyCap, ... }] for easy UI rendering
  const tiers = Object.entries(TIERS).map(([key, cfg]) => ({ key, ...cfg }));
  res.json({
    tiers,
    verificationLevels: VERIFICATION_LEVELS.map((level, idx) => ({
      key: level,
      order: idx,
    })),
  });
});

module.exports = router;
