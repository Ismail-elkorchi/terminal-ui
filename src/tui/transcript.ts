import { createTranscriptRecorder } from '../transcript/index.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { TerminalStateSnapshot } from '../host/index.ts';
import type { TranscriptRecorder } from '../transcript/index.ts';
import type { Frame, RenderDiff } from './frame.ts';
import type { TuiApp, TuiExit } from './types.ts';

export function createTuiTranscript<TState, TMessage>(
  app: TuiApp<TState, TMessage>
): TranscriptRecorder | undefined {
  if (app.definition.transcript?.enabled !== true) return undefined;
  return createTranscriptRecorder({ id: `${app.id}-transcript`, source: 'tui' });
}

export function recordTuiFrame(
  transcript: TranscriptRecorder | undefined,
  frame: Frame,
  diff: RenderDiff
): void {
  transcript?.record({ kind: 'frame', frame });
  transcript?.record({ kind: 'diff', diff });
}

export function recordTuiRestore(
  transcript: TranscriptRecorder | undefined,
  checkpoint: TerminalStateSnapshot
): void {
  transcript?.record({ kind: 'restore', checkpoint });
}

export function withTuiTranscript<TState>(
  exit: TuiExit<TState>,
  transcript: TranscriptRecorder | undefined
): TuiExit<TState> {
  if (transcript === undefined) return exit;
  recordTuiDiagnostics(transcript, exit.diagnostics);
  transcript.record({ kind: 'snapshot', snapshot: exit.snapshot });
  return { ...exit, transcript: transcript.snapshot() };
}

function recordTuiDiagnostics(
  transcript: TranscriptRecorder,
  diagnostics: readonly TerminalDiagnostic[]
): void {
  for (const item of diagnostics) {
    transcript.recordDiagnostic(item);
  }
}
