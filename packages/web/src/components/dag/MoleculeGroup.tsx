'use client';

import { memo, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';

interface MoleculeGroupData {
  name: string;
  childCount?: number;
}

function MoleculeGroupComponent({
  data,
  style: nodeStyle,
}: {
  data: MoleculeGroupData;
  style?: React.CSSProperties;
}) {
  const { name, childCount } = data;
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div
      style={{
        ...nodeStyle,
        border: '1px dashed #1a2330',
        borderRadius: 8,
        background: 'rgba(17, 24, 32, 0.3)',
        minWidth: 280,
        minHeight: 120,
        position: 'relative',
      }}
    >
      {/* Target handle at top */}
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: '#3d5166', border: 'none', width: 8, height: 8 }}
      />

      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        {/* Header */}
        <CollapsibleTrigger
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 10px',
            cursor: 'pointer',
            borderBottom: isOpen ? '1px solid #1a2330' : 'none',
            borderRadius: isOpen ? '7px 7px 0 0' : 7,
            background: 'none',
            border: 'none',
            width: '100%',
            textAlign: 'left',
          }}
        >
          {isOpen ? (
            <ChevronDown style={{ width: 12, height: 12, color: '#6b8399' }} />
          ) : (
            <ChevronRight style={{ width: 12, height: 12, color: '#6b8399' }} />
          )}
          <span style={{ fontSize: 11, fontWeight: 600, color: '#6b8399', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {name}
          </span>
          {!isOpen && childCount != null && (
            <Badge variant="secondary" style={{ marginLeft: 4, fontSize: 10 }}>
              {childCount} beads
            </Badge>
          )}
        </CollapsibleTrigger>

        <CollapsibleContent>
          {/* Children are rendered by React Flow via parentId — this area is just a visual container */}
          <div style={{ minHeight: 80 }} />
        </CollapsibleContent>
      </Collapsible>

      {/* Source handle at bottom */}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: '#3d5166', border: 'none', width: 8, height: 8 }}
      />
    </div>
  );
}

export const MoleculeGroup = memo(MoleculeGroupComponent);
export type { MoleculeGroupData };
