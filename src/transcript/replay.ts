import { validateTranscript } from './validate.ts';
import type { InteractionResult, InteractionTranscript, TranscriptReplayTarget } from './types.ts';

export async function replayTranscript(
  target: TranscriptReplayTarget,
  value: unknown
): Promise<InteractionResult> {
  const valid = validateTranscript(value);
  if (!valid.ok) {
    target.transcript.reportDiagnostic(valid.error);
    return currentResult(target);
  }
  const transcript = valid.value;

  for (const step of transcript.steps) {
    switch (step.kind) {
      case 'input':
        await target.input(step.event);
        break;
      case 'commit':
        target.recordCommit(step.commit);
        break;
      case 'snapshot':
        target.transcript.record(step);
        break;
      case 'diagnostic':
        target.transcript.recordDiagnostic(step.occurrence);
        break;
      case 'restore':
        target.recordRestore(step.result, step.phase);
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
    transcript.steps.flatMap((step) => step.kind === 'diagnostic' ? [step.occurrence.id] : [])
  );
  for (const item of transcript.diagnostics) {
    if (!stepDiagnostics.has(item.id)) target.transcript.recordDiagnostic(item);
  }
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
