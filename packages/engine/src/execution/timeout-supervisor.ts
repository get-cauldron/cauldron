import type { ChildProcess } from 'node:child_process';
import type { TimeoutConfig } from './types.js';

export type TimeoutStatus = 'running' | 'idle_warning' | 'soft_timeout' | 'hard_timeout' | 'stopped';

export interface TimeoutCallbacks {
  onIdleWarning?: (elapsedMinutes: number) => void;
  onSoftTimeout?: (elapsedMinutes: number) => void;
  onHardTimeout?: (elapsedMinutes: number) => void;
}

const DEFAULT_CONFIG: TimeoutConfig = {
  idleMinutes: 5,
  softTimeoutPercent: 80,
  hardTimeoutMinutes: 30,
};

/**
 * TimeoutSupervisor tracks three timeout thresholds for agent execution (D-24):
 *
 * - Idle warning:  no file activity for idleMinutes (default 5)
 * - Soft timeout:  at softTimeoutPercent% of hardTimeoutMinutes (default 80% = 24min)
 * - Hard timeout:  absolute limit at hardTimeoutMinutes (default 30min)
 *
 * Callbacks fire once per threshold crossing. stop() cancels all timers.
 * CONC-03: setKillTarget() wires a ChildProcess for enforced kill on hard timeout.
 */
export class TimeoutSupervisor {
  private status: TimeoutStatus = 'stopped';
  private startTime: number = 0;
  private lastActivityTime: number = 0;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private softTimer: ReturnType<typeof setTimeout> | null = null;
  private hardTimer: ReturnType<typeof setTimeout> | null = null;
  private killTarget: ChildProcess | null = null;
  private killGraceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly config: TimeoutConfig;
  private readonly callbacks: TimeoutCallbacks;

  constructor(config?: Partial<TimeoutConfig>, callbacks: TimeoutCallbacks = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.callbacks = callbacks;
  }

  /**
   * Start tracking. Sets all three timers.
   * Idempotent if called while already running — use stop() first to restart.
   */
  start(): void {
    this.startTime = Date.now();
    this.lastActivityTime = this.startTime;
    this.status = 'running';

    // Idle timer: resets on activity
    this.resetIdleTimer();

    // Soft timeout: fires at softTimeoutPercent% of hardTimeoutMinutes
    const softMs =
      (this.config.hardTimeoutMinutes * (this.config.softTimeoutPercent / 100)) * 60 * 1000;
    this.softTimer = setTimeout(() => {
      this.status = 'soft_timeout';
      this.callbacks.onSoftTimeout?.(this.getElapsedMinutes());
    }, softMs);

    // Hard timeout: absolute maximum
    const hardMs = this.config.hardTimeoutMinutes * 60 * 1000;
    this.hardTimer = setTimeout(() => {
      this.status = 'hard_timeout';
      this.callbacks.onHardTimeout?.(this.getElapsedMinutes());
      // CONC-03: Enforce kill on hung agent process
      if (this.killTarget) {
        this.killTarget.kill('SIGTERM');
        this.killGraceTimer = setTimeout(() => {
          if (this.killTarget) {
            this.killTarget.kill('SIGKILL');
          }
        }, 5_000);
      }
    }, hardMs);
  }

  /**
   * Record that agent activity occurred (e.g., file write).
   * Resets the idle timer and clears idle_warning status.
   */
  recordActivity(): void {
    this.lastActivityTime = Date.now();
    if (this.status === 'idle_warning') {
      this.status = 'running';
    }
    this.resetIdleTimer();
  }

  /** Get current timeout status. */
  getStatus(): TimeoutStatus {
    return this.status;
  }

  /** Get elapsed time in minutes since start(). */
  getElapsedMinutes(): number {
    return (Date.now() - this.startTime) / 60_000;
  }

  /**
   * Register the ChildProcess to kill when the hard timeout fires (CONC-03).
   * Replaces any previously registered target.
   * Subscribes to 'exit' to cancel the SIGKILL grace timer if the process exits cleanly.
   */
  setKillTarget(proc: ChildProcess): void {
    // Clear any existing grace timer from a previous target
    if (this.killGraceTimer !== null) {
      clearTimeout(this.killGraceTimer);
      this.killGraceTimer = null;
    }
    this.killTarget = proc;
    // Cancel SIGKILL if process exits on its own before grace period expires
    proc.once('exit', () => {
      if (this.killGraceTimer !== null) {
        clearTimeout(this.killGraceTimer);
        this.killGraceTimer = null;
      }
      this.killTarget = null;
    });
  }

  /**
   * Stop all timers. No further callbacks will fire after this call.
   * Also clears any pending kill grace timer (CONC-03).
   */
  stop(): void {
    if (this.idleTimer !== null) clearTimeout(this.idleTimer);
    if (this.softTimer !== null) clearTimeout(this.softTimer);
    if (this.hardTimer !== null) clearTimeout(this.hardTimer);
    if (this.killGraceTimer !== null) clearTimeout(this.killGraceTimer);
    this.idleTimer = null;
    this.softTimer = null;
    this.hardTimer = null;
    this.killGraceTimer = null;
    this.killTarget = null;
    this.status = 'stopped';
  }

  private resetIdleTimer(): void {
    if (this.idleTimer !== null) clearTimeout(this.idleTimer);
    const idleMs = this.config.idleMinutes * 60 * 1000;
    this.idleTimer = setTimeout(() => {
      this.status = 'idle_warning';
      this.callbacks.onIdleWarning?.(this.getElapsedMinutes());
    }, idleMs);
  }
}
