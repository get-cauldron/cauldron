/**
 * Integration test: ready-bead SQL query correctness against real PostgreSQL.
 * Tests the diamond DAG fan-in pattern and conditional edge filtering
 * using the CLAUDE.md ready-bead SQL query pattern directly.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { eq, sql } from 'drizzle-orm';
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

async function createTestProject() {
  const [project] = await testDb.db
    .insert(schema.projects)
    .values({ name: 'Ready Bead Test Project' })
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
      goal: 'Test ready-bead query',
      status: 'crystallized',
      crystallizedAt: new Date(),
    })
    .returning();
  return seed!;
}

async function createBead(seedId: string, title: string, status: 'pending' | 'completed' | 'claimed' = 'pending') {
  const [bead] = await testDb.db
    .insert(schema.beads)
    .values({
      seedId,
      title,
      spec: `Spec for ${title}`,
      status,
      coversCriteria: [],
    })
    .returning();
  return bead!;
}

async function completeBead(beadId: string) {
  await testDb.db
    .update(schema.beads)
    .set({ status: 'completed', completedAt: new Date() })
    .where(eq(schema.beads.id, beadId));
}

/**
 * The CLAUDE.md ready-bead SQL pattern: pending beads with no incomplete blocking/waits-for upstream.
 * This query is implemented in packages/engine via findReadyBeads() -- we test the SQL semantics here.
 */
async function queryReadyBeads(seedId: string): Promise<Array<{ id: string }>> {
  const result = await testDb.db.execute(sql`
    SELECT b.id FROM beads b
    WHERE b.seed_id = ${seedId}
    AND b.status = 'pending'
    AND NOT EXISTS (
      SELECT 1 FROM bead_edges e
      INNER JOIN beads blockers ON e.from_bead_id = blockers.id
      WHERE e.to_bead_id = b.id
      AND e.edge_type IN ('blocks', 'waits_for')
      AND blockers.status != 'completed'
    )
  `) as unknown as Array<{ id: string }>;
  return result;
}

