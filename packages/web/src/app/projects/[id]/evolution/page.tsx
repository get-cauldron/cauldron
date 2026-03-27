'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useTRPC } from '@/trpc/client';
import { useQuery } from '@tanstack/react-query';
import { useSSE } from '@/hooks/useSSE';
import { EVOLUTION_EVENTS } from '@/lib/sse-event-types';
import type { SSEEvent } from '@/lib/sse-event-types';
import { EvolutionTimeline, type GenerationDot, type GenerationStatus } from '@/components/evolution/EvolutionTimeline';
import { ConvergencePanel, type ConvergenceSignalRow, type LateralThinkingActivation } from '@/components/evolution/ConvergencePanel';
import { SeedLineageTree, type SeedLineageNode } from '@/components/evolution/SeedLineageTree';

// Map seed status + evolution context to GenerationStatus
function seedToGenerationStatus(seed: SeedLineageNode & { evolutionContext: unknown }): GenerationStatus {
  const ctx = seed.evolutionContext as Record<string, unknown> | null;
  if (!ctx) {
    // No evolution context yet — seed may still be executing
    return seed.status === 'crystallized' ? 'converged' : 'active';
  }
  const terminalReason = ctx.terminalReason as string | undefined;
  if (terminalReason === 'goal_met') return 'goal_met';
  if (terminalReason === 'hard_cap' || terminalReason === 'budget_exceeded') return 'halted';
  if (terminalReason === 'escalated') return 'halted';
  const signal = ctx.convergenceSignal as string | undefined;
  if (signal === 'stagnation') return 'stagnating';
  return seed.status === 'crystallized' ? 'converged' : 'active';
}

