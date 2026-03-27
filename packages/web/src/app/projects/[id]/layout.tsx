import { notFound } from 'next/navigation';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { getQueryClient, trpc } from '@/trpc/server';
import { ProjectHeader } from '@/components/shell/ProjectHeader';
import { EscalationBanner } from '@/components/shell/EscalationBanner';
import { TabLinkClient } from './TabLinkClient';
// D-21 escalation wiring: ProjectShellClient renders EscalationBanner driven by useEscalation(projectId)
// It also passes unreadCount to NavSidebar so the nav icon shows a badge count.
// toast (sonner) fires when activeEscalation arrives. See ProjectShellClient.tsx.
import { ProjectShellClient } from './ProjectShellClient';

interface ProjectLayoutProps {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

const TABS = [
  { label: 'Interview', path: 'interview' },
  { label: 'Execution', path: 'execution' },
  { label: 'Evolution', path: 'evolution' },
  { label: 'Costs', path: 'costs' },
];

export default async function ProjectLayout({ children, params }: ProjectLayoutProps) {
  const { id } = await params;

  const queryClient = getQueryClient();

  let projectData: { id: string; name: string; totalCostCents: number } | null = null;

  try {
    projectData = await queryClient.fetchQuery(trpc.projects.byId.queryOptions({ id }));
  } catch {
    notFound();
  }

  if (!projectData) {
    notFound();
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      {/*
        Project shell:
        - ProjectShellClient wraps children with escalation wiring:
          useEscalation(projectId) → EscalationBanner + toast (sonner) + unreadCount badge on NavSidebar
        - ProjectHeader shows project name, cost, settings link
        - Tab navigation: interview | execution | evolution | costs
      */}
      <ProjectShellClient projectId={id}>
        {/* Project header */}
        <ProjectHeader
          projectName={projectData.name}
          totalCostCents={projectData.totalCostCents}
          projectId={id}
        />

        {/* Tab navigation */}
        <nav
          aria-label="Project tabs"
          className="flex items-center px-6 gap-1"
          style={{ borderBottom: '1px solid #1a2330', flexShrink: 0 }}
        >
          {TABS.map((tab) => (
            <TabLinkClient
              key={tab.label}
              href={`/projects/${id}/${tab.path}`}
              label={tab.label}
            />
          ))}
        </nav>

        {/* Tab content */}
        <div className="flex-1 overflow-auto">{children}</div>
      </ProjectShellClient>
    </HydrationBoundary>
  );
}
