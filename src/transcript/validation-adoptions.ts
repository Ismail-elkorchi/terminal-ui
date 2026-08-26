import type { TerminalDiagnostic } from '../diagnostics.ts';
import type {
  TerminalRestoreCompletion,
  TerminalRestoreResult,
  TerminalStateChange,
  TerminalStateSnapshot,
} from '../host/index.ts';
import type { TerminalKeyboardProfile } from '../protocol/index.ts';
import type { CursorPosition, RenderOperation } from '../renderer/index.ts';
import type { TextWidthProfile } from '../text/index.ts';
import type { TerminalStyle } from '../visual/index.ts';
import type { TranscriptFrame, TranscriptRenderDiff } from './types.ts';

export interface TranscriptAdoptions {
  readonly cursors: WeakMap<object, CursorPosition>;
  readonly diagnostics: WeakMap<object, TerminalDiagnostic>;
  readonly diffs: WeakMap<object, TranscriptRenderDiff>;
  readonly frames: WeakMap<object, TranscriptFrame>;
  readonly keyboardProfiles: WeakMap<object, TerminalKeyboardProfile>;
  readonly operations: WeakMap<object, RenderOperation>;
  readonly restores: WeakMap<object, TerminalRestoreResult>;
  readonly stateChanges: WeakMap<object, TerminalStateChange | TerminalRestoreCompletion>;
  readonly stateSnapshots: WeakMap<object, TerminalStateSnapshot>;
  readonly styles: WeakMap<object, TerminalStyle>;
  readonly widthProfiles: WeakMap<object, TextWidthProfile>;
}

export function createTranscriptAdoptions(): TranscriptAdoptions {
  return {
    cursors: new WeakMap(),
    diagnostics: new WeakMap(),
    diffs: new WeakMap(),
    frames: new WeakMap(),
    keyboardProfiles: new WeakMap(),
    operations: new WeakMap(),
    restores: new WeakMap(),
    stateChanges: new WeakMap(),
    stateSnapshots: new WeakMap(),
    styles: new WeakMap(),
    widthProfiles: new WeakMap(),
  };
}
