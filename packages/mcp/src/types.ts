/**
 * MCP-layer input types and intendedUse enum.
 * Extends the base AssetJobParams with MCP-specific fields per D-08, D-14, D-15.
 */

export const INTENDED_USES = ['hero-image', 'icon', 'texture', 'avatar', 'background', 'other'] as const;
export type IntendedUse = typeof INTENDED_USES[number];

/**
 * Extended input contract for the generate_image MCP tool.
 * Adds styleGuidance, referenceImages, intendedUse, and destination fields
 * on top of the base AssetJobParams.
 */
export interface GenerateImageInput {
  /** The main image generation prompt */
  prompt: string;
  /** Optional style direction prepended to the prompt */
  styleGuidance?: string;
  /** Optional reference image paths or URLs for style transfer */
  referenceImages?: string[];
  /** Semantic use-case that drives smart dimension/step defaults */
  intendedUse?: IntendedUse;
  /** Target filesystem path to deliver the generated artifact */
  destination?: string;
  /** Image width in pixels (overrides intendedUse defaults) */
  width?: number;
  /** Image height in pixels (overrides intendedUse defaults) */
  height?: number;
  /** Diffusion steps (overrides intendedUse defaults) */
  steps?: number;
  /** Noise seed for reproducible generation */
  seed?: number;
  /** Negative prompt for things to avoid in the image */
  negativePrompt?: string;
  /** Classifier-free guidance scale */
  guidanceScale?: number;
  /** Idempotency key for deduplication */
  idempotencyKey?: string;
  /** Project ID (auto-detected from cwd if not provided) */
  projectId?: string;
}

/** Input for the check_job_status MCP tool */
export interface CheckJobStatusInput {
  jobId: string;
}

/** Input for the get_artifact MCP tool */
export interface GetArtifactInput {
  jobId: string;
  /** Include base64-encoded image data in the response */
  includeBase64?: boolean;
}

/** Input for the list_jobs MCP tool */
export interface ListJobsInput {
  status?: string;
  limit?: number;
  offset?: number;
}
