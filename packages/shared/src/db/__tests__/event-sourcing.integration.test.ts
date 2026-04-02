import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { createTestDb, runMigrations, truncateAll } from './setup.js';
import {
  appendEvent,
  deriveProjectState,
  replayFromSnapshot,
  upsertSnapshot,
  initialProjectState,
} from '../event-store.js';
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
  return project;
}

describe('appendEvent', () => {
  it('Test 1: inserts a row and returns it with auto-generated id and occurredAt', async () => {
    const project = await createTestProject();

    const event = await appendEvent(testDb.db, {
      projectId: project.id,
      type: 'interview_started',
      payload: { source: 'test' },
    });

    expect(event.id).toBeDefined();
    expect(event.occurredAt).toBeDefined();
    expect(event.projectId).toBe(project.id);
    expect(event.type).toBe('interview_started');
    expect(event.payload).toEqual({ source: 'test' });
  });

  it('Test 2: auto-increments sequenceNumber within a project (sequence 1, 2, 3...)', async () => {
    const project = await createTestProject();

    const event1 = await appendEvent(testDb.db, {
      projectId: project.id,
      type: 'interview_started',
      payload: {},
    });
    const event2 = await appendEvent(testDb.db, {
      projectId: project.id,
      type: 'interview_completed',
      payload: {},
    });
    const event3 = await appendEvent(testDb.db, {
      projectId: project.id,
      type: 'evolution_started',
      payload: {},
    });

    expect(event1.sequenceNumber).toBe(1);
    expect(event2.sequenceNumber).toBe(2);
    expect(event3.sequenceNumber).toBe(3);
  });

  it('Test 7: Multiple events across different projects maintain independent sequence numbers', async () => {
    const project1 = await createTestProject('Project 1');
    const project2 = await createTestProject('Project 2');

    const p1e1 = await appendEvent(testDb.db, {
      projectId: project1.id,
      type: 'interview_started',
      payload: {},
    });
    const p2e1 = await appendEvent(testDb.db, {
      projectId: project2.id,
      type: 'interview_started',
      payload: {},
    });
    const p1e2 = await appendEvent(testDb.db, {
      projectId: project1.id,
      type: 'interview_completed',
      payload: {},
    });
    const p2e2 = await appendEvent(testDb.db, {
      projectId: project2.id,
      type: 'interview_completed',
      payload: {},
    });

    expect(p1e1.sequenceNumber).toBe(1);
    expect(p1e2.sequenceNumber).toBe(2);
    expect(p2e1.sequenceNumber).toBe(1);
    expect(p2e2.sequenceNumber).toBe(2);
  });

  it('Test 8: direct insert of duplicate project_id + sequence_number raises constraint violation', async () => {
    const project = await createTestProject();

    // Insert first event
    await testDb.db.insert(schema.events).values({
      projectId: project.id,
      type: 'interview_started',
      payload: {},
      sequenceNumber: 1,
    });

    // Attempt duplicate — same project_id + sequence_number
    await expect(
      testDb.db.insert(schema.events).values({
        projectId: project.id,
        type: 'interview_completed',
        payload: {},
        sequenceNumber: 1,
      })
    ).rejects.toThrow(); // PostgreSQL unique_violation (23505)
  });

  it('Test 9: appendEvent produces correct sequence after manual inserts', async () => {
    const project = await createTestProject();

    // Manually insert events with specific sequence numbers
    await testDb.db.insert(schema.events).values({
      projectId: project.id,
      type: 'interview_started',
      payload: {},
      sequenceNumber: 1,
    });
    await testDb.db.insert(schema.events).values({
      projectId: project.id,
      type: 'interview_completed',
      payload: {},
      sequenceNumber: 2,
    });

    // appendEvent should pick up MAX(2)+1 = 3
    const event = await appendEvent(testDb.db, {
      projectId: project.id,
      type: 'evolution_started',
      payload: {},
    });

    expect(event.sequenceNumber).toBe(3);
  });

  it('Test 10: appendEvent handles concurrent-safe sequence assignment with constraint', async () => {
    const project = await createTestProject();

    // Rapid sequential inserts — each should get a unique sequence
    const results = await Promise.all([
      appendEvent(testDb.db, { projectId: project.id, type: 'interview_started', payload: {} }),
      appendEvent(testDb.db, { projectId: project.id, type: 'interview_completed', payload: {} }),
    ]);

    const sequences = results.map(r => r.sequenceNumber).sort();
    // Both should succeed with different sequence numbers
    expect(new Set(sequences).size).toBe(2);
  });
});

