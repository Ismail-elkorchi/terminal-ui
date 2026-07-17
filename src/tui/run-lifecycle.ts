import { diagnostic } from '../diagnostics.ts';
import { restoreTuiSession } from './lifecycle.ts';
import { settleTuiCleanup } from './cleanup.ts';
import { recordTuiRestore } from './transcript.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { TerminalHost, TerminalRestoreReason, TerminalSession } from '../host/index.ts';
import type { TranscriptRecorder } from '../transcript/index.ts';
import type { TuiCleanupTask } from './cleanup.ts';
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
  readonly phase: 'ended';
}

export class TuiRunLifecycleOwner<TState, TMessage> {
  #phase: TuiRunPhase = 'prepared';
  #session: TerminalSession | undefined;
  #runtime: TuiRuntime<TState, TMessage> | undefined;
  #exit: TuiExit<TState> | undefined;
  #finalization: Promise<TuiRunFinalization> | undefined;

  constructor(
    private readonly app: TuiApp<TState, TMessage>,
    private readonly host: TerminalHost,
    private readonly options: NormalizedTuiRunOptions<TState>,
    private readonly transcript: TranscriptRecorder | undefined
  ) {}

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

  finalize(reason: TerminalRestoreReason): Promise<TuiRunFinalization> {
    this.#finalization ??= this.#finalize(reason);
    return this.#finalization;
  }

  async #finalize(reason: TerminalRestoreReason): Promise<TuiRunFinalization> {
    const diagnostics: TerminalDiagnostic[] = [];
    this.#phase = 'cleaning';
    const cleanupDiagnostics = await settleTuiCleanup(
      this.host.clock,
      this.cleanupTasks(),
      this.options.cleanup
    );
    diagnostics.push(...cleanupDiagnostics);

    this.#phase = 'restoring';
    if (this.#session !== undefined) {
      const restoreReason = cleanupDiagnostics.some(isFailure) ? 'error' : reason;
      diagnostics.push(...await restoreTuiSession(this.#session, restoreReason));
      recordTuiRestore(this.transcript, this.#session.initialState);
    }

    try {
      await this.host.flush();
    } catch (cause) {
      diagnostics.push(diagnostic('TUI_CLEANUP_FAILED', 'Terminal output flush failed during TUI finalization.', {
        target: this.app.id,
        cause,
        data: { phase: 'flush' }
      }));
    }

    this.#phase = 'ended';
    return { diagnostics, phase: 'ended' };
  }

  private cleanupTasks(): readonly TuiCleanupTask[] {
    const tasks: TuiCleanupTask[] = [];
    const runtime = this.#runtime;
    if (runtime !== undefined) {
      tasks.push({ owner: this.app.id, phase: 'runtime', run: () => invoke(() => runtime.dispose()) });
    }
    const onExit = this.app.definition.onExit;
    if (this.#exit !== undefined && 'state' in this.#exit && onExit !== undefined) {
      const state = this.#exit.state;
      tasks.push({
        owner: this.app.id,
        phase: 'onExit',
        run: () => invoke(() => onExit(state))
      });
    }
    return tasks;
  }

  private expectPhase(expected: TuiRunPhase): void {
    if (this.#phase !== expected) {
      throw new Error(`Expected TUI run phase ${expected}, received ${this.#phase}.`);
    }
  }
}

async function invoke(operation: () => unknown): Promise<void> {
  await operation();
}

function isFailure(item: TerminalDiagnostic): boolean {
  return item.severity === 'error' || item.severity === 'fatal';
}
