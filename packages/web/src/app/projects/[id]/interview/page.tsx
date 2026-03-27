'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { useTRPC } from '@/trpc/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ChatBubble } from '@/components/interview/ChatBubble';
import { MCChipGroup } from '@/components/interview/MCChipGroup';
import { AmbiguityMeter } from '@/components/interview/AmbiguityMeter';
import { SeedApprovalCard } from '@/components/interview/SeedApprovalCard';
import { HoldoutCard } from '@/components/interview/HoldoutCard';
import { ClarityBanner } from '@/components/interview/ClarityBanner';
import type { HoldoutStatus } from '@/components/interview/HoldoutCard';
import type { SeedSummaryData } from '@/components/interview/SeedApprovalCard';
import type { InterviewTurn, AmbiguityScores } from '@get-cauldron/engine';

// ────────────────────────────────────────────────────────────────────────────
// Interview page
// Layout: chat area (flex-1, scrollable) + right sidebar (320px fixed)
// ────────────────────────────────────────────────────────────────────────────

interface HoldoutScenarioLocal {
  id: string;
  name: string;
  description: string;
  testCode: string;
  status: HoldoutStatus;
}

function useInterviewData(projectId: string) {
  const trpc = useTRPC();

  const transcriptQuery = useQuery(
    trpc.interview.getTranscript.queryOptions({ projectId }),
  );

  const summaryQuery = useQuery(
    trpc.interview.getSummary.queryOptions({ projectId }),
  );

  return { transcriptQuery, summaryQuery };
}

