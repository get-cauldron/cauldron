'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useTRPC } from '@/trpc/client';
import { useQuery } from '@tanstack/react-query';
import { useBeadStatus } from '@/hooks/useBeadStatus';
import { getLayoutedElements } from '@/lib/dag-layout';
import { BeadNode } from './BeadNode';
import { MoleculeGroup } from './MoleculeGroup';
import { edgeTypes } from './EdgeStyles';

const nodeTypes = {
  beadNode: BeadNode,
  moleculeGroup: MoleculeGroup,
};

interface DAGCanvasInnerProps {
  projectId: string;
  onNodeClick?: (beadId: string) => void;
}

function DAGCanvasInner({ projectId, onNodeClick }: DAGCanvasInnerProps) {
  const trpc = useTRPC();
  const { fitView } = useReactFlow();

  // Fetch initial DAG structure from tRPC
  const dagQuery = useQuery(
    trpc.execution.getProjectDAG.queryOptions({ projectId })
  );

  // Subscribe to SSE status updates
  const { beads: liveBeads } = useBeadStatus(projectId);

  // Track previously active beads to detect transitions (ref to avoid infinite re-render loop)
  const prevActiveIdsRef = useRef<Set<string>>(new Set());

  // Build nodes/edges from DAG data + live status overlay
  const { nodes, edges } = useMemo(() => {
    if (!dagQuery.data || dagQuery.data.beads.length === 0) {
      return { nodes: [], edges: [] };
    }

    const { beads, edges: rawEdges } = dagQuery.data;

    const rawNodes: Node[] = beads.map((bead) => {
      const live = liveBeads.get(bead.id);
      const status = live?.status ?? bead.status;
      return {
        id: bead.id,
        type: 'beadNode',
        position: { x: 0, y: 0 }, // Will be overwritten by dagre
        data: {
          name: bead.title,
          status,
          agentModel: bead.agentAssignment ?? undefined,
          elapsedMs: bead.claimedAt && bead.completedAt
            ? new Date(bead.completedAt).getTime() - new Date(bead.claimedAt).getTime()
            : bead.claimedAt && status === 'active'
            ? Date.now() - new Date(bead.claimedAt).getTime()
            : undefined,
        },
      };
    });

    const rawEdgeList: Edge[] = rawEdges.map((e) => ({
      id: e.id,
      source: e.fromBeadId,
      target: e.toBeadId,
      type: e.edgeType, // maps to edgeTypes keys
    }));

    const layouted = getLayoutedElements(rawNodes, rawEdgeList, 'TB');
    return { nodes: layouted.nodes, edges: layouted.edges };
  }, [dagQuery.data, liveBeads]);

  // Auto-pan: when a bead transitions to active, fitView toward it
  useEffect(() => {
    const currentActiveIds = new Set<string>();
    liveBeads.forEach((state, id) => {
      if (state.status === 'active') currentActiveIds.add(id);
    });

    const newlyActive = [...currentActiveIds].filter((id) => !prevActiveIdsRef.current.has(id));
    if (newlyActive.length > 0) {
      fitView({
        nodes: newlyActive.map((id) => ({ id })),
        duration: 800,
        padding: 0.3,
      });
    }

    prevActiveIdsRef.current = currentActiveIds;
  }, [liveBeads, fitView]);

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (node.type === 'beadNode' && onNodeClick) {
        onNodeClick(node.id);
      }
    },
    [onNodeClick]
  );

  if (dagQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-sm text-muted-foreground">Loading execution graph...</span>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <span className="text-sm text-muted-foreground">Execution not started</span>
        <span className="text-xs text-muted-foreground">
          The DAG will appear here once decomposition begins.
        </span>
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodeClick={handleNodeClick}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={true}
      style={{ background: '#0a0f14' }}
    >
      <Background gap={16} color="#1a2330" style={{ opacity: 0.3 }} />
      <Controls style={{ background: '#111820', border: '1px solid #1a2330' }} />
      <MiniMap
        style={{ background: '#111820', border: '1px solid #1a2330' }}
        nodeColor={(node) => {
          const status = (node.data as { status?: string })?.status;
          switch (status) {
            case 'active': return '#f5a623';
            case 'completed': return '#00d4aa';
            case 'failed': return '#e5484d';
            case 'blocked': return '#8a5c00';
            default: return '#3d5166';
          }
        }}
        maskColor="rgba(10, 15, 20, 0.7)"
      />
    </ReactFlow>
  );
}

interface DAGCanvasProps {
  projectId: string;
  onNodeClick?: (beadId: string) => void;
}

export function DAGCanvas({ projectId, onNodeClick }: DAGCanvasProps) {
  return (
    <ReactFlowProvider>
      <DAGCanvasInner projectId={projectId} onNodeClick={onNodeClick} />
    </ReactFlowProvider>
  );
}
