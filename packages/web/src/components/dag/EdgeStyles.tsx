'use client';

import { getBezierPath, type EdgeProps } from '@xyflow/react';

// D-09: Color-coded edges by dependency type
// blocks = solid, parent-child = dashed, conditional-blocks = dotted, waits-for = teal glow

function BlocksEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps) {
  const [edgePath] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  return (
    <path
      id={id}
      className="react-flow__edge-path"
      d={edgePath}
      fill="none"
      stroke="#6b8399"
      strokeWidth={2}
    />
  );
}

function ParentChildEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps) {
  const [edgePath] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  return (
    <path
      id={id}
      className="react-flow__edge-path"
      d={edgePath}
      fill="none"
      stroke="#3d5166"
      strokeWidth={1.5}
      strokeDasharray="8 4"
    />
  );
}

function ConditionalEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps) {
  const [edgePath] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  return (
    <path
      id={id}
      className="react-flow__edge-path"
      d={edgePath}
      fill="none"
      stroke="#3d5166"
      strokeWidth={1.5}
      strokeDasharray="2 4"
    />
  );
}

function WaitsForEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps) {
  const [edgePath] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  return (
    <path
      id={id}
      className="react-flow__edge-path"
      d={edgePath}
      fill="none"
      stroke="#00d4aa"
      strokeWidth={2}
      style={{ filter: 'drop-shadow(0 0 4px #00d4aa)' }}
    />
  );
}

export { BlocksEdge, ParentChildEdge, ConditionalEdge, WaitsForEdge };

export const edgeTypes = {
  blocks: BlocksEdge,
  parent_child: ParentChildEdge,
  conditional_blocks: ConditionalEdge,
  waits_for: WaitsForEdge,
};
