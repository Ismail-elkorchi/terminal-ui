import { diagnostic } from '../diagnostics.ts';
import { errorFromUnknown } from '../errors.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { TerminalClock } from '../host/index.ts';

const PHASE_TIMER_CLOSED = Symbol('terminal-ui.phase-timer-closed');

export type TuiLifecyclePhase =
  | 'capabilities'
  | 'session'
  | 'setup'
  | 'runtime_start'
  | 'output'
  | 'input'
  | 'runtime'
  | 'onExit'
  | 'restore'
  | 'flush'
  | 'host';

export type TuiLifecyclePhaseStatus = 'settled' | 'failed' | 'timed_out';

export type TuiLifecyclePhaseOutcome<TValue> =
  | { readonly phase: TuiLifecyclePhase; readonly status: 'settled'; readonly value: TValue }
  | {
      readonly phase: TuiLifecyclePhase;
      readonly status: 'failed' | 'timed_out';
      readonly diagnostic: TerminalDiagnostic;
    };

export interface TuiLifecyclePhaseResult {
  readonly phase: TuiLifecyclePhase;
  readonly status: TuiLifecyclePhaseStatus;
  readonly diagnostic?: TerminalDiagnostic;
}

export async function runTuiLifecyclePhase<TValue>(input: {
  readonly clock: TerminalClock;
  readonly target: string;
  readonly phase: TuiLifecyclePhase;
  readonly timeoutMs: number;
  readonly operation: (signal: AbortSignal) => TValue | Promise<TValue>;
}): Promise<TuiLifecyclePhaseOutcome<TValue>> {
  const operationController = new AbortController();
  const timerController = new AbortController();
  let closed = false;
  const timeout = Promise.resolve()
    .then(() => input.clock.sleep(input.timeoutMs, timerController.signal))
    .then<TuiLifecyclePhaseOutcome<TValue>>(() => {
      if (closed) return new Promise<TuiLifecyclePhaseOutcome<TValue>>(() => undefined);
      operationController.abort('lifecycle_phase_timeout');
      return {
        phase: input.phase,
        status: 'timed_out',
        diagnostic: phaseDiagnostic(input.target, input.phase, 'timed_out')
      };
    })
    .catch<TuiLifecyclePhaseOutcome<TValue>>((cause: unknown) => {
      if (timerController.signal.aborted && timerController.signal.reason === PHASE_TIMER_CLOSED) {
        return new Promise<TuiLifecyclePhaseOutcome<TValue>>(() => undefined);
      }
      operationController.abort('lifecycle_clock_failed');
      return {
        phase: input.phase,
        status: 'failed',
        diagnostic: diagnostic('TUI_CLEANUP_FAILED', 'TUI lifecycle clock failed.', {
          target: input.target,
          cause: errorFromUnknown(cause),
          data: { phase: input.phase }
        })
      };
    });
  const completion: Promise<TuiLifecyclePhaseOutcome<TValue>> = Promise.resolve()
    .then(() => input.operation(operationController.signal))
    .then(
      (value) => ({ phase: input.phase, status: 'settled', value }),
      (cause: unknown) => ({
        phase: input.phase,
        status: 'failed',
        diagnostic: phaseDiagnostic(input.target, input.phase, 'failed', cause)
      })
    );
  const outcome = await Promise.race([completion, timeout]);
  closed = true;
  timerController.abort(PHASE_TIMER_CLOSED);
  return outcome;
}

export function lifecyclePhaseResult(
  outcome: TuiLifecyclePhaseOutcome<unknown>
): TuiLifecyclePhaseResult {
  return outcome.status === 'settled'
    ? { phase: outcome.phase, status: outcome.status }
    : { phase: outcome.phase, status: outcome.status, diagnostic: outcome.diagnostic };
}

function phaseDiagnostic(
  target: string,
  phase: TuiLifecyclePhase,
  status: 'failed' | 'timed_out',
  cause?: unknown
): TerminalDiagnostic {
  const startup = phase === 'capabilities' || phase === 'session' || phase === 'setup' || phase === 'runtime_start';
  const code = startup
    ? status === 'timed_out' ? 'TUI_STARTUP_TIMEOUT' : 'TUI_STARTUP_FAILED'
    : status === 'timed_out' ? 'TUI_CLEANUP_TIMEOUT' : 'TUI_CLEANUP_FAILED';
  return diagnostic(code, `TUI ${startup ? 'startup' : 'finalization'} ${status.replace('_', ' ')}: ${phase}.`, {
    target,
    ...(cause === undefined ? {} : { cause: errorFromUnknown(cause) }),
    data: { phase }
  });
}
