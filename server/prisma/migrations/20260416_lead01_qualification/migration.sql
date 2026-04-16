-- LEAD-01: Lead qualification, scoring, and source tracking
-- Adds fields for lead scoring, qualification pipeline, UTM tracking, and referral codes

-- Lead scoring & qualification
ALTER TABLE "enquiries" ADD COLUMN "leadScore" INTEGER DEFAULT 0;
ALTER TABLE "enquiries" ADD COLUMN "qualificationStatus" TEXT NOT NULL DEFAULT 'Unqualified';

-- Source tracking
ALTER TABLE "enquiries" ADD COLUMN "source" TEXT;
ALTER TABLE "enquiries" ADD COLUMN "utmSource" TEXT;
ALTER TABLE "enquiries" ADD COLUMN "utmMedium" TEXT;
ALTER TABLE "enquiries" ADD COLUMN "utmCampaign" TEXT;
ALTER TABLE "enquiries" ADD COLUMN "referralCode" TEXT;

-- Indexes for lead CRM queries
CREATE INDEX "enquiries_qualificationStatus_idx" ON "enquiries"("qualificationStatus");
CREATE INDEX "enquiries_leadScore_idx" ON "enquiries"("leadScore");
CREATE INDEX "enquiries_source_idx" ON "enquiries"("source");

-- Backfill source for existing enquiries that have notes indicating their origin
UPDATE "enquiries" SET "source" = 'Fee Gate' WHERE "notes" LIKE '%fee unlock%' AND "source" IS NULL;
UPDATE "enquiries" SET "source" = 'Agent' WHERE "agentId" IS NOT NULL AND "source" IS NULL;
UPDATE "enquiries" SET "source" = 'Website' WHERE "source" IS NULL;
