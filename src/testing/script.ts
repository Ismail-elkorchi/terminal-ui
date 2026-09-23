import { diagnostic } from '../diagnostics.ts';
import { replayTranscript } from '../transcript/index.ts';
import {
  assertFocus,
  assertHitTarget,
  assertNoSecretLeak,
  assertOutput,
  assertSelected,
  assertSnapshot,
  assertTerminalRestored,
  assertVisibleText
} from './assertions.ts';
import type { FrameDescriptor } from '../renderer/index.ts';
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
          await harness.resize(step.terminalSize);
          break;
        case 'wait':
          harness.clock.advance(step.ms);
          break;
        case 'waitForCommit': {
          const next = harness.nextCommit();
          harness.clock.advance(step.ms);
          await next;
          break;
        }
        case 'assertOutput':
          assertOutput(harness.output(), step.includes, step.excludes);
          break;
        case 'assertSnapshot':
          assertSnapshot(harness.snapshot(), step.assertion);
          break;
        case 'assertFocus':
          assertFocus(harness.snapshot(), step.assertion);
          break;
        case 'assertSelected':
          assertSelected(harness.snapshot(), step.assertion);
          break;
        case 'assertVisibleText':
          assertVisibleText(latestFrame(harness), step.assertion);
          break;
        case 'assertHitTarget':
          assertHitTarget(latestFrame(harness), step.assertion);
          break;
        case 'assertRestore':
          assertTerminalRestored(currentResult(harness), step.phase);
          break;
        case 'assertNoSecretLeak':
          assertNoSecretLeak(currentResult(harness), step.secret);
          break;
      }
    } catch (cause) {
      harness.transcript.reportDiagnostic(diagnostic(
        'INTERACTION_SCRIPT_FAILED',
        `Interaction script "${script.id}" failed at step ${String(index + 1)}.`,
        {
          cause,
          target: `steps[${String(index)}]`,
          data: { scriptId: script.id, stepKind: step.kind }
        }
      ));
      throw new InteractionScriptError(script.id, index, step.kind, currentResult(harness), cause);
    }
  }
  return currentResult(harness);
}

export class InteractionScriptError extends Error {
  readonly result: InteractionResult;
  readonly stepIndex: number;
  readonly stepKind: InteractionScript['steps'][number]['kind'];

  constructor(
    scriptId: string,
    stepIndex: number,
    stepKind: InteractionScript['steps'][number]['kind'],
    result: InteractionResult,
    cause: unknown,
  ) {
    super(`Interaction script "${scriptId}" failed at step ${String(stepIndex + 1)} (${stepKind}).`, { cause });
    this.name = 'InteractionScriptError';
    this.result = result;
    this.stepIndex = stepIndex;
    this.stepKind = stepKind;
  }
}

function latestFrame(harness: TerminalHarness): FrameDescriptor {
  const frame = harness.frames().at(-1);
  if (frame === undefined) throw new Error('Expected harness to have recorded at least one frame.');
  return frame;
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
