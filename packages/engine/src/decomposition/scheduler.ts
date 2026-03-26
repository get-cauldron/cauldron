import { eq, and, sql } from 'drizzle-orm';
import { beads, beadEdges } from '@cauldron/shared';
import { appendEvent } from '@cauldron/shared';
import type { DbClient, Bead } from '@cauldron/shared';
import type { DecompositionResult, ClaimResult } from './types.js';

/**
 * Finds all pending beads with no incomplete blocking upstream dependencies.
 * Implements the CLAUDE.md ready-bead SQL pattern using NOT EXISTS subquery
 * that checks both 'blocks' and 'waits_for' edge types.
 *
 * Parent-child edges are intentionally excluded from the blocking check --
 * they represent molecule hierarchy, not execution ordering.
 */
export async function findReadyBeads(db: DbClient, seedId: string): Promise<Bead[]> {
  const readyBeads = await db
    .select()
    .from(beads)
    .where(
      and(
        eq(beads.seedId, seedId),
        eq(beads.status, 'pending'),
        sql`NOT EXISTS (
          SELECT 1 FROM bead_edges
          INNER JOIN beads AS blockers ON bead_edges.from_bead_id = blockers.id
          WHERE bead_edges.to_bead_id = ${beads.id}
          AND bead_edges.edge_type IN ('blocks', 'waits_for')
          AND blockers.status != 'completed'
        )`
      )
    );

  return readyBeads;
}

/**
 * Atomically claims a bead using optimistic concurrency control (D-16).
 * Reads the current version, then performs a conditional UPDATE WHERE version = expected.
 * If another agent claimed first, the version will have changed and the update returns 0 rows.
 *
 * Returns success=true only when exactly one row is updated.
 */
export async function claimBead(db: DbClient, beadId: string, agentId: string): Promise<ClaimResult> {
  // Read current bead state
  const [current] = await db
    .select()
    .from(beads)
    .where(eq(beads.id, beadId));

  // Not found or already claimed/completed
  if (!current || current.status !== 'pending') {
    return { success: false, beadId, agentId };
  }

  // Optimistic update: only succeeds if version still matches (no concurrent claim)
  const updated = await db
    .update(beads)
    .set({
      status: 'claimed',
      version: sql`${beads.version} + 1`,
      claimedAt: new Date(),
      agentAssignment: agentId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(beads.id, beadId),
        eq(beads.version, current.version),
        eq(beads.status, 'pending')
      )
    )
    .returning({ id: beads.id, version: beads.version });

  if (updated.length === 0) {
    // Version conflict: another agent claimed this bead first
    return { success: false, beadId, agentId };
  }

  return { success: true, beadId, agentId, newVersion: updated[0]!.version };
}

/**
 * Persists a full decomposition result to the database.
 * Inserts molecules as structural (completed) beads, child beads as pending,
 * and all four edge types (blocks, waits_for, conditional_blocks, parent_child).
 *
 * Returns maps from slug IDs to database UUID IDs for downstream use.
 */
