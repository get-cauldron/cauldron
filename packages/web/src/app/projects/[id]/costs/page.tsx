'use client';

import { useParams } from 'next/navigation';
import { useTRPC } from '@/trpc/client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export default function CostsPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const trpc = useTRPC();

  const summaryQuery = useQuery(
    trpc.costs.getProjectSummary.queryOptions({ projectId }),
  );
  const byModelQuery = useQuery(
    trpc.costs.getByModel.queryOptions({ projectId }),
  );
  const byStageQuery = useQuery(
    trpc.costs.getByStage.queryOptions({ projectId }),
  );
  const byCycleQuery = useQuery(
    trpc.costs.getByCycle.queryOptions({ projectId }),
  );
  const topBeadsQuery = useQuery(
    trpc.costs.getTopBeads.queryOptions({ projectId }),
  );

  const isLoading =
    summaryQuery.isLoading ||
    byModelQuery.isLoading ||
    byStageQuery.isLoading ||
    byCycleQuery.isLoading ||
    topBeadsQuery.isLoading;

  const summary = summaryQuery.data;
  const byModel = byModelQuery.data ?? [];
  const byStage = byStageQuery.data ?? [];
  const byCycle = byCycleQuery.data ?? [];
  const topBeads = topBeadsQuery.data ?? [];

  const hasData = summary && Number(summary.callCount) > 0;

  const totalCost = summary ? Number(summary.totalCostCents) : 0;
  const totalCalls = summary ? Number(summary.callCount) : 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        Loading cost data...
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2">
        <p className="text-base font-medium" style={{ color: '#c8d6e5' }}>
          No token usage yet
        </p>
        <p className="text-sm text-muted-foreground">
          Cost data appears once execution begins.
        </p>
      </div>
    );
  }

  const avgCostPerCall = totalCalls > 0 ? totalCost / totalCalls : 0;
  const maxModelCost = byModel.length > 0 ? Number(byModel[0]!.totalCostCents) : 1;
  const maxStageCost = byStage.length > 0 ? Number(byStage[0]!.totalCostCents) : 1;
  const maxCycleCost =
    byCycle.length > 0
      ? Math.max(...byCycle.map((c) => Number(c.totalCostCents)))
      : 1;

  return (
    <div className="p-6 space-y-8 max-w-4xl">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle
              className="text-xs tracking-widest uppercase"
              style={{ color: '#6b8399' }}
            >
              Total Cost
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="text-2xl font-bold tabular-nums"
              style={{ color: '#00d4aa' }}
            >
              {formatCents(totalCost)}
            </div>
            <div className="text-xs mt-1" style={{ color: '#6b8399' }}>
              {formatTokens(Number(summary?.totalTokens ?? 0))} tokens
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle
              className="text-xs tracking-widest uppercase"
              style={{ color: '#6b8399' }}
            >
              Total Calls
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="text-2xl font-bold tabular-nums"
              style={{ color: '#00d4aa' }}
            >
              {totalCalls.toLocaleString()}
            </div>
            <div className="text-xs mt-1" style={{ color: '#6b8399' }}>
              API calls
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle
              className="text-xs tracking-widest uppercase"
              style={{ color: '#6b8399' }}
            >
              Avg Cost / Call
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="text-2xl font-bold tabular-nums"
              style={{ color: '#00d4aa' }}
            >
              {formatCents(avgCostPerCall)}
            </div>
            <div className="text-xs mt-1" style={{ color: '#6b8399' }}>
              per API call
            </div>
          </CardContent>
        </Card>
      </div>

      {/* By Model */}
      <div className="space-y-3">
        <div className="space-y-1">
          <h2
            className="text-xs font-semibold tracking-widest uppercase"
            style={{ color: '#6b8399', letterSpacing: '0.08em' }}
          >
            COST BY MODEL
          </h2>
          <Separator />
        </div>
        <div className="space-y-3">
          {byModel.map((row) => {
            const cost = Number(row.totalCostCents);
            const pct = totalCost > 0 ? (cost / totalCost) * 100 : 0;
            return (
              <div key={row.model} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: '#c8d6e5' }}>{row.model}</span>
                  <div className="flex items-center gap-4">
                    <span style={{ color: '#6b8399' }} className="text-xs tabular-nums">
                      {formatTokens(Number(row.totalTokens))} tokens
                    </span>
                    <span style={{ color: '#6b8399' }} className="text-xs tabular-nums">
                      {Number(row.callCount).toLocaleString()} calls
                    </span>
                    <span
                      className="font-medium tabular-nums w-16 text-right"
                      style={{ color: '#00d4aa' }}
                    >
                      {formatCents(cost)}
                    </span>
                  </div>
                </div>
                <Progress value={(cost / maxModelCost) * 100} />
              </div>
            );
          })}
        </div>
      </div>

      {/* By Stage */}
      <div className="space-y-3">
        <div className="space-y-1">
          <h2
            className="text-xs font-semibold tracking-widest uppercase"
            style={{ color: '#6b8399', letterSpacing: '0.08em' }}
          >
            COST BY PIPELINE STAGE
          </h2>
          <Separator />
        </div>
        <div className="space-y-3">
          {byStage.map((row) => {
            const cost = Number(row.totalCostCents);
            const pct = totalCost > 0 ? (cost / totalCost) * 100 : 0;
            return (
              <div key={row.stage} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: '#c8d6e5' }}>{row.stage}</span>
                  <div className="flex items-center gap-4">
                    <span style={{ color: '#6b8399' }} className="text-xs tabular-nums">
                      {formatTokens(Number(row.totalTokens))} tokens
                    </span>
                    <span style={{ color: '#6b8399' }} className="text-xs tabular-nums">
                      {Number(row.callCount).toLocaleString()} calls
                    </span>
                    <span
                      className="font-medium tabular-nums w-16 text-right"
                      style={{ color: '#00d4aa' }}
                    >
                      {formatCents(cost)}
                    </span>
                  </div>
                </div>
                <Progress value={(cost / maxStageCost) * 100} />
              </div>
            );
          })}
        </div>
      </div>

      {/* By Evolution Cycle */}
      {byCycle.length > 0 && (
        <div className="space-y-3">
          <div className="space-y-1">
            <h2
              className="text-xs font-semibold tracking-widest uppercase"
              style={{ color: '#6b8399', letterSpacing: '0.08em' }}
            >
              COST PER EVOLUTION CYCLE
            </h2>
            <Separator />
          </div>
          <div className="space-y-2">
            {byCycle.map((row) => {
              const cost = Number(row.totalCostCents);
              const barPct = maxCycleCost > 0 ? (cost / maxCycleCost) * 100 : 0;
              const cycleLabel =
                row.evolutionCycle != null
                  ? `Cycle ${row.evolutionCycle}`
                  : 'Pre-evolution';
              return (
                <div key={String(row.evolutionCycle)} className="flex items-center gap-3">
                  <span
                    className="text-xs tabular-nums w-16 shrink-0"
                    style={{ color: '#6b8399' }}
                  >
                    {cycleLabel}
                  </span>
                  <div
                    className="h-5 rounded"
                    style={{
                      width: `${barPct}%`,
                      minWidth: '4px',
                      backgroundColor: '#00d4aa',
                      opacity: 0.8,
                    }}
                  />
                  <span
                    className="text-xs tabular-nums"
                    style={{ color: '#c8d6e5' }}
                  >
                    {formatCents(cost)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top Beads */}
      {topBeads.length > 0 && (
        <div className="space-y-3">
          <div className="space-y-1">
            <h2
              className="text-xs font-semibold tracking-widest uppercase"
              style={{ color: '#6b8399', letterSpacing: '0.08em' }}
            >
              MOST EXPENSIVE TASKS
            </h2>
            <Separator />
          </div>
          <div className="grid grid-cols-1 gap-3">
            {topBeads.map((bead, idx) => (
              <Card key={String(bead.beadId ?? idx)}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate" style={{ color: '#c8d6e5' }}>
                        {bead.beadName}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: '#6b8399' }}>
                        {formatTokens(Number(bead.totalTokens))} tokens &middot;{' '}
                        {Number(bead.callCount).toLocaleString()} calls
                      </p>
                    </div>
                    <div
                      className="text-xl font-bold tabular-nums shrink-0"
                      style={{ color: '#00d4aa' }}
                    >
                      {formatCents(Number(bead.totalCostCents))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
