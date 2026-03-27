'use client';

import Link from 'next/link';
import { Settings } from 'lucide-react';

interface ProjectHeaderProps {
  projectName: string;
  totalCostCents?: number;
  projectId: string;
}

function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function ProjectHeader({ projectName, totalCostCents, projectId }: ProjectHeaderProps) {
  const cost = totalCostCents ?? 0;

  return (
    <header
      className="flex items-center justify-between px-6"
      style={{
        height: '56px',
        background: 'transparent',
        borderBottom: '1px solid #1a2330',
        flexShrink: 0,
      }}
    >
      <div className="flex items-center gap-3 overflow-hidden">
        <h1
          className="font-semibold truncate"
          style={{ fontSize: '20px', fontWeight: 600, lineHeight: '1.2', color: '#c8d6e5' }}
        >
          {projectName}
        </h1>
        <span
          className="flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold"
          style={{ background: '#1a2330', color: '#00d4aa', border: '1px solid #00d4aa33' }}
        >
          {formatCost(cost)}
        </span>
      </div>

      <Link
        href={`/projects/${projectId}/settings`}
        aria-label="Project settings"
        title="Project settings"
        className="flex items-center justify-center w-8 h-8 rounded-md transition-colors"
        style={{ color: '#6b8399' }}
      >
        <Settings size={16} />
      </Link>
    </header>
  );
}
