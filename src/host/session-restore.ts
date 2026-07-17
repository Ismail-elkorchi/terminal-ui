import type { TerminalStateChange, TerminalStateSnapshot } from './types.ts';

export interface TerminalRestorePlan {
  readonly snapshot: TerminalStateSnapshot;
  readonly operations: readonly TerminalStateChange[];
}

export function createTerminalRestorePlan(snapshot: TerminalStateSnapshot): TerminalRestorePlan {
  return {
    snapshot,
    operations: [
      { kind: 'cursorVisible', enabled: snapshot.cursorVisible },
      { kind: 'focusReporting', enabled: snapshot.focusReporting },
      { kind: 'mouseReporting', enabled: snapshot.mouseReporting },
      { kind: 'keyboardProfile', enabled: snapshot.keyboardProfile },
      { kind: 'bracketedPaste', enabled: snapshot.bracketedPaste },
      { kind: 'alternateScreen', enabled: snapshot.alternateScreen },
      { kind: 'rawInput', enabled: snapshot.rawInput }
    ]
  };
}
