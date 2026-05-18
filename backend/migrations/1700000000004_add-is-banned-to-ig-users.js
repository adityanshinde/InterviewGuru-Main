/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * Add is_banned column to ig_users for admin user management
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const up = (pgm) => {
	pgm.sql(`
ALTER TABLE ig_users
ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT FALSE;
`);

	pgm.sql(`
CREATE INDEX IF NOT EXISTS idx_ig_users_is_banned ON ig_users(is_banned);
`);
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const down = (pgm) => {
	pgm.sql(`
DROP INDEX IF EXISTS idx_ig_users_is_banned;
`);
	pgm.sql(`
ALTER TABLE ig_users
DROP COLUMN IF EXISTS is_banned;
`);
};
