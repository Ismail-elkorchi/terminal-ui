import { diagnostic } from '../diagnostics.ts';
import { replayTranscript } from '../transcript/index.ts';
import {
  assertNoSecretLeak,
  assertOutput,
  assertSnapshot,
  assertTerminalRestored
} from './assertions.ts';
import type { InteractionResult, InteractionScript, TerminalHarness } from './types.ts';

export { replayTranscript };

export async function runInteractionScript(
  harness: TerminalHarness,
  script: InteractionScript
): Promise<InteractionResult> {
  for (const [index, step] of script.steps.entries()) {
    try {
      switch (step.kind) {
        case 'input':
          await harness.input(step.event);
          break;
        case 'paste':
          await harness.input({ kind: 'paste', text: step.text, bracketed: true });
          break;
        case 'resize':
          await harness.resize(step.viewport);
          break;
        case 'wait':
          harness.clock.advance(step.ms);
          await Promise.resolve();
          break;
        case 'assertOutput':
          assertOutput(harness.output(), step.includes, step.excludes);
          break;
        case 'assertSnapshot':
          assertSnapshot(harness.snapshot(), step.assertion);
          break;
        case 'assertRestore':
          assertTerminalRestored(currentResult(harness));
          break;
        case 'assertNoSecretLeak':
          assertNoSecretLeak(currentResult(harness), step.secret);
          break;
      }
    } catch (cause) {
      harness.transcript.recordDiagnostic(diagnostic(
        'INTERACTION_SCRIPT_FAILED',
        `Interaction script "${script.id}" failed at step ${String(index + 1)}.`,
        {
          cause,
          target: `steps[${String(index)}]`,
          data: { scriptId: script.id, stepKind: step.kind }
        }
      ));
      return currentResult(harness);
    }
  }
  return currentResult(harness);
}

function currentResult(harness: TerminalHarness): InteractionResult {
  const transcript = harness.transcript.snapshot();
  return {
    transcript,
    output: harness.output(),
    snapshot: harness.snapshot(),
    diagnostics: transcript.diagnostics
  };
}
