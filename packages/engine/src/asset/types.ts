export interface AssetJobParams {
  projectId: string;
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  seed?: number;
  steps?: number;
  guidanceScale?: number;
  idempotencyKey?: string;
  extras?: Record<string, unknown>;
}

export interface AssetJobHandle {
  jobId: string;
  status: string;
  duplicate?: boolean;
}

export interface AssetOutputMetadata {
  imageFilename: string;
  comfyuiPromptId: string;
  width: number;
  height: number;
  model: string;
  generatedAt: string; // ISO 8601
}

export interface ArtifactSidecar {
  jobId: string;
  projectId: string;
  prompt: string;
  negativePrompt?: string;
  model: string;
  seed: number;
  width: number;
  height: number;
  steps: number;
  guidanceScale: number;
  generatedAt: string; // ISO 8601
  executorAdapter: string;
  comfyuiPromptId: string;
  imageFilename: string;
}

export interface ExecutorOutputs {
  images: Array<{ filename: string; subfolder: string; type: string }>;
}

export interface AssetExecutor {
  submitJob(params: AssetJobParams & { jobId: string }): Promise<string>; // returns executor-specific prompt ID
  checkStatus(executorPromptId: string): Promise<{ done: boolean; outputs?: ExecutorOutputs }>;
  getArtifact(outputs: ExecutorOutputs, filename: string): Promise<Buffer>;
}

export type AssetJobStatus = 'pending' | 'claimed' | 'active' | 'completed' | 'failed' | 'canceled';
