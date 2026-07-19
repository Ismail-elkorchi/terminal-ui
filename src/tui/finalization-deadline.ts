import { diagnostic } from '../diagnostics.ts';
import { errorFromUnknown } from '../errors.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { TerminalClock } from '../host/index.ts';

const FINALIZATION_TIMER_CLOSED = Symbol('terminal-ui.finalization-timer-closed');

export type TuiFinalizationPhase =
  | 'output'
  | 'input'
  | 'runtime'
  | 'onExit'
  | 'restore'
  | 'flush'
  | 'host';

export type TuiFinalizationPhaseStatus = 'settled' | 'failed' | 'timed_out';

export interface TuiFinalizationPhaseResult {
  readonly phase: TuiFinalizationPhase;
  readonly status: TuiFinalizationPhaseStatus;
  readonly diagnostic?: TerminalDiagnostic;
}

export class TuiFinalizationDeadline {
  readonly #clock: TerminalClock;
  readonly #controller = new AbortController();
  readonly #expiresAt: number;
  readonly #owner: string;
  readonly #timerController = new AbortController();
  readonly #timer: Promise<void>;
  #clockDiagnostic: TerminalDiagnostic | undefined;

  constructor(clock: TerminalClock, owner: string, timeoutMs: number) {
    this.#clock = clock;
    this.#owner = owner;
    this.#expiresAt = clock.monotonicNow() + timeoutMs;
    this.#timer = Promise.resolve()
      .then(() => clock.sleep(timeoutMs, this.#timerController.signal))
      .then(() => {
        if (!this.#timerController.signal.aborted) this.#controller.abort('finalization_deadline');
      })
      .catch((cause: unknown) => {
        if (
          this.#timerController.signal.aborted
          && this.#timerController.signal.reason === FINALIZATION_TIMER_CLOSED
        ) return;
        this.#clockDiagnostic = diagnostic('TUI_CLEANUP_FAILED', 'TUI finalization clock failed.', {
          target: this.#owner,
          cause,
          data: { phase: 'clock' }
        });
        this.#controller.abort('finalization_clock_failed');
      });
  }

  get signal(): AbortSignal {
    return this.#controller.signal;
  }

  remainingMs(): number {
    return Math.max(0, this.#expiresAt - this.#clock.monotonicNow());
  }

  clockDiagnostic(): TerminalDiagnostic | undefined {
    return this.#clockDiagnostic;
  }

  async run(
    phase: TuiFinalizationPhase,
    operation: (signal: AbortSignal) => Promise<void>
  ): Promise<TuiFinalizationPhaseResult> {
    let running: Promise<void>;
    try {
      running = operation(this.#controller.signal);
    } catch (cause) {
      running = Promise.reject(errorFromUnknown(cause));
    }
    const completion = running
      .then(() => ({ phase, status: 'settled' as const }))
      .catch((cause: unknown) => ({
        phase,
        status: 'failed' as const,
        diagnostic: diagnostic('TUI_CLEANUP_FAILED', `TUI finalization failed: ${phase}.`, {
          target: this.#owner,
          cause,
          data: { phase }
        })
      }));
    const timedOut = waitForAbort(this.#controller.signal).then(() => ({
      phase,
      status: 'timed_out' as const,
      diagnostic: diagnostic('TUI_CLEANUP_TIMEOUT', `TUI finalization deadline expired during ${phase}.`, {
        target: this.#owner,
        data: { phase, remainingMs: this.remainingMs() }
      })
    }));
    return Promise.race([completion, timedOut]);
  }

  async close(): Promise<void> {
    this.#timerController.abort(FINALIZATION_TIMER_CLOSED);
    await this.#timer;
  }
}

function waitForAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const aborted = (): void => {
      signal.removeEventListener('abort', aborted);
      resolve();
    };
    signal.addEventListener('abort', aborted, { once: true });
  });
}
