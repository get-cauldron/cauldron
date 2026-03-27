'use client';

import Link from 'next/link';
import { useTRPC } from '@/trpc/client';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';

type EventType =
  | 'interview_started'
  | 'interview_completed'
  | 'seed_crystallized'
  | 'decomposition_started'
  | 'decomposition_completed'
  | 'bead_dispatched'
  | 'bead_claimed'
  | 'bead_completed'
  | 'bead_failed'
  | 'evolution_started'
  | 'evolution_converged'
  | 'evolution_goal_met'
  | string;

function getStatusLabel(eventType: EventType | null): string {
  if (!eventType) return 'Idle';
  if (eventType.startsWith('interview')) return 'Interviewing';
  if (
    eventType.startsWith('bead') ||
    eventType.startsWith('decomposition') ||
    eventType === 'seed_crystallized'
  )
    return 'Executing';
  if (eventType.startsWith('evolution')) return 'Evolving';
  if (eventType.startsWith('merge')) return 'Merging';
  return 'Idle';
}

function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  if (diffDays < 30) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  return d.toLocaleDateString();
}

function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Interviewing: { bg: '#0a1628', text: '#00d4aa', border: '#00d4aa33' },
  Executing: { bg: '#1a1200', text: '#f5a623', border: '#f5a62333' },
  Evolving: { bg: '#1a1200', text: '#f5a623', border: '#f5a62333' },
  Merging: { bg: '#0a1628', text: '#00d4aa', border: '#00d4aa33' },
  Idle: { bg: '#111820', text: '#6b8399', border: '#3d516633' },
};

export function ProjectListClient() {
  const trpc = useTRPC();
  const { data: projects } = useSuspenseQuery(trpc.projects.list.queryOptions());

  if (!projects || projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 py-24">
        <div
          className="max-w-md w-full p-8 rounded-lg text-center"
          style={{ background: '#111820', border: '1px solid #1a2330' }}
        >
          <h2
            className="font-semibold mb-3"
            style={{ fontSize: '20px', fontWeight: 600, color: '#c8d6e5' }}
          >
            No projects yet
          </h2>
          <p className="mb-6 text-sm" style={{ color: '#6b8399' }}>
            Describe what you want to build and Cauldron will take it from there. Start with an
            interview.
          </p>
          <Link
            href="/projects/new"
            className="inline-flex items-center justify-center px-6 py-3 rounded-md font-semibold text-sm transition-colors"
            style={{ background: '#00d4aa', color: '#0a0f14', minHeight: '44px' }}
          >
            Start Building
          </Link>
        </div>
      </div>
    );
  }

  // Most recent project by lastActivity
  const mostRecentId = projects.reduce((prev, curr) =>
    new Date(curr.lastActivity) > new Date(prev.lastActivity) ? curr : prev,
  ).id;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {projects.map((project) => {
        const status = getStatusLabel(project.lastEventType);
        const isRecent = project.id === mostRecentId;
        const statusColors = STATUS_COLORS[status] ?? STATUS_COLORS['Idle']!;

        return (
          <Link
            key={project.id}
            href={`/projects/${project.id}/interview`}
            className="block rounded-lg transition-colors"
            style={{
              background: isRecent ? '#1a2330' : '#111820',
              border: '1px solid #1a2330',
              borderLeft: isRecent ? '4px solid #00d4aa' : '1px solid #1a2330',
              padding: '20px',
            }}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <h3
                className="font-semibold truncate"
                style={{ fontSize: '16px', fontWeight: 600, color: '#c8d6e5' }}
              >
                {project.name}
              </h3>
              <span
                className="flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold"
                style={{
                  background: statusColors.bg,
                  color: statusColors.text,
                  border: `1px solid ${statusColors.border}`,
                }}
              >
                {status}
              </span>
            </div>

            {project.description && (
              <p className="text-sm mb-4 line-clamp-2" style={{ color: '#6b8399' }}>
                {project.description}
              </p>
            )}

            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: '#6b8399' }}>
                {formatRelativeTime(project.lastActivity)}
              </span>
              <span className="text-xs font-semibold" style={{ color: '#6b8399' }}>
                {formatCost(project.totalCostCents)}
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

export function ProjectListSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="rounded-lg p-5"
          style={{ background: '#111820', border: '1px solid #1a2330' }}
        >
          <Skeleton className="h-5 w-3/4 mb-3" />
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-2/3 mb-4" />
          <div className="flex justify-between">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-12" />
          </div>
        </div>
      ))}
    </div>
  );
}
