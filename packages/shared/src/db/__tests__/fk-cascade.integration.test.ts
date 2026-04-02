/**
 * DATA-05: FK Cascade Strategy Integration Tests
 *
 * Verifies that migration 0017 correctly enforces:
 * - CASCADE on structural tables when a project is deleted
 * - SET NULL on audit tables when a project is deleted
 * - SET NULL on llm_usage FK columns when beads/seeds are cascade-deleted
 * - SET NULL on seeds.parent_id when a parent seed is directly deleted
 *
 * CRITICAL: All tests use real DELETE operations, not TRUNCATE.
 * TRUNCATE bypasses FK enforcement and would not test cascade behavior.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { eq, sql, isNull } from 'drizzle-orm';
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

// Helper: query FK delete_rule from information_schema
async function expectDeleteRule(constraintName: string, expectedRule: string) {
  const result = await testDb.db.execute(
    sql`SELECT rc.delete_rule
        FROM information_schema.table_constraints tc
        JOIN information_schema.referential_constraints rc
          ON tc.constraint_name = rc.constraint_name
        WHERE tc.constraint_name = ${constraintName}
          AND tc.constraint_type = 'FOREIGN KEY'`
  );
  expect(result.length, `Constraint "${constraintName}" not found in information_schema`).toBe(1);
  expect((result[0] as { delete_rule: string }).delete_rule).toBe(expectedRule);
}

describe('DATA-05: CASCADE deletes structural rows on project deletion', () => {
  it('deletes all structural child rows when a project is deleted', async () => {
    // 1. Insert a project
    const [project] = await testDb.db.insert(schema.projects).values({
      name: 'Cascade Test Project',
    }).returning();
    expect(project).toBeDefined();
    const projectId = project!.id;

    // 2. Insert an interview (projectId)
    await testDb.db.insert(schema.interviews).values({
      projectId,
      status: 'active',
      mode: 'greenfield',
      phase: 'gathering',
    });

    // 3. Insert a seed (projectId)
    const [seed] = await testDb.db.insert(schema.seeds).values({
      projectId,
      goal: 'Test seed goal',
      version: 1,
    }).returning();
    expect(seed).toBeDefined();
    const seedId = seed!.id;

    // 4. Insert two beads (seedId) — need 2 for bead_edge
    const [bead1] = await testDb.db.insert(schema.beads).values({
      seedId,
      title: 'Bead 1',
      spec: 'First bead spec',
    }).returning();
    const [bead2] = await testDb.db.insert(schema.beads).values({
      seedId,
      title: 'Bead 2',
      spec: 'Second bead spec',
    }).returning();
    expect(bead1).toBeDefined();
    expect(bead2).toBeDefined();

    // 5. Insert a bead_edge (fromBeadId, toBeadId)
    await testDb.db.insert(schema.beadEdges).values({
      fromBeadId: bead1!.id,
      toBeadId: bead2!.id,
      edgeType: 'blocks',
    });

    // 6. Insert a holdout_vault row (seedId)
    await testDb.db.insert(schema.holdoutVault).values({
      seedId,
      status: 'pending_review',
    });

    // 7. Insert a project_snapshot (projectId)
    await testDb.db.insert(schema.projectSnapshots).values({
      projectId,
      state: { phase: 'gathering' },
      lastEventSequence: 0,
    });

    // 8. Insert an asset_job (projectId)
    await testDb.db.insert(schema.assetJobs).values({
      projectId,
      prompt: 'A test image prompt',
      executorAdapter: 'comfyui',
    });

    // Verify rows exist before deletion
    const beadsBeforeDelete = await testDb.db.select().from(schema.beads);
    expect(beadsBeforeDelete).toHaveLength(2);

    // DELETE the project — triggers cascade
    await testDb.db.delete(schema.projects).where(eq(schema.projects.id, projectId));

    // Assert each structural table has 0 rows
    const interviewCount = await testDb.db.select({ count: sql<number>`count(*)` }).from(schema.interviews);
    expect(Number(interviewCount[0]!.count)).toBe(0);

    const seedCount = await testDb.db.select({ count: sql<number>`count(*)` }).from(schema.seeds);
    expect(Number(seedCount[0]!.count)).toBe(0);

    const beadCount = await testDb.db.select({ count: sql<number>`count(*)` }).from(schema.beads);
    expect(Number(beadCount[0]!.count)).toBe(0);

    const beadEdgeCount = await testDb.db.select({ count: sql<number>`count(*)` }).from(schema.beadEdges);
    expect(Number(beadEdgeCount[0]!.count)).toBe(0);

    const holdoutCount = await testDb.db.select({ count: sql<number>`count(*)` }).from(schema.holdoutVault);
    expect(Number(holdoutCount[0]!.count)).toBe(0);

    const snapshotCount = await testDb.db.select({ count: sql<number>`count(*)` }).from(schema.projectSnapshots);
    expect(Number(snapshotCount[0]!.count)).toBe(0);

    const assetJobCount = await testDb.db.select({ count: sql<number>`count(*)` }).from(schema.assetJobs);
    expect(Number(assetJobCount[0]!.count)).toBe(0);
  });
});

describe('DATA-05: SET NULL preserves audit rows on project deletion', () => {
  it('preserves llm_usage and events rows with NULL project_id after project deletion', async () => {
    // 1. Insert a project
    const [project] = await testDb.db.insert(schema.projects).values({
      name: 'SET NULL Test Project',
    }).returning();
    const projectId = project!.id;

    // 2. Insert a seed (projectId)
    const [seed] = await testDb.db.insert(schema.seeds).values({
      projectId,
      goal: 'Test seed for SET NULL',
      version: 1,
    }).returning();
    const seedId = seed!.id;

    // 3. Insert a bead (seedId)
    const [bead] = await testDb.db.insert(schema.beads).values({
      seedId,
      title: 'Audit Bead',
      spec: 'Bead for audit test',
    }).returning();
    const beadId = bead!.id;

    // 4. Insert 2 llm_usage rows (projectId, beadId, seedId)
    await testDb.db.insert(schema.llmUsage).values({
      projectId,
      beadId,
      seedId,
      stage: 'decomposition',
      model: 'claude-3-5-sonnet',
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500,
      costCents: 3,
    });
    await testDb.db.insert(schema.llmUsage).values({
      projectId,
      beadId,
      seedId,
      stage: 'execution',
      model: 'gpt-4o',
      promptTokens: 2000,
      completionTokens: 800,
      totalTokens: 2800,
      costCents: 7,
    });

    // 5. Insert 2 events rows (projectId, type, payload, sequenceNumber)
    //    Use distinct sequence numbers to avoid unique constraint on (projectId, sequenceNumber)
    //    becoming (NULL, 1) + (NULL, 1) after SET NULL — which would violate the unique constraint
    await testDb.db.insert(schema.events).values({
      projectId,
      type: 'interview_started',
      payload: { source: 'test' },
      sequenceNumber: 1,
    });
    await testDb.db.insert(schema.events).values({
      projectId,
      type: 'seed_crystallized',
      payload: { source: 'test' },
      sequenceNumber: 2,
    });

    // Verify rows exist before deletion
    const usageBefore = await testDb.db.select().from(schema.llmUsage);
    expect(usageBefore).toHaveLength(2);
    const eventsBefore = await testDb.db.select().from(schema.events);
    expect(eventsBefore).toHaveLength(2);

    // DELETE the project — triggers cascade on seeds/beads, SET NULL on llm_usage/events
    await testDb.db.delete(schema.projects).where(eq(schema.projects.id, projectId));

    // Assert llm_usage count is still 2
    const usageCount = await testDb.db.select({ count: sql<number>`count(*)` }).from(schema.llmUsage);
    expect(Number(usageCount[0]!.count)).toBe(2);

    // Assert events count is still 2
    const eventsCount = await testDb.db.select({ count: sql<number>`count(*)` }).from(schema.events);
    expect(Number(eventsCount[0]!.count)).toBe(2);

    // Assert all llm_usage rows have project_id IS NULL
    const nullProjectUsage = await testDb.db.select().from(schema.llmUsage).where(isNull(schema.llmUsage.projectId));
    expect(nullProjectUsage).toHaveLength(2);

    // Assert all llm_usage rows have bead_id IS NULL (beads cascade-deleted → SET NULL on bead_id)
    const nullBeadUsage = await testDb.db.select().from(schema.llmUsage).where(isNull(schema.llmUsage.beadId));
    expect(nullBeadUsage).toHaveLength(2);

    // Assert all llm_usage rows have seed_id IS NULL (seeds cascade-deleted → SET NULL on seed_id)
    const nullSeedUsage = await testDb.db.select().from(schema.llmUsage).where(isNull(schema.llmUsage.seedId));
    expect(nullSeedUsage).toHaveLength(2);

    // Assert all events rows have project_id IS NULL
    const nullProjectEvents = await testDb.db.select().from(schema.events).where(isNull(schema.events.projectId));
    expect(nullProjectEvents).toHaveLength(2);
  });
});

describe('DATA-05: seeds.parent_id SET NULL preserves child seeds', () => {
  it('child seed survives parent seed deletion with NULL parentId', async () => {
    // 1. Insert a project
    const [project] = await testDb.db.insert(schema.projects).values({
      name: 'Parent Seed SET NULL Project',
    }).returning();
    const projectId = project!.id;

    // 2. Insert a parent seed (version 1, no parentId)
    const [parentSeed] = await testDb.db.insert(schema.seeds).values({
      projectId,
      goal: 'Original goal — parent',
      version: 1,
    }).returning();
    expect(parentSeed).toBeDefined();
    const parentSeedId = parentSeed!.id;

    // 3. Insert a child seed (parentId = parent seed, version 2)
    const [childSeed] = await testDb.db.insert(schema.seeds).values({
      projectId,
      parentId: parentSeedId,
      goal: 'Evolved goal — child',
      version: 2,
    }).returning();
    expect(childSeed).toBeDefined();
    const childSeedId = childSeed!.id;

    // Verify parent/child relationship
    const before = await testDb.db.select().from(schema.seeds).where(eq(schema.seeds.id, childSeedId));
    expect(before[0]!.parentId).toBe(parentSeedId);

    // DELETE the parent seed directly (not via project cascade)
    await testDb.db.delete(schema.seeds).where(eq(schema.seeds.id, parentSeedId));

    // Assert child seed still exists
    const afterDelete = await testDb.db.select().from(schema.seeds).where(eq(schema.seeds.id, childSeedId));
    expect(afterDelete).toHaveLength(1);

    // Assert child seed's parentId is NULL
    expect(afterDelete[0]!.parentId).toBeNull();
  });
});

describe('DATA-05: FK constraint metadata verification', () => {
  // CASCADE constraints — structural tables
  it('seeds.project_id uses CASCADE', async () => {
    await expectDeleteRule('seeds_project_id_projects_id_fk', 'CASCADE');
  });

  it('beads.seed_id uses CASCADE', async () => {
    await expectDeleteRule('beads_seed_id_seeds_id_fk', 'CASCADE');
  });

  it('bead_edges.from_bead_id uses CASCADE', async () => {
    await expectDeleteRule('bead_edges_from_bead_id_beads_id_fk', 'CASCADE');
  });

  it('bead_edges.to_bead_id uses CASCADE', async () => {
    await expectDeleteRule('bead_edges_to_bead_id_beads_id_fk', 'CASCADE');
  });

  it('holdout_vault.seed_id uses CASCADE', async () => {
    await expectDeleteRule('holdout_vault_seed_id_seeds_id_fk', 'CASCADE');
  });

  it('interviews.project_id uses CASCADE', async () => {
    await expectDeleteRule('interviews_project_id_projects_id_fk', 'CASCADE');
  });

  it('project_snapshots.project_id uses CASCADE', async () => {
    await expectDeleteRule('project_snapshots_project_id_projects_id_fk', 'CASCADE');
  });

  it('asset_jobs.project_id uses CASCADE', async () => {
    await expectDeleteRule('asset_jobs_project_id_projects_id_fk', 'CASCADE');
  });

  // SET NULL constraints — audit tables
  it('events.project_id uses SET NULL', async () => {
    await expectDeleteRule('events_project_id_projects_id_fk', 'SET NULL');
  });

  it('llm_usage.project_id uses SET NULL', async () => {
    await expectDeleteRule('llm_usage_project_id_projects_id_fk', 'SET NULL');
  });

  it('llm_usage.bead_id uses SET NULL', async () => {
    await expectDeleteRule('llm_usage_bead_id_beads_id_fk', 'SET NULL');
  });

  it('llm_usage.seed_id uses SET NULL', async () => {
    await expectDeleteRule('llm_usage_seed_id_seeds_id_fk', 'SET NULL');
  });

  it('seeds.parent_id uses SET NULL', async () => {
    await expectDeleteRule('seeds_parent_id_seeds_id_fk', 'SET NULL');
  });
});
