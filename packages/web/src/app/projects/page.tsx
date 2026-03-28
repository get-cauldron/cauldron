import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import Link from 'next/link';
import { getQueryClient, trpc } from '@/trpc/server';

// Force dynamic rendering — page prefetches live tRPC data and should not be
// statically pre-rendered during next build (no DATABASE_URL at build time).
export const dynamic = 'force-dynamic';
import { NavSidebar } from '@/components/shell/NavSidebar';
import { ProjectListClient } from './ProjectListClient';

export default async function ProjectsPage() {
  const queryClient = getQueryClient();
  await queryClient.prefetchQuery(trpc.projects.list.queryOptions({ includeArchived: false }));

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <div className="flex flex-1 min-h-screen">
        <NavSidebar />
        <main className="flex-1 overflow-auto flex flex-col">
          {/* Page header */}
          <div
            className="flex items-center justify-between px-8 py-6"
            style={{ borderBottom: '1px solid #1a2330' }}
          >
            <h1
              className="font-semibold uppercase tracking-widest"
              style={{
                fontSize: '16px',
                fontWeight: 600,
                letterSpacing: '0.08em',
                color: '#c8d6e5',
              }}
            >
              Projects
            </h1>
            <Link
              href="/projects/new"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-colors"
              style={{
                background: '#00d4aa',
                color: '#0a0f14',
                minHeight: '44px',
              }}
            >
              New Project
            </Link>
          </div>

          {/* Project grid */}
          <div className="flex-1 p-8">
            <ProjectListClient />
          </div>
        </main>
      </div>
    </HydrationBoundary>
  );
}
