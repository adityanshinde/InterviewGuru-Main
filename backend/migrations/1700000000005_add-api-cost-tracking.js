/**
 * Add API cost tracking for Groq usage
 * Tracks per-request costs and enforces spending limits
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const up = (pgm) => {
	// Add api_spend_usd column to ig_users for quick lookups
	pgm.sql(`
ALTER TABLE ig_users
ADD COLUMN IF NOT EXISTS api_spend_usd DECIMAL(10, 6) NOT NULL DEFAULT 0;
`);

	// Create API usage tracking table
	pgm.sql(`
CREATE TABLE IF NOT EXISTS ig_api_usage (
  id TEXT PRIMARY KEY DEFAULT 'api_' || substr(md5(random()::text), 1, 16),
  clerk_user_id TEXT NOT NULL REFERENCES ig_users(clerk_user_id) ON DELETE CASCADE,
  billing_month VARCHAR(7) NOT NULL,
  request_type VARCHAR(32) NOT NULL,
  model TEXT NOT NULL,
  input_tokens INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  audio_minutes DECIMAL(10, 4) NOT NULL DEFAULT 0,
  cost_usd DECIMAL(10, 6) NOT NULL,
  session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ig_api_usage_type_check CHECK (request_type IN ('transcription', 'llm_8b', 'llm_70b', 'tts', 'embedding'))
);
`);

	// Indexes for efficient queries
	pgm.sql(`
CREATE INDEX IF NOT EXISTS ig_api_usage_user_month_idx 
ON ig_api_usage(clerk_user_id, billing_month);
`);

	pgm.sql(`
CREATE INDEX IF NOT EXISTS ig_api_usage_created_idx 
ON ig_api_usage(created_at DESC);
`);

	pgm.sql(`
CREATE INDEX IF NOT EXISTS ig_api_usage_session_idx 
ON ig_api_usage(session_id) WHERE session_id IS NOT NULL;
`);

	pgm.sql(`
CREATE INDEX IF NOT EXISTS ig_api_usage_type_idx 
ON ig_api_usage(request_type);
`);

	// Create a view for monthly spending summaries
	pgm.sql(`
CREATE OR REPLACE VIEW ig_api_spending_summary AS
SELECT 
  clerk_user_id,
  billing_month,
  SUM(cost_usd) as total_cost_usd,
  COUNT(*) as total_requests,
  SUM(CASE WHEN request_type = 'transcription' THEN cost_usd ELSE 0 END) as transcription_cost,
  SUM(CASE WHEN request_type = 'transcription' THEN audio_minutes ELSE 0 END) as total_audio_minutes,
  SUM(CASE WHEN request_type LIKE 'llm%' THEN cost_usd ELSE 0 END) as llm_cost,
  SUM(CASE WHEN request_type LIKE 'llm%' THEN input_tokens + output_tokens ELSE 0 END) as total_tokens
FROM ig_api_usage
GROUP BY clerk_user_id, billing_month;
`);

	// Create function to check spending limit before request
	pgm.sql(`
CREATE OR REPLACE FUNCTION check_api_spending_limit(
  p_user_id TEXT,
  p_estimated_cost DECIMAL
) RETURNS TABLE(
  allowed BOOLEAN,
  current_spend DECIMAL,
  max_spend DECIMAL,
  remaining DECIMAL
) AS $$
DECLARE
  v_current_spend DECIMAL;
  v_max_spend DECIMAL;
  v_plan TEXT;
  v_month VARCHAR(7);
BEGIN
  v_month := to_char(NOW(), 'YYYY-MM');
  
  SELECT plan, COALESCE(api_spend_usd, 0)
  INTO v_plan, v_current_spend
  FROM ig_users
  WHERE clerk_user_id = p_user_id;
  
  -- Default max spend by plan (matching TypeScript PLAN_LIMITS)
  v_max_spend := CASE v_plan
    WHEN 'free' THEN 0.50
    WHEN 'basic' THEN 2.00
    WHEN 'pro' THEN 2.00
    WHEN 'enterprise' THEN 50.00
    ELSE 0.50
  END;
  
  RETURN QUERY SELECT 
    (v_current_spend + p_estimated_cost) <= v_max_spend,
    v_current_spend,
    v_max_spend,
    GREATEST(0, v_max_spend - v_current_spend);
END;
$$ LANGUAGE plpgsql;
`);

	// Create trigger to auto-update user's api_spend_usd on insert
	pgm.sql(`
CREATE OR REPLACE FUNCTION update_user_api_spend()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE ig_users 
  SET api_spend_usd = api_spend_usd + NEW.cost_usd,
      updated_at = NOW()
  WHERE clerk_user_id = NEW.clerk_user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
`);

	pgm.sql(`
DROP TRIGGER IF EXISTS ig_api_usage_update_spend ON ig_api_usage;
CREATE TRIGGER ig_api_usage_update_spend
  AFTER INSERT ON ig_api_usage
  FOR EACH ROW EXECUTE FUNCTION update_user_api_spend();
`);

	// Create trigger to reset api_spend_usd when billing_month changes
	pgm.sql(`
CREATE OR REPLACE FUNCTION reset_api_spend_on_new_month()
RETURNS TRIGGER AS $$
DECLARE
  v_current_month VARCHAR(7);
BEGIN
  v_current_month := to_char(NOW(), 'YYYY-MM');
  
  IF NEW.billing_month <> OLD.billing_month THEN
    NEW.api_spend_usd := 0;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
`);

	pgm.sql(`
DROP TRIGGER IF EXISTS ig_users_reset_api_spend ON ig_users;
CREATE TRIGGER ig_users_reset_api_spend
  BEFORE UPDATE OF billing_month ON ig_users
  FOR EACH ROW EXECUTE FUNCTION reset_api_spend_on_new_month();
`);
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const down = (pgm) => {
	pgm.sql(`DROP TRIGGER IF EXISTS ig_users_reset_api_spend ON ig_users;`);
	pgm.sql(`DROP FUNCTION IF EXISTS reset_api_spend_on_new_month();`);
	pgm.sql(`DROP TRIGGER IF EXISTS ig_api_usage_update_spend ON ig_api_usage;`);
	pgm.sql(`DROP FUNCTION IF EXISTS update_user_api_spend();`);
	pgm.sql(`DROP FUNCTION IF EXISTS check_api_spending_limit(TEXT, DECIMAL);`);
	pgm.sql(`DROP VIEW IF EXISTS ig_api_spending_summary;`);
	pgm.sql(`DROP TABLE IF EXISTS ig_api_usage CASCADE;`);
	pgm.sql(`ALTER TABLE ig_users DROP COLUMN IF EXISTS api_spend_usd;`);
};
