import type { TerminalRestorableStateChange } from './terminal-state/contracts.ts';
import type { TerminalStateSnapshot } from './types.ts';

export interface TerminalRestorePlan {
  readonly snapshot: TerminalStateSnapshot;
  readonly operations: readonly TerminalRestorableStateChange[];
}

export function createTerminalRestorePlan(snapshot: TerminalStateSnapshot): TerminalRestorePlan {
  return {
    snapshot,
    operations: [
      { kind: 'cursorVisible', state: snapshot.cursorVisible },
      { kind: 'focusReporting', state: snapshot.focusReporting },
      { kind: 'metaSendsEscape', state: snapshot.metaSendsEscape },
      { kind: 'unicodeGraphemeMode', state: snapshot.unicodeGraphemeMode },
      { kind: 'bidiMode', state: snapshot.bidiMode },
      { kind: 'mouseReporting', state: snapshot.mouseReporting },
      { kind: 'keyboardProfile', state: snapshot.keyboardProfile },
      { kind: 'bracketedPaste', state: snapshot.bracketedPaste },
      { kind: 'alternateScreen', state: snapshot.alternateScreen },
      { kind: 'keyboardProfile', state: snapshot.keyboardProfile },
      { kind: 'rawInput', state: snapshot.rawInput }
    ]
  };
}
