import type { AccessibleSnapshot } from '../accessibility/index.ts';
import type { DiagnosticOccurrence, TerminalDiagnostic } from '../diagnostics.ts';
import type { TerminalRestoreResult, TerminalSize } from '../host/index.ts';
import type { FocusPath } from '../interaction/focus.ts';
import type { RecordedInputEvent } from '../input/index.ts';
import type { FrameDescriptor, RenderDiffDescriptor } from '../renderer/index.ts';
import type { TuiMessageSource } from '../interaction/message.ts';
import type { JsonValue } from '../foundation/json.ts';

export const interactionTranscriptFormatVersion = 8 as const;

export const transcriptSources = ['prompt', 'tui', 'test', 'replay'] as const;

export interface InteractionTranscript {
  readonly formatVersion: typeof interactionTranscriptFormatVersion;
  readonly id: string;
  readonly source: TranscriptSource;
  readonly startedAt?: string;
  readonly steps: readonly InteractionTranscriptStep[];
  readonly omittedSteps: number;
  readonly diagnostics: readonly DiagnosticOccurrence[];
  readonly omittedDiagnostics: number;
  readonly redactions: readonly TranscriptRedaction[];
  readonly omittedRedactions: number;
}

export type TranscriptSource = typeof transcriptSources[number];

export type TranscriptFrame = FrameDescriptor;

export type TranscriptRenderDiff = RenderDiffDescriptor;

export type InteractionTranscriptStep =
  | { readonly kind: 'input'; readonly event: RecordedInputEvent }
  | {
      readonly kind: 'message';
      readonly source: TuiMessageSource;
      readonly fidelity: 'exact' | 'normalized';
      readonly message: JsonValue;
    }
  | { readonly kind: 'commit'; readonly commit: TranscriptRuntimeCommit }
  | { readonly kind: 'snapshot'; readonly snapshot: AccessibleSnapshot }
  | { readonly kind: 'diagnostic'; readonly occurrence: DiagnosticOccurrence }
  | {
      readonly kind: 'restore';
      readonly phase: 'checkpoint' | 'shutdown';
      readonly result: TerminalRestoreResult;
    };

export interface TranscriptRuntimeCommit {
  readonly id: string;
  readonly stateVersion: number;
  readonly terminalSize: TerminalSize;
  readonly focusPath?: FocusPath;
  readonly frame: TranscriptFrame;
  readonly diff: TranscriptRenderDiff;
}

export interface TranscriptRedaction {
  readonly path: string;
  readonly reason: 'secret';
}

export interface TranscriptRecorderOptions {
  readonly id?: string;
  readonly source?: TranscriptSource;
  readonly startedAt?: string;
  readonly retention?: TranscriptRetentionPolicy;
  readonly onStep?: (step: InteractionTranscriptStep) => void;
}

export interface TranscriptRetentionPolicy {
  readonly maxSteps?: number;
  readonly maxDiagnostics?: number;
  readonly maxRedactions?: number;
  readonly maxRetainedBytes?: number;
  readonly maxRetainedJsonNodes?: number;
  readonly maxRetainedStringCodeUnits?: number;
  readonly maxRetainedCells?: number;
  readonly maxRetainedGraphics?: number;
}

export interface TranscriptValidationLimits {
  readonly maxDepth?: number;
  readonly maxJsonNodes?: number;
  readonly maxStringCodeUnits?: number;
  readonly maxSteps?: number;
  readonly maxFrameCells?: number;
  readonly maxFrameGraphics?: number;
  readonly maxDiffOperations?: number;
  readonly maxGraphicOperations?: number;
  readonly maxDiagnostics?: number;
  readonly maxRedactions?: number;
}

export interface TranscriptRecorder {
  record(step: InteractionTranscriptStep): void;
  recordNormalizedMessage(source: TuiMessageSource, message: unknown): void;
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
  input(event: RecordedInputEvent | string): Promise<void>;
  snapshot(): AccessibleSnapshot;
  output(): string;
  recordCommit(commit: TranscriptRuntimeCommit): void;
  recordRestore(result: TerminalRestoreResult, phase: 'checkpoint' | 'shutdown'): void;
}
