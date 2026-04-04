/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const up = (pgm) => {
	pgm.sql(`
CREATE TABLE IF NOT EXISTS ig_users (
  clerk_user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL DEFAULT '',
  plan VARCHAR(32) NOT NULL DEFAULT 'free',
  subscription_status VARCHAR(32) NOT NULL DEFAULT 'trial',
  trial_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  billing_month VARCHAR(7) NOT NULL,
  voice_minutes_used INT NOT NULL DEFAULT 0,
  chat_messages_used INT NOT NULL DEFAULT 0,
  sessions_used INT NOT NULL DEFAULT 0,
  signup_ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`);

	pgm.sql(`
CREATE TABLE IF NOT EXISTS ig_sessions (
  id TEXT PRIMARY KEY,
  clerk_user_id TEXT NOT NULL REFERENCES ig_users(clerk_user_id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  questions_asked INT NOT NULL DEFAULT 0,
  voice_minutes_used INT NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`);

	pgm.sql(`
CREATE INDEX IF NOT EXISTS ig_sessions_user_idx ON ig_sessions(clerk_user_id);
`);

	pgm.sql(`
CREATE INDEX IF NOT EXISTS ig_sessions_user_started_idx ON ig_sessions(clerk_user_id, started_at DESC);
`);
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const down = (pgm) => {
	pgm.sql(`DROP TABLE IF EXISTS ig_sessions CASCADE;`);
	pgm.sql(`DROP TABLE IF EXISTS ig_users CASCADE;`);
};
