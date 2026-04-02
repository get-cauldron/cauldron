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

describe('DATA-02: events composite indexes', () => {
  it('events_project_sequence_idx exists in pg_indexes', async () => {
    const result = await testDb.db.execute(
      sql`SELECT indexname FROM pg_indexes WHERE tablename = 'events' AND indexname = 'events_project_sequence_idx'`
    );
    expect(result.length).toBe(1);
    expect((result[0] as { indexname: string }).indexname).toBe('events_project_sequence_idx');
  });

  it('events_project_occurred_at_idx exists in pg_indexes', async () => {
    const result = await testDb.db.execute(
      sql`SELECT indexname FROM pg_indexes WHERE tablename = 'events' AND indexname = 'events_project_occurred_at_idx'`
    );
    expect(result.length).toBe(1);
    expect((result[0] as { indexname: string }).indexname).toBe('events_project_occurred_at_idx');
  });

  it('events_project_sequence_unique constraint exists', async () => {
    const result = await testDb.db.execute(
      sql`SELECT constraint_name FROM information_schema.table_constraints
          WHERE table_name = 'events' AND constraint_name = 'events_project_sequence_unique' AND constraint_type = 'UNIQUE'`
    );
    expect(result.length).toBe(1);
    expect((result[0] as { constraint_name: string }).constraint_name).toBe('events_project_sequence_unique');
  });
});

describe('DATA-03: seed version partial unique index', () => {
  it('rejects duplicate (parent_id, version) when parent_id is NOT NULL', async () => {
    const [project] = await testDb.db.insert(schema.projects).values({ name: 'Test' }).returning();

    const [parentSeed] = await testDb.db.insert(schema.seeds).values({
      projectId: project!.id,
      goal: 'Parent seed',
      version: 1,
    }).returning();

    // First child seed — version 1
    await testDb.db.insert(schema.seeds).values({
      projectId: project!.id,
      parentId: parentSeed!.id,
      goal: 'Child v1',
      version: 1,
    });

    // Second child seed with SAME parent + version — should fail
    await expect(
      testDb.db.insert(schema.seeds).values({
        projectId: project!.id,
        parentId: parentSeed!.id,
        goal: 'Duplicate child v1',
        version: 1,
      })
    ).rejects.toThrow();
  });

  it('allows root seeds (parent_id IS NULL) to share version numbers', async () => {
    const [project] = await testDb.db.insert(schema.projects).values({ name: 'Test' }).returning();

    // First root seed with version 1
    await testDb.db.insert(schema.seeds).values({
      projectId: project!.id,
      parentId: null,
      goal: 'Root seed A',
      version: 1,
    });

    // Second root seed with same version — should succeed (partial index excludes NULL parent_id)
    await expect(
      testDb.db.insert(schema.seeds).values({
        projectId: project!.id,
        parentId: null,
        goal: 'Root seed B',
        version: 1,
      })
    ).resolves.toBeDefined(); // No error — NULL parent_id exempt from constraint
  });

  it('allows same version under different parents', async () => {
    const [project] = await testDb.db.insert(schema.projects).values({ name: 'Test' }).returning();

    const [parentA] = await testDb.db.insert(schema.seeds).values({
      projectId: project!.id, goal: 'Parent A', version: 1,
    }).returning();
    const [parentB] = await testDb.db.insert(schema.seeds).values({
      projectId: project!.id, goal: 'Parent B', version: 2,
    }).returning();

    // Same version (1) under different parents — should succeed
    await testDb.db.insert(schema.seeds).values({
      projectId: project!.id, parentId: parentA!.id, goal: 'Child of A', version: 1,
    });
    await expect(
      testDb.db.insert(schema.seeds).values({
        projectId: project!.id, parentId: parentB!.id, goal: 'Child of B', version: 1,
      })
    ).resolves.toBeDefined();
  });

  it('seeds_parent_version_unique_idx exists in pg_indexes', async () => {
    const result = await testDb.db.execute(
      sql`SELECT indexname FROM pg_indexes WHERE tablename = 'seeds' AND indexname = 'seeds_parent_version_unique_idx'`
    );
    expect(result.length).toBe(1);
    expect((result[0] as { indexname: string }).indexname).toBe('seeds_parent_version_unique_idx');
  });
});

describe('DATA-04: bead_edges reverse-lookup index', () => {
  it('bead_edges_to_bead_id_idx exists in pg_indexes', async () => {
    const result = await testDb.db.execute(
      sql`SELECT indexname FROM pg_indexes WHERE tablename = 'bead_edges' AND indexname = 'bead_edges_to_bead_id_idx'`
    );
    expect(result.length).toBe(1);
    expect((result[0] as { indexname: string }).indexname).toBe('bead_edges_to_bead_id_idx');
  });
});
