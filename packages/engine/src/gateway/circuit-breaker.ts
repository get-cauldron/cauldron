import type { ProviderFamily } from './types.js';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface ProviderCircuit {
  state: CircuitState;
  failureCount: number;
  lastFailureAt: number;
  openedAt: number | null;
}

export const FAILURE_THRESHOLD = 3;
export const COOLDOWN_MS = 60_000;
export const WINDOW_MS = 120_000;

function makeDefaultCircuit(): ProviderCircuit {
  return { state: 'CLOSED', failureCount: 0, lastFailureAt: 0, openedAt: null };
}

export class CircuitBreaker {
  private circuits: Map<ProviderFamily, ProviderCircuit> = new Map();

  private getCircuit(provider: ProviderFamily): ProviderCircuit {
    if (!this.circuits.has(provider)) {
      this.circuits.set(provider, makeDefaultCircuit());
    }
    return this.circuits.get(provider)!;
  }

  isOpen(provider: ProviderFamily): boolean {
    const circuit = this.getCircuit(provider);
    const now = Date.now();

    // If CLOSED, check whether the window has expired (reset if so)
    if (circuit.state === 'CLOSED') {
      if (circuit.lastFailureAt > 0 && now - circuit.lastFailureAt > WINDOW_MS) {
        this.circuits.set(provider, makeDefaultCircuit());
      }
      return false;
    }

    // If OPEN, check whether cooldown has elapsed → transition to HALF_OPEN
    if (circuit.state === 'OPEN') {
      if (circuit.openedAt !== null && now - circuit.openedAt >= COOLDOWN_MS) {
        circuit.state = 'HALF_OPEN';
        return false;
      }
      return true;
    }

    // HALF_OPEN — allow a probe attempt
    return false;
  }

  recordFailure(provider: ProviderFamily): void {
    const circuit = this.getCircuit(provider);
    const now = Date.now();
    circuit.failureCount += 1;
    circuit.lastFailureAt = now;
    if (circuit.failureCount >= FAILURE_THRESHOLD) {
      circuit.state = 'OPEN';
      circuit.openedAt = now;
    }
  }

  recordSuccess(provider: ProviderFamily): void {
    this.circuits.set(provider, makeDefaultCircuit());
  }

  reset(): void {
    this.circuits.clear();
  }
}
