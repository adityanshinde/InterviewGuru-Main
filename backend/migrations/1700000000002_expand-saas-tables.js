/**
 * Comprehensive SaaS database schema expansion
 * Adds subscriptions, payments, user preferences, feature flags, audit logs, API keys, and daily usage tracking
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const up = (pgm) => {
	// ═══════════════════════════════════════════════════════════════
	// EXTEND ig_users TABLE
	// ═══════════════════════════════════════════════════════════════
	pgm.sql(`
ALTER TABLE ig_users
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
ADD COLUMN IF NOT EXISTS display_name TEXT,
ADD COLUMN IF NOT EXISTS avatar_url TEXT,
ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC',
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS login_count INT NOT NULL DEFAULT 0;
`);

	pgm.sql(`
CREATE INDEX IF NOT EXISTS ig_users_stripe_customer_idx ON ig_users(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
`);

	pgm.sql(`
CREATE INDEX IF NOT EXISTS ig_users_deleted_at_idx ON ig_users(deleted_at) WHERE deleted_at IS NOT NULL;
`);

	// ═══════════════════════════════════════════════════════════════
	// SUBSCRIPTIONS TABLE - Stripe subscription tracking
	// ═══════════════════════════════════════════════════════════════
	pgm.sql(`
CREATE TABLE IF NOT EXISTS ig_subscriptions (
  id TEXT PRIMARY KEY DEFAULT 'sub_' || substr(md5(random()::text), 1, 16),
  clerk_user_id TEXT NOT NULL REFERENCES ig_users(clerk_user_id) ON DELETE CASCADE,
  stripe_subscription_id TEXT UNIQUE NOT NULL,
  stripe_customer_id TEXT NOT NULL,
  stripe_price_id TEXT NOT NULL,
  plan VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  canceled_at TIMESTAMPTZ,
  trial_start TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ig_subscriptions_status_check CHECK (status IN ('active', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'trialing', 'paused'))
);
`);

	pgm.sql(`
CREATE INDEX IF NOT EXISTS ig_subscriptions_user_idx ON ig_subscriptions(clerk_user_id);
`);

	pgm.sql(`
CREATE INDEX IF NOT EXISTS ig_subscriptions_stripe_sub_idx ON ig_subscriptions(stripe_subscription_id);
`);

	pgm.sql(`
CREATE INDEX IF NOT EXISTS ig_subscriptions_status_idx ON ig_subscriptions(status) WHERE status = 'active';
`);

	// ═══════════════════════════════════════════════════════════════
	// PAYMENTS TABLE - Payment history and invoices
	// ═══════════════════════════════════════════════════════════════
	pgm.sql(`
CREATE TABLE IF NOT EXISTS ig_payments (
  id TEXT PRIMARY KEY DEFAULT 'pay_' || substr(md5(random()::text), 1, 16),
  clerk_user_id TEXT NOT NULL REFERENCES ig_users(clerk_user_id) ON DELETE CASCADE,
  stripe_payment_intent_id TEXT UNIQUE,
  stripe_invoice_id TEXT,
  stripe_charge_id TEXT,
  amount INT NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'usd',
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  description TEXT,
  receipt_url TEXT,
  failure_message TEXT,
  refunded_amount INT DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ig_payments_status_check CHECK (status IN ('succeeded', 'pending', 'failed', 'refunded', 'partially_refunded'))
);
`);

	pgm.sql(`
CREATE INDEX IF NOT EXISTS ig_payments_user_idx ON ig_payments(clerk_user_id);
`);

	pgm.sql(`
CREATE INDEX IF NOT EXISTS ig_payments_created_idx ON ig_payments(created_at DESC);
`);

	pgm.sql(`
CREATE INDEX IF NOT EXISTS ig_payments_invoice_idx ON ig_payments(stripe_invoice_id) WHERE stripe_invoice_id IS NOT NULL;
`);

	// ═══════════════════════════════════════════════════════════════
	// USER PREFERENCES TABLE
	// ═══════════════════════════════════════════════════════════════
	pgm.sql(`
CREATE TABLE IF NOT EXISTS ig_user_preferences (
  clerk_user_id TEXT PRIMARY KEY REFERENCES ig_users(clerk_user_id) ON DELETE CASCADE,
  theme VARCHAR(16) NOT NULL DEFAULT 'system',
  email_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  usage_alerts BOOLEAN NOT NULL DEFAULT TRUE,
  weekly_digest BOOLEAN NOT NULL DEFAULT FALSE,
  default_persona TEXT DEFAULT 'Technical Interviewer',
  default_voice_model TEXT DEFAULT 'whisper-large-v3-turbo',
  default_chat_model TEXT DEFAULT 'llama-3.1-8b-instant',
  language VARCHAR(10) DEFAULT 'en',
  keyboard_shortcuts BOOLEAN NOT NULL DEFAULT TRUE,
  auto_start_session BOOLEAN NOT NULL DEFAULT FALSE,
  tts_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  tts_voice TEXT DEFAULT 'default',
  tts_speed DECIMAL(3,2) DEFAULT 1.0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ig_preferences_theme_check CHECK (theme IN ('light', 'dark', 'system'))
);
`);

	// ═══════════════════════════════════════════════════════════════
	// FEATURE FLAGS TABLE - Per-user feature toggles
	// ═══════════════════════════════════════════════════════════════
	pgm.sql(`
CREATE TABLE IF NOT EXISTS ig_feature_flags (
  id TEXT PRIMARY KEY DEFAULT 'ff_' || substr(md5(random()::text), 1, 16),
  clerk_user_id TEXT NOT NULL REFERENCES ig_users(clerk_user_id) ON DELETE CASCADE,
  feature_name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB DEFAULT '{}',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  UNIQUE(clerk_user_id, feature_name)
);
`);

	pgm.sql(`
CREATE INDEX IF NOT EXISTS ig_feature_flags_user_idx ON ig_feature_flags(clerk_user_id);
`);

	pgm.sql(`
CREATE INDEX IF NOT EXISTS ig_feature_flags_name_idx ON ig_feature_flags(feature_name);
`);

	// ═══════════════════════════════════════════════════════════════
	// AUDIT LOGS TABLE - Security and compliance tracking
	// ═══════════════════════════════════════════════════════════════
	pgm.sql(`
CREATE TABLE IF NOT EXISTS ig_audit_logs (
  id TEXT PRIMARY KEY DEFAULT 'audit_' || substr(md5(random()::text), 1, 16),
  clerk_user_id TEXT REFERENCES ig_users(clerk_user_id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  old_values JSONB,
  new_values JSONB,
  metadata JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`);

	pgm.sql(`
CREATE INDEX IF NOT EXISTS ig_audit_logs_user_idx ON ig_audit_logs(clerk_user_id) WHERE clerk_user_id IS NOT NULL;
`);

	pgm.sql(`
CREATE INDEX IF NOT EXISTS ig_audit_logs_action_idx ON ig_audit_logs(action);
`);

	pgm.sql(`
CREATE INDEX IF NOT EXISTS ig_audit_logs_created_idx ON ig_audit_logs(created_at DESC);
`);

	pgm.sql(`
CREATE INDEX IF NOT EXISTS ig_audit_logs_resource_idx ON ig_audit_logs(resource_type, resource_id);
`);

	// ═══════════════════════════════════════════════════════════════
	// API KEYS TABLE - BYOK (Bring Your Own Key) management
	// ═══════════════════════════════════════════════════════════════
	pgm.sql(`
CREATE TABLE IF NOT EXISTS ig_api_keys (
  id TEXT PRIMARY KEY DEFAULT 'key_' || substr(md5(random()::text), 1, 16),
  clerk_user_id TEXT NOT NULL REFERENCES ig_users(clerk_user_id) ON DELETE CASCADE,
  provider VARCHAR(32) NOT NULL,
  key_prefix VARCHAR(16) NOT NULL,
  encrypted_key TEXT NOT NULL,
  label TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,
  usage_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ig_api_keys_provider_check CHECK (provider IN ('groq', 'openai', 'anthropic', 'google', 'elevenlabs'))
);
`);

	pgm.sql(`
CREATE INDEX IF NOT EXISTS ig_api_keys_user_idx ON ig_api_keys(clerk_user_id);
`);

	pgm.sql(`
CREATE INDEX IF NOT EXISTS ig_api_keys_provider_idx ON ig_api_keys(clerk_user_id, provider);
`);

	// ═══════════════════════════════════════════════════════════════
	// USAGE DAILY TABLE - Daily aggregated usage for analytics
	// ═══════════════════════════════════════════════════════════════
	pgm.sql(`
CREATE TABLE IF NOT EXISTS ig_usage_daily (
  id TEXT PRIMARY KEY DEFAULT 'usage_' || substr(md5(random()::text), 1, 16),
  clerk_user_id TEXT NOT NULL REFERENCES ig_users(clerk_user_id) ON DELETE CASCADE,
  date DATE NOT NULL,
  voice_minutes INT NOT NULL DEFAULT 0,
  chat_messages INT NOT NULL DEFAULT 0,
  sessions_count INT NOT NULL DEFAULT 0,
  cache_hits INT NOT NULL DEFAULT 0,
  api_calls INT NOT NULL DEFAULT 0,
  transcription_requests INT NOT NULL DEFAULT 0,
  tts_requests INT NOT NULL DEFAULT 0,
  avg_response_time_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(clerk_user_id, date)
);
`);

	pgm.sql(`
CREATE INDEX IF NOT EXISTS ig_usage_daily_user_date_idx ON ig_usage_daily(clerk_user_id, date DESC);
`);

	pgm.sql(`
CREATE INDEX IF NOT EXISTS ig_usage_daily_date_idx ON ig_usage_daily(date DESC);
`);

	// ═══════════════════════════════════════════════════════════════
	// WEBHOOK EVENTS TABLE - Track processed webhooks for idempotency
	// ═══════════════════════════════════════════════════════════════
	pgm.sql(`
CREATE TABLE IF NOT EXISTS ig_webhook_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  source VARCHAR(32) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  error_message TEXT,
  processed_at TIMESTAMPTZ,
  retry_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ig_webhook_events_status_check CHECK (status IN ('pending', 'processed', 'failed', 'skipped')),
  CONSTRAINT ig_webhook_events_source_check CHECK (source IN ('clerk', 'stripe'))
);
`);

	pgm.sql(`
CREATE INDEX IF NOT EXISTS ig_webhook_events_status_idx ON ig_webhook_events(status) WHERE status = 'pending';
`);

	pgm.sql(`
CREATE INDEX IF NOT EXISTS ig_webhook_events_type_idx ON ig_webhook_events(event_type);
`);

	pgm.sql(`
CREATE INDEX IF NOT EXISTS ig_webhook_events_created_idx ON ig_webhook_events(created_at DESC);
`);

	// ═══════════════════════════════════════════════════════════════
	// SESSION TRANSCRIPTS TABLE - Store session Q&A history
	// ═══════════════════════════════════════════════════════════════
	pgm.sql(`
CREATE TABLE IF NOT EXISTS ig_session_transcripts (
  id TEXT PRIMARY KEY DEFAULT 'trans_' || substr(md5(random()::text), 1, 16),
  session_id TEXT NOT NULL REFERENCES ig_sessions(id) ON DELETE CASCADE,
  sequence_num INT NOT NULL,
  role VARCHAR(16) NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ig_session_transcripts_role_check CHECK (role IN ('user', 'assistant', 'system'))
);
`);

	pgm.sql(`
CREATE INDEX IF NOT EXISTS ig_session_transcripts_session_idx ON ig_session_transcripts(session_id, sequence_num);
`);

	// ═══════════════════════════════════════════════════════════════
	// GLOBAL FEATURE FLAGS TABLE - System-wide feature toggles
	// ═══════════════════════════════════════════════════════════════
	pgm.sql(`
CREATE TABLE IF NOT EXISTS ig_global_feature_flags (
  feature_name TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  rollout_percentage INT NOT NULL DEFAULT 0,
  allowed_plans TEXT[] DEFAULT ARRAY[]::TEXT[],
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ig_global_ff_rollout_check CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100)
);
`);

	// ═══════════════════════════════════════════════════════════════
	// HELPER FUNCTION - Update updated_at timestamp
	// ═══════════════════════════════════════════════════════════════
	pgm.sql(`
CREATE OR REPLACE FUNCTION ig_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
`);

	// Apply triggers
	pgm.sql(`
DROP TRIGGER IF EXISTS ig_users_updated_at ON ig_users;
CREATE TRIGGER ig_users_updated_at
  BEFORE UPDATE ON ig_users
  FOR EACH ROW EXECUTE FUNCTION ig_update_updated_at();
`);

	pgm.sql(`
DROP TRIGGER IF EXISTS ig_subscriptions_updated_at ON ig_subscriptions;
CREATE TRIGGER ig_subscriptions_updated_at
  BEFORE UPDATE ON ig_subscriptions
  FOR EACH ROW EXECUTE FUNCTION ig_update_updated_at();
`);

	pgm.sql(`
DROP TRIGGER IF EXISTS ig_user_preferences_updated_at ON ig_user_preferences;
CREATE TRIGGER ig_user_preferences_updated_at
  BEFORE UPDATE ON ig_user_preferences
  FOR EACH ROW EXECUTE FUNCTION ig_update_updated_at();
`);

	pgm.sql(`
DROP TRIGGER IF EXISTS ig_global_feature_flags_updated_at ON ig_global_feature_flags;
CREATE TRIGGER ig_global_feature_flags_updated_at
  BEFORE UPDATE ON ig_global_feature_flags
  FOR EACH ROW EXECUTE FUNCTION ig_update_updated_at();
`);
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const down = (pgm) => {
	// Drop triggers first
	pgm.sql(`DROP TRIGGER IF EXISTS ig_global_feature_flags_updated_at ON ig_global_feature_flags;`);
	pgm.sql(`DROP TRIGGER IF EXISTS ig_user_preferences_updated_at ON ig_user_preferences;`);
	pgm.sql(`DROP TRIGGER IF EXISTS ig_subscriptions_updated_at ON ig_subscriptions;`);
	pgm.sql(`DROP TRIGGER IF EXISTS ig_users_updated_at ON ig_users;`);
	pgm.sql(`DROP FUNCTION IF EXISTS ig_update_updated_at();`);

	// Drop tables in reverse order of dependencies
	pgm.sql(`DROP TABLE IF EXISTS ig_global_feature_flags CASCADE;`);
	pgm.sql(`DROP TABLE IF EXISTS ig_session_transcripts CASCADE;`);
	pgm.sql(`DROP TABLE IF EXISTS ig_webhook_events CASCADE;`);
	pgm.sql(`DROP TABLE IF EXISTS ig_usage_daily CASCADE;`);
	pgm.sql(`DROP TABLE IF EXISTS ig_api_keys CASCADE;`);
	pgm.sql(`DROP TABLE IF EXISTS ig_audit_logs CASCADE;`);
	pgm.sql(`DROP TABLE IF EXISTS ig_feature_flags CASCADE;`);
	pgm.sql(`DROP TABLE IF EXISTS ig_user_preferences CASCADE;`);
	pgm.sql(`DROP TABLE IF EXISTS ig_payments CASCADE;`);
	pgm.sql(`DROP TABLE IF EXISTS ig_subscriptions CASCADE;`);

	// Remove added columns from ig_users
	pgm.sql(`
ALTER TABLE ig_users
DROP COLUMN IF EXISTS stripe_customer_id,
DROP COLUMN IF EXISTS display_name,
DROP COLUMN IF EXISTS avatar_url,
DROP COLUMN IF EXISTS timezone,
DROP COLUMN IF EXISTS deleted_at,
DROP COLUMN IF EXISTS last_login_at,
DROP COLUMN IF EXISTS login_count;
`);
};
