import { TerminalUiError } from '../errors.ts';

export type TuiRuntimePhase = 'created' | 'active' | 'exiting' | 'disposing' | 'disposed';

export function assertRuntimeCanStart(phase: TuiRuntimePhase): void {
  if (phase === 'created' || phase === 'active') return;
  throw runtimePhaseError(phase);
}

export function assertRuntimeOperational(phase: TuiRuntimePhase): void {
  if (phase === 'created' || phase === 'active') return;
  throw runtimePhaseError(phase);
}

export function assertRuntimeWaitable(phase: TuiRuntimePhase): void {
  if (phase === 'created' || phase === 'active' || phase === 'exiting') return;
  throw runtimePhaseError(phase);
}

export function runtimePhaseError(phase: TuiRuntimePhase): TerminalUiError {
  return new TerminalUiError(`TUI runtime is ${phase} and cannot accept this operation.`);
}
