import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CircuitBreaker, FAILURE_THRESHOLD, COOLDOWN_MS, WINDOW_MS } from '../circuit-breaker.js';

describe('CircuitBreaker', () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    cb = new CircuitBreaker();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts in CLOSED state: isOpen returns false', () => {
    expect(cb.isOpen('anthropic')).toBe(false);
  });

  it(`opens after ${FAILURE_THRESHOLD} recordFailure calls: isOpen returns true`, () => {
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      cb.recordFailure('anthropic');
    }
    expect(cb.isOpen('anthropic')).toBe(true);
  });

  it('stays closed with fewer than threshold failures', () => {
    for (let i = 0; i < FAILURE_THRESHOLD - 1; i++) {
      cb.recordFailure('mistral');
    }
    expect(cb.isOpen('mistral')).toBe(false);
  });

  it('transitions to HALF_OPEN after cooldown expires: isOpen returns false', () => {
    // Open the circuit
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      cb.recordFailure('anthropic');
    }
    expect(cb.isOpen('anthropic')).toBe(true);

    // Advance past cooldown
    vi.advanceTimersByTime(COOLDOWN_MS + 1);

    // Should now be HALF_OPEN, which allows a probe
    expect(cb.isOpen('anthropic')).toBe(false);
  });

  it('returns to CLOSED after recordSuccess in HALF_OPEN state', () => {
    // Open the circuit
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      cb.recordFailure('google');
    }
    // Advance past cooldown → HALF_OPEN
    vi.advanceTimersByTime(COOLDOWN_MS + 1);
    expect(cb.isOpen('google')).toBe(false); // HALF_OPEN allows probe

    // Successful probe resets to CLOSED
    cb.recordSuccess('google');
    expect(cb.isOpen('google')).toBe(false);

    // Failure count should be zeroed — one more failure should not open the circuit
    cb.recordFailure('google');
    expect(cb.isOpen('google')).toBe(false);
  });

  it('recordSuccess resets failure count to 0', () => {
    cb.recordFailure('anthropic');
    cb.recordFailure('anthropic');
    cb.recordSuccess('anthropic');

    // After success, we should need FAILURE_THRESHOLD new failures to open
    for (let i = 0; i < FAILURE_THRESHOLD - 1; i++) {
      cb.recordFailure('anthropic');
    }
    expect(cb.isOpen('anthropic')).toBe(false);
  });

  it('reset() clears all circuits', () => {
    // Open multiple circuits
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      cb.recordFailure('anthropic');
      cb.recordFailure('mistral');
    }
    expect(cb.isOpen('anthropic')).toBe(true);
    expect(cb.isOpen('mistral')).toBe(true);

    cb.reset();

    expect(cb.isOpen('anthropic')).toBe(false);
    expect(cb.isOpen('mistral')).toBe(false);
  });

  it('circuits are independent: failure in one does not affect another', () => {
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      cb.recordFailure('anthropic');
    }
    expect(cb.isOpen('anthropic')).toBe(true);
    expect(cb.isOpen('mistral')).toBe(false);
    expect(cb.isOpen('google')).toBe(false);
  });

  it('only allows one probe call during HALF_OPEN state', () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker();

    // Open the circuit
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      cb.recordFailure('anthropic');
    }
    expect(cb.isOpen('anthropic')).toBe(true);

    // Advance past cooldown → HALF_OPEN
    vi.advanceTimersByTime(COOLDOWN_MS + 1);

    // First probe: allowed (isOpen returns false)
    expect(cb.isOpen('anthropic')).toBe(false);

    // After the probe call, if it fails, circuit should go back to OPEN
    cb.recordFailure('anthropic');
    expect(cb.isOpen('anthropic')).toBe(true);

    vi.useRealTimers();
  });

  it('window-based reset: old failures outside window do not count', () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker();

    // Record failures just below threshold
    for (let i = 0; i < FAILURE_THRESHOLD - 1; i++) {
      cb.recordFailure('anthropic');
    }
    expect(cb.isOpen('anthropic')).toBe(false);

    // Advance past the failure window
    vi.advanceTimersByTime(WINDOW_MS + 1);

    // Trigger window expiry check (isOpen resets stale failures on CLOSED circuits)
    expect(cb.isOpen('anthropic')).toBe(false);

    // One more failure should NOT open (old failures expired)
    cb.recordFailure('anthropic');
    expect(cb.isOpen('anthropic')).toBe(false);

    vi.useRealTimers();
  });
});
