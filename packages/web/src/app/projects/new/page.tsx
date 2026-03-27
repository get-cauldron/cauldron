'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTRPC } from '@/trpc/client';
import { useMutation } from '@tanstack/react-query';
import { NavSidebar } from '@/components/shell/NavSidebar';

export default function NewProjectPage() {
  const router = useRouter();
  const trpc = useTRPC();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { mutate: createProject, isPending } = useMutation(
    trpc.projects.create.mutationOptions({
      onSuccess: (project) => {
        router.push(`/projects/${project.id}/interview`);
      },
      onError: (err) => {
        setError(err.message ?? 'Failed to create project. Please try again.');
      },
    }),
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Project name is required.');
      return;
    }

    createProject({
      name: trimmedName,
      description: description.trim() || undefined,
    });
  }

  return (
    <div className="flex flex-1 min-h-screen">
      <NavSidebar />
      <main className="flex-1 flex items-center justify-center p-8" style={{ background: '#0a0f14' }}>
        <div
          className="w-full max-w-md rounded-lg p-8"
          style={{ background: '#111820', border: '1px solid #1a2330' }}
        >
          <h1
            className="font-semibold mb-2"
            style={{ fontSize: '20px', fontWeight: 600, color: '#c8d6e5' }}
          >
            New Project
          </h1>
          <p className="text-sm mb-8" style={{ color: '#6b8399' }}>
            Give your project a name, then Cauldron will start the interview.
          </p>

          <form onSubmit={handleSubmit} noValidate>
            <div className="mb-5">
              <label
                htmlFor="project-name"
                className="block text-xs font-semibold uppercase tracking-wide mb-2"
                style={{ letterSpacing: '0.08em', color: '#6b8399' }}
              >
                Project Name <span style={{ color: '#e5484d' }}>*</span>
              </label>
              <input
                id="project-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Bulk file renamer"
                required
                disabled={isPending}
                maxLength={100}
                className="w-full rounded-md px-3 py-2 text-sm transition-colors"
                style={{
                  background: '#1a2330',
                  border: `1px solid ${error && !name.trim() ? '#e5484d' : '#1a2330'}`,
                  color: '#c8d6e5',
                  outline: 'none',
                  minHeight: '44px',
                }}
                onFocus={(e) => {
                  e.target.style.border = '1px solid #00d4aa';
                  e.target.style.outline = '2px solid #00d4aa';
                  e.target.style.outlineOffset = '2px';
                }}
                onBlur={(e) => {
                  e.target.style.border = '1px solid #1a2330';
                  e.target.style.outline = 'none';
                }}
              />
            </div>

            <div className="mb-6">
              <label
                htmlFor="project-description"
                className="block text-xs font-semibold uppercase tracking-wide mb-2"
                style={{ letterSpacing: '0.08em', color: '#6b8399' }}
              >
                Description{' '}
                <span className="normal-case font-normal" style={{ color: '#6b8399' }}>
                  (optional)
                </span>
              </label>
              <textarea
                id="project-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of what you want to build..."
                disabled={isPending}
                maxLength={500}
                rows={3}
                className="w-full rounded-md px-3 py-2 text-sm transition-colors resize-none"
                style={{
                  background: '#1a2330',
                  border: '1px solid #1a2330',
                  color: '#c8d6e5',
                  outline: 'none',
                }}
                onFocus={(e) => {
                  e.target.style.border = '1px solid #00d4aa';
                  e.target.style.outline = '2px solid #00d4aa';
                  e.target.style.outlineOffset = '2px';
                }}
                onBlur={(e) => {
                  e.target.style.border = '1px solid #1a2330';
                  e.target.style.outline = 'none';
                }}
              />
            </div>

            {error && (
              <p className="mb-4 text-xs" style={{ color: '#e5484d' }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isPending || !name.trim()}
              className="w-full rounded-md font-semibold text-sm transition-colors"
              style={{
                background: isPending || !name.trim() ? '#1a2330' : '#00d4aa',
                color: isPending || !name.trim() ? '#6b8399' : '#0a0f14',
                minHeight: '44px',
                cursor: isPending || !name.trim() ? 'not-allowed' : 'pointer',
                opacity: isPending ? 0.6 : 1,
              }}
            >
              {isPending ? 'Creating…' : 'Start Building'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
