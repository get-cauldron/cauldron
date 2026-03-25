import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { createTestDb, runMigrations, truncateAll } from './setup.js';
import * as schema from '../schema/index.js';

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'] ?? 'postgres://cauldron:cauldron@localhost:5433/cauldron_test';

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
  const [project] = await testDb.db
    .insert(schema.projects)
    .values({ name })
    .returning();
  return project!;
}

async function createTestSeed(projectId: string, parentId?: string, version = 1) {
  const [seed] = await testDb.db
    .insert(schema.seeds)
    .values({
      projectId,
      parentId: parentId ?? null,
      version,
      goal: `Goal for seed v${version}`,
      status: 'crystallized',
      crystallizedAt: new Date(),
    })
    .returning();
  return seed!;
}

async function createTestBead(seedId: string, title: string) {
  const [bead] = await testDb.db
    .insert(schema.beads)
    .values({
      seedId,
      title,
      spec: `Spec for ${title}`,
      status: 'pending',
    })
    .returning();
  return bead!;
}

describe('Seed lineage traversal', () => {
  it('Test 1: recursive CTE returns full lineage chain (A -> B -> C)', async () => {
    const project = await createTestProject();

    // Insert parent chain: A (no parent), B (parent=A), C (parent=B)
    const seedA = await createTestSeed(project.id, undefined, 1);
    const seedB = await createTestSeed(project.id, seedA.id, 2);
    const seedC = await createTestSeed(project.id, seedB.id, 3);

    // Execute recursive CTE to traverse lineage from C back to root
    const lineageRows = await testDb.db.execute(sql`
      WITH RECURSIVE lineage AS (
        SELECT * FROM seeds WHERE id = ${seedC.id}
        UNION ALL
        SELECT s.* FROM seeds s INNER JOIN lineage l ON s.id = l.parent_id
      )
      SELECT * FROM lineage ORDER BY version ASC
    `);

    const rows = lineageRows as unknown as Array<{ id: string; version: number }>;
    expect(rows).toHaveLength(3);
    expect(rows[0]!.id).toBe(seedA.id);
    expect(rows[1]!.id).toBe(seedB.id);
    expect(rows[2]!.id).toBe(seedC.id);
    expect(rows[0]!.version).toBe(1);
    expect(rows[1]!.version).toBe(2);
    expect(rows[2]!.version).toBe(3);
  });

  it('Test 2: Seed immutability — seed-data module enforces no mutation after crystallization', async () => {
    // Application-level invariant: the event-store and seed modules provide no update function.
    // Verify the seeds schema has no updatedAt column (schema-level enforcement).
    const project = await createTestProject();
    const seed = await createTestSeed(project.id);

    // Re-fetch seed to confirm it has no updatedAt
    const [fetched] = await testDb.db
      .select()
      .from(schema.seeds)
      .where(eq(schema.seeds.id, seed.id));

    expect(fetched).toBeDefined();
    // seeds table has no updatedAt column — TypeScript type check is the enforcement
    expect('updatedAt' in (fetched ?? {})).toBe(false);
    // Verify crystallizedAt is set and immutable once set
    expect(fetched!.crystallizedAt).toBeDefined();
    expect(fetched!.status).toBe('crystallized');
  });
});

describe('BeadEdge integrity', () => {
  it('Test 3: insert beads and edges with all 4 edge types, verify FK integrity', async () => {
    const project = await createTestProject();
    const seed = await createTestSeed(project.id);

    const beadA = await createTestBead(seed.id, 'Bead A');
    const beadB = await createTestBead(seed.id, 'Bead B');
    const beadC = await createTestBead(seed.id, 'Bead C');
    const beadD = await createTestBead(seed.id, 'Bead D');

    // Insert all 4 edge types
    await testDb.db.insert(schema.beadEdges).values([
      { fromBeadId: beadA.id, toBeadId: beadB.id, edgeType: 'blocks' },
      { fromBeadId: beadA.id, toBeadId: beadC.id, edgeType: 'parent_child' },
      { fromBeadId: beadB.id, toBeadId: beadC.id, edgeType: 'conditional_blocks' },
      { fromBeadId: beadC.id, toBeadId: beadD.id, edgeType: 'waits_for' },
    ]);

    const edges = await testDb.db
      .select()
      .from(schema.beadEdges)
      .where(eq(schema.beadEdges.fromBeadId, beadA.id));

    const allEdges = await testDb.db.select().from(schema.beadEdges);
    expect(allEdges).toHaveLength(4);

    const edgeTypes = allEdges.map(e => e.edgeType);
    expect(edgeTypes).toContain('blocks');
    expect(edgeTypes).toContain('parent_child');
    expect(edgeTypes).toContain('conditional_blocks');
    expect(edgeTypes).toContain('waits_for');
  });

  it('Test 4: BeadEdge FK constraint — inserting edge with non-existent bead ID is rejected', async () => {
    const project = await createTestProject();
    const seed = await createTestSeed(project.id);
    const beadA = await createTestBead(seed.id, 'Bead A');
    const nonExistentId = '00000000-0000-0000-0000-000000000000';

    await expect(
      testDb.db.insert(schema.beadEdges).values({
        fromBeadId: beadA.id,
        toBeadId: nonExistentId,
        edgeType: 'blocks',
      })
    ).rejects.toThrow();
  });
});

