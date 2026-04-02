import { pgTable, pgEnum, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { seeds } from './seed.js';

export const holdoutStatusEnum = pgEnum('holdout_status', [
  'pending_review',
  'approved',
  'sealed',
  'unsealed',
  'evaluated',
]);

export const holdoutVault = pgTable('holdout_vault', {
  id: uuid('id').primaryKey().defaultRandom(),
  seedId: uuid('seed_id').notNull().references(() => seeds.id, { onDelete: 'cascade' }),
  // Encryption columns — nullable until sealed (pending_review/approved rows have no ciphertext)
  ciphertext: text('ciphertext'),      // base64-encoded AES-256-GCM ciphertext
  encryptedDek: text('encrypted_dek'), // compound: base64(dekIv):base64(dekAuthTag):base64(dekCiphertext)
  iv: text('iv'),                      // base64-encoded initialization vector for payload encryption
  authTag: text('auth_tag'),           // GCM authentication tag for payload encryption
  status: holdoutStatusEnum('status').notNull().default('pending_review'),
  // draftScenarios holds scenario JSON during review; nulled after sealing
  draftScenarios: jsonb('draft_scenarios'),
  // results stores evaluation results JSONB per D-18; nullable until evaluated
  results: jsonb('results'),
  // Timestamp columns — all nullable; encryptedAt only set on seal
  encryptedAt: timestamp('encrypted_at', { withTimezone: true }),
  unsealedAt: timestamp('unsealed_at', { withTimezone: true }),
  evaluatedAt: timestamp('evaluated_at', { withTimezone: true }),
});

export type HoldoutVault = typeof holdoutVault.$inferSelect;
export type NewHoldoutVault = typeof holdoutVault.$inferInsert;
