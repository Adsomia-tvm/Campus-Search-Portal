-- AGENT-01: Add agentId to enquiries for referral tracking
-- Allows agents to be linked to the leads they bring in

-- Add agentId column to enquiries
ALTER TABLE "enquiries" ADD COLUMN "agentId" INTEGER;

-- Add foreign key constraint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Index for agent dashboard queries (my referrals)
CREATE INDEX "enquiries_agentId_idx" ON "enquiries"("agentId");
