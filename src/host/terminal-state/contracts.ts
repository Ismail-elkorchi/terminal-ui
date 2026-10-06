import type { CellPresentationObservation, CellPresentationResolution } from '../cell-presentation.ts';
import type { TerminalDiagnostic } from '../../diagnostics.ts';
import type { TerminalKeyboardProfile } from '../../protocol/keyboard.ts';
import type {
  TerminalInitialState,
  TerminalOperationContext,
  TerminalRestoreCompletion,
  TerminalRestoreResult,
  TerminalStateKnowledge,
  TerminalStateSnapshot,
  TerminalStateChange,
} from '../types.ts';


export type TerminalStateStorage = Omit<TerminalStateSnapshot, 'cellPresentation' | 'provenance'> & {
  readonly provenance: Omit<TerminalStateSnapshot['provenance'], 'cellPresentation'>;
};
export type TerminalRestorableStateChange = Exclude<TerminalStateChange, { readonly kind: 'cellPresentation' }>;
export type TerminalStateKey = keyof Omit<TerminalStateStorage, 'provenance'>;

export type TerminalScreen = 'main' | 'alternate';

export interface KeyboardScreenState {
  readonly profile: TerminalKeyboardProfile;
  readonly knowledge: TerminalStateKnowledge;
  readonly uncertain: boolean;
}

export interface KeyboardFrame {
  readonly state: KeyboardFrameState;
  readonly previous: KeyboardScreenState;
}

export interface RestoredKeyboardFrame {
  readonly screen: TerminalScreen;
  readonly previous: KeyboardScreenState;
}

export interface RestoreOperationOutcome {
  readonly continue: boolean;
  readonly completion?: TerminalRestoreCompletion;
  readonly diagnostic?: TerminalDiagnostic;
}

export interface RestoreAttempt {
  readonly promise: Promise<TerminalRestoreResult>;
}

export type KeyboardFrameState = 'none' | 'push_uncertain' | 'owned' | 'pop_uncertain';

export interface TerminalStateAuthorityOptions {
  readonly rawInputKnowledge: TerminalStateKnowledge;
  readonly initialState?: TerminalInitialState;
  readonly resolveCellPresentation: (observation: CellPresentationObservation) => CellPresentationResolution;
  readonly observeBidiMode?: (context: TerminalOperationContext, recovery: boolean) => Promise<import('../terminal-mode-query.ts').TerminalModeReportState | undefined>;
  readonly verifyKeyboardProfile?: (
    flags: number,
    context: TerminalOperationContext
  ) => Promise<'verified' | 'unsupported' | 'inconclusive'>;
}
