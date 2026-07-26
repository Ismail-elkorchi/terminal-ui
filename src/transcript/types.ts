import type { AccessibleSnapshot } from '../accessibility/index.ts';
import type { DiagnosticOccurrence, TerminalDiagnostic } from '../diagnostics.ts';
import type { TerminalRestoreResult, TerminalSize } from '../host/index.ts';
import type { FocusPath } from '../interaction/focus.ts';
import type { InputEvent } from '../input/index.ts';
import type { Frame, RenderDiff } from '../renderer/index.ts';
import type { TuiMessageSource } from '../interaction/message.ts';

export interface InteractionTranscript {
  readonly schemaVersion: 'terminal-ui.interaction-transcript.v4';
  readonly id: string;
  readonly source: TranscriptSource;
  readonly startedAt?: string;
  readonly steps: readonly InteractionTranscriptStep[];
  readonly diagnostics: readonly DiagnosticOccurrence[];
  readonly redactions: readonly TranscriptRedaction[];
}

export type TranscriptSource = 'prompt' | 'tui' | 'test' | 'replay';

export type InteractionTranscriptStep =
  | { readonly kind: 'input'; readonly event: InputEvent }
  | { readonly kind: 'message'; readonly source: TuiMessageSource; readonly message: unknown }
  | { readonly kind: 'commit'; readonly commit: TranscriptRuntimeCommit }
  | { readonly kind: 'snapshot'; readonly snapshot: AccessibleSnapshot }
  | { readonly kind: 'diagnostic'; readonly diagnostic: DiagnosticOccurrence }
  | { readonly kind: 'restore'; readonly result: TerminalRestoreResult };

export interface TranscriptRuntimeCommit {
  readonly id: string;
  readonly stateVersion: number;
  readonly terminalSize: TerminalSize;
  readonly focusPath?: FocusPath;
  readonly frame: Frame;
  readonly diff: RenderDiff;
}

export interface TranscriptRedaction {
  readonly path: string;
  readonly reason: string;
}

export interface TranscriptRecorderOptions {
  readonly id?: string;
  readonly source?: TranscriptSource;
  readonly startedAt?: string;
}

export interface TranscriptPolicy {
  readonly enabled: boolean;
}

export interface TranscriptRecorder {
  record(step: InteractionTranscriptStep): void;
  reportDiagnostic(diagnostic: TerminalDiagnostic): DiagnosticOccurrence;
  recordDiagnostic(diagnostic: DiagnosticOccurrence): void;
  recordRedaction(redaction: TranscriptRedaction): void;
  snapshot(): InteractionTranscript;
}

export interface RedactionPolicy {
  readonly secrets?: readonly string[];
  readonly replacement?: string;
}

export interface InteractionResult {
  readonly transcript: InteractionTranscript;
  readonly output: string;
  readonly snapshot: AccessibleSnapshot;
  readonly diagnostics: readonly DiagnosticOccurrence[];
}

export interface TranscriptReplayTarget {
  readonly transcript: TranscriptRecorder;
  input(event: InputEvent | string): Promise<void>;
  snapshot(): AccessibleSnapshot;
  output(): string;
  recordCommit(commit: TranscriptRuntimeCommit): void;
  recordRestore(result: TerminalRestoreResult): void;
}
