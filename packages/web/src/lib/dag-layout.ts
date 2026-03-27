import dagre from '@dagrejs/dagre';
import type { Node, Edge } from '@xyflow/react';

export const NODE_WIDTH = 240;
export const NODE_HEIGHT = 80;
const GROUP_PADDING = 40;

export function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  direction: 'TB' | 'LR' = 'TB'
) {
  const g = new dagre.graphlib.Graph()
    .setDefaultEdgeLabel(() => ({}))
    .setGraph({ rankdir: direction, nodesep: 32, ranksep: 48 });

  nodes.forEach((node) => {
    const width = node.type === 'moleculeGroup'
      ? ((node.data?.childCount as number) ?? 2) * (NODE_WIDTH + 32) + GROUP_PADDING * 2
      : NODE_WIDTH;
    const height = node.type === 'moleculeGroup'
      ? NODE_HEIGHT * 2 + GROUP_PADDING * 2
      : NODE_HEIGHT;
    g.setNode(node.id, { width, height });
  });

  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  return {
    nodes: nodes.map((node) => {
      const { x, y } = g.node(node.id);
      const width = node.type === 'moleculeGroup'
        ? ((node.data?.childCount as number) ?? 2) * (NODE_WIDTH + 32) + GROUP_PADDING * 2
        : NODE_WIDTH;
      const height = node.type === 'moleculeGroup'
        ? NODE_HEIGHT * 2 + GROUP_PADDING * 2
        : NODE_HEIGHT;
      return {
        ...node,
        position: { x: x - width / 2, y: y - height / 2 },
      };
    }),
    edges,
  };
}
