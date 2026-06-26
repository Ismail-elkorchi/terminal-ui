import { validateTranscript } from './validate.ts';
import type { InteractionResult, InteractionTranscript, TranscriptReplayTarget } from './types.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';

export async function replayTranscript(
  target: TranscriptReplayTarget,
  transcript: InteractionTranscript
): Promise<InteractionResult> {
  const valid = validateTranscript(transcript);
  if (!valid.ok) {
    target.transcript.recordDiagnostic(valid.error);
    return currentResult(target);
  }

  for (const step of transcript.steps) {
    switch (step.kind) {
      case 'input':
        await target.input(step.event);
        break;
      case 'frame':
        target.recordFrame(step.frame);
        break;
      case 'diff':
        target.recordDiff(step.diff);
        break;
      case 'snapshot':
        target.transcript.record(step);
        break;
      case 'diagnostic':
        target.transcript.recordDiagnostic(step.diagnostic);
        break;
      case 'restore':
        target.recordRestore(step.checkpoint);
        break;
    }
  }
  recordTopLevelDiagnostics(target, transcript);
  for (const redaction of transcript.redactions) target.transcript.recordRedaction(redaction);

  return currentResult(target);
}

function recordTopLevelDiagnostics(
  target: TranscriptReplayTarget,
  transcript: InteractionTranscript
): void {
  const stepDiagnostics = new Set(
    transcript.steps.flatMap((step) => step.kind === 'diagnostic' ? [diagnosticKey(step.diagnostic)] : [])
  );
  for (const item of transcript.diagnostics) {
    if (!stepDiagnostics.has(diagnosticKey(item))) target.transcript.recordDiagnostic(item);
  }
}

function diagnosticKey(diagnostic: TerminalDiagnostic): string {
  return JSON.stringify({
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    target: diagnostic.target ?? null,
    cause: diagnostic.cause ?? null,
    hint: diagnostic.hint ?? null,
    data: diagnostic.data ?? null
  });
}

function currentResult(target: TranscriptReplayTarget): InteractionResult {
  const transcript = target.transcript.snapshot();
  return {
    transcript,
    output: target.output(),
    snapshot: target.snapshot(),
    diagnostics: transcript.diagnostics
  };
}