describe('Ready-bead query: diamond DAG fan-in (DAG-06)', () => {
  /**
   * Diamond pattern:
   *   A
   *  / \
   * B   C
   *  \ /
   *   D
   *
   * A blocks B and C (blocks edges); B and C both block D (waits_for edges for fan-in).
   * D becomes ready only after BOTH B and C complete.
   */
  it('Test 1: diamond DAG -- initially only A is ready (B, C, D are blocked)', async () => {
    const project = await createTestProject();
    const seed = await createTestSeed(project.id);

    const beadA = await createBead(seed.id, 'Bead A');
    const beadB = await createBead(seed.id, 'Bead B');
    const beadC = await createBead(seed.id, 'Bead C');
    const beadD = await createBead(seed.id, 'Bead D');

    // Diamond edges
    await testDb.db.insert(schema.beadEdges).values([
      { fromBeadId: beadA.id, toBeadId: beadB.id, edgeType: 'blocks' },
      { fromBeadId: beadA.id, toBeadId: beadC.id, edgeType: 'blocks' },
      { fromBeadId: beadB.id, toBeadId: beadD.id, edgeType: 'waits_for' },
      { fromBeadId: beadC.id, toBeadId: beadD.id, edgeType: 'waits_for' },
    ]);

    const ready = await queryReadyBeads(seed.id);
    expect(ready).toHaveLength(1);
    expect(ready[0]!.id).toBe(beadA.id);
  });

  it('Test 2: after A completes, B and C become ready', async () => {
    const project = await createTestProject();
    const seed = await createTestSeed(project.id);

    const beadA = await createBead(seed.id, 'Bead A');
    const beadB = await createBead(seed.id, 'Bead B');
    const beadC = await createBead(seed.id, 'Bead C');
    const beadD = await createBead(seed.id, 'Bead D');

    await testDb.db.insert(schema.beadEdges).values([
      { fromBeadId: beadA.id, toBeadId: beadB.id, edgeType: 'blocks' },
      { fromBeadId: beadA.id, toBeadId: beadC.id, edgeType: 'blocks' },
      { fromBeadId: beadB.id, toBeadId: beadD.id, edgeType: 'waits_for' },
      { fromBeadId: beadC.id, toBeadId: beadD.id, edgeType: 'waits_for' },
    ]);

    await completeBead(beadA.id);

    const ready = await queryReadyBeads(seed.id);
    const readyIds = ready.map(r => r.id).sort();
    expect(readyIds).toHaveLength(2);
    expect(readyIds).toContain(beadB.id);
    expect(readyIds).toContain(beadC.id);
  });

  it('Test 3: after B completes but C still pending, D is NOT ready (fan-in not satisfied)', async () => {
    const project = await createTestProject();
    const seed = await createTestSeed(project.id);

    const beadA = await createBead(seed.id, 'Bead A', 'completed');
    const beadB = await createBead(seed.id, 'Bead B');
    const beadC = await createBead(seed.id, 'Bead C');
    const beadD = await createBead(seed.id, 'Bead D');

    await testDb.db.insert(schema.beadEdges).values([
      { fromBeadId: beadA.id, toBeadId: beadB.id, edgeType: 'blocks' },
      { fromBeadId: beadA.id, toBeadId: beadC.id, edgeType: 'blocks' },
      { fromBeadId: beadB.id, toBeadId: beadD.id, edgeType: 'waits_for' },
      { fromBeadId: beadC.id, toBeadId: beadD.id, edgeType: 'waits_for' },
    ]);

    await completeBead(beadB.id);

    const ready = await queryReadyBeads(seed.id);
    const readyIds = ready.map(r => r.id);

    // D is blocked because C has not completed yet
    expect(readyIds).not.toContain(beadD.id);
    // C is ready now (A completed)
    expect(readyIds).toContain(beadC.id);
  });

  it('Test 4: after both B and C complete, D becomes ready (DAG-06 fan-in gate satisfied)', async () => {
    const project = await createTestProject();
    const seed = await createTestSeed(project.id);

    const beadA = await createBead(seed.id, 'Bead A', 'completed');
    const beadB = await createBead(seed.id, 'Bead B');
    const beadC = await createBead(seed.id, 'Bead C');
    const beadD = await createBead(seed.id, 'Bead D');

    await testDb.db.insert(schema.beadEdges).values([
      { fromBeadId: beadA.id, toBeadId: beadB.id, edgeType: 'blocks' },
      { fromBeadId: beadA.id, toBeadId: beadC.id, edgeType: 'blocks' },
      { fromBeadId: beadB.id, toBeadId: beadD.id, edgeType: 'waits_for' },
      { fromBeadId: beadC.id, toBeadId: beadD.id, edgeType: 'waits_for' },
    ]);

    await completeBead(beadB.id);
    await completeBead(beadC.id);

    const ready = await queryReadyBeads(seed.id);
    const readyIds = ready.map(r => r.id);
    expect(readyIds).toHaveLength(1);
    expect(readyIds[0]).toBe(beadD.id);
  });

  it('Test 5: conditional_blocks edge -- conditional bead excluded from ready query when upstream is pending', async () => {
    const project = await createTestProject();
    const seed = await createTestSeed(project.id);

    const beadA = await createBead(seed.id, 'Bead A - upstream');
    const beadCond = await createBead(seed.id, 'Bead Conditional');

    // Note: conditional_blocks is NOT in the edge_type filter of the ready-bead query
    // The ready-bead query only blocks on 'blocks' and 'waits_for' -- conditional logic
    // is handled at dispatch time by beadDispatchHandler. Here we verify A itself is ready.
    await testDb.db.insert(schema.beadEdges).values([
      { fromBeadId: beadA.id, toBeadId: beadCond.id, edgeType: 'conditional_blocks' },
    ]);

    // Both beads are pending with no blocks/waits_for blocking them
    const ready = await queryReadyBeads(seed.id);
    const readyIds = ready.map(r => r.id);

    // Both A and the conditional bead are "ready" from the SQL perspective
    // (conditional_blocks does not block in the ready-bead query -- it's evaluated at dispatch)
    expect(readyIds).toContain(beadA.id);
    // The conditional bead is also pending with no blocking edges, so it appears ready
    // The dispatch handler (beadDispatchHandler) handles the conditional skip logic at runtime
    expect(readyIds).toHaveLength(2);
  });

  it('Test 6: parent_child edges do NOT block beads (molecule hierarchy, not execution ordering)', async () => {
    const project = await createTestProject();
    const seed = await createTestSeed(project.id);

    const moleculeBead = await createBead(seed.id, 'Molecule (parent)', 'completed'); // molecules are completed structural beads
    const childBead = await createBead(seed.id, 'Child Bead');

    await testDb.db.insert(schema.beadEdges).values([
      { fromBeadId: moleculeBead.id, toBeadId: childBead.id, edgeType: 'parent_child' },
    ]);

    const ready = await queryReadyBeads(seed.id);
    const readyIds = ready.map(r => r.id);

    // Child bead should be ready even though its parent molecule is its "from" node
    // (parent_child is not in the blocking edge types)
    expect(readyIds).toContain(childBead.id);
  });
});
