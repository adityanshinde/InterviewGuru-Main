/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * BYOK free plan now uses daily reset periods (YYYY-MM-DD), while paid stays monthly (YYYY-MM).
 * Existing column `billing_month` was VARCHAR(7), so expand it to hold daily period strings safely.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const up = (pgm) => {
	pgm.sql(`
ALTER TABLE ig_users
ALTER COLUMN billing_month TYPE VARCHAR(10);
`);
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const down = (pgm) => {
	pgm.sql(`
ALTER TABLE ig_users
ALTER COLUMN billing_month TYPE VARCHAR(7);
`);
};
