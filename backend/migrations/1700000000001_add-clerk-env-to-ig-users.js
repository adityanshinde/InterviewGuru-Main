/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const up = (pgm) => {
	pgm.sql(`
ALTER TABLE ig_users
ADD COLUMN IF NOT EXISTS clerk_env VARCHAR(16) NOT NULL DEFAULT 'unknown';
`);

	pgm.sql(`
ALTER TABLE ig_users
DROP CONSTRAINT IF EXISTS ig_users_clerk_env_check;
`);

	pgm.sql(`
ALTER TABLE ig_users
ADD CONSTRAINT ig_users_clerk_env_check CHECK (clerk_env IN ('live', 'test', 'unknown'));
`);
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const down = (pgm) => {
	pgm.sql(`
ALTER TABLE ig_users
DROP CONSTRAINT IF EXISTS ig_users_clerk_env_check;
`);
	pgm.sql(`
ALTER TABLE ig_users
DROP COLUMN IF EXISTS clerk_env;
`);
};