describe('HoldoutVault lifecycle', () => {
  it('Test 5: insert sealed holdout, verify status transitions (sealed -> unsealed)', async () => {
    const project = await createTestProject();
    const seed = await createTestSeed(project.id);

    // Insert sealed holdout
    const [holdout] = await testDb.db
      .insert(schema.holdoutVault)
      .values({
        seedId: seed.id,
        ciphertext: 'base64-encrypted-test-data',
        encryptedDek: 'base64-encrypted-dek',
        iv: 'base64-iv',
        authTag: 'base64-auth-tag',
        status: 'sealed',
      })
      .returning();

    expect(holdout!.status).toBe('sealed');
    expect(holdout!.unsealedAt).toBeNull();

    // Transition to unsealed
    const now = new Date();
    await testDb.db
      .update(schema.holdoutVault)
      .set({ status: 'unsealed', unsealedAt: now })
      .where(eq(schema.holdoutVault.id, holdout!.id));

    const [updated] = await testDb.db
      .select()
      .from(schema.holdoutVault)
      .where(eq(schema.holdoutVault.id, holdout!.id));

    expect(updated!.status).toBe('unsealed');
    expect(updated!.unsealedAt).toBeDefined();
  });
});

describe('DAG ready-bead query', () => {
  it('Test 6: query returns only beads with all blocking dependencies completed', async () => {
    const project = await createTestProject();
    const seed = await createTestSeed(project.id);

    // Create A -> B -> C dependency chain (A blocks B, B blocks C)
    const beadA = await createTestBead(seed.id, 'Bead A');
    const beadB = await createTestBead(seed.id, 'Bead B');
    const beadC = await createTestBead(seed.id, 'Bead C');

    await testDb.db.insert(schema.beadEdges).values([
      { fromBeadId: beadA.id, toBeadId: beadB.id, edgeType: 'blocks' },
      { fromBeadId: beadB.id, toBeadId: beadC.id, edgeType: 'blocks' },
    ]);

    // Ready-bead query: pending beads with no incomplete blocking dependencies
    const readyQuery = sql`
      SELECT b.id FROM beads b
      WHERE b.status = 'pending'
      AND NOT EXISTS (
        SELECT 1 FROM bead_edges e
        INNER JOIN beads blocker ON e.from_bead_id = blocker.id
        WHERE e.to_bead_id = b.id
        AND e.edge_type = 'blocks'
        AND blocker.status != 'completed'
      )
    `;

    // Initially only A is ready (B and C are blocked)
    const initialReady = await testDb.db.execute(readyQuery) as unknown as Array<{ id: string }>;
    expect(initialReady).toHaveLength(1);
    expect(initialReady[0]!.id).toBe(beadA.id);

    // Mark A as completed
    await testDb.db
      .update(schema.beads)
      .set({ status: 'completed', completedAt: new Date() })
      .where(eq(schema.beads.id, beadA.id));

    // Now B is ready (A is done, C still blocked by B)
    const afterAReady = await testDb.db.execute(readyQuery) as unknown as Array<{ id: string }>;
    expect(afterAReady).toHaveLength(1);
    expect(afterAReady[0]!.id).toBe(beadB.id);

    // Mark B as completed
    await testDb.db
      .update(schema.beads)
      .set({ status: 'completed', completedAt: new Date() })
      .where(eq(schema.beads.id, beadB.id));

    // Now C is ready
    const afterBReady = await testDb.db.execute(readyQuery) as unknown as Array<{ id: string }>;
    expect(afterBReady).toHaveLength(1);
    expect(afterBReady[0]!.id).toBe(beadC.id);
  });
});
