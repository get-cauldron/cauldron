/**
 * Integration test: concurrent bead claiming with real PostgreSQL.
 * Proves that exactly one agent wins when multiple agents attempt to claim the same bead
 * simultaneously (optimistic concurrency via version column, DAG-08).
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, runMigrations, truncateAll } from '../../__tests__/setup.js';
import * as schema from '@get-cauldron/shared';
import { claimBead } from '../scheduler.js';

const TEST_DATABASE_URL =
  process.env['TEST_DATABASE_URL'] ?? 'postgres://cauldron:cauldron@localhost:5433/cauldron_test';

let testDb: ReturnType<typeof createTestDb>;

beforeAll(async () => {
  testDb = createTestDb();
  await runMigrations(testDb.db);
});

afterEach(async () => {
  await truncateAll(testDb.db);
});

afterAll(async () => {
  await testDb.client.end();
});

async function createTestProject() {
  const [project] = await testDb.db
    .insert(schema.projects)
    .values({ name: 'Concurrent Claim Test Project' })
    .returning();
  return project!;
}

async function createTestSeed(projectId: string) {
  const [seed] = await testDb.db
    .insert(schema.seeds)
    .values({
      projectId,
      parentId: null,
      version: 1,
      goal: 'Test concurrent claiming',
      status: 'crystallized',
      crystallizedAt: new Date(),
    })
    .returning();
  return seed!;
}

async function createPendingBead(seedId: string) {
  const [bead] = await testDb.db
    .insert(schema.beads)
    .values({
      seedId,
      title: 'Concurrently Contested Bead',
      spec: 'This bead will be contested by many agents',
      status: 'pending',
      coversCriteria: [],
    })
    .returning();
  return bead!;
}

describe('Concurrent bead claiming (DAG-08)', () => {
  it('Test 1: 10 concurrent claimBead calls for same bead result in exactly 1 success', async () => {
    const project = await createTestProject();
    const seed = await createTestSeed(project.id);
    const bead = await createPendingBead(seed.id);

    // Fire 10 concurrent claim attempts
    const agents = Array.from({ length: 10 }, (_, i) => `agent-${String(i).padStart(3, '0')}`);
    const results = await Promise.allSettled(
      agents.map(agentId => claimBead(testDb.db, bead.id, agentId))
    );

    // All promises should resolve (none rejected)
    const fulfilled = results.filter(r => r.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof claimBead>>>[];
    expect(fulfilled).toHaveLength(10);

    // Exactly one should succeed
    const successes = fulfilled.filter(r => r.value.success === true);
    expect(successes).toHaveLength(1);

    // All others should fail
    const failures = fulfilled.filter(r => r.value.success === false);
    expect(failures).toHaveLength(9);
  });

  it('Test 2: after concurrent claims, bead.version is incremented exactly once (version=2)', async () => {
    const project = await createTestProject();
    const seed = await createTestSeed(project.id);
    const bead = await createPendingBead(seed.id);

    // bead starts at version=1 (default)
    expect(bead.version).toBe(1);

    // 10 concurrent claims
    const agents = Array.from({ length: 10 }, (_, i) => `agent-${String(i).padStart(3, '0')}`);
    await Promise.allSettled(
      agents.map(agentId => claimBead(testDb.db, bead.id, agentId))
    );

    // Fetch the bead from DB and verify version
    const [updated] = await testDb.db
      .select()
      .from(schema.beads)
      .where(eq(schema.beads.id, bead.id));

    expect(updated!.version).toBe(2); // incremented exactly once
    expect(updated!.status).toBe('claimed');
  });

  it('Test 3: after concurrent claims, bead.agentAssignment is set to exactly one winning agent', async () => {
    const project = await createTestProject();
    const seed = await createTestSeed(project.id);
    const bead = await createPendingBead(seed.id);

    const agents = Array.from({ length: 10 }, (_, i) => `agent-${String(i).padStart(3, '0')}`);
    const results = await Promise.allSettled(
      agents.map(agentId => claimBead(testDb.db, bead.id, agentId))
    );

    // Find the winning agent from the results
    const fulfilled = results.filter(r => r.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof claimBead>>>[];
    const winner = fulfilled.find(r => r.value.success === true);
    expect(winner).toBeDefined();
    const winningAgentId = winner!.value.agentId;

    // Fetch bead from DB and verify agentAssignment matches the winner
    const [updated] = await testDb.db
      .select()
      .from(schema.beads)
      .where(eq(schema.beads.id, bead.id));

    expect(updated!.agentAssignment).toBe(winningAgentId);
    expect(updated!.claimedAt).not.toBeNull();
  });
});
