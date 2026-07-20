import { TerminalUiError } from '../errors.ts';

export type TuiRuntimePhase =
  | 'created'
  | 'starting'
  | 'active'
  | 'exiting'
  | 'failed'
  | 'disposing'
  | 'disposed';

export function assertRuntimeCanStart(phase: TuiRuntimePhase): void {
  if (phase === 'created' || phase === 'starting' || phase === 'active') return;
  throw runtimePhaseError(phase);
}

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
