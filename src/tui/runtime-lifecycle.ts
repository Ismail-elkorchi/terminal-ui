import { TerminalUiError } from '../errors.ts';

export type TuiRuntimePhase =
  | 'created'
  | 'starting'
  | 'active'
  | 'exiting'
  | 'failed'
  | 'disposing'
  | 'disposed';

export function assertRuntimeOperational(phase: TuiRuntimePhase): void {
  if (phase === 'active') return;
  throw runtimePhaseError(phase);
}

export function assertRuntimeWaitable(phase: TuiRuntimePhase): void {
  if (phase === 'active' || phase === 'exiting') return;
  throw runtimePhaseError(phase);
}

export function runtimePhaseError(phase: TuiRuntimePhase): TerminalUiError {
  return new TerminalUiError(`TUI runtime is ${phase} and cannot accept this operation.`);
}

export function createRuntimeLifecycle<TFrame>() {
  let currentPhase: TuiRuntimePhase = 'created';
  let startup: Promise<TFrame> | undefined;
  let disposal: Promise<void> | undefined;
  const lifetime = new AbortController();

  return {
    signal: lifetime.signal,
    phase: () => currentPhase,
    active: () => currentPhase === 'active',
    start(operation: () => Promise<TFrame>): Promise<TFrame> {
      if (currentPhase === 'created') {
        currentPhase = 'starting';
        const started = operation();
        startup = started;
        return started;
      }
      if (currentPhase === 'starting') return startup ?? Promise.reject(runtimePhaseError(currentPhase));
      if (currentPhase === 'active') return startup ?? Promise.reject(runtimePhaseError(currentPhase));
      return Promise.reject(runtimePhaseError(currentPhase));
    },
    activate() {
      if (currentPhase !== 'starting') throw runtimePhaseError(currentPhase);
      currentPhase = 'active';
    },
    beginExit() {
      if (currentPhase === 'active') currentPhase = 'exiting';
    },
    retire() {
      if (currentPhase === 'active') currentPhase = 'exiting';
      if (!lifetime.signal.aborted) lifetime.abort('tui_input_retired');
    },
    fail() {
      if (currentPhase !== 'disposing' && currentPhase !== 'disposed') currentPhase = 'failed';
      if (!lifetime.signal.aborted) lifetime.abort('tui_runtime_failed');
    },
    dispose(operation: () => Promise<void>): Promise<void> {
      if (disposal !== undefined) return disposal;
      currentPhase = 'disposing';
      if (!lifetime.signal.aborted) lifetime.abort('tui_runtime_disposed');
      const cleanup = operation();
      currentPhase = 'disposed';
      disposal = cleanup;
      return cleanup;
    },
    assertOperational() {
      assertRuntimeOperational(currentPhase);
    },
    assertWaitable() {
      assertRuntimeWaitable(currentPhase);
    }
  };
}
