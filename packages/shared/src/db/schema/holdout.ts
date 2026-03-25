import { pgTable, pgEnum, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { seeds } from './seed.js';

export const holdoutStatusEnum = pgEnum('holdout_status', [
  'sealed',
  'unsealed',
  'evaluated',
]);

export const holdoutVault = pgTable('holdout_vault', {
  id: uuid('id').primaryKey().defaultRandom(),
  seedId: uuid('seed_id').notNull().references(() => seeds.id),
  ciphertext: text('ciphertext').notNull(),      // base64-encoded AES-256-GCM ciphertext
  encryptedDek: text('encrypted_dek').notNull(), // base64-encoded DEK encrypted with master key
  iv: text('iv').notNull(),                       // base64-encoded initialization vector
  authTag: text('auth_tag').notNull(),            // GCM authentication tag
  status: holdoutStatusEnum('status').notNull().default('sealed'),
  encryptedAt: timestamp('encrypted_at', { withTimezone: true }).notNull().defaultNow(),
  unsealedAt: timestamp('unsealed_at', { withTimezone: true }),
});

export type HoldoutVault = typeof holdoutVault.$inferSelect;
export type NewHoldoutVault = typeof holdoutVault.$inferInsert;