export default function EvolutionPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const trpc = useTRPC();

  const [selectedGeneration, setSelectedGeneration] = useState<number | null>(null);
  const [convergencePanelExpanded, setConvergencePanelExpanded] = useState(true);

  // Fetch seed lineage
  const seedLineageQuery = useQuery(
    trpc.evolution.getSeedLineage.queryOptions({ projectId })
  );

  // Fetch evolution history events
  const evolutionHistoryQuery = useQuery(
    trpc.evolution.getEvolutionHistory.queryOptions({ projectId })
  );

  // Select latest generation by default once data loads
  useEffect(() => {
    if (seedLineageQuery.data && seedLineageQuery.data.length > 0 && selectedGeneration === null) {
      const latest = seedLineageQuery.data[seedLineageQuery.data.length - 1];
      setSelectedGeneration(latest.generation);
    }
  }, [seedLineageQuery.data, selectedGeneration]);

  // Derive selected seed from generation
  const selectedSeed = seedLineageQuery.data?.find(s => s.generation === selectedGeneration) ?? null;

  // Fetch convergence data for selected seed
  const convergenceQuery = useQuery({
    ...trpc.evolution.getConvergenceForSeed.queryOptions({ seedId: selectedSeed?.id ?? '' }),
    enabled: !!selectedSeed?.id,
  });

  // Derive lateral thinking events for selected seed
  const lateralThinkingActivations: LateralThinkingActivation[] = (
    convergenceQuery.data?.lateralThinkingEvents ?? []
  ).map(evt => {
    const payload = evt.payload as Record<string, unknown>;
    return {
      persona: (payload.persona as string) ?? 'unknown',
      analysis: (payload.analysis as string) ?? '',
      timestamp: String(evt.occurredAt),
    };
  });

  // Build convergence signals from convergence event payload
  const convergenceSignals: ConvergenceSignalRow[] = (() => {
    const event = convergenceQuery.data?.convergenceEvent;
    if (!event) return [];
    const payload = event.payload as Record<string, unknown>;
    const signals = payload.signals as Array<Record<string, unknown>> | undefined;
    if (!signals || !Array.isArray(signals)) return [];
    return signals.map(s => ({
      type: (s.type as string) ?? '',
      triggered: Boolean(s.fired ?? s.triggered),
      value: Number(s.value ?? 0),
      threshold: Number(s.threshold ?? 1),
    }));
  })();

  // Live SSE updates — refetch on evolution events
  const handleSSEEvent = useCallback((event: SSEEvent) => {
    if (EVOLUTION_EVENTS.includes(event.type as (typeof EVOLUTION_EVENTS)[number])) {
      seedLineageQuery.refetch();
      evolutionHistoryQuery.refetch();
      if (selectedSeed) {
        convergenceQuery.refetch();
      }
    }
  }, [seedLineageQuery, evolutionHistoryQuery, convergenceQuery, selectedSeed]);

  useSSE<SSEEvent>(`/api/events/${projectId}`, handleSSEEvent);

  // Build generation dot data for timeline
  const lateralSeedIds = new Set(
    (evolutionHistoryQuery.data ?? [])
      .filter(e => e.type === 'evolution_lateral_thinking')
      .map(e => e.seedId)
      .filter(Boolean)
  );

  const generationDots: GenerationDot[] = (seedLineageQuery.data ?? []).map(seed => ({
    seedId: seed.id,
    generation: seed.generation,
    status: seedToGenerationStatus(seed as SeedLineageNode & { evolutionContext: unknown }),
    hasLateralThinking: lateralSeedIds.has(seed.id),
  }));

  // Build seed nodes for lineage tree
  const seedNodes: SeedLineageNode[] = (seedLineageQuery.data ?? []).map(s => ({
    id: s.id,
    parentId: s.parentId ?? null,
    generation: s.generation,
    goal: s.goal,
    acceptanceCriteria: s.acceptanceCriteria as unknown[],
    status: s.status,
    createdAt: String(s.createdAt),
  }));

  const hasData = seedNodes.length > 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#0a0f14',
      }}
    >
      {/* Evolution timeline strip */}
      <EvolutionTimeline
        generations={generationDots}
        selectedGeneration={selectedGeneration}
        onSelectGeneration={setSelectedGeneration}
      />

      {/* Main content */}
      {!hasData ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: 32,
          }}
        >
          <span style={{ fontSize: 16, fontWeight: 600, color: '#c8d6e5' }}>
            No evolution cycles yet
          </span>
          <span
            style={{
              fontSize: 14,
              color: '#6b8399',
              textAlign: 'center',
              maxWidth: 360,
            }}
          >
            Evolution begins after the first execution cycle completes evaluation.
          </span>
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            display: 'flex',
            overflow: 'hidden',
            gap: 0,
          }}
        >
          {/* Left: Seed lineage tree */}
          <div
            style={{
              flex: 1,
              overflow: 'auto',
              borderRight: '1px solid #1a2330',
            }}
          >
            <SeedLineageTree
              seeds={seedNodes}
              selectedSeedId={selectedSeed?.id ?? null}
              onSelectSeed={(id) => {
                const seed = seedLineageQuery.data?.find(s => s.id === id);
                if (seed) setSelectedGeneration(seed.generation);
              }}
            />
          </div>

          {/* Right: Convergence panel */}
          <div
            style={{
              width: 400,
              flexShrink: 0,
              overflowY: 'auto',
              padding: 16,
              background: '#0a0f14',
            }}
          >
            <ConvergencePanel
              signals={convergenceSignals}
              lateralThinkingActivations={lateralThinkingActivations}
              isExpanded={convergencePanelExpanded}
              onToggle={() => setConvergencePanelExpanded(prev => !prev)}
            />

            {/* Cost summary for selected seed */}
            {convergenceQuery.data && (
              <div
                style={{
                  marginTop: 12,
                  padding: '10px 14px',
                  background: '#111820',
                  border: '1px solid #1a2330',
                  borderRadius: 8,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 600, color: '#6b8399' }}>
                  Cycle Cost
                </span>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#c8d6e5' }}>
                  {(convergenceQuery.data.costCents / 100).toFixed(4)} USD
                  <span style={{ fontSize: 12, color: '#6b8399', marginLeft: 6 }}>
                    ({convergenceQuery.data.totalTokens.toLocaleString()} tokens)
                  </span>
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
