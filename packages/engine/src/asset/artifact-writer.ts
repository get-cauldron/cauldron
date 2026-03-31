import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ArtifactSidecar } from './types.js';

/**
 * Write a generated image artifact and its JSON provenance sidecar to the
 * local artifact storage directory.
 *
 * Directory structure:
 *   {artifactsRoot}/{jobId}/{imageFilename}
 *   {artifactsRoot}/{jobId}/{imageFilename}.meta.json
 *
 * @param opts.artifactsRoot - Root directory for artifacts (e.g. ".cauldron/artifacts")
 * @param opts.jobId         - Unique job identifier (used as subdirectory name)
 * @param opts.projectId     - Project identifier (used in sidecar only)
 * @param opts.imageBuffer   - Raw image bytes to write
 * @param opts.imageFilename - Filename of the image (from ComfyUI output)
 * @param opts.sidecar       - Full provenance metadata to write as JSON
 * @returns The artifact directory path: {artifactsRoot}/{jobId}
 */
export async function writeArtifact(opts: {
  artifactsRoot: string;
  jobId: string;
  projectId: string;
  imageBuffer: Buffer;
  imageFilename: string;
  sidecar: ArtifactSidecar;
}): Promise<string> {
  const dir = join(opts.artifactsRoot, opts.jobId);

  // Create artifact directory (and any intermediate directories) if needed
  await mkdir(dir, { recursive: true });

  // Write the raw image binary
  await writeFile(join(dir, opts.imageFilename), opts.imageBuffer);

  // Write the provenance sidecar as pretty-printed JSON (2-space indent)
  await writeFile(
    join(dir, `${opts.imageFilename}.meta.json`),
    JSON.stringify(opts.sidecar, null, 2),
    'utf-8'
  );

  return dir;
}
