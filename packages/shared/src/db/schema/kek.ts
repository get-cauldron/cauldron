import { pgTable, pgEnum, serial, text, timestamp, jsonb, uuid, integer } from 'drizzle-orm/pg-core';

export const kekStatusEnum = pgEnum('kek_status', ['active', 'retired']);

/**
 * Tracks KEK (Key Encryption Key) versions for rotation audit and lifecycle.
 * The `version` serial PK lets holdout_vault rows reference which KEK was used
 * to encrypt their DEK without storing key material in the DB.
 */
export const kekVersions = pgTable('kek_versions', {
  version: serial('version').primaryKey(),
  label: text('label').notNull(),
  status: kekStatusEnum('status').notNull().default('active'),
  activatedAt: timestamp('activated_at', { withTimezone: true }).notNull().defaultNow(),
  retiredAt: timestamp('retired_at', { withTimezone: true }),
  // SHA-256 hex digest of the key bytes — verification without storing key material
  keyFingerprint: text('key_fingerprint').notNull(),
});

/**
 * Append-only audit log for KEK rotation events.
 * NOT project-scoped (rotation is a global infrastructure operation).
 * Events: 'rotation_started', 'rotation_completed', 'old_key_retired'
 */
export const kekRotationLog = pgTable('kek_rotation_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  event: text('event').notNull(),
  payload: jsonb('payload').notNull().default({}),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
});

export type KekVersion = typeof kekVersions.$inferSelect;
export type NewKekVersion = typeof kekVersions.$inferInsert;
export type KekRotationLogEntry = typeof kekRotationLog.$inferSelect;
export type NewKekRotationLogEntry = typeof kekRotationLog.$inferInsert;
