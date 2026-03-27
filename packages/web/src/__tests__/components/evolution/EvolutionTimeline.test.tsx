import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EvolutionTimeline } from '@/components/evolution/EvolutionTimeline';
import type { GenerationDot } from '@/components/evolution/EvolutionTimeline';

const mockGenerations: GenerationDot[] = [
  { seedId: 'seed-1', generation: 1, status: 'converged', hasLateralThinking: false },
  { seedId: 'seed-2', generation: 2, status: 'active', hasLateralThinking: true },
  { seedId: 'seed-3', generation: 3, status: 'halted', hasLateralThinking: false },
];

describe('EvolutionTimeline', () => {
  it('shows empty state when no generations', () => {
    render(
      <EvolutionTimeline
        generations={[]}
        selectedGeneration={null}
        onSelectGeneration={vi.fn()}
      />
    );
    expect(screen.getByText('No evolution cycles yet')).toBeInTheDocument();
  });

  it('renders generation number labels', () => {
    render(
      <EvolutionTimeline
        generations={mockGenerations}
        selectedGeneration={null}
        onSelectGeneration={vi.fn()}
      />
    );
    // Generation numbers shown below each dot
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('calls onSelectGeneration with correct number when dot clicked', () => {
    const onSelectGeneration = vi.fn();
    render(
      <EvolutionTimeline
        generations={mockGenerations}
        selectedGeneration={null}
        onSelectGeneration={onSelectGeneration}
      />
    );
    // Find dots by title attribute
    const dot1 = document.querySelector('[title="Generation 1 — converged"]') as HTMLElement;
    fireEvent.click(dot1);
    expect(onSelectGeneration).toHaveBeenCalledWith(1);
  });

  it('calls onSelectGeneration with correct generation number', () => {
    const onSelectGeneration = vi.fn();
    render(
      <EvolutionTimeline
        generations={mockGenerations}
        selectedGeneration={1}
        onSelectGeneration={onSelectGeneration}
      />
    );
    const dot2 = document.querySelector('[title="Generation 2 — active"]') as HTMLElement;
    fireEvent.click(dot2);
    expect(onSelectGeneration).toHaveBeenCalledWith(2);
  });

  it('renders lateral thinking spark icon for generations with hasLateralThinking', () => {
    render(
      <EvolutionTimeline
        generations={mockGenerations}
        selectedGeneration={null}
        onSelectGeneration={vi.fn()}
      />
    );
    // Seed 2 has hasLateralThinking=true — Sparkles icon rendered
    // The SVG from lucide should be present
    const sparkles = document.querySelector('svg') as SVGElement;
    expect(sparkles).toBeTruthy();
  });
});
