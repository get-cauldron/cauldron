import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createComfyUIExecutor } from '../comfyui-adapter.js';
import type { AssetJobParams } from '../types.js';
import { ComfyUIError } from '../errors.js';

// Mock pino logger
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn().mockReturnThis(),
} as unknown as import('pino').Logger;

const BASE_URL = 'http://localhost:8188';

const baseParams: AssetJobParams & { jobId: string } = {
  jobId: 'job-abc123',
  projectId: 'proj-xyz',
  prompt: 'a cat sitting on a cauldron',
  negativePrompt: 'blurry, bad quality',
  width: 512,
  height: 512,
  seed: 42,
  steps: 20,
  guidanceScale: 3.5,
};

describe('createComfyUIExecutor', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('submitJob', () => {
    it('POSTs to /prompt and returns prompt_id', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ prompt_id: 'comfy-prompt-001' }),
      });

      const executor = createComfyUIExecutor({ baseUrl: BASE_URL, logger: mockLogger });
      const promptId = await executor.submitJob(baseParams);

      expect(promptId).toBe('comfy-prompt-001');
      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL}/prompt`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        })
      );
    });

    it('substitutes {{PROMPT}} in the workflow template', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ prompt_id: 'comfy-prompt-001' }),
      });

      const executor = createComfyUIExecutor({ baseUrl: BASE_URL, logger: mockLogger });
      await executor.submitJob(baseParams);

      const callArgs = fetchMock.mock.calls[0];
      const body = JSON.parse(callArgs[1].body as string);
      const workflowStr = JSON.stringify(body.prompt);
      expect(workflowStr).toContain('a cat sitting on a cauldron');
      expect(workflowStr).not.toContain('{{PROMPT}}');
    });

    it('substitutes {{NEGATIVE_PROMPT}} in the workflow template', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ prompt_id: 'comfy-prompt-001' }),
      });

      const executor = createComfyUIExecutor({ baseUrl: BASE_URL, logger: mockLogger });
      await executor.submitJob(baseParams);

      const callArgs = fetchMock.mock.calls[0];
      const body = JSON.parse(callArgs[1].body as string);
      const workflowStr = JSON.stringify(body.prompt);
      expect(workflowStr).toContain('blurry, bad quality');
      expect(workflowStr).not.toContain('{{NEGATIVE_PROMPT}}');
    });

    it('substitutes numeric placeholders for seed, steps, width, height, guidance', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ prompt_id: 'comfy-prompt-001' }),
      });

      const executor = createComfyUIExecutor({ baseUrl: BASE_URL, logger: mockLogger });
      await executor.submitJob(baseParams);

      const callArgs = fetchMock.mock.calls[0];
      const body = JSON.parse(callArgs[1].body as string);
      const workflowStr = JSON.stringify(body.prompt);
      expect(workflowStr).not.toContain('{{SEED}}');
      expect(workflowStr).not.toContain('{{STEPS}}');
      expect(workflowStr).not.toContain('{{WIDTH}}');
      expect(workflowStr).not.toContain('{{HEIGHT}}');
      expect(workflowStr).not.toContain('{{GUIDANCE_SCALE}}');
    });

    it('uses default values when optional params are omitted', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ prompt_id: 'comfy-prompt-002' }),
      });

      const executor = createComfyUIExecutor({ baseUrl: BASE_URL, logger: mockLogger });
      const minimalParams: AssetJobParams & { jobId: string } = {
        jobId: 'job-min',
        projectId: 'proj-xyz',
        prompt: 'a simple scene',
      };
      const promptId = await executor.submitJob(minimalParams);
      expect(promptId).toBe('comfy-prompt-002');

      const callArgs = fetchMock.mock.calls[0];
      const body = JSON.parse(callArgs[1].body as string);
      const workflowStr = JSON.stringify(body.prompt);
      // Defaults should be substituted
      expect(workflowStr).not.toContain('{{SEED}}');
      expect(workflowStr).not.toContain('{{STEPS}}');
      expect(workflowStr).not.toContain('{{WIDTH}}');
      expect(workflowStr).not.toContain('{{HEIGHT}}');
      expect(workflowStr).not.toContain('{{GUIDANCE_SCALE}}');
      expect(workflowStr).not.toContain('{{NEGATIVE_PROMPT}}');
    });

    it('throws ComfyUIError on non-2xx response from /prompt', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      const executor = createComfyUIExecutor({ baseUrl: BASE_URL, logger: mockLogger });
      await expect(executor.submitJob(baseParams)).rejects.toThrow(ComfyUIError);
    });

    it('includes statusCode in ComfyUIError from /prompt', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => 'Service Unavailable',
      });

      const executor = createComfyUIExecutor({ baseUrl: BASE_URL, logger: mockLogger });
      await expect(executor.submitJob(baseParams)).rejects.toMatchObject({
        statusCode: 503,
      });
    });
  });

  describe('checkStatus', () => {
    it('returns { done: false } when prompt_id not in history response', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const executor = createComfyUIExecutor({ baseUrl: BASE_URL, logger: mockLogger });
      const result = await executor.checkStatus('comfy-prompt-001');

      expect(result).toEqual({ done: false });
      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL}/history/comfy-prompt-001`,
        expect.any(Object)
      );
    });

    it('returns { done: true, outputs } when prompt_id present in history', async () => {
      const historyResponse = {
        'comfy-prompt-001': {
          outputs: {
            '16': {
              images: [
                { filename: 'cauldron_00001.png', subfolder: '', type: 'output' },
              ],
            },
          },
        },
      };
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => historyResponse,
      });

      const executor = createComfyUIExecutor({ baseUrl: BASE_URL, logger: mockLogger });
      const result = await executor.checkStatus('comfy-prompt-001');

      expect(result.done).toBe(true);
      expect(result.outputs).toBeDefined();
      expect(result.outputs?.images).toHaveLength(1);
      expect(result.outputs?.images[0].filename).toBe('cauldron_00001.png');
    });

    it('throws ComfyUIError on non-2xx response from /history', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Not Found',
      });

      const executor = createComfyUIExecutor({ baseUrl: BASE_URL, logger: mockLogger });
      await expect(executor.checkStatus('comfy-prompt-001')).rejects.toThrow(ComfyUIError);
    });
  });

  describe('getArtifact', () => {
    it('GETs the /view endpoint and returns Buffer', async () => {
      const fakeImageBytes = Buffer.from('PNG_DATA_FAKE');
      fetchMock.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => fakeImageBytes.buffer,
      });

      const executor = createComfyUIExecutor({ baseUrl: BASE_URL, logger: mockLogger });
      const outputs = {
        images: [{ filename: 'cauldron_00001.png', subfolder: '', type: 'output' }],
      };
      const result = await executor.getArtifact(outputs, 'cauldron_00001.png');

      expect(result).toBeInstanceOf(Buffer);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining(`${BASE_URL}/view`),
        expect.any(Object)
      );
      expect(fetchMock.mock.calls[0][0]).toContain('filename=');
    });

    it('includes filename, subfolder, and type=output in query params', async () => {
      const fakeImageBytes = Buffer.from('PNG_DATA_FAKE');
      fetchMock.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => fakeImageBytes.buffer,
      });

      const executor = createComfyUIExecutor({ baseUrl: BASE_URL, logger: mockLogger });
      const outputs = {
        images: [{ filename: 'cauldron_00001.png', subfolder: 'my-sub', type: 'output' }],
      };
      await executor.getArtifact(outputs, 'cauldron_00001.png');

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain('filename=cauldron_00001.png');
      expect(url).toContain('subfolder=my-sub');
      expect(url).toContain('type=output');
    });

    it('throws ComfyUIError on non-2xx response from /view', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Not Found',
      });

      const executor = createComfyUIExecutor({ baseUrl: BASE_URL, logger: mockLogger });
      const outputs = {
        images: [{ filename: 'cauldron_00001.png', subfolder: '', type: 'output' }],
      };
      await expect(executor.getArtifact(outputs, 'cauldron_00001.png')).rejects.toThrow(ComfyUIError);
    });
  });
});
