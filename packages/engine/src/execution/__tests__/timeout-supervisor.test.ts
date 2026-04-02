import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { TimeoutSupervisor } from '../timeout-supervisor.js';
import type { TimeoutCallbacks } from '../timeout-supervisor.js';
import type { ChildProcess } from 'node:child_process';

/** Create a minimal mock ChildProcess for kill target tests */
function makeMockProcess(): ChildProcess & { kill: ReturnType<typeof vi.fn> } {
  const emitter = new EventEmitter();
  const killMock = vi.fn();
  return Object.assign(emitter, { kill: killMock }) as unknown as ChildProcess & {
    kill: ReturnType<typeof vi.fn>;
  };
}

describe('TimeoutSupervisor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('start() begins tracking and getStatus() returns running', () => {
    const supervisor = new TimeoutSupervisor();
    supervisor.start();
    expect(supervisor.getStatus()).toBe('running');
  });

  it('getStatus() returns stopped before start() is called', () => {
    const supervisor = new TimeoutSupervisor();
    expect(supervisor.getStatus()).toBe('stopped');
  });

  it('idle timeout fires callback after idleMinutes with no activity', () => {
    const onIdleWarning = vi.fn();
    const supervisor = new TimeoutSupervisor(
      { idleMinutes: 5, softTimeoutPercent: 80, hardTimeoutMinutes: 30 },
      { onIdleWarning }
    );
    supervisor.start();

    // Advance to just before idle timeout (4min 59s)
    vi.advanceTimersByTime(4 * 60 * 1000 + 59 * 1000);
    expect(onIdleWarning).not.toHaveBeenCalled();
    expect(supervisor.getStatus()).toBe('running');

    // Advance past idle timeout
    vi.advanceTimersByTime(1001);
    expect(onIdleWarning).toHaveBeenCalledOnce();
    expect(supervisor.getStatus()).toBe('idle_warning');
  });

  it('recordActivity() resets the idle timer', () => {
    const onIdleWarning = vi.fn();
    const supervisor = new TimeoutSupervisor(
      { idleMinutes: 5, softTimeoutPercent: 80, hardTimeoutMinutes: 30 },
      { onIdleWarning }
    );
    supervisor.start();

    // Advance to 4 minutes (before idle would fire)
    vi.advanceTimersByTime(4 * 60 * 1000);
    expect(onIdleWarning).not.toHaveBeenCalled();

    // Record activity — resets idle timer
    supervisor.recordActivity();

    // Advance another 4 minutes (still under idle threshold from last activity)
    vi.advanceTimersByTime(4 * 60 * 1000);
    expect(onIdleWarning).not.toHaveBeenCalled();
    expect(supervisor.getStatus()).toBe('running');

    // Now advance past the full idle threshold
    vi.advanceTimersByTime(61 * 1000);
    expect(onIdleWarning).toHaveBeenCalledOnce();
  });

  it('recordActivity() resets status from idle_warning back to running', () => {
    const supervisor = new TimeoutSupervisor(
      { idleMinutes: 5, softTimeoutPercent: 80, hardTimeoutMinutes: 30 },
      {}
    );
    supervisor.start();

    // Trigger idle warning
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    expect(supervisor.getStatus()).toBe('idle_warning');

    // Activity should reset status
    supervisor.recordActivity();
    expect(supervisor.getStatus()).toBe('running');
  });

  it('soft timeout fires callback at 80% of hard timeout minutes', () => {
    const onSoftTimeout = vi.fn();
    const supervisor = new TimeoutSupervisor(
      { idleMinutes: 5, softTimeoutPercent: 80, hardTimeoutMinutes: 30 },
      { onSoftTimeout }
    );
    supervisor.start();

    // 80% of 30min = 24min
    vi.advanceTimersByTime(24 * 60 * 1000 - 1);
    expect(onSoftTimeout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onSoftTimeout).toHaveBeenCalledOnce();
    expect(supervisor.getStatus()).toBe('soft_timeout');
  });

  it('hard timeout fires callback at hardTimeoutMinutes', () => {
    const onHardTimeout = vi.fn();
    const supervisor = new TimeoutSupervisor(
      { idleMinutes: 5, softTimeoutPercent: 80, hardTimeoutMinutes: 30 },
      { onHardTimeout }
    );
    supervisor.start();

    // 30min hard timeout
    vi.advanceTimersByTime(30 * 60 * 1000 - 1);
    expect(onHardTimeout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onHardTimeout).toHaveBeenCalledOnce();
    expect(supervisor.getStatus()).toBe('hard_timeout');
  });

  it('stop() clears all timers and prevents further callbacks', () => {
    const onIdleWarning = vi.fn();
    const onSoftTimeout = vi.fn();
    const onHardTimeout = vi.fn();
    const supervisor = new TimeoutSupervisor(
      { idleMinutes: 5, softTimeoutPercent: 80, hardTimeoutMinutes: 30 },
      { onIdleWarning, onSoftTimeout, onHardTimeout }
    );
    supervisor.start();

    // Stop before any timeouts fire
    supervisor.stop();
    expect(supervisor.getStatus()).toBe('stopped');

    // Advance past all timeouts — no callbacks should fire
    vi.advanceTimersByTime(31 * 60 * 1000);
    expect(onIdleWarning).not.toHaveBeenCalled();
    expect(onSoftTimeout).not.toHaveBeenCalled();
    expect(onHardTimeout).not.toHaveBeenCalled();
  });

  it('getStatus() returns correct status across state transitions', () => {
    const supervisor = new TimeoutSupervisor(
      { idleMinutes: 5, softTimeoutPercent: 80, hardTimeoutMinutes: 30 },
      {}
    );

    expect(supervisor.getStatus()).toBe('stopped');
    supervisor.start();
    expect(supervisor.getStatus()).toBe('running');

    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    expect(supervisor.getStatus()).toBe('idle_warning');

    vi.advanceTimersByTime(24 * 60 * 1000);
    // After 24min total, soft timeout (24min) should have fired
    // But idle_warning was already set — soft_timeout overrides it since 24+5=29min total from start
    // Wait: soft timeout is from START time (24min), not from idle warning
    // So after 5min idle fires, then at 24min mark soft fires
    expect(supervisor.getStatus()).toBe('soft_timeout');
  });

  it('default config uses idleMinutes=5, softTimeoutPercent=80, hardTimeoutMinutes=30', () => {
    const onIdleWarning = vi.fn();
    const onSoftTimeout = vi.fn();
    const onHardTimeout = vi.fn();

    // Construct with no config (use defaults)
    const supervisor = new TimeoutSupervisor(undefined, {
      onIdleWarning,
      onSoftTimeout,
      onHardTimeout,
    });
    supervisor.start();

    // Default idle: 5 min
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    expect(onIdleWarning).toHaveBeenCalledOnce();

    // Default soft: 80% of 30 = 24 min from start
    vi.advanceTimersByTime((24 - 5) * 60 * 1000);
    expect(onSoftTimeout).toHaveBeenCalledOnce();

    // Default hard: 30 min from start
    vi.advanceTimersByTime((30 - 24) * 60 * 1000);
    expect(onHardTimeout).toHaveBeenCalledOnce();
  });

  it('custom config overrides default values', () => {
    const onIdleWarning = vi.fn();
    const onHardTimeout = vi.fn();

    const supervisor = new TimeoutSupervisor(
      { idleMinutes: 2, softTimeoutPercent: 50, hardTimeoutMinutes: 10 },
      { onIdleWarning, onHardTimeout }
    );
    supervisor.start();

    // Custom idle: 2 min
    vi.advanceTimersByTime(2 * 60 * 1000 + 1);
    expect(onIdleWarning).toHaveBeenCalledOnce();

    // Custom hard: 10 min
    vi.advanceTimersByTime((10 - 2) * 60 * 1000);
    expect(onHardTimeout).toHaveBeenCalledOnce();
  });
});

