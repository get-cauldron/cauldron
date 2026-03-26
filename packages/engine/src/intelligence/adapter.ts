import * as childProcess from 'node:child_process';
import * as fsModule from 'node:fs';
import * as osModule from 'node:os';
import { join } from 'node:path';
import type {
  GraphSearchResult,
  TraceResult,
  DetectChangesResult,
  IndexResult,
  CodeSnippetResult,
} from './types.js';

/** MCP tool response envelope */
interface McpEnvelope {
  isError: boolean;
  content: Array<{ text: string }>;
}

/**
 * Promise wrapper around child_process.exec that is mock-friendly.
 * We avoid promisify() because the real exec has a util.promisify.custom symbol
 * that changes the resolution shape ({stdout, stderr}) — but mocked exec does not,
 * causing promisify to resolve with just the stdout string.
 */
function execPromise(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    childProcess.exec(cmd, (err, stdout) => {
      if (err) {
        reject(err);
      } else {
        resolve(stdout);
      }
    });
  });
}

export class KnowledgeGraphAdapter {
  readonly repoPath: string;
  readonly projectName: string;
  private readonly binaryPath: string;

  constructor(repoPath: string, binaryPath?: string) {
    this.repoPath = repoPath;
    this.projectName = repoPath.replace(/\//g, '-').replace(/^-/, '');
    this.binaryPath = binaryPath ?? process.env['CODEBASE_MEMORY_MCP_BIN'] ?? 'codebase-memory-mcp';
  }

  /**
   * Invoke a codebase-memory-mcp CLI tool.
   *
   * Writes args JSON to a temp file to avoid shell injection (Research open question 1).
   * Command: codebase-memory-mcp cli <tool> "$(cat <tmpfile>)"
   */
  private async invoke<T>(tool: string, args: Record<string, unknown>): Promise<T> {
    const payload = JSON.stringify({ ...args, project: this.projectName });
    const tmpFile = join(
      osModule.tmpdir(),
      `cauldron-mcp-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
    );

    try {
      fsModule.writeFileSync(tmpFile, payload, 'utf8');
      const cmd = `${this.binaryPath} cli ${tool} "$(cat ${tmpFile})"`;
      const stdout = await execPromise(cmd);

      const envelope = JSON.parse(stdout) as McpEnvelope;
      if (envelope.isError) {
        const inner = envelope.content[0]?.text ?? 'unknown error';
        throw new Error(`codebase-memory-mcp error for tool ${tool}: ${inner}`);
      }

      const result = JSON.parse(envelope.content[0]!.text) as T;
      return result;
    } finally {
      try {
        fsModule.unlinkSync(tmpFile);
      } catch {
        // Best-effort cleanup; ignore errors
      }
    }
  }

  /** Index the repository and return node/edge counts. */
  async indexRepository(): Promise<IndexResult> {
    return this.invoke<IndexResult>('index_repository', { repo_path: this.repoPath });
  }

  /** Search the knowledge graph for symbols matching label/name/file patterns. */
  async searchGraph(params: {
    label?: string;
    name_pattern?: string;
    file_pattern?: string;
  }): Promise<GraphSearchResult> {
    return this.invoke<GraphSearchResult>('search_graph', params);
  }

  /** Trace callers/callees for a function. */
  async traceCallPath(
    functionName: string,
    direction: 'callers' | 'callees' | 'both' = 'both'
  ): Promise<TraceResult> {
    return this.invoke<TraceResult>('trace_call_path', {
      function_name: functionName,
      direction,
    });
  }

  /** Retrieve a code snippet by qualified name. */
  async getCodeSnippet(qualifiedName: string): Promise<CodeSnippetResult> {
    return this.invoke<CodeSnippetResult>('get_code_snippet', {
      qualified_name: qualifiedName,
    });
  }

  /** Detect changed files and their impacted symbols (git-based). */
  async detectChanges(): Promise<DetectChangesResult> {
    return this.invoke<DetectChangesResult>('detect_changes', {});
  }
}