export default function InterviewPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  const { transcriptQuery, summaryQuery } = useInterviewData(projectId);

  const [inputValue, setInputValue] = React.useState('');
  const [isSending, setIsSending] = React.useState(false);
  const [localHoldoutStatuses, setLocalHoldoutStatuses] = React.useState<
    Record<string, HoldoutStatus>
  >({});
  const [seedId, setSeedId] = React.useState<string | null>(null);

  const holdoutsQuery = useQuery({
    ...trpc.interview.getHoldouts.queryOptions({ seedId: seedId ?? '' }),
    enabled: !!seedId,
  });

  // Auto-scroll ref
  const chatEndRef = React.useRef<HTMLDivElement>(null);

  // Scroll to bottom when transcript updates
  React.useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcriptQuery.data?.transcript]);

  // tRPC mutations (startInterviewMutation declared first — used in auto-start effect below)
  const startInterviewMutation = useMutation(trpc.interview.startInterview.mutationOptions());
  const sendAnswerMutation = useMutation(trpc.interview.sendAnswer.mutationOptions());

  // Auto-start interview when no DB record exists (P0 gap closure)
  React.useEffect(() => {
    if (
      transcriptQuery.data?.status === 'not_started' &&
      !startInterviewMutation.isPending &&
      !startInterviewMutation.isSuccess
    ) {
      startInterviewMutation.mutate(
        { projectId },
        {
          onSuccess: () => {
            void transcriptQuery.refetch();
          },
        },
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcriptQuery.data?.status, startInterviewMutation.isPending, startInterviewMutation.isSuccess, projectId]);
  const approveSummaryMutation = useMutation(trpc.interview.approveSummary.mutationOptions());
  const rejectSummaryMutation = useMutation(trpc.interview.rejectSummary.mutationOptions());
  const approveHoldoutMutation = useMutation(trpc.interview.approveHoldout.mutationOptions());
  const rejectHoldoutMutation = useMutation(trpc.interview.rejectHoldout.mutationOptions());
  const sealHoldoutsMutation = useMutation(trpc.interview.sealHoldouts.mutationOptions());

  const transcriptData = transcriptQuery.data;
  const summaryData = summaryQuery.data;

  const transcript: InterviewTurn[] = transcriptData?.transcript ?? [];
  const currentScores = transcriptData?.currentScores as AmbiguityScores | null;
  const phase = transcriptData?.phase ?? 'gathering';
  const suggestions = transcriptData?.suggestions ?? [];
  const thresholdMet = transcriptData?.thresholdMet ?? false;
  const isGreenfield = transcriptData?.interview?.mode !== 'brownfield';

  // Map dimensions from AmbiguityScores to AmbiguityMeter format
  const meterDimensions = {
    goal: currentScores?.goalClarity ?? 0,
    constraint: currentScores?.constraintClarity ?? 0,
    successCriteria: currentScores?.successCriteriaClarity ?? 0,
    context: currentScores?.contextClarity,
  };
  const overallClarity = currentScores?.overall ?? 0;

  async function handleSendAnswer(answerText: string) {
    if (!answerText.trim() || isSending) return;
    setIsSending(true);
    setInputValue('');
    try {
      await sendAnswerMutation.mutateAsync({ projectId, answer: answerText.trim() });
      await queryClient.invalidateQueries({ queryKey: ['interview', 'getTranscript', projectId] });
      await transcriptQuery.refetch();
    } finally {
      setIsSending(false);
    }
  }

  async function handleMCSelect(option: string) {
    await handleSendAnswer(option);
  }

  async function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      await handleSendAnswer(inputValue);
    }
  }

  async function handleApproveSummary() {
    if (!summaryData?.summary) return;
    const s = summaryData.summary;
    const result = await approveSummaryMutation.mutateAsync({
      projectId,
      summary: {
        goal: s.goal,
        constraints: s.constraints,
        acceptanceCriteria: s.acceptanceCriteria,
        ontologySchema: (s.ontologySchema as { entities: Array<{ name: string; attributes: string[]; relations: Array<{ to: string; type: string }> }> }) ?? { entities: [] },
        evaluationPrinciples: s.evaluationPrinciples ?? [],
        exitConditions: (s.exitConditions as Record<string, unknown> | Array<{ condition: string; description: string }>) ?? {},
      },
    });
    setSeedId(result.seedId);
    await transcriptQuery.refetch();
    await summaryQuery.refetch();
  }

  async function handleRejectSummary() {
    await rejectSummaryMutation.mutateAsync({ projectId });
    await transcriptQuery.refetch();
  }

  async function handleApproveHoldout(id: string) {
    setLocalHoldoutStatuses((prev) => ({ ...prev, [id]: 'approved' }));
    // The actual vault ID is the part before ":" in composite id
    const vaultId = id.includes(':') ? id.split(':')[0]! : id;
    await approveHoldoutMutation.mutateAsync({ holdoutId: vaultId });
  }

  async function handleRejectHoldout(id: string) {
    setLocalHoldoutStatuses((prev) => ({ ...prev, [id]: 'rejected' }));
    const vaultId = id.includes(':') ? id.split(':')[0]! : id;
    await rejectHoldoutMutation.mutateAsync({ holdoutId: vaultId });
  }

  // Derive holdout scenarios from tRPC getHoldouts query — populated after seed crystallization
  const holdoutScenarios: HoldoutScenarioLocal[] = (holdoutsQuery.data?.scenarios ?? []).map(s => ({
    id: s.id,
    name: s.name,
    description: s.description,
    testCode: s.testCode,
    status: (localHoldoutStatuses[s.id] ?? s.status) as HoldoutStatus,
  }));

  const showSeedApproval = phase === 'reviewing' && summaryData?.summary != null;
  const showHoldouts = (phase === 'crystallized' || !!seedId) && holdoutScenarios.length > 0;
  const showClarityBanner = thresholdMet && phase === 'gathering';
  const isLoading = transcriptQuery.isLoading;

  return (
    <div
      className="flex flex-1"
      style={{ height: '100%', overflow: 'hidden' }}
    >
      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* Chat area */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <div
        className="flex flex-col flex-1"
        style={{ minWidth: 0, overflow: 'hidden' }}
      >
        {/* Messages */}
        <ScrollArea className="flex-1" style={{ minHeight: 0 }}>
          <div
            style={{
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            {isLoading ? (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-12 w-3/4" />
                <Skeleton className="h-8 w-1/2 self-end" />
                <Skeleton className="h-12 w-3/4" />
              </div>
            ) : transcript.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center"
                style={{ padding: '48px 24px', textAlign: 'center' }}
              >
                <p
                  style={{
                    fontSize: '16px',
                    fontWeight: 600,
                    color: '#c8d6e5',
                    margin: '0 0 8px',
                  }}
                >
                  {startInterviewMutation.isPending ? 'Starting interview...' : 'Interview not started'}
                </p>
                <p style={{ fontSize: '14px', color: '#6b8399', margin: 0 }}>
                  {startInterviewMutation.isPending
                    ? 'Preparing your Socratic interview session.'
                    : 'Send your first message to begin the Socratic interview.'}
                </p>
              </div>
            ) : (
              transcript.map((turn, idx) => {
                // Each turn has the system question + user answer
                const items: React.ReactNode[] = [];

                // System question (rendered first)
                if (turn.question && turn.question !== '(opening turn)') {
                  items.push(
                    <ChatBubble
                      key={`system-${idx}`}
                      role="system"
                      content={turn.question}
                      perspective={(turn.perspective as string) !== 'user' ? turn.perspective : undefined}
                      timestamp={new Date(turn.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    />,
                  );
                }

                // User answer
                if (turn.userAnswer) {
                  items.push(
                    <ChatBubble
                      key={`user-${idx}`}
                      role="user"
                      content={turn.userAnswer}
                    />,
                  );
                }

                return items;
              })
            )}

            {/* Seed approval card — inline in chat when reviewing */}
            {showSeedApproval && summaryData?.summary && (
              <div style={{ marginTop: 16 }}>
                <SeedApprovalCard
                  summary={summaryData.summary as SeedSummaryData}
                  onApprove={handleApproveSummary}
                  onReject={handleRejectSummary}
                  isLoading={approveSummaryMutation.isPending || rejectSummaryMutation.isPending}
                />
              </div>
            )}

            {/* Holdout cards — inline after crystallization */}
            {showHoldouts && (
              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    color: '#6b8399',
                    textTransform: 'uppercase',
                    margin: '0 0 8px',
                  }}
                >
                  HOLDOUT TEST REVIEW
                </p>
                {holdoutScenarios.map((scenario) => (
                  <HoldoutCard
                    key={scenario.id}
                    scenario={{
                      ...scenario,
                      status: (localHoldoutStatuses[scenario.id] ?? scenario.status) as HoldoutStatus,
                    }}
                    onApprove={handleApproveHoldout}
                    onReject={handleRejectHoldout}
                  />
                ))}
                <Button
                  onClick={() => {
                    if (seedId) sealHoldoutsMutation.mutate({ seedId });
                  }}
                  style={{
                    backgroundColor: '#00d4aa',
                    color: '#0a0f14',
                    fontWeight: 600,
                    marginTop: 8,
                    minHeight: 44,
                  }}
                >
                  Seal Holdout Tests
                </Button>
              </div>
            )}

            {/* Scroll anchor */}
            <div ref={chatEndRef} />
          </div>
        </ScrollArea>

        {/* ──────────────────────────────────────────────────────────────── */}
        {/* Input area */}
        {/* ──────────────────────────────────────────────────────────────── */}
        <div
          style={{
            borderTop: '1px solid #1a2330',
            padding: '16px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            flexShrink: 0,
            backgroundColor: '#0a0f14',
          }}
        >
          {/* Clarity threshold banner — above input */}
          <ClarityBanner
            visible={showClarityBanner}
            onCrystallize={handleApproveSummary}
            onKeepRefining={() => {
              /* Dismiss banner; interview continues */
            }}
          />

          {/* MC chips */}
          {suggestions.length > 0 && phase === 'gathering' && (
            <MCChipGroup
              options={suggestions}
              onSelect={handleMCSelect}
              disabled={isSending}
            />
          )}

          {/* Freeform input */}
          {phase === 'gathering' && (
            <div className="flex gap-2">
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your answer..."
                disabled={isSending}
                style={{
                  backgroundColor: '#111820',
                  border: '1px solid #1a2330',
                  color: '#c8d6e5',
                  fontSize: '14px',
                  minHeight: 44,
                  flex: 1,
                }}
                aria-label="Interview answer input"
              />
              <Button
                onClick={() => handleSendAnswer(inputValue)}
                disabled={!inputValue.trim() || isSending}
                style={{
                  backgroundColor: '#00d4aa',
                  color: '#0a0f14',
                  fontWeight: 600,
                  minHeight: 44,
                  flexShrink: 0,
                }}
                aria-label="Send answer"
              >
                {isSending ? 'Sending...' : 'Send Answer'}
              </Button>
            </div>
          )}

          {phase === 'reviewing' && (
            <p style={{ fontSize: '13px', color: '#6b8399', margin: 0 }}>
              Review the seed summary above, then approve or request revisions.
            </p>
          )}

          {phase === 'crystallized' && (
            <p style={{ fontSize: '13px', color: '#00d4aa', margin: 0, fontWeight: 600 }}>
              Seed crystallized. Review holdout tests above.
            </p>
          )}
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* Right sidebar — 320px fixed */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <div
        style={{
          width: 320,
          flexShrink: 0,
          borderLeft: '1px solid #1a2330',
          backgroundColor: '#111820',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'auto',
          padding: '24px 16px',
          gap: '24px',
        }}
      >
        {/* Ambiguity meter */}
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: '12px',
            }}
          >
            <h2
              style={{
                fontSize: '12px',
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: '#6b8399',
                margin: 0,
                fontFamily: 'var(--font-geist-sans, sans-serif)',
              }}
            >
              AMBIGUITY SCORE
            </h2>
          </div>
          <Separator style={{ backgroundColor: '#1a2330', marginBottom: 16 }} />
          {isLoading ? (
            <div className="flex flex-col items-center gap-4">
              <Skeleton className="rounded-full" style={{ width: 128, height: 128 }} />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </div>
          ) : (
            <AmbiguityMeter
              overallClarity={overallClarity}
              dimensions={meterDimensions}
              isGreenfield={isGreenfield}
            />
          )}
        </div>

        {/* Live summary preview */}
        <div>
          <div style={{ marginBottom: '12px' }}>
            <h2
              style={{
                fontSize: '12px',
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: '#6b8399',
                margin: 0,
                fontFamily: 'var(--font-geist-sans, sans-serif)',
              }}
            >
              LIVE SUMMARY
            </h2>
          </div>
          <Separator style={{ backgroundColor: '#1a2330', marginBottom: 12 }} />
          {summaryData?.summary ? (
            <div className="flex flex-col gap-2">
              <p
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: '#6b8399',
                  margin: '0 0 4px',
                }}
              >
                GOAL
              </p>
              <p style={{ fontSize: '13px', color: '#c8d6e5', lineHeight: 1.5, margin: 0 }}>
                {summaryData.summary.goal}
              </p>
            </div>
          ) : (
            <p style={{ fontSize: '13px', color: '#6b8399', margin: 0 }}>
              Summary will appear as interview progresses.
            </p>
          )}
        </div>

        {/* Interview progress */}
        <div>
          <div style={{ marginBottom: '12px' }}>
            <h2
              style={{
                fontSize: '12px',
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: '#6b8399',
                margin: 0,
                fontFamily: 'var(--font-geist-sans, sans-serif)',
              }}
            >
              INTERVIEW PROGRESS
            </h2>
          </div>
          <Separator style={{ backgroundColor: '#1a2330', marginBottom: 12 }} />
          <div className="flex flex-col gap-2">
            {/* Phase steps */}
            {(['gathering', 'reviewing', 'approved', 'crystallized'] as const).map((step, idx) => {
              const phaseOrder = ['gathering', 'reviewing', 'approved', 'crystallized'];
              const currentIdx = phaseOrder.indexOf(phase);
              const stepIdx = phaseOrder.indexOf(step);
              const isComplete = stepIdx < currentIdx;
              const isCurrent = stepIdx === currentIdx;
              const isPending = stepIdx > currentIdx;

              return (
                <div key={step} className="flex items-center gap-3">
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      flexShrink: 0,
                      backgroundColor: isComplete
                        ? '#00d4aa'
                        : isCurrent
                          ? '#f5a623'
                          : '#3d5166',
                      boxShadow: isCurrent ? '0 0 6px rgba(245, 166, 35, 0.5)' : 'none',
                    }}
                  />
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: isCurrent ? 600 : 400,
                      color: isComplete ? '#00d4aa' : isCurrent ? '#c8d6e5' : '#6b8399',
                      textTransform: 'capitalize',
                      fontFamily: 'var(--font-geist-sans, sans-serif)',
                    }}
                  >
                    {step}
                  </span>
                </div>
              );
            })}

            <div style={{ marginTop: 8 }}>
              <p style={{ fontSize: '12px', color: '#6b8399', margin: 0 }}>
                Turn {transcriptData?.interview?.turnCount ?? 0} completed
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
