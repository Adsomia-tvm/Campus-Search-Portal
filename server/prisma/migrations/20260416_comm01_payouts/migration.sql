-- COMM-01/02: Enhance commissions + add agent payouts
-- Adds agent tracking to commissions and creates agent_payouts table

-- Add new columns to commissions
ALTER TABLE "commissions" ADD COLUMN "agentAmount" INTEGER;
ALTER TABLE "commissions" ADD COLUMN "agentId" INTEGER;
ALTER TABLE "commissions" ADD COLUMN "invoiceNumber" TEXT;

-- FK for agentId
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Index for agent commission lookup
CREATE INDEX "commissions_agentId_idx" ON "commissions"("agentId");

-- Backfill agentId from enquiries where available
UPDATE "commissions" c
SET "agentId" = e."agentId"
FROM "enquiries" e
WHERE c."enquiryId" = e."id"
  AND e."agentId" IS NOT NULL
  AND c."agentId" IS NULL;

-- Create agent_payouts table
CREATE TABLE "agent_payouts" (
    "id" SERIAL NOT NULL,
    "agentId" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "commissionIds" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "paymentMethod" TEXT,
    "utrNumber" TEXT,
    "bankRef" TEXT,
    "processedDate" TIMESTAMP(3),
    "paidDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_payouts_pkey" PRIMARY KEY ("id")
);

-- FK and indexes for agent_payouts
ALTER TABLE "agent_payouts" ADD CONSTRAINT "agent_payouts_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "agent_payouts_agentId_idx" ON "agent_payouts"("agentId");
CREATE INDEX "agent_payouts_status_idx" ON "agent_payouts"("status");
CREATE INDEX "agent_payouts_agentId_status_idx" ON "agent_payouts"("agentId", "status");
