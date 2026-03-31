import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writeArtifact } from '../artifact-writer.js';
import type { ArtifactSidecar } from '../types.js';

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

import { mkdir, writeFile } from 'node:fs/promises';

const mockMkdir = mkdir as ReturnType<typeof vi.fn>;
const mockWriteFile = writeFile as ReturnType<typeof vi.fn>;

const ARTIFACTS_ROOT = '/project/.cauldron/artifacts';
const JOB_ID = 'job-abc123';
const IMAGE_FILENAME = 'cauldron_00001.png';

const sidecar: ArtifactSidecar = {
  jobId: JOB_ID,
  projectId: 'proj-xyz',
  prompt: 'a beautiful cat',
  negativePrompt: 'blurry',
  model: 'flux1-dev.safetensors',
  seed: 42,
  width: 1024,
  height: 1024,
  steps: 20,
  guidanceScale: 3.5,
  generatedAt: '2026-03-31T12:00:00.000Z',
  executorAdapter: 'comfyui',
  comfyuiPromptId: 'comfy-prompt-001',
  imageFilename: IMAGE_FILENAME,
};

const imageBuffer = Buffer.from('FAKE_PNG_DATA');

describe('writeArtifact', () => {
  beforeEach(() => {
    mockMkdir.mockClear();
    mockWriteFile.mockClear();
  });

  it('creates the artifact directory with recursive: true', async () => {
    await writeArtifact({
      artifactsRoot: ARTIFACTS_ROOT,
      jobId: JOB_ID,
      projectId: 'proj-xyz',
      imageBuffer,
      imageFilename: IMAGE_FILENAME,
      sidecar,
    });

    expect(mockMkdir).toHaveBeenCalledWith(
      `${ARTIFACTS_ROOT}/${JOB_ID}`,
      { recursive: true }
    );
  });

  it('writes the image buffer to {artifactsRoot}/{jobId}/{imageFilename}', async () => {
    await writeArtifact({
      artifactsRoot: ARTIFACTS_ROOT,
      jobId: JOB_ID,
      projectId: 'proj-xyz',
      imageBuffer,
      imageFilename: IMAGE_FILENAME,
      sidecar,
    });

    const imagePath = `${ARTIFACTS_ROOT}/${JOB_ID}/${IMAGE_FILENAME}`;
    const imageCall = mockWriteFile.mock.calls.find(
      (call) => call[0] === imagePath
    );
    expect(imageCall).toBeDefined();
    expect(imageCall![1]).toBe(imageBuffer);
  });

  it('writes JSON sidecar to {artifactsRoot}/{jobId}/{imageFilename}.meta.json', async () => {
    await writeArtifact({
      artifactsRoot: ARTIFACTS_ROOT,
      jobId: JOB_ID,
      projectId: 'proj-xyz',
      imageBuffer,
      imageFilename: IMAGE_FILENAME,
      sidecar,
    });

    const sidecarPath = `${ARTIFACTS_ROOT}/${JOB_ID}/${IMAGE_FILENAME}.meta.json`;
    const sidecarCall = mockWriteFile.mock.calls.find(
      (call) => call[0] === sidecarPath
    );
    expect(sidecarCall).toBeDefined();
    // Verify it's valid JSON
    const parsed = JSON.parse(sidecarCall![1] as string);
    expect(parsed.jobId).toBe(JOB_ID);
    expect(parsed.projectId).toBe('proj-xyz');
    expect(parsed.prompt).toBe('a beautiful cat');
    expect(parsed.seed).toBe(42);
    expect(parsed.comfyuiPromptId).toBe('comfy-prompt-001');
  });

  it('writes sidecar JSON with 2-space indentation', async () => {
    await writeArtifact({
      artifactsRoot: ARTIFACTS_ROOT,
      jobId: JOB_ID,
      projectId: 'proj-xyz',
      imageBuffer,
      imageFilename: IMAGE_FILENAME,
      sidecar,
    });

    const sidecarPath = `${ARTIFACTS_ROOT}/${JOB_ID}/${IMAGE_FILENAME}.meta.json`;
    const sidecarCall = mockWriteFile.mock.calls.find(
      (call) => call[0] === sidecarPath
    );
    const content = sidecarCall![1] as string;
    // 2-space indent means the first nested key starts with exactly 2 spaces
    expect(content).toContain('\n  "');
    // Verify it matches JSON.stringify(sidecar, null, 2) exactly
    expect(content).toBe(JSON.stringify(sidecar, null, 2));
  });

  it('writes sidecar as utf-8', async () => {
    await writeArtifact({
      artifactsRoot: ARTIFACTS_ROOT,
      jobId: JOB_ID,
      projectId: 'proj-xyz',
      imageBuffer,
      imageFilename: IMAGE_FILENAME,
      sidecar,
    });

    const sidecarPath = `${ARTIFACTS_ROOT}/${JOB_ID}/${IMAGE_FILENAME}.meta.json`;
    const sidecarCall = mockWriteFile.mock.calls.find(
      (call) => call[0] === sidecarPath
    );
    expect(sidecarCall![2]).toBe('utf-8');
  });

  it('calls writeFile exactly twice (image + sidecar)', async () => {
    await writeArtifact({
      artifactsRoot: ARTIFACTS_ROOT,
      jobId: JOB_ID,
      projectId: 'proj-xyz',
      imageBuffer,
      imageFilename: IMAGE_FILENAME,
      sidecar,
    });

    expect(mockWriteFile).toHaveBeenCalledTimes(2);
  });

  it('returns the artifact directory path', async () => {
    const result = await writeArtifact({
      artifactsRoot: ARTIFACTS_ROOT,
      jobId: JOB_ID,
      projectId: 'proj-xyz',
      imageBuffer,
      imageFilename: IMAGE_FILENAME,
      sidecar,
    });

    expect(result).toBe(`${ARTIFACTS_ROOT}/${JOB_ID}`);
  });

  it('sidecar contains all ArtifactSidecar fields', async () => {
    await writeArtifact({
      artifactsRoot: ARTIFACTS_ROOT,
      jobId: JOB_ID,
      projectId: 'proj-xyz',
      imageBuffer,
      imageFilename: IMAGE_FILENAME,
      sidecar,
    });

    const sidecarPath = `${ARTIFACTS_ROOT}/${JOB_ID}/${IMAGE_FILENAME}.meta.json`;
    const sidecarCall = mockWriteFile.mock.calls.find(
      (call) => call[0] === sidecarPath
    );
    const parsed = JSON.parse(sidecarCall![1] as string) as ArtifactSidecar;

    // Verify all required fields are present
    expect(parsed.jobId).toBeDefined();
    expect(parsed.projectId).toBeDefined();
    expect(parsed.prompt).toBeDefined();
    expect(parsed.model).toBeDefined();
    expect(parsed.seed).toBeDefined();
    expect(parsed.width).toBeDefined();
    expect(parsed.height).toBeDefined();
    expect(parsed.steps).toBeDefined();
    expect(parsed.guidanceScale).toBeDefined();
    expect(parsed.generatedAt).toBeDefined();
    expect(parsed.executorAdapter).toBeDefined();
    expect(parsed.comfyuiPromptId).toBeDefined();
    expect(parsed.imageFilename).toBeDefined();
  });
});
