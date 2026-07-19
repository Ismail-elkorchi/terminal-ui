import { restoreTuiSession } from './lifecycle.ts';
import { diagnostic } from '../diagnostics.ts';
import { recordTuiRestore } from './transcript.ts';
import { TuiFinalizationDeadline } from './finalization-deadline.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { TerminalHost, TerminalRestoreReason, TerminalSession } from '../host/index.ts';
import type { TranscriptRecorder } from '../transcript/index.ts';
import type { TuiFinalizationPhaseResult } from './finalization-deadline.ts';
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
  readonly phases: readonly TuiFinalizationPhaseResult[];
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
    this.#inputRetirement = retirement;
  }

  finalize(reason: TerminalRestoreReason): Promise<TuiRunFinalization> {
    this.#finalization ??= this.#finalize(reason);
    return this.#finalization;
  }

  async #finalize(reason: TerminalRestoreReason): Promise<TuiRunFinalization> {
    const deadline = new TuiFinalizationDeadline(
      this.#host.clock,
      this.#app.id,
      this.#options.cleanup.timeoutMs
    );
    const phases: TuiFinalizationPhaseResult[] = [];
    const restorationDiagnostics: TerminalDiagnostic[] = [];
    this.#phase = 'cleaning';
    if (this.#inputRetirement !== undefined) {
      phases.push(await deadline.run('input', async () => this.#inputRetirement));
    }
    if (this.#runtime !== undefined) {
      phases.push(await deadline.run('runtime', async (signal) => this.#runtime?.dispose({ signal })));
    }
    const onExit = this.#app.definition.onExit;
    if (this.#exit !== undefined && 'state' in this.#exit && onExit !== undefined) {
      const state = this.#exit.state;
      phases.push(await deadline.run('onExit', async () => { await onExit(state); }));
    }

    this.#phase = 'restoring';
    const session = this.#session;
    if (session !== undefined) {
      const restoreReason = phases.some(isPhaseFailure) ? 'error' : reason;
      phases.push(await deadline.run('restore', async (signal) => {
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
      }));
    }

    phases.push(await deadline.run('flush', async (signal) => this.#host.flush({ signal })));
    phases.push(await deadline.run('host', async (signal) => this.#host.dispose({ signal })));
    await deadline.close();

    this.#phase = 'ended';
    const clockDiagnostic = deadline.clockDiagnostic();
    return {
      diagnostics: [
        ...restorationDiagnostics,
        ...phases.flatMap((item) => item.diagnostic === undefined ? [] : [item.diagnostic]),
        ...(clockDiagnostic === undefined ? [] : [clockDiagnostic])
      ],
      phases,
      phase: 'ended'
    };
  }

  private expectPhase(expected: TuiRunPhase): void {
    if (this.#phase !== expected) {
      throw new Error(`Expected TUI run phase ${expected}, received ${this.#phase}.`);
    }
  }
}

function isPhaseFailure(item: TuiFinalizationPhaseResult): boolean {
  return item.status !== 'settled';
}
