import { restoreTuiSession } from './lifecycle.ts';
import { diagnostic } from '../diagnostics.ts';
import { recordTuiRestore } from './transcript.ts';
import { lifecyclePhaseResult, runTuiLifecyclePhase } from './lifecycle-phase.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { TerminalHost, TerminalRestoreReason, TerminalSession } from '../host/index.ts';
import type { TranscriptRecorder } from '../transcript/index.ts';
import type {
  TuiLifecyclePhase,
  TuiLifecyclePhaseOutcome,
  TuiLifecyclePhaseResult
} from './lifecycle-phase.ts';
import type { NormalizedTuiRunOptions } from './run-configuration.ts';
import type { TuiApp, TuiExit, TuiRuntime } from './types.ts';

export type TuiRunPhase =
  | 'prepared'
  | 'session_open'
  | 'runtime_active'
  | 'cleaning'
  | 'restoring'
  | 'ended';

export interface TuiRunFinalization {
  readonly diagnostics: readonly TerminalDiagnostic[];
  readonly phases: readonly TuiLifecyclePhaseResult[];
  readonly phase: 'ended';
}

export class TuiRunLifecycleOwner<TState, TMessage> {
  readonly #app: TuiApp<TState, TMessage>;
  readonly #host: TerminalHost;
  readonly #options: NormalizedTuiRunOptions<TState>;
  readonly #transcript: TranscriptRecorder | undefined;
  #phase: TuiRunPhase = 'prepared';
  #session: TerminalSession | undefined;
  #runtime: TuiRuntime<TState, TMessage> | undefined;
  #exit: TuiExit<TState> | undefined;
  #finalization: Promise<TuiRunFinalization> | undefined;
  #inputRetirement: Promise<void> | undefined;
  #inputRetirementFailure: unknown;

  constructor(
    app: TuiApp<TState, TMessage>,
    host: TerminalHost,
    options: NormalizedTuiRunOptions<TState>,
    transcript: TranscriptRecorder | undefined
  ) {
    this.#app = app;
    this.#host = host;
    this.#options = options;
    this.#transcript = transcript;
  }

  get phase(): TuiRunPhase {
    return this.#phase;
  }

  get runtime(): TuiRuntime<TState, TMessage> | undefined {
    return this.#runtime;
  }

  get session(): TerminalSession | undefined {
    return this.#session;
  }

  openSession(session: TerminalSession): void {
    this.expectPhase('prepared');
    this.#session = session;
    this.#phase = 'session_open';
  }

  activateRuntime(runtime: TuiRuntime<TState, TMessage>): void {
    this.expectPhase('session_open');
    this.#runtime = runtime;
    this.#phase = 'runtime_active';
  }

  replaceSession(session: TerminalSession): void {
    if (this.#phase !== 'runtime_active') {
      throw new Error(`Cannot replace the terminal session from phase ${this.#phase}.`);
    }
    this.#session = session;
  }

  complete(exit: TuiExit<TState>): void {
    if (this.#phase !== 'runtime_active') {
      throw new Error(`Cannot complete TUI run from phase ${this.#phase}.`);
    }
    this.#exit = exit;
  }

  retireInput(retirement: Promise<void>): void {
    if (this.#inputRetirement !== undefined) {
      throw new Error('TUI input retirement was registered more than once.');
    }
    this.#inputRetirement = retirement.catch((cause: unknown) => {
      this.#inputRetirementFailure = cause;
      throw cause;
    });
    void this.#inputRetirement.catch(() => undefined);
  }

  finalize(reason: TerminalRestoreReason): Promise<TuiRunFinalization> {
    this.#finalization ??= this.#finalize(reason);
    return this.#finalization;
  }

  async #finalize(reason: TerminalRestoreReason): Promise<TuiRunFinalization> {
    const phases: TuiLifecyclePhaseResult[] = [];
    const restorationDiagnostics: TerminalDiagnostic[] = [];
    this.#phase = 'cleaning';
    if (this.#inputRetirement !== undefined) {
      phases.push(lifecyclePhaseResult(await this.runPhase(
        'input',
        this.#options.lifecycle.inputRetirementTimeoutMs,
        async () => {
          if (this.#inputRetirementFailure !== undefined) {
            throw this.#inputRetirementFailure instanceof Error
              ? this.#inputRetirementFailure
              : new Error('TUI input retirement failed.', { cause: this.#inputRetirementFailure });
          }
          await this.#inputRetirement;
        }
      )));
    }
    if (this.#runtime !== undefined) {
      phases.push(lifecyclePhaseResult(await this.runPhase(
        'runtime',
        this.#options.lifecycle.runtimeDisposalTimeoutMs,
        async (signal) => this.#runtime?.dispose({ signal, timeoutMs: this.#options.lifecycle.runtimeDisposalTimeoutMs })
      )));
    }
    const onExit = this.#app.definition.onExit;
    if (this.#exit !== undefined && 'state' in this.#exit && onExit !== undefined) {
      const state = this.#exit.state;
      phases.push(lifecyclePhaseResult(await this.runPhase(
        'onExit',
        this.#options.lifecycle.exitHandlerTimeoutMs,
        async () => { await onExit(state); }
      )));
    }

    this.#phase = 'restoring';
    const session = this.#session;
    if (session !== undefined) {
      const restoreReason = phases.some(isPhaseFailure) ? 'error' : reason;
      const restoration = await this.runPhase('restore', this.#options.lifecycle.restorationTimeoutMs, async (signal) => {
        const restoration = await restoreTuiSession(session, restoreReason, { operationSignal: signal });
        recordTuiRestore(this.#transcript, restoration);
        if (restoration.status !== 'restored') {
          restorationDiagnostics.push(...restoration.diagnostics);
          if (restoration.diagnostics.length === 0) {
            restorationDiagnostics.push(diagnostic(
              'HOST_RESTORE_FAILED',
              `Terminal session restoration completed with status ${restoration.status}.`,
              { target: session.id, data: { status: restoration.status } }
            ));
          }
          throw new Error(`Terminal session restoration completed with status ${restoration.status}.`);
        }
      });
      phases.push(lifecyclePhaseResult(restoration));
    }

    phases.push(lifecyclePhaseResult(await this.runPhase(
      'flush',
      this.#options.lifecycle.outputFlushTimeoutMs,
      async (signal) => this.#host.flush({ signal })
    )));
    phases.push(lifecyclePhaseResult(await this.runPhase(
      'host',
      this.#options.lifecycle.hostDisposalTimeoutMs,
      async (signal) => this.#host.dispose({ signal })
    )));

    this.#phase = 'ended';
    return {
      diagnostics: [
        ...restorationDiagnostics,
        ...phases.flatMap((item) => item.diagnostic === undefined ? [] : [item.diagnostic])
      ],
      phases,
      phase: 'ended'
    };
  }

  private runPhase<TValue>(
    phase: TuiLifecyclePhase,
    timeoutMs: number,
    operation: (signal: AbortSignal) => TValue | Promise<TValue>
  ): Promise<TuiLifecyclePhaseOutcome<TValue>> {
    return runTuiLifecyclePhase({
      clock: this.#host.clock,
      target: this.#app.id,
      phase,
      timeoutMs,
      operation
    });
  }

  private expectPhase(expected: TuiRunPhase): void {
    if (this.#phase !== expected) {
      throw new Error(`Expected TUI run phase ${expected}, received ${this.#phase}.`);
    }
  }
}

function isPhaseFailure(item: TuiLifecyclePhaseResult): boolean {
  return item.status !== 'settled';
}
