-- NOTIF-01: Notification log table for tracking all sent notifications
CREATE TABLE "notification_logs" (
    "id" SERIAL NOT NULL,
    "channel" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "error" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notification_logs_event_idx" ON "notification_logs"("event");
CREATE INDEX "notification_logs_channel_idx" ON "notification_logs"("channel");
CREATE INDEX "notification_logs_recipient_idx" ON "notification_logs"("recipient");
CREATE INDEX "notification_logs_createdAt_idx" ON "notification_logs"("createdAt");
