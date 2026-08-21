import { createTranscriptRecorder } from '../transcript/index.ts';
import type { TerminalRestoreResult } from '../host/index.ts';
import type { TranscriptRecorder } from '../transcript/index.ts';
import type { TranscriptRuntimeCommit } from '../transcript/index.ts';
import type { TuiApp, TuiExit } from './types.ts';
import { tuiDefinition } from './definition.ts';

export function createTuiTranscript<TState, TMessage>(
  app: TuiApp<TState, TMessage>
): TranscriptRecorder | undefined {
  if (tuiDefinition(app).transcript !== true) return undefined;
  return createTranscriptRecorder({ id: `${app.id}-transcript`, source: 'tui' });
}

export function recordTuiCommit(
  transcript: TranscriptRecorder | undefined,
  commit: TranscriptRuntimeCommit
): void {
  transcript?.record({ kind: 'commit', commit });
}

export function recordTuiRestore(
  transcript: TranscriptRecorder | undefined,
  result: TerminalRestoreResult,
  phase: 'checkpoint' | 'shutdown'
): void {
  transcript?.record({ kind: 'restore', phase, result });
}

export function withTuiTranscript<TExit extends TuiExit<unknown>>(
  exit: TExit,
  transcript: TranscriptRecorder | undefined
): TExit {
  if (transcript === undefined) return exit;
  for (const item of exit.diagnostics) transcript.recordDiagnostic(item);
  transcript.record({ kind: 'snapshot', snapshot: exit.snapshot });
  return { ...exit, transcript: transcript.snapshot() };
}
