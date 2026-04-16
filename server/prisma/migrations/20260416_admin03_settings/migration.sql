-- ADMIN-03: System settings (key-value configuration)
CREATE TABLE IF NOT EXISTS "system_settings" (
    "id" SERIAL PRIMARY KEY,
    "key" TEXT NOT NULL UNIQUE,
    "value" TEXT NOT NULL,
    "label" TEXT,
    "category" TEXT NOT NULL DEFAULT 'general',
    "description" TEXT,
    "updatedBy" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "system_settings_category_idx" ON "system_settings"("category");

-- Seed default settings
INSERT INTO "system_settings" ("key", "value", "label", "category", "description") VALUES
  -- Lead scoring weights
  ('lead_scoring.website_weight', '30', 'Website Lead Weight', 'lead_scoring', 'Score weight for leads from website (0-100)'),
  ('lead_scoring.agent_weight', '25', 'Agent Referral Weight', 'lead_scoring', 'Score weight for agent-referred leads (0-100)'),
  ('lead_scoring.whatsapp_weight', '20', 'WhatsApp Lead Weight', 'lead_scoring', 'Score weight for WhatsApp leads (0-100)'),
  ('lead_scoring.walkin_weight', '35', 'Walk-in Lead Weight', 'lead_scoring', 'Score weight for walk-in leads (0-100)'),
  ('lead_scoring.fee_gate_weight', '40', 'Fee Gate Lead Weight', 'lead_scoring', 'Score weight for fee-gate leads (0-100)'),
  ('lead_scoring.career_clarity_weight', '15', 'Career Clarity Weight', 'lead_scoring', 'Score weight for career clarity leads (0-100)'),

  -- Commission defaults
  ('commission.default_agent_rate', '10', 'Default Agent Commission %', 'commission', 'Default commission rate for new agents (percentage)'),
  ('commission.payment_terms_days', '30', 'Payment Terms (days)', 'commission', 'Days after enrollment before commission is due'),
  ('commission.min_payout_amount', '500', 'Minimum Payout Amount', 'commission', 'Minimum amount for agent payout processing (INR)'),

  -- Notification preferences
  ('notification.admin_email', 'admin@campussearch.in', 'Admin Notification Email', 'notification', 'Email address for admin notifications'),
  ('notification.whatsapp_enabled', 'true', 'WhatsApp Notifications', 'notification', 'Enable/disable WhatsApp notifications'),
  ('notification.email_enabled', 'true', 'Email Notifications', 'notification', 'Enable/disable email notifications'),
  ('notification.notify_on_new_lead', 'true', 'Notify on New Lead', 'notification', 'Send notification when new lead arrives'),
  ('notification.notify_on_enrollment', 'true', 'Notify on Enrollment', 'notification', 'Send notification when student enrolls'),

  -- General settings
  ('general.company_name', 'Campus Search', 'Company Name', 'general', 'Organization name used in communications'),
  ('general.support_phone', '+917407556677', 'Support Phone', 'general', 'Primary support phone number'),
  ('general.max_follow_up_days', '14', 'Max Follow-up Days', 'general', 'Days after which a lead without follow-up is flagged'),
  ('general.auto_assign_leads', 'false', 'Auto-assign Leads', 'general', 'Automatically assign new leads to counselors via round-robin')
ON CONFLICT ("key") DO NOTHING;
