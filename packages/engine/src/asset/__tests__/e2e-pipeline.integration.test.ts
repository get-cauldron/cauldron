/**
 * E2E integration test: full asset generation pipeline with mock executor.
 *
 * Proves the complete v1.1 asset pipeline against real Postgres (Docker :5433):
 *   submit job -> generateAssetHandler -> mock executor -> poll -> artifact write -> completed state
 *
 * Also proves style/seed provenance:
 *   interview with style hints -> crystallized seed with style -> asset job referencing seed -> delivery
 *
 * Mode enforcement and concurrency limit tests verify operator controls (D-02, D-05).
 *
 * Test uses:
 * - Real Postgres via createTestDb() / runMigrations() / truncateAll() from ../../__tests__/setup.js
 * - Mock AssetExecutor (not mock DB) — follows events.test.ts pattern
 * - tmpdir-based artifactsRoot via mkdtemp (cleaned up in afterEach)
 * - Direct generateAssetHandler call with mock step (not through Inngest)
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import pino from 'pino';

import { createTestDb, runMigrations, truncateAll } from '../../__tests__/setup.js';
import { configureAssetDeps, generateAssetHandler } from '../events.js';
import { submitAssetJob, getAssetJob, checkAssetMode, checkAssetConcurrency } from '../job-store.js';
import { projects, interviews, seeds, assetJobs } from '@get-cauldron/shared';
import type { AssetExecutor } from '../types.js';
import { AssetModeDisabledError, AssetConcurrencyLimitError } from '../errors.js';

// --- Mock executor (not mock DB) ---

const mockExecutor: AssetExecutor = {
  submitJob: vi.fn().mockResolvedValue('mock-prompt-id-e2e'),
  checkStatus: vi.fn().mockResolvedValue({
    done: true,
    outputs: {
      images: [{ filename: 'output_00001.png', subfolder: '', type: 'output' }],
    },
  }),
  getArtifact: vi.fn().mockResolvedValue(Buffer.from('fake-png-data-for-e2e')),
};

// Mock step object that executes callbacks immediately (no Inngest overhead)
const mockStep = {
  run: async <T>(_name: string, fn: () => Promise<T>) => fn(),
};

// Null logger for tests
const nullLogger = pino({ level: 'silent' });

// --- Test state ---

let testDb: ReturnType<typeof createTestDb>;
let tmpDir: string;
let testProjectId: string;

// --- Setup / teardown ---

beforeAll(async () => {
  testDb = createTestDb();
  await runMigrations(testDb.db);
});

afterAll(async () => {
  await testDb.client.end();
});

afterEach(async () => {
  // Reset mock calls between tests
  vi.clearAllMocks();

  // Reset mock executor to default behavior
  (mockExecutor.submitJob as ReturnType<typeof vi.fn>).mockResolvedValue('mock-prompt-id-e2e');
  (mockExecutor.checkStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
    done: true,
    outputs: {
      images: [{ filename: 'output_00001.png', subfolder: '', type: 'output' }],
    },
  });
  (mockExecutor.getArtifact as ReturnType<typeof vi.fn>).mockResolvedValue(
    Buffer.from('fake-png-data-for-e2e')
  );

  // Truncate all tables (including asset_jobs — not covered by shared truncateAll)
  await testDb.db.execute(
    sql`TRUNCATE TABLE asset_jobs RESTART IDENTITY CASCADE`
  );
  await truncateAll(testDb.db);

  // Remove tmpdir if it was created
  if (tmpDir) {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

async function createTestProject(assetSettings?: Record<string, unknown>) {
  const [project] = await testDb.db
    .insert(projects)
    .values({
      name: 'E2E Pipeline Test Project',
      settings: assetSettings ? { asset: assetSettings } : {},
    })
    .returning();
  testProjectId = project!.id;
  return project!;
}

function setupDeps(artifactsRoot: string) {
  configureAssetDeps({
    db: testDb.db,
    logger: nullLogger,
    executor: mockExecutor,
    artifactsRoot,
  });
}

// --- Tests ---

describe('E2E asset pipeline integration', () => {
  it('full pipeline: submit -> handle -> complete with artifact', async () => {
    const project = await createTestProject({ mode: 'active' });
    tmpDir = await mkdtemp(join(tmpdir(), 'cauldron-e2e-'));
    setupDeps(tmpDir);

    // Submit job
    const handle = await submitAssetJob({
      db: testDb.db,
      params: {
        projectId: project.id,
        prompt: 'a beautiful watercolor landscape',
        width: 512,
        height: 512,
        seed: 42,
        steps: 20,
        guidanceScale: 7,
      },
    });

    expect(handle.status).toBe('pending');
    expect(handle.jobId).toBeDefined();

    // Run the handler
    const result = await generateAssetHandler(
      {
        event: { data: { jobId: handle.jobId, projectId: project.id } },
        step: mockStep,
      },
      5000, // pollTimeout
      0     // pollInterval — immediate
    );

    expect(result).toEqual({ jobId: handle.jobId, status: 'completed' });

    // Verify DB state
    const job = await getAssetJob(testDb.db, handle.jobId);
    expect(job).not.toBeNull();
    expect(job!.status).toBe('completed');
    expect(job!.artifactPath).not.toBeNull();
    expect(job!.outputMetadata).not.toBeNull();
    expect((job!.outputMetadata as { imageFilename?: string })?.imageFilename).toBe('output_00001.png');
  });

  it('artifact file written to tmpdir with sidecar', async () => {
    const project = await createTestProject({ mode: 'active' });
    tmpDir = await mkdtemp(join(tmpdir(), 'cauldron-e2e-'));
    setupDeps(tmpDir);

    const handle = await submitAssetJob({
      db: testDb.db,
      params: {
        projectId: project.id,
        prompt: 'a misty forest at dawn',
        width: 512,
        height: 512,
      },
    });

    await generateAssetHandler(
      {
        event: { data: { jobId: handle.jobId, projectId: project.id } },
        step: mockStep,
      },
      5000,
      0
    );

    // Get the completed job to find artifactPath
    const job = await getAssetJob(testDb.db, handle.jobId);
    expect(job!.artifactPath).not.toBeNull();

    // Verify files exist in the artifact directory
    const files = await readdir(job!.artifactPath!);
    expect(files).toContain('output_00001.png');
    expect(files).toContain('output_00001.png.meta.json');
  });

  it('disabled mode blocks job submission via checkAssetMode', async () => {
    const project = await createTestProject({ mode: 'disabled' });

    await expect(checkAssetMode(testDb.db, project.id)).rejects.toThrow(
      AssetModeDisabledError
    );
  });

  it('paused mode returns paused without throwing', async () => {
    const project = await createTestProject({ mode: 'paused' });

    const mode = await checkAssetMode(testDb.db, project.id);
    expect(mode).toBe('paused');
  });

  it('concurrency limit blocks when at max', async () => {
    const project = await createTestProject({ mode: 'active', maxConcurrentJobs: 1 });
    tmpDir = await mkdtemp(join(tmpdir(), 'cauldron-e2e-'));

    // Submit one job (pending) — this counts toward the limit
    await submitAssetJob({
      db: testDb.db,
      params: {
        projectId: project.id,
        prompt: 'first job occupying the slot',
      },
    });

    // Second submission should fail concurrency check
    await expect(checkAssetConcurrency(testDb.db, project.id)).rejects.toThrow(
      AssetConcurrencyLimitError
    );
  });

  it('full pipeline with style/seed provenance: interview -> seed -> asset job -> delivery (D-07)', async () => {
    const project = await createTestProject({ mode: 'active' });
    tmpDir = await mkdtemp(join(tmpdir(), 'cauldron-e2e-'));
    setupDeps(tmpDir);

    // Insert interview with style hints in metadata
    const [interview] = await testDb.db
      .insert(interviews)
      .values({
        projectId: project.id,
        status: 'completed',
        phase: 'crystallized',
        transcript: [],
        ambiguityScoresHistory: [],
        currentAmbiguityScore: null,
        turnCount: 3,
      })
      .returning();

    expect(interview).toBeDefined();

    // Insert seed with style field referencing the interview
    // Seeds table has structured columns (goal, constraints, etc.) — not a JSONB spec blob
    // We use evolutionContext to carry the style metadata per the schema
    const styleData = { artStyle: 'watercolor', colorPalette: 'muted earth tones' };
    const [seed] = await testDb.db
      .insert(seeds)
      .values({
        projectId: project.id,
        interviewId: interview!.id,
        version: 1,
        status: 'crystallized',
        goal: 'Build a visually polished landing page',
        constraints: [],
        acceptanceCriteria: [],
        ontologySchema: {},
        evaluationPrinciples: [],
        exitConditions: {},
        ambiguityScore: 0.1,
        crystallizedAt: new Date(),
        evolutionContext: { style: styleData }, // provenance: style captured during interview
      })
      .returning();

    expect(seed).toBeDefined();

    // Submit asset job that references this seed via extras (provenance link)
    const handle = await submitAssetJob({
      db: testDb.db,
      params: {
        projectId: project.id,
        prompt: `Generate a ${styleData.artStyle} illustration with ${styleData.colorPalette} palette for the landing page`,
        width: 1024,
        height: 1024,
        steps: 20,
        extras: {
          seedId: seed!.id,
          interviewId: interview!.id,
          styleProvenance: styleData,
        },
      },
    });

    expect(handle.status).toBe('pending');

    // Run the handler
    const result = await generateAssetHandler(
      {
        event: { data: { jobId: handle.jobId, projectId: project.id } },
        step: mockStep,
      },
      5000,
      0
    );

    expect(result).toEqual({ jobId: handle.jobId, status: 'completed' });

    // Verify DB state — job completed
    const job = await getAssetJob(testDb.db, handle.jobId);
    expect(job).not.toBeNull();
    expect(job!.status).toBe('completed');
    expect(job!.artifactPath).not.toBeNull();

    // Verify provenance chain: job extras link to seed and interview
    const jobExtras = job!.extras as {
      seedId?: string;
      interviewId?: string;
      styleProvenance?: typeof styleData;
    };
    expect(jobExtras.seedId).toBe(seed!.id);
    expect(jobExtras.interviewId).toBe(interview!.id);
    expect(jobExtras.styleProvenance).toEqual(styleData);

    // Verify provenance chain: seed links to interview
    const [seedFromDb] = await testDb.db
      .select()
      .from(seeds)
      .where(eq(seeds.id, seed!.id))
      .limit(1);

    expect(seedFromDb).toBeDefined();
    expect(seedFromDb!.interviewId).toBe(interview!.id);
    expect((seedFromDb!.evolutionContext as { style?: typeof styleData } | null)?.style).toEqual(
      styleData
    );

    // Verify provenance chain: same project_id links everything
    expect(job!.projectId).toBe(project.id);
    expect(seedFromDb!.projectId).toBe(project.id);
    expect(interview!.projectId).toBe(project.id);

    // Verify artifact file was written
    const files = await readdir(job!.artifactPath!);
    expect(files).toContain('output_00001.png');
    expect(files).toContain('output_00001.png.meta.json');
  });
});
