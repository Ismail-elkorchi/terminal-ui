import type { AccessibleSnapshot } from '../accessibility/index.ts';
import type { DiagnosticOccurrence, TerminalDiagnostic } from '../diagnostics.ts';
import type { TerminalRestoreResult, TerminalSize } from '../host/index.ts';
import type { FocusPath } from '../interaction/focus.ts';
import type { InputEvent } from '../input/index.ts';
import type { Frame, RenderDiff } from '../renderer/index.ts';
import type { TuiMessageSource } from '../interaction/message.ts';
import type { JsonValue } from '../foundation/json.ts';

export const interactionTranscriptFormatVersion = 1 as const;

export const transcriptSources = ['prompt', 'tui', 'test', 'replay'] as const;

export interface InteractionTranscript {
  readonly formatVersion: typeof interactionTranscriptFormatVersion;
  readonly id: string;
  readonly source: TranscriptSource;
  readonly startedAt?: string;
  readonly steps: readonly InteractionTranscriptStep[];
  readonly diagnostics: readonly DiagnosticOccurrence[];
  readonly redactions: readonly TranscriptRedaction[];
}

export type TranscriptSource = typeof transcriptSources[number];

export type InteractionTranscriptStep =
  | { readonly kind: 'input'; readonly event: InputEvent }
  | { readonly kind: 'message'; readonly source: TuiMessageSource; readonly message: JsonValue }
  | { readonly kind: 'commit'; readonly commit: TranscriptRuntimeCommit }
  | { readonly kind: 'snapshot'; readonly snapshot: AccessibleSnapshot }
  | { readonly kind: 'diagnostic'; readonly occurrence: DiagnosticOccurrence }
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
  readonly reason: 'secret';
}

export interface TranscriptRecorderOptions {
  readonly id?: string;
  readonly source?: TranscriptSource;
  readonly startedAt?: string;
}

export interface TranscriptRecorder {
  record(step: InteractionTranscriptStep): void;
  recordMessage(source: TuiMessageSource, message: unknown): void;
  reportDiagnostic(diagnostic: TerminalDiagnostic): DiagnosticOccurrence;
  recordDiagnostic(occurrence: DiagnosticOccurrence): void;
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