describe('TimeoutSupervisor — kill target (CONC-03)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('setKillTarget stores the process reference', () => {
    const supervisor = new TimeoutSupervisor(
      { idleMinutes: 5, softTimeoutPercent: 80, hardTimeoutMinutes: 30 },
      {}
    );
    const proc = makeMockProcess();
    supervisor.setKillTarget(proc);
    // The target is stored — no throws, kill not called yet
    expect(proc.kill).not.toHaveBeenCalled();
  });

  it('hard timeout sends SIGTERM to kill target', () => {
    const supervisor = new TimeoutSupervisor(
      { idleMinutes: 5, softTimeoutPercent: 80, hardTimeoutMinutes: 1 },
      {}
    );
    const proc = makeMockProcess();
    supervisor.setKillTarget(proc);
    supervisor.start();

    // Advance to hard timeout (1 min)
    vi.advanceTimersByTime(1 * 60 * 1000);
    expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('SIGKILL follows SIGTERM after 5s grace period', () => {
    const supervisor = new TimeoutSupervisor(
      { idleMinutes: 5, softTimeoutPercent: 80, hardTimeoutMinutes: 1 },
      {}
    );
    const proc = makeMockProcess();
    supervisor.setKillTarget(proc);
    supervisor.start();

    // Trigger hard timeout → SIGTERM
    vi.advanceTimersByTime(1 * 60 * 1000);
    expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
    expect(proc.kill).toHaveBeenCalledTimes(1);

    // Advance grace period (4999ms — SIGKILL should not fire yet)
    vi.advanceTimersByTime(4999);
    expect(proc.kill).toHaveBeenCalledTimes(1);

    // Advance 1ms more — SIGKILL fires
    vi.advanceTimersByTime(1);
    expect(proc.kill).toHaveBeenCalledWith('SIGKILL');
    expect(proc.kill).toHaveBeenCalledTimes(2);
  });

  it('process exit before grace period cancels SIGKILL', () => {
    const supervisor = new TimeoutSupervisor(
      { idleMinutes: 5, softTimeoutPercent: 80, hardTimeoutMinutes: 1 },
      {}
    );
    const proc = makeMockProcess();
    supervisor.setKillTarget(proc);
    supervisor.start();

    // Trigger hard timeout → SIGTERM
    vi.advanceTimersByTime(1 * 60 * 1000);
    expect(proc.kill).toHaveBeenCalledWith('SIGTERM');

    // Process exits before grace period
    proc.emit('exit', 0, null);

    // Grace period passes — SIGKILL should NOT fire (timer was cleared)
    vi.advanceTimersByTime(6000);
    expect(proc.kill).toHaveBeenCalledTimes(1);
    expect(proc.kill).not.toHaveBeenCalledWith('SIGKILL');
  });

  it('stop() clears killGraceTimer preventing stale SIGKILL', () => {
    const supervisor = new TimeoutSupervisor(
      { idleMinutes: 5, softTimeoutPercent: 80, hardTimeoutMinutes: 1 },
      {}
    );
    const proc = makeMockProcess();
    supervisor.setKillTarget(proc);
    supervisor.start();

    // Trigger hard timeout → SIGTERM + grace timer set
    vi.advanceTimersByTime(1 * 60 * 1000);
    expect(proc.kill).toHaveBeenCalledWith('SIGTERM');

    // stop() should clear the grace timer
    supervisor.stop();

    // Advance past grace period — SIGKILL should not fire
    vi.advanceTimersByTime(6000);
    expect(proc.kill).toHaveBeenCalledTimes(1);
    expect(proc.kill).not.toHaveBeenCalledWith('SIGKILL');
  });

  it('setKillTarget replaces previous target and clears old grace timer', () => {
    const supervisor = new TimeoutSupervisor(
      { idleMinutes: 5, softTimeoutPercent: 80, hardTimeoutMinutes: 1 },
      {}
    );
    const proc1 = makeMockProcess();
    const proc2 = makeMockProcess();

    // Set first target and trigger hard timeout
    supervisor.setKillTarget(proc1);
    supervisor.start();
    vi.advanceTimersByTime(1 * 60 * 1000);
    expect(proc1.kill).toHaveBeenCalledWith('SIGTERM');

    // Replace target mid-grace — proc2 becomes the new kill target
    supervisor.setKillTarget(proc2);

    // Advance past grace — SIGKILL should not fire on proc1 (timer was cleared by setKillTarget)
    vi.advanceTimersByTime(6000);
    expect(proc1.kill).toHaveBeenCalledTimes(1); // only SIGTERM, not SIGKILL
    expect(proc2.kill).not.toHaveBeenCalled();   // new target not killed mid-execution
  });
});
