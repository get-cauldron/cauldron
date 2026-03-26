import { eq } from 'drizzle-orm';
import { holdoutVault, appendEvent } from '@cauldron/shared';
import type { DbClient } from '@cauldron/shared';
import { sealPayload } from './crypto.js';
import type { HoldoutScenario } from './types.js';

/**
 * Valid state machine transitions for holdout vault lifecycle per D-16.
 * Prevents skipping states and enforces the review workflow.
 */
export const VALID_TRANSITIONS: Record<string, string[]> = {
  pending_review: ['approved'],
  approved: ['sealed'],
  sealed: ['unsealed'],
  unsealed: ['evaluated'],
};

/**
 * Internal representation of a scenario with approval tracking in draft_scenarios JSONB.
 */
interface DraftScenario extends HoldoutScenario {
  _approved: boolean;
}

function assertValidTransition(currentStatus: string, targetStatus: string): void {
  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(targetStatus)) {
    throw new Error(
      `Invalid vault status transition: ${currentStatus} -> ${targetStatus}. ` +
      `Allowed transitions from '${currentStatus}': ${allowed ? allowed.join(', ') : 'none'}`
    );
  }
}

/**
 * Creates a new holdout vault row with status 'pending_review'.
 * Encryption columns are null until sealVault() is called.
 *
 * @returns the vault ID
 */
export async function createVault(
  db: DbClient,
  params: { seedId: string; scenarios: HoldoutScenario[] }
): Promise<string> {
  const { seedId, scenarios } = params;

  const draftScenarios: DraftScenario[] = scenarios.map(s => ({ ...s, _approved: false }));

  const [row] = await db
    .insert(holdoutVault)
    .values({
      seedId,
      status: 'pending_review',
      draftScenarios,
      ciphertext: null,
      encryptedDek: null,
      iv: null,
      authTag: null,
    })
    .returning();

  return row!.id;
}

/**
 * Marks scenarios as approved and transitions vault to 'approved' status.
 * Enforces minimum 5 approved scenarios before allowing the transition.
 *
 * @throws if fewer than 5 scenarios are approved
 * @throws if invalid status transition
 */
export async function approveScenarios(
  db: DbClient,
  params: { vaultId: string; approvedIds: string[] | 'all' }
): Promise<{ approved: number }> {
  const { vaultId, approvedIds } = params;

  const [vault] = await db
    .select()
    .from(holdoutVault)
    .where(eq(holdoutVault.id, vaultId));

  if (!vault) {
    throw new Error(`Vault not found: ${vaultId}`);
  }

  assertValidTransition(vault.status, 'approved');

  const drafts = (vault.draftScenarios as DraftScenario[]) ?? [];

  const updatedDrafts = drafts.map(scenario => {
    if (approvedIds === 'all') {
      return { ...scenario, _approved: true };
    }
    return approvedIds.includes(scenario.id)
      ? { ...scenario, _approved: true }
      : scenario;
  });

  const approvedCount = updatedDrafts.filter(s => s._approved).length;

  if (approvedCount < 5) {
    throw new Error(
      `Minimum 5 approved scenarios required to proceed. Currently approved: ${approvedCount}`
    );
  }

  await db
    .update(holdoutVault)
    .set({
      status: 'approved',
      draftScenarios: updatedDrafts,
    })
    .where(eq(holdoutVault.id, vaultId));

  return { approved: approvedCount };
}

/**
 * Returns rejected scenario IDs without changing vault status.
 * Vault remains in 'pending_review' for regeneration via regenerateRejected().
 */
export async function rejectScenarios(
  db: DbClient,
  params: { vaultId: string; rejectedIds: string[]; reasons: string[] }
): Promise<{ rejectedIds: string[]; reasons: string[] }> {
  const { rejectedIds, reasons } = params;
  // Intentionally does NOT update vault status — stays pending_review for regeneration
  return { rejectedIds, reasons };
}

/**
 * Seals the vault: encrypts approved scenarios, stores ciphertext columns,
 * nulls draft_scenarios, and emits a holdouts_sealed audit event.
 *
 * Two-step process per D-07:
 * 1. approveScenarios() must be called first
 * 2. sealVault() then encrypts and transitions to 'sealed'
 *
 * @throws if status is not 'approved'
 * @throws if fewer than 5 approved scenarios exist
 */
export async function sealVault(
  db: DbClient,
  params: { vaultId: string; projectId: string }
): Promise<void> {
  const { vaultId, projectId } = params;

  const [vault] = await db
    .select()
    .from(holdoutVault)
    .where(eq(holdoutVault.id, vaultId));

  if (!vault) {
    throw new Error(`Vault not found: ${vaultId}`);
  }

  assertValidTransition(vault.status, 'sealed');

  const drafts = (vault.draftScenarios as DraftScenario[]) ?? [];
  const approvedScenarios = drafts.filter(s => s._approved);

  if (approvedScenarios.length < 5) {
    throw new Error(
      `Minimum 5 approved scenarios required to seal. Currently approved: ${approvedScenarios.length}`
    );
  }

  // Strip internal _approved metadata before encrypting
  const scenariosToSeal: HoldoutScenario[] = approvedScenarios.map(({ _approved: _, ...s }) => s);
  const plaintext = JSON.stringify(scenariosToSeal);
  const sealed = sealPayload(plaintext);

  await db
    .update(holdoutVault)
    .set({
      ciphertext: sealed.ciphertext,
      encryptedDek: sealed.encryptedDek,
      iv: sealed.iv,
      authTag: sealed.authTag,
      status: 'sealed',
      draftScenarios: null,
      encryptedAt: new Date(),
    })
    .where(eq(holdoutVault.id, vaultId));

  await appendEvent(db, {
    projectId,
    seedId: vault.seedId,
    type: 'holdouts_sealed',
    payload: {
      vaultId,
      scenarioCount: scenariosToSeal.length,
    },
  });
}

/**
 * Returns current vault status and metadata without decrypting sealed content.
 */
export async function getVaultStatus(
  db: DbClient,
  vaultId: string
): Promise<{ status: string; scenarioCount: number; isSealed: boolean }> {
  const [vault] = await db
    .select()
    .from(holdoutVault)
    .where(eq(holdoutVault.id, vaultId));

  if (!vault) {
    throw new Error(`Vault not found: ${vaultId}`);
  }

  const isSealed = vault.status === 'sealed' || vault.status === 'unsealed' || vault.status === 'evaluated';

  let scenarioCount = 0;
  if (vault.draftScenarios) {
    const drafts = vault.draftScenarios as DraftScenario[];
    scenarioCount = drafts.length;
  }

  return {
    status: vault.status,
    scenarioCount,
    isSealed,
  };
}