export async function persistDecomposition(
  db: DbClient,
  seedId: string,
  result: DecompositionResult
): Promise<{ moleculeDbIds: Map<string, string>; beadDbIds: Map<string, string> }> {
  const moleculeDbIds = new Map<string, string>();
  const beadDbIds = new Map<string, string>();

  // Insert molecules as structural beads (status=completed; they're not executable)
  for (const molecule of result.molecules) {
    const [inserted] = await db
      .insert(beads)
      .values({
        seedId,
        moleculeId: null,
        title: molecule.title,
        spec: molecule.description,
        status: 'completed',
        coversCriteria: molecule.coversCriteria,
      })
      .returning();

    moleculeDbIds.set(molecule.id, inserted!.id);
  }

  // Insert child beads with moleculeId set to their parent molecule's DB UUID
  for (const bead of result.beads) {
    const parentDbId = moleculeDbIds.get(bead.moleculeId) ?? null;

    const [inserted] = await db
      .insert(beads)
      .values({
        seedId,
        moleculeId: parentDbId,
        title: bead.title,
        spec: bead.spec,
        status: 'pending',
        estimatedTokens: bead.estimatedTokens,
        coversCriteria: bead.coversCriteria,
      })
      .returning();

    beadDbIds.set(bead.id, inserted!.id);
  }

  // Insert all edges
  const edgesToInsert: Array<{ fromBeadId: string; toBeadId: string; edgeType: 'blocks' | 'parent_child' | 'conditional_blocks' | 'waits_for' }> = [];

  for (const bead of result.beads) {
    const beadDbId = beadDbIds.get(bead.id)!;

    // Parent-child edge: molecule -> child bead
    const parentDbId = moleculeDbIds.get(bead.moleculeId);
    if (parentDbId) {
      edgesToInsert.push({
        fromBeadId: parentDbId,
        toBeadId: beadDbId,
        edgeType: 'parent_child',
      });
    }

    // blocks edges from dependsOn
    for (const depId of bead.dependsOn) {
      const depDbId = beadDbIds.get(depId);
      if (depDbId) {
        edgesToInsert.push({
          fromBeadId: depDbId,
          toBeadId: beadDbId,
          edgeType: 'blocks',
        });
      }
    }

    // waits_for edges
    for (const waitId of bead.waitsFor) {
      const waitDbId = beadDbIds.get(waitId);
      if (waitDbId) {
        edgesToInsert.push({
          fromBeadId: waitDbId,
          toBeadId: beadDbId,
          edgeType: 'waits_for',
        });
      }
    }

    // conditional_blocks edge
    if (bead.conditionalOn) {
      const condDbId = beadDbIds.get(bead.conditionalOn);
      if (condDbId) {
        edgesToInsert.push({
          fromBeadId: condDbId,
          toBeadId: beadDbId,
          edgeType: 'conditional_blocks',
        });
      }
    }
  }

  if (edgesToInsert.length > 0) {
    await db.insert(beadEdges).values(edgesToInsert).returning();
  }

  return { moleculeDbIds, beadDbIds };
}

/**
 * Marks a bead as completed or failed, emits the corresponding event,
 * and handles D-14: conditional beads downstream of a failed bead are
 * marked as failed with reason 'upstream_conditional_failed'.
 */
export async function completeBead(
  db: DbClient,
  beadId: string,
  status: 'completed' | 'failed',
  projectId: string,
  seedId: string
): Promise<void> {
  // Update bead status
  await db
    .update(beads)
    .set({
      status,
      completedAt: new Date(),
      version: sql`${beads.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(beads.id, beadId))
    .returning({ id: beads.id, version: beads.version });

  // Emit the appropriate event
  const eventType = status === 'completed' ? 'bead_completed' : 'bead_failed';
  await appendEvent(db, {
    projectId,
    seedId,
    beadId,
    type: eventType,
    payload: { beadId },
  });

  // D-14: If this bead failed, mark conditional-blocks downstream beads as failed (skipped)
  if (status === 'failed') {
    const conditionalEdges = await db
      .select()
      .from(beadEdges)
      .where(
        and(
          eq(beadEdges.fromBeadId, beadId),
          eq(beadEdges.edgeType, 'conditional_blocks')
        )
      );

    for (const edge of conditionalEdges) {
      // Mark the conditional bead as failed with the skip reason
      await db
        .update(beads)
        .set({
          status: 'failed',
          completedAt: new Date(),
          version: sql`${beads.version} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(beads.id, edge.toBeadId))
        .returning({ id: beads.id });

      // Emit bead_failed with reason=upstream_conditional_failed (skipped semantically per D-14)
      await appendEvent(db, {
        projectId,
        seedId,
        beadId: edge.toBeadId,
        type: 'bead_failed',
        payload: { beadId: edge.toBeadId, reason: 'upstream_conditional_failed' },
      });
    }
  }
}
