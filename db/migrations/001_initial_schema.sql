-- InterviewGuru SaaS Database Schema
-- Neon PostgreSQL Project: square-sky-94984427
-- Created: 2026-05-18

-- ============================================================
-- FUNCTION: Auto-update updated_at timestamp
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TABLE: ig_users
-- Description: Core user profiles linked to Clerk authentication
-- ============================================================
CREATE TABLE IF NOT EXISTS ig_users (
    clerk_user_id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT,
    avatar_url TEXT,
    plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'basic', 'pro', 'enterprise')),
    subscription_status TEXT NOT NULL DEFAULT 'inactive' CHECK (subscription_status IN ('active', 'inactive', 'trialing', 'past_due', 'canceled', 'paused')),
    trial_started_at TIMESTAMPTZ,
    trial_ends_at TIMESTAMPTZ,
    billing_cycle_start TIMESTAMPTZ,
    billing_cycle_end TIMESTAMPTZ,
    voice_minutes_used INTEGER NOT NULL DEFAULT 0,
    chat_messages_used INTEGER NOT NULL DEFAULT 0,
    sessions_used INTEGER NOT NULL DEFAULT 0,
    signup_ip TEXT,
    last_login_at TIMESTAMPTZ,
    login_count INTEGER NOT NULL DEFAULT 0,
    referral_code TEXT UNIQUE,
    referred_by TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ig_users_email ON ig_users(email);
CREATE INDEX IF NOT EXISTS idx_ig_users_plan ON ig_users(plan);
CREATE INDEX IF NOT EXISTS idx_ig_users_subscription_status ON ig_users(subscription_status);
CREATE INDEX IF NOT EXISTS idx_ig_users_created_at ON ig_users(created_at);
CREATE INDEX IF NOT EXISTS idx_ig_users_referral_code ON ig_users(referral_code);

CREATE TRIGGER trigger_ig_users_updated_at
    BEFORE UPDATE ON ig_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- TABLE: ig_sessions
