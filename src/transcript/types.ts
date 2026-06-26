import type { AccessibleSnapshot } from '../accessibility/index.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { TerminalStateSnapshot } from '../host/index.ts';
import type { InputEvent } from '../input/index.ts';
import type { Frame, RenderDiff } from '../tui/index.ts';

export interface InteractionTranscript {
  readonly schemaVersion: 'terminal-ui.interaction-transcript.v1';
  readonly id: string;
  readonly source: TranscriptSource;
  readonly startedAt?: string;
  readonly steps: readonly InteractionTranscriptStep[];
  readonly diagnostics: readonly TerminalDiagnostic[];
  readonly redactions: readonly TranscriptRedaction[];
}

export type TranscriptSource = 'prompt' | 'shell' | 'tui' | 'test' | 'replay';

export type InteractionTranscriptStep =
  | { readonly kind: 'input'; readonly event: InputEvent }
  | { readonly kind: 'frame'; readonly frame: Frame }
  | { readonly kind: 'diff'; readonly diff: RenderDiff }
  | { readonly kind: 'snapshot'; readonly snapshot: AccessibleSnapshot }
  | { readonly kind: 'diagnostic'; readonly diagnostic: TerminalDiagnostic }
  | { readonly kind: 'restore'; readonly checkpoint: TerminalStateSnapshot };

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
  recordDiagnostic(diagnostic: TerminalDiagnostic): void;
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
  readonly diagnostics: readonly TerminalDiagnostic[];
}

export interface TranscriptReplayTarget {
  readonly transcript: TranscriptRecorder;
  input(event: InputEvent | string): Promise<void>;
  snapshot(): AccessibleSnapshot;
  output(): string;
  recordFrame(frame: Frame): void;
  recordDiff(diff: RenderDiff): void;
  recordRestore(checkpoint: TerminalStateSnapshot): void;
}
