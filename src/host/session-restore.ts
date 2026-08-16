import type { TerminalStateChange, TerminalStateSnapshot } from './types.ts';

export interface TerminalRestorePlan {
  readonly snapshot: TerminalStateSnapshot;
  readonly operations: readonly TerminalStateChange[];
}

export function createTerminalRestorePlan(snapshot: TerminalStateSnapshot): TerminalRestorePlan {
  return {
    snapshot,
    operations: [
      { kind: 'cursorVisible', state: snapshot.cursorVisible },
      { kind: 'focusReporting', state: snapshot.focusReporting },
      { kind: 'unicodeGraphemeMode', state: snapshot.unicodeGraphemeMode },
      { kind: 'mouseReporting', state: snapshot.mouseReporting },
      { kind: 'keyboardProfile', state: snapshot.keyboardProfile },
      { kind: 'bracketedPaste', state: snapshot.bracketedPaste },
      { kind: 'alternateScreen', state: snapshot.alternateScreen },
      { kind: 'keyboardProfile', state: snapshot.keyboardProfile },
      { kind: 'rawInput', state: snapshot.rawInput }
    ]
  };
}
