-- COL-01: Partnership tier + verification level on colleges
-- Plan refs: Module 04 (College Portal), Module 15 (Verification)
-- Adds four fields that are the source of truth for tier-gated lead allocation.

ALTER TABLE "colleges"
  ADD COLUMN "verificationLevel" TEXT NOT NULL DEFAULT 'Unverified',
  ADD COLUMN "partnershipTier"   TEXT NOT NULL DEFAULT 'Starter',
  ADD COLUMN "monthlyLeadCap"    INTEGER,
  ADD COLUMN "pricePerLead"      INTEGER,
  ADD COLUMN "partnershipSince"  TIMESTAMP(3);

CREATE INDEX "colleges_partnershipTier_idx"           ON "colleges"("partnershipTier");
CREATE INDEX "colleges_verificationLevel_idx"         ON "colleges"("verificationLevel");
CREATE INDEX "colleges_partnershipTier_isActive_idx"  ON "colleges"("partnershipTier", "isActive");