-- Description: Interview/practice session records
-- ============================================================
CREATE TABLE IF NOT EXISTS ig_sessions (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    clerk_user_id TEXT NOT NULL REFERENCES ig_users(clerk_user_id) ON DELETE CASCADE,
    session_type TEXT NOT NULL DEFAULT 'interview' CHECK (session_type IN ('interview', 'practice', 'mock', 'assessment')),
    job_title TEXT,
    company_name TEXT,
    job_description TEXT,
    difficulty_level TEXT DEFAULT 'medium' CHECK (difficulty_level IN ('easy', 'medium', 'hard', 'expert')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    questions_asked INTEGER NOT NULL DEFAULT 0,
    questions_answered INTEGER NOT NULL DEFAULT 0,
    voice_minutes_used NUMERIC(10,2) NOT NULL DEFAULT 0,
    tokens_used INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned', 'error')),
    feedback_rating INTEGER CHECK (feedback_rating >= 1 AND feedback_rating <= 5),
    feedback_comment TEXT,
    summary JSONB,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ig_sessions_clerk_user_id ON ig_sessions(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_ig_sessions_status ON ig_sessions(status);
CREATE INDEX IF NOT EXISTS idx_ig_sessions_started_at ON ig_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_ig_sessions_session_type ON ig_sessions(session_type);

CREATE TRIGGER trigger_ig_sessions_updated_at
    BEFORE UPDATE ON ig_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- TABLE: ig_subscriptions
-- Description: Stripe subscription tracking and billing details
-- ============================================================
CREATE TABLE IF NOT EXISTS ig_subscriptions (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    clerk_user_id TEXT NOT NULL REFERENCES ig_users(clerk_user_id) ON DELETE CASCADE,
    stripe_customer_id TEXT UNIQUE,
    stripe_subscription_id TEXT UNIQUE,
    stripe_price_id TEXT,
    plan TEXT NOT NULL CHECK (plan IN ('free', 'basic', 'pro', 'enterprise')),
    status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'trialing', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused')),
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    canceled_at TIMESTAMPTZ,
    cancel_reason TEXT,
    trial_start TIMESTAMPTZ,
    trial_end TIMESTAMPTZ,
    price_amount INTEGER,  -- Amount in cents
    price_currency TEXT DEFAULT 'usd',
    billing_interval TEXT DEFAULT 'month' CHECK (billing_interval IN ('month', 'year')),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ig_subscriptions_clerk_user_id ON ig_subscriptions(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_ig_subscriptions_stripe_customer_id ON ig_subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_ig_subscriptions_stripe_subscription_id ON ig_subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_ig_subscriptions_status ON ig_subscriptions(status);

CREATE TRIGGER trigger_ig_subscriptions_updated_at
    BEFORE UPDATE ON ig_subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- TABLE: ig_payments
-- Description: Payment history and transaction records
-- ============================================================
CREATE TABLE IF NOT EXISTS ig_payments (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    clerk_user_id TEXT NOT NULL REFERENCES ig_users(clerk_user_id) ON DELETE CASCADE,
    subscription_id TEXT REFERENCES ig_subscriptions(id) ON DELETE SET NULL,
    stripe_payment_intent_id TEXT UNIQUE,
    stripe_invoice_id TEXT UNIQUE,
    stripe_charge_id TEXT,
    amount INTEGER NOT NULL,  -- Amount in cents
    currency TEXT NOT NULL DEFAULT 'usd',
    status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded', 'partially_refunded', 'disputed')),
    payment_method_type TEXT,
    payment_method_last4 TEXT,
    payment_method_brand TEXT,
    description TEXT,
    failure_code TEXT,
    failure_message TEXT,
    refund_amount INTEGER DEFAULT 0,
    refund_reason TEXT,
    receipt_url TEXT,
    invoice_pdf_url TEXT,
    metadata JSONB DEFAULT '{}',
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ig_payments_clerk_user_id ON ig_payments(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_ig_payments_subscription_id ON ig_payments(subscription_id);
CREATE INDEX IF NOT EXISTS idx_ig_payments_status ON ig_payments(status);
CREATE INDEX IF NOT EXISTS idx_ig_payments_created_at ON ig_payments(created_at);
CREATE INDEX IF NOT EXISTS idx_ig_payments_stripe_payment_intent_id ON ig_payments(stripe_payment_intent_id);

CREATE TRIGGER trigger_ig_payments_updated_at
    BEFORE UPDATE ON ig_payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- TABLE: ig_feature_flags
-- Description: Per-user feature overrides and A/B testing
-- ============================================================
CREATE TABLE IF NOT EXISTS ig_feature_flags (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    clerk_user_id TEXT NOT NULL REFERENCES ig_users(clerk_user_id) ON DELETE CASCADE,
    feature_key TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    value JSONB,
    reason TEXT,
    expires_at TIMESTAMPTZ,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(clerk_user_id, feature_key)
);

CREATE INDEX IF NOT EXISTS idx_ig_feature_flags_clerk_user_id ON ig_feature_flags(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_ig_feature_flags_feature_key ON ig_feature_flags(feature_key);
CREATE INDEX IF NOT EXISTS idx_ig_feature_flags_enabled ON ig_feature_flags(enabled);

CREATE TRIGGER trigger_ig_feature_flags_updated_at
    BEFORE UPDATE ON ig_feature_flags
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- TABLE: ig_user_preferences
-- Description: User settings and UI preferences
-- ============================================================
CREATE TABLE IF NOT EXISTS ig_user_preferences (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    clerk_user_id TEXT NOT NULL UNIQUE REFERENCES ig_users(clerk_user_id) ON DELETE CASCADE,
    theme TEXT DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
    language TEXT DEFAULT 'en',
    timezone TEXT DEFAULT 'UTC',
    voice_enabled BOOLEAN DEFAULT TRUE,
    voice_speed NUMERIC(3,2) DEFAULT 1.0 CHECK (voice_speed >= 0.5 AND voice_speed <= 2.0),
    voice_pitch NUMERIC(3,2) DEFAULT 1.0 CHECK (voice_pitch >= 0.5 AND voice_pitch <= 2.0),
    preferred_voice TEXT,
    notifications_email BOOLEAN DEFAULT TRUE,
    notifications_push BOOLEAN DEFAULT TRUE,
    notifications_marketing BOOLEAN DEFAULT FALSE,
    interview_mode TEXT DEFAULT 'balanced' CHECK (interview_mode IN ('easy', 'balanced', 'challenging')),
    default_session_type TEXT DEFAULT 'interview' CHECK (default_session_type IN ('interview', 'practice', 'mock', 'assessment')),
    auto_save_sessions BOOLEAN DEFAULT TRUE,
    show_hints BOOLEAN DEFAULT TRUE,
    keyboard_shortcuts BOOLEAN DEFAULT TRUE,
    accessibility_mode BOOLEAN DEFAULT FALSE,
    custom_settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ig_user_preferences_clerk_user_id ON ig_user_preferences(clerk_user_id);

CREATE TRIGGER trigger_ig_user_preferences_updated_at
    BEFORE UPDATE ON ig_user_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- TABLE: ig_audit_logs
-- Description: Security and compliance audit trail
-- ============================================================
CREATE TABLE IF NOT EXISTS ig_audit_logs (
    id BIGSERIAL PRIMARY KEY,
    clerk_user_id TEXT REFERENCES ig_users(clerk_user_id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    ip_address INET,
    user_agent TEXT,
    request_id TEXT,
    old_values JSONB,
    new_values JSONB,
    metadata JSONB DEFAULT '{}',
    severity TEXT DEFAULT 'info' CHECK (severity IN ('debug', 'info', 'warning', 'error', 'critical')),
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ig_audit_logs_clerk_user_id ON ig_audit_logs(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_ig_audit_logs_action ON ig_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_ig_audit_logs_resource_type ON ig_audit_logs(resource_type);
CREATE INDEX IF NOT EXISTS idx_ig_audit_logs_created_at ON ig_audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_ig_audit_logs_severity ON ig_audit_logs(severity);

-- ============================================================
-- TABLE: ig_api_keys
-- Description: BYOK (Bring Your Own Key) API key storage
-- ============================================================
CREATE TABLE IF NOT EXISTS ig_api_keys (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    clerk_user_id TEXT NOT NULL REFERENCES ig_users(clerk_user_id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('groq', 'openai', 'anthropic', 'custom')),
    key_name TEXT NOT NULL,
    encrypted_key TEXT NOT NULL,
    key_hint TEXT,  -- Last 4 chars for display
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_valid BOOLEAN DEFAULT NULL,  -- NULL = not validated yet
    last_validated_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    usage_count INTEGER NOT NULL DEFAULT 0,
    rate_limit_rpm INTEGER,  -- Requests per minute
    rate_limit_tpm INTEGER,  -- Tokens per minute
    metadata JSONB DEFAULT '{}',
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(clerk_user_id, provider, key_name)
);

CREATE INDEX IF NOT EXISTS idx_ig_api_keys_clerk_user_id ON ig_api_keys(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_ig_api_keys_provider ON ig_api_keys(provider);
CREATE INDEX IF NOT EXISTS idx_ig_api_keys_is_active ON ig_api_keys(is_active);

CREATE TRIGGER trigger_ig_api_keys_updated_at
    BEFORE UPDATE ON ig_api_keys
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- TABLE: ig_usage_daily
-- Description: Daily usage aggregates for analytics and billing
-- ============================================================
CREATE TABLE IF NOT EXISTS ig_usage_daily (
    id BIGSERIAL PRIMARY KEY,
    clerk_user_id TEXT NOT NULL REFERENCES ig_users(clerk_user_id) ON DELETE CASCADE,
    usage_date DATE NOT NULL,
    sessions_count INTEGER NOT NULL DEFAULT 0,
    voice_minutes_used NUMERIC(10,2) NOT NULL DEFAULT 0,
    chat_messages_count INTEGER NOT NULL DEFAULT 0,
    tokens_input INTEGER NOT NULL DEFAULT 0,
    tokens_output INTEGER NOT NULL DEFAULT 0,
    questions_asked INTEGER NOT NULL DEFAULT 0,
    questions_answered INTEGER NOT NULL DEFAULT 0,
    avg_session_duration_seconds INTEGER DEFAULT 0,
    avg_feedback_rating NUMERIC(3,2),
    api_calls_count INTEGER NOT NULL DEFAULT 0,
    errors_count INTEGER NOT NULL DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(clerk_user_id, usage_date)
);

CREATE INDEX IF NOT EXISTS idx_ig_usage_daily_clerk_user_id ON ig_usage_daily(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_ig_usage_daily_usage_date ON ig_usage_daily(usage_date);
CREATE INDEX IF NOT EXISTS idx_ig_usage_daily_user_date ON ig_usage_daily(clerk_user_id, usage_date);

CREATE TRIGGER trigger_ig_usage_daily_updated_at
    BEFORE UPDATE ON ig_usage_daily
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- SCHEMA SUMMARY
-- ============================================================
-- Tables created:
--   1. ig_users          - User profiles (21 columns, 8 indexes)
--   2. ig_sessions       - Interview sessions (21 columns, 5 indexes)
--   3. ig_subscriptions  - Stripe subscriptions (20 columns, 7 indexes)
--   4. ig_payments       - Payment history (23 columns, 8 indexes)
--   5. ig_feature_flags  - Feature overrides (10 columns, 5 indexes)
--   6. ig_user_preferences - User settings (21 columns, 3 indexes)
--   7. ig_audit_logs     - Audit trail (15 columns, 6 indexes)
--   8. ig_api_keys       - BYOK API keys (17 columns, 5 indexes)
--   9. ig_usage_daily    - Daily analytics (17 columns, 5 indexes)
--
-- Total: 9 tables, 52 indexes, 8 triggers
-- Foreign Keys: All reference ig_users with ON DELETE CASCADE (except audit_logs uses SET NULL)
