'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useTRPC } from '@/trpc/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';

const PIPELINE_STAGES = [
  { key: 'interview', label: 'INTERVIEW', placeholder: 'gpt-4.1' },
  { key: 'holdout', label: 'HOLDOUT GENERATION', placeholder: 'claude-opus-4-5' },
  { key: 'decomposition', label: 'DECOMPOSITION', placeholder: 'gpt-4.1' },
  { key: 'execution', label: 'EXECUTION', placeholder: 'gpt-4.1-mini' },
  { key: 'evaluation', label: 'EVALUATION', placeholder: 'gemini-2.5-pro' },
];

export default function SettingsPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  const projectQuery = useQuery(
    trpc.projects.byId.queryOptions({ id: projectId }),
  );

  const project = projectQuery.data;
  const settings = project?.settings ?? {};

  // Form state
  const [budgetLimitCents, setBudgetLimitCents] = useState('');
  const [maxConcurrentBeads, setMaxConcurrentBeads] = useState('');
  const [modelOverrides, setModelOverrides] = useState<Record<string, string>>({});
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Sync form state from loaded settings
  useEffect(() => {
    if (settings) {
      setBudgetLimitCents(
        settings.budgetLimitCents != null ? String(settings.budgetLimitCents) : '',
      );
      setMaxConcurrentBeads(
        settings.maxConcurrentBeads != null ? String(settings.maxConcurrentBeads) : '',
      );
      // Load model overrides from settings.models
      const overrides: Record<string, string> = {};
      for (const stage of PIPELINE_STAGES) {
        const models = settings.models?.[stage.key];
        overrides[stage.key] = models ? models.join(', ') : '';
      }
      setModelOverrides(overrides);
    }
    // Only run when project loads
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  const updateSettingsMutation = useMutation(
    trpc.projects.updateSettings.mutationOptions({
      onSuccess: () => {
        toast.success('Settings saved');
        void queryClient.invalidateQueries(trpc.projects.byId.queryFilter({ id: projectId }));
      },
      onError: (err) => {
        toast.error(err.message || 'Failed to save settings');
      },
    }),
  );

  const archiveMutation = useMutation(
    trpc.projects.archive.mutationOptions({
      onSuccess: () => {
        toast.success('Project deleted');
        router.push('/projects');
      },
      onError: (err) => {
        toast.error(err.message || 'Failed to delete project');
      },
    }),
  );

  function handleSave() {
    // Parse budget fields
    const budgetCents = budgetLimitCents.trim()
      ? Number(budgetLimitCents.trim())
      : undefined;
    const maxBeads = maxConcurrentBeads.trim()
      ? Number(maxConcurrentBeads.trim())
      : undefined;

    // Build model overrides
    const models: Record<string, string[]> = {};
    for (const stage of PIPELINE_STAGES) {
      const raw = modelOverrides[stage.key]?.trim();
      if (raw) {
        models[stage.key] = raw.split(',').map((m) => m.trim()).filter(Boolean);
      }
    }

    updateSettingsMutation.mutate({
      id: projectId,
      settings: {
        ...(budgetCents != null ? { budgetLimitCents: budgetCents } : {}),
        ...(maxBeads != null ? { maxConcurrentBeads: maxBeads } : {}),
        ...(Object.keys(models).length > 0 ? { models } : {}),
      },
    });
  }

  function handleDelete() {
    archiveMutation.mutate({ id: projectId });
  }

  if (projectQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        Loading settings...
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      {/* Budget Configuration */}
      <Card>
        <CardHeader>
          <CardTitle
            className="text-xs font-semibold tracking-widest uppercase"
            style={{ color: '#6b8399', letterSpacing: '0.08em' }}
          >
            BUDGET
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: '#c8d6e5' }}>
              Budget Limit (cents)
            </label>
            <Input
              type="number"
              min={0}
              placeholder="No limit"
              value={budgetLimitCents}
              onChange={(e) => setBudgetLimitCents(e.target.value)}
            />
            <p className="text-xs" style={{ color: '#6b8399' }}>
              Maximum token spend in cents. Leave blank for no limit.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: '#c8d6e5' }}>
              Max Concurrent Beads
            </label>
            <Input
              type="number"
              min={1}
              placeholder="Default (4)"
              value={maxConcurrentBeads}
              onChange={(e) => setMaxConcurrentBeads(e.target.value)}
            />
            <p className="text-xs" style={{ color: '#6b8399' }}>
              Maximum number of beads executing simultaneously.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Model Overrides */}
      <Card>
        <CardHeader>
          <CardTitle
            className="text-xs font-semibold tracking-widest uppercase"
            style={{ color: '#6b8399', letterSpacing: '0.08em' }}
          >
            MODEL OVERRIDES
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs" style={{ color: '#6b8399' }}>
            Override default model assignments for this project&apos;s pipeline stages.
          </p>
          <div className="space-y-3">
            {PIPELINE_STAGES.map((stage) => (
              <div key={stage.key} className="space-y-1.5">
                <label
                  className="text-xs font-medium tracking-widest uppercase"
                  style={{ color: '#c8d6e5', letterSpacing: '0.04em' }}
                >
                  {stage.label}
                </label>
                <Input
                  type="text"
                  placeholder={stage.placeholder}
                  value={modelOverrides[stage.key] ?? ''}
                  onChange={(e) =>
                    setModelOverrides((prev) => ({
                      ...prev,
                      [stage.key]: e.target.value,
                    }))
                  }
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={updateSettingsMutation.isPending}
        >
          {updateSettingsMutation.isPending ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>

      <Separator />

      {/* Danger Zone */}
      <Card style={{ borderColor: '#e5484d' }}>
        <CardHeader>
          <CardTitle
            className="text-xs font-semibold tracking-widest uppercase"
            style={{ color: '#e5484d', letterSpacing: '0.08em' }}
          >
            DANGER ZONE
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium" style={{ color: '#c8d6e5' }}>
                Delete Project
              </p>
              <p className="text-xs mt-0.5" style={{ color: '#6b8399' }}>
                Permanently remove this project and all associated data.
              </p>
            </div>
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
              <DialogTrigger
                render={<Button variant="destructive" />}
              >
                Delete Project
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete project?</DialogTitle>
                  <DialogDescription>
                    Permanently delete{' '}
                    <span className="font-semibold text-foreground">
                      {project?.name ?? 'this project'}
                    </span>{' '}
                    and all associated seeds, beads, and history? This cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setDeleteDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleDelete}
                    disabled={archiveMutation.isPending}
                  >
                    {archiveMutation.isPending ? 'Deleting...' : 'Delete Project'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
