import { createTranscriptRecorder } from '../transcript/index.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { InputEvent } from '../input/index.ts';
import type { InteractionTranscript, TranscriptRecorder } from '../transcript/index.ts';
import type { PromptDefinition, PromptResult } from './types.ts';

export function transcriptEvent<TValue>(prompt: PromptDefinition<TValue>, event: InputEvent): InputEvent {
  if (prompt.kind !== 'password') return event;
  if (event.kind === 'text') return { ...event, text: '[redacted]' };
  if (event.kind === 'paste') return { ...event, text: '[redacted]' };
  return event;
}

export function createPromptTranscript<TValue>(prompt: PromptDefinition<TValue>): TranscriptRecorder | undefined {
  if (prompt.transcript?.enabled !== true) return undefined;
  return createPromptTranscriptRecorder(prompt);
}

export function createTranscriptOnlyPromptTranscript<TValue>(prompt: PromptDefinition<TValue>): TranscriptRecorder {
  return createPromptTranscriptRecorder(prompt);
}

function createPromptTranscriptRecorder<TValue>(prompt: PromptDefinition<TValue>): TranscriptRecorder {
  return createTranscriptRecorder({
    id: prompt.id ?? `prompt-${prompt.kind}`,
    source: 'prompt'
  });
}

export function withPromptTranscript<TValue>(
  result: PromptResult<TValue>,
  transcript: InteractionTranscript | undefined
): PromptResult<TValue> {
  if (transcript === undefined) return result;
  return { ...result, transcript };
}

export function withPromptDiagnostics<TValue>(
  result: PromptResult<TValue>,
  diagnostics: readonly TerminalDiagnostic[]
): PromptResult<TValue> {
  if (diagnostics.length === 0) return result;
  return { ...result, diagnostics: [...result.diagnostics, ...diagnostics] };
}

export function recordPromptResult<TValue>(
  transcript: TranscriptRecorder | undefined,
  result: PromptResult<TValue>
): void {
  for (const item of result.diagnostics) {
    transcript?.recordDiagnostic(item);
  }
  if (result.snapshot !== undefined) transcript?.record({ kind: 'snapshot', snapshot: result.snapshot });
}
