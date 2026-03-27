/**
 * tRPC test wrapper for component (unit) tests.
 *
 * Provides a mock tRPC client that matches the shape returned by useTRPC()
 * and a TestProviders wrapper for rendering components that need React Query.
 *
 * Usage:
 *   const trpc = createMockTRPC({
 *     'projects.list': vi.fn().mockResolvedValue([{ id: '1', name: 'Test' }]),
 *   });
 *   render(<TestProviders trpc={trpc}><ProjectListClient /></TestProviders>);
 */
import React from 'react';
import { vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape of a mock query option: queryKey + queryFn */
interface MockQueryOptions<T = unknown> {
  queryKey: unknown[];
  queryFn: () => Promise<T>;
}

/** Shape of a mock mutation option: mutationFn */
interface MockMutationOptions<T = unknown> {
  mutationFn: (...args: unknown[]) => Promise<T>;
}

/** Per-namespace stub shape matching tRPC procedures */
interface RouterNamespaceStub {
  [procedure: string]: {
    queryOptions?: (...args: unknown[]) => MockQueryOptions;
    mutationOptions?: (...args: unknown[]) => MockMutationOptions;
    useSuspenseQuery?: (...args: unknown[]) => unknown;
    useMutation?: (...args: unknown[]) => unknown;
    useQuery?: (...args: unknown[]) => unknown;
    useSubscription?: (...args: unknown[]) => unknown;
  };
}

export interface MockTRPCClient {
  projects: RouterNamespaceStub;
  interview: RouterNamespaceStub;
  execution: RouterNamespaceStub;
  evolution: RouterNamespaceStub;
  costs: RouterNamespaceStub;
  health: RouterNamespaceStub;
}

// ---------------------------------------------------------------------------
// Mock factory
// ---------------------------------------------------------------------------

/**
 * Create a mock tRPC client.
 * Each procedure stub has a no-op queryFn or mutationFn by default.
 *
 * Pass override values as a flat record of "namespace.procedure" → mock function:
 *   createMockTRPC({ 'projects.list': vi.fn().mockResolvedValue([...]) })
 *
 * The returned object matches the shape of `useTRPC()` from @trpc/tanstack-react-query.
 */
export function createMockTRPC(
  overrides: Record<string, (...args: unknown[]) => unknown> = {}
): MockTRPCClient {
  function makeStub(namespace: string, procedures: string[]): RouterNamespaceStub {
    const stub: RouterNamespaceStub = {};
    for (const proc of procedures) {
      const key = `${namespace}.${proc}`;
      const override = overrides[key];
      stub[proc] = {
        queryOptions: (...args: unknown[]): MockQueryOptions => ({
          queryKey: [namespace, proc, ...args],
          queryFn: override
            ? () => override(...args) as Promise<unknown>
            : vi.fn().mockResolvedValue(undefined),
        }),
        mutationOptions: (...args: unknown[]): MockMutationOptions => ({
          mutationFn: override
            ? () => override(...args) as Promise<unknown>
            : vi.fn().mockResolvedValue(undefined),
        }),
        useSuspenseQuery: vi.fn().mockReturnValue({ data: undefined, isLoading: false }),
        useQuery: vi.fn().mockReturnValue({ data: undefined, isLoading: false }),
        useMutation: vi.fn().mockReturnValue({ mutate: vi.fn(), isPending: false }),
        useSubscription: vi.fn().mockReturnValue(undefined),
      };
    }
    return stub;
  }

  return {
    projects: makeStub('projects', [
      'list',
      'byId',
      'create',
      'update',
      'archive',
    ]),
    interview: makeStub('interview', [
      'get',
      'start',
      'sendAnswer',
      'approveSummary',
      'getSuggestions',
    ]),
    execution: makeStub('execution', [
      'getBeads',
      'triggerDecomposition',
      'triggerExecution',
    ]),
    evolution: makeStub('evolution', [
      'getSeedLineage',
      'getLatestSeed',
    ]),
    costs: makeStub('costs', [
      'getProjectCosts',
      'getBeadCosts',
    ]),
    health: makeStub('health', ['check']),
  };
}

// ---------------------------------------------------------------------------
// Test provider wrapper
// ---------------------------------------------------------------------------

interface TestProvidersProps {
  children: React.ReactNode;
  queryClient?: QueryClient;
}

/**
 * Minimal provider wrapper for component tests.
 * Includes QueryClientProvider with retry disabled to avoid test hangs.
 *
 * Usage:
 *   render(<TestProviders><MyComponent /></TestProviders>);
 */
export function TestProviders({ children, queryClient }: TestProvidersProps) {
  const client = queryClient ?? new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });

  return (
    <QueryClientProvider client={client}>
      {children}
    </QueryClientProvider>
  );
}