describe('deriveProjectState', () => {
  it('Test 4: with no events returns initial empty state', async () => {
    const project = await createTestProject();

    const state = await deriveProjectState(testDb.db, project.id);

    expect(state).toEqual(initialProjectState(project.id));
    expect(state.interviewStatus).toBe('not_started');
    expect(state.seedCount).toBe(0);
    expect(state.evolutionGeneration).toBe(0);
    expect(state.lastEventSequence).toBe(0);
  });

  it('Test 3: replays events in order and returns correct aggregated state', async () => {
    const project = await createTestProject();

    // Insert a seed so we can reference it in the event
    const [seed] = await testDb.db
      .insert(schema.seeds)
      .values({
        projectId: project.id,
        goal: 'Test goal',
        status: 'crystallized',
        crystallizedAt: new Date(),
      })
      .returning();

    await appendEvent(testDb.db, {
      projectId: project.id,
      type: 'interview_started',
      payload: {},
    });
    await appendEvent(testDb.db, {
      projectId: project.id,
      type: 'interview_completed',
      payload: {},
    });
    await appendEvent(testDb.db, {
      projectId: project.id,
      seedId: seed.id,
      type: 'seed_crystallized',
      payload: { version: 1 },
    });
    await appendEvent(testDb.db, {
      projectId: project.id,
      type: 'evolution_started',
      payload: {},
    });

    const state = await deriveProjectState(testDb.db, project.id);

    expect(state.interviewStatus).toBe('completed');
    expect(state.seedCount).toBe(1);
    expect(state.activeSeedId).toBe(seed.id);
    expect(state.evolutionGeneration).toBe(1);
    expect(state.lastEventSequence).toBe(4);
  });
});

describe('snapshot and replay', () => {
  it('Test 5: upsertSnapshot stores snapshot; replayFromSnapshot replays only events after snapshot', async () => {
    const project = await createTestProject();

    // Append initial events
    await appendEvent(testDb.db, {
      projectId: project.id,
      type: 'interview_started',
      payload: {},
    });
    await appendEvent(testDb.db, {
      projectId: project.id,
      type: 'interview_completed',
      payload: {},
    });

    // Take snapshot at sequence 2
    await upsertSnapshot(testDb.db, project.id);

    // Append more events
    await appendEvent(testDb.db, {
      projectId: project.id,
      type: 'evolution_started',
      payload: {},
    });

    // Replay from snapshot should give correct state including post-snapshot events
    const stateFromSnapshot = await replayFromSnapshot(testDb.db, project.id);
    const stateFromFull = await deriveProjectState(testDb.db, project.id);

    expect(stateFromSnapshot.interviewStatus).toBe('completed');
    expect(stateFromSnapshot.evolutionGeneration).toBe(1);
    expect(stateFromSnapshot.lastEventSequence).toBe(3);
    // Both approaches should give the same result
    expect(stateFromSnapshot.interviewStatus).toBe(stateFromFull.interviewStatus);
    expect(stateFromSnapshot.evolutionGeneration).toBe(stateFromFull.evolutionGeneration);
    expect(stateFromSnapshot.lastEventSequence).toBe(stateFromFull.lastEventSequence);
  });
});

describe('event-store module exports', () => {
  it('Test 6: module does NOT export any function that updates or deletes event rows', async () => {
    const eventStore = await import('../event-store.js');
    const exportedFunctions = Object.keys(eventStore);

    const dangerousNames = exportedFunctions.filter(name =>
      name.toLowerCase().includes('update') ||
      name.toLowerCase().includes('delete') ||
      name.toLowerCase().includes('remove') ||
      name.toLowerCase().includes('mutate') ||
      name.toLowerCase().includes('patch')
    );

    expect(dangerousNames).toHaveLength(0);
    // Verify the expected safe exports ARE present
    expect(exportedFunctions).toContain('appendEvent');
    expect(exportedFunctions).toContain('deriveProjectState');
    expect(exportedFunctions).toContain('replayFromSnapshot');
    expect(exportedFunctions).toContain('upsertSnapshot');
    expect(exportedFunctions).toContain('initialProjectState');
    expect(exportedFunctions).toContain('applyEvent');
  });
});
