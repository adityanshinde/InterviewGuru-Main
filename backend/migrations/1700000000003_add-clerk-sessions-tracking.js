/**
 * Add Clerk session tracking table for webhook-based session analytics
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const up = (pgm) => {
	// Track Clerk authentication sessions (separate from interview sessions)
	pgm.sql(`
CREATE TABLE IF NOT EXISTS ig_clerk_sessions (
  clerk_session_id TEXT PRIMARY KEY,
  clerk_user_id TEXT NOT NULL REFERENCES ig_users(clerk_user_id) ON DELETE CASCADE,
  client_id TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`);

	pgm.sql(`
CREATE INDEX IF NOT EXISTS ig_clerk_sessions_user_idx ON ig_clerk_sessions(clerk_user_id);
`);

	pgm.sql(`
CREATE INDEX IF NOT EXISTS ig_clerk_sessions_status_idx ON ig_clerk_sessions(status) WHERE status = 'active';
`);

	pgm.sql(`
CREATE INDEX IF NOT EXISTS ig_clerk_sessions_started_idx ON ig_clerk_sessions(started_at DESC);
`);

	// Add first_name and last_name columns to ig_users if they don't exist
	pgm.sql(`
ALTER TABLE ig_users
ADD COLUMN IF NOT EXISTS first_name TEXT,
ADD COLUMN IF NOT EXISTS last_name TEXT;
`);
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const down = (pgm) => {
	pgm.sql(`DROP TABLE IF EXISTS ig_clerk_sessions CASCADE;`);
	pgm.sql(`
ALTER TABLE ig_users
DROP COLUMN IF EXISTS first_name,
DROP COLUMN IF EXISTS last_name;
`);
};
