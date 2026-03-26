export interface GraphNode {
  name: string;
  qualified_name: string;
  label: string;
  file_path: string;
  in_degree: number;
  out_degree: number;
}

export interface GraphSearchResult {
  total: number;
  results: GraphNode[];
  has_more: boolean;
}

export interface TraceHop {
  name: string;
  qualified_name: string;
  hop: number;
}

export interface TraceResult {
  function: string;
  direction: string;
  callers: TraceHop[];
  callees: TraceHop[];
}

export interface DetectChangesResult {
  changed_files: string[];
  changed_count: number;
  impacted_symbols: Array<{ name: string; label: string; file: string }>;
}

export interface IndexResult {
  project: string;
  status: string;
  nodes: number;
  edges: number;
}

export interface CodeSnippetResult {
  name: string;
  qualified_name: string;
  code: string;
  file_path: string;
  start_line: number;
  end_line: number;
}
