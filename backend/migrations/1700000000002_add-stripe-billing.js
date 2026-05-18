/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const up = (pgm) => {
	// Add stripe_customer_id to ig_users
	pgm.sql(`
ALTER TABLE ig_users
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE;
`);

	// Create ig_subscriptions table
	pgm.sql(`
CREATE TABLE IF NOT EXISTS ig_subscriptions (
  id SERIAL PRIMARY KEY,
  clerk_user_id TEXT NOT NULL REFERENCES ig_users(clerk_user_id) ON DELETE CASCADE,
  stripe_subscription_id TEXT NOT NULL UNIQUE,
  stripe_customer_id TEXT NOT NULL,
  stripe_price_id TEXT NOT NULL,
  plan VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  canceled_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`);

	// Create ig_payments table
	pgm.sql(`
CREATE TABLE IF NOT EXISTS ig_payments (
  id SERIAL PRIMARY KEY,
  clerk_user_id TEXT NOT NULL REFERENCES ig_users(clerk_user_id) ON DELETE CASCADE,
  stripe_payment_intent_id TEXT,
  stripe_invoice_id TEXT UNIQUE,
  stripe_subscription_id TEXT,
  amount_cents INT NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'usd',
  status VARCHAR(32) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`);

	// Create indexes
	pgm.sql(`
CREATE INDEX IF NOT EXISTS ig_subscriptions_user_idx ON ig_subscriptions(clerk_user_id);
`);

	pgm.sql(`
CREATE INDEX IF NOT EXISTS ig_subscriptions_stripe_sub_idx ON ig_subscriptions(stripe_subscription_id);
`);

	pgm.sql(`
CREATE INDEX IF NOT EXISTS ig_payments_user_idx ON ig_payments(clerk_user_id);
`);

	pgm.sql(`
CREATE INDEX IF NOT EXISTS ig_payments_invoice_idx ON ig_payments(stripe_invoice_id);
`);
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const down = (pgm) => {
	pgm.sql(`DROP TABLE IF EXISTS ig_payments CASCADE;`);
	pgm.sql(`DROP TABLE IF EXISTS ig_subscriptions CASCADE;`);
	pgm.sql(`ALTER TABLE ig_users DROP COLUMN IF EXISTS stripe_customer_id;`);
};
