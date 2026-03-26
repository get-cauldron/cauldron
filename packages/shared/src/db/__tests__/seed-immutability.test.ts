/**
 * Integration tests for seed immutability DB trigger.
 * The `prevent_seed_mutation` BEFORE UPDATE trigger on the seeds table
 * fires when OLD.status = 'crystallized' and raises an exception containing
 * 'ImmutableSeedError' or 'crystallized and cannot be mutated'.
 *
 * These tests verify the trigger behavior against real Postgres.
 * See: packages/shared/src/db/migrations/0003_...sql for trigger definition.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDb, runMigrations, truncateAll } from './setup.js';
import * as schema from '../schema/index.js';

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

async function createTestProject(name = 'Test Project') {
  const [project] = await testDb.db.insert(schema.projects).values({ name }).returning();
  return project!;
}

async function createTestInterview(projectId: string) {
  const [interview] = await testDb.db
    .insert(schema.interviews)
    .values({ projectId })
    .returning();
  return interview!;
}

describe('seed immutability trigger', () => {
  it('allows updating draft seed goal (draft seeds are mutable)', async () => {
    const project = await createTestProject();
    const interview = await createTestInterview(project.id);

    const [draftSeed] = await testDb.db.insert(schema.seeds).values({
      projectId: project.id,
      interviewId: interview.id,
      status: 'draft',
      goal: 'Original draft goal',
    }).returning();

    // Update draft seed goal — should succeed
    const [updated] = await testDb.db
      .update(schema.seeds)
      .set({ goal: 'Updated draft goal' })
      .where(sql`id = ${draftSeed!.id}::uuid`)
      .returning();

    expect(updated!.goal).toBe('Updated draft goal');
  });

  it('allows transitioning draft seed to crystallized status (draft -> crystallized is valid)', async () => {
    const project = await createTestProject();
    const interview = await createTestInterview(project.id);

    const [draftSeed] = await testDb.db.insert(schema.seeds).values({
      projectId: project.id,
      interviewId: interview.id,
      status: 'draft',
      goal: 'Draft seed to crystallize',
    }).returning();

    // Transition draft -> crystallized — should succeed
    const [updated] = await testDb.db
      .update(schema.seeds)
      .set({ status: 'crystallized', crystallizedAt: new Date() })
      .where(sql`id = ${draftSeed!.id}::uuid`)
      .returning();

    expect(updated!.status).toBe('crystallized');
    expect(updated!.crystallizedAt).not.toBeNull();
  });

  it('blocks updating goal on a crystallized seed', async () => {
    const project = await createTestProject();
    const interview = await createTestInterview(project.id);

    const [crystallizedSeed] = await testDb.db.insert(schema.seeds).values({
      projectId: project.id,
      interviewId: interview.id,
      status: 'crystallized',
      goal: 'Immutable goal',
      crystallizedAt: new Date(),
    }).returning();

    // Attempt to update goal — should fail with trigger error
    try {
      await testDb.db
        .update(schema.seeds)
        .set({ goal: 'Mutated goal — should not be saved' })
        .where(sql`id = ${crystallizedSeed!.id}::uuid`);
      // If we get here, the trigger didn't fire — test fails
      throw new Error('Expected trigger to prevent mutation but it did not');
    } catch (err: unknown) {
      const msg = String(err);
      // Trigger should raise an error containing 'ImmutableSeedError' or 'crystallized and cannot be mutated'
      expect(msg).toMatch(/ImmutableSeedError|crystallized and cannot be mutated/i);
    }
  });

  it('blocks updating constraints on a crystallized seed', async () => {
    const project = await createTestProject();
    const interview = await createTestInterview(project.id);

    const [crystallizedSeed] = await testDb.db.insert(schema.seeds).values({
      projectId: project.id,
      interviewId: interview.id,
      status: 'crystallized',
      goal: 'Stable goal',
      constraints: ['TypeScript only'],
      crystallizedAt: new Date(),
    }).returning();

    try {
      await testDb.db
        .update(schema.seeds)
        .set({ constraints: ['TypeScript', 'No deps', 'Added constraint'] })
        .where(sql`id = ${crystallizedSeed!.id}::uuid`);
      throw new Error('Expected trigger to prevent mutation but it did not');
    } catch (err: unknown) {
      const msg = String(err);
      expect(msg).toMatch(/ImmutableSeedError|crystallized and cannot be mutated/i);
    }
  });

  it('blocks changing status back to draft on a crystallized seed', async () => {
    const project = await createTestProject();
    const interview = await createTestInterview(project.id);

    const [crystallizedSeed] = await testDb.db.insert(schema.seeds).values({
      projectId: project.id,
      interviewId: interview.id,
      status: 'crystallized',
      goal: 'Cannot un-crystallize',
      crystallizedAt: new Date(),
    }).returning();

    try {
      await testDb.db
        .update(schema.seeds)
        .set({ status: 'draft' })
        .where(sql`id = ${crystallizedSeed!.id}::uuid`);
      throw new Error('Expected trigger to prevent mutation but it did not');
    } catch (err: unknown) {
      const msg = String(err);
      // The trigger fires on ANY update to a crystallized seed
      expect(msg).toMatch(/ImmutableSeedError|crystallized and cannot be mutated/i);
    }
  });

  it('blocks updating acceptanceCriteria on a crystallized seed', async () => {
    const project = await createTestProject();
    const interview = await createTestInterview(project.id);

    const [crystallizedSeed] = await testDb.db.insert(schema.seeds).values({
      projectId: project.id,
      interviewId: interview.id,
      status: 'crystallized',
      goal: 'Stable AC',
      acceptanceCriteria: ['All tests pass'],
      crystallizedAt: new Date(),
    }).returning();

    try {
      await testDb.db
        .update(schema.seeds)
        .set({ acceptanceCriteria: ['All tests pass', 'Performance < 100ms'] })
        .where(sql`id = ${crystallizedSeed!.id}::uuid`);
      throw new Error('Expected trigger to prevent mutation but it did not');
    } catch (err: unknown) {
      const msg = String(err);
      expect(msg).toMatch(/ImmutableSeedError|crystallized and cannot be mutated/i);
    }
  });
});
