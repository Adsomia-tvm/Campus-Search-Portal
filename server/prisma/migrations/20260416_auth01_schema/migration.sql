-- AUTH-01: Extend User model, add Session, AuditLog, Agent tables
-- Safe: all new columns have defaults or are nullable; no data loss

-- ── User model extensions ───────────────────────────────────────────────────
ALTER TABLE "users" ADD COLUMN "loginAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "lockedUntil" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "lastLoginAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "collegeId" INTEGER;

CREATE INDEX "users_role_idx" ON "users"("role");
CREATE INDEX "users_collegeId_idx" ON "users"("collegeId");

-- FK: users.collegeId → colleges.id
ALTER TABLE "users" ADD CONSTRAINT "users_collegeId_fkey"
  FOREIGN KEY ("collegeId") REFERENCES "colleges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Student: add userId for student login link ──────────────────────────────
ALTER TABLE "students" ADD COLUMN "userId" INTEGER;
CREATE UNIQUE INDEX "students_userId_key" ON "students"("userId");
ALTER TABLE "students" ADD CONSTRAINT "students_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Sessions table (refresh tokens) ─────────────────────────────────────────
CREATE TABLE "sessions" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "refreshToken" TEXT NOT NULL,
  "userAgent" TEXT,
  "ipAddress" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "sessions_refreshToken_key" ON "sessions"("refreshToken");
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- ── Audit log table ─────────────────────────────────────────────────────────
CREATE TABLE "audit_logs" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER,
  "action" TEXT NOT NULL,
  "entity" TEXT,
  "entityId" INTEGER,
  "details" TEXT,
  "ipAddress" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- ── Agents table ────────────────────────────────────────────────────────────
CREATE TABLE "agents" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "referralCode" TEXT NOT NULL,
  "commissionRate" DOUBLE PRECISION DEFAULT 5.0,
  "bankName" TEXT,
  "bankAccount" TEXT,
  "ifsc" TEXT,
  "panNumber" TEXT,
  "isVerified" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agents_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "agents_userId_key" ON "agents"("userId");
CREATE UNIQUE INDEX "agents_referralCode_key" ON "agents"("referralCode");
CREATE INDEX "agents_referralCode_idx" ON "agents"("referralCode");
