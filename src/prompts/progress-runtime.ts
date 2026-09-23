import { diagnostic } from '../diagnostics.ts';
import { requireCommittedTerminalWrite } from '../host/write-receipt.ts';
import { isCancelKey, isInterruptKey } from '../input/index.ts';
import { createAccessibleSnapshot } from '../accessibility/index.ts';
import { createProgress } from './progress.ts';
import { progressDisplayLine } from './progress-view.ts';
import { nonTtyDiagnosticOptions } from './non-tty.ts';
import { runOwnedPrompt, type PromptTaskOwner } from './session.ts';
import { submitPrompt } from './submit.ts';
import { promptInputEvents } from './input-events.ts';
import {
  createPromptTranscript,
  createTranscriptOnlyPromptTranscript,
  recordPromptResult,
  transcriptEvent,
  withPromptTranscript
} from './transcript.ts';
import type { AccessibleSnapshot } from '../accessibility/index.ts';
import type { TerminalHost } from '../host/index.ts';
import type { InputEvent } from '../input/index.ts';
import type { TranscriptRecorder } from '../transcript/index.ts';
import type {
  ProgressController,
  ProgressResult,
  ProgressState,
  ProgressPromptDefinition,
  PromptResult
} from './types.ts';

type ProgressOutcome =
  | { readonly kind: 'completed'; readonly value: ProgressResult }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'interrupted' }
  | { readonly kind: 'timeout' }
  | { readonly kind: 'failed'; readonly cause: unknown };

export async function runProgressPrompt(
  prompt: ProgressPromptDefinition,
  host: TerminalHost | undefined
): Promise<PromptResult<ProgressResult>> {
  if (host?.stdin.isTty() !== true && prompt.nonTty?.mode === 'provided_value') {
    return submitPrompt(prompt, prompt.nonTty.value, progressSnapshot(createProgress({
      id: prompt.accessibility?.id ?? prompt.id ?? 'prompt-progress',
      label: prompt.label,
      ...prompt.progress
    })), host);
  }
  if (prompt.nonTty?.mode === 'reject' && host?.stdin.isTty() !== true) {
    return rejectedProgress(prompt);
  }

  const interactive = host?.stdin.isTty() === true;
  const transcript = interactive
    ? createPromptTranscript(prompt)
    : createTranscriptOnlyPromptTranscript(prompt);
  const deadline = prompt.timeoutMs === undefined || host === undefined
    ? undefined
    : host.clock.monotonicNow() + prompt.timeoutMs;
  let progressRuntime: ReturnType<typeof createProgressRuntime> | undefined;
  const result = await runOwnedPrompt<ProgressResult>(
    host,
    prompt.id ?? 'prompt-progress',
    async (owner) => {
      progressRuntime = createProgressRuntime(prompt, host, transcript, owner);
      await owner.wait(progressRuntime.publish());
      const outcome = await owner.wait(progressRuntime.run(deadline));
      return owner.wait(progressResultFromOutcome(prompt, host, progressRuntime.current(), outcome, owner));
    },
    (cause) => failedProgress(prompt, progressRuntime?.snapshot() ?? progressSnapshot(createProgress({
      id: prompt.accessibility?.id ?? prompt.id ?? 'prompt-progress', label: prompt.label, ...prompt.progress
    })), cause),
    interactive
  );
  recordPromptResult(transcript, result);
  return withPromptTranscript(result, transcript?.snapshot());
}

function createProgressRuntime(
  prompt: ProgressPromptDefinition,
  host: TerminalHost | undefined,
  transcript: TranscriptRecorder | undefined,
  owner: PromptTaskOwner
): {
  current(): ProgressState;
  publish(): Promise<void>;
  run(deadline: number | undefined): Promise<ProgressOutcome>;
  snapshot(): AccessibleSnapshot;
} {
  let progress = createProgress({
    id: prompt.accessibility?.id ?? prompt.id ?? 'prompt-progress',
    label: prompt.label,
    ...prompt.progress
  });
  let closed = false;
  const publish = (current: ProgressState): Promise<void> => owner.publish(async () => {
    if (!owner.active) return;
    if (host?.stdin.isTty() === true) {
      requireCommittedTerminalWrite(await host.write({ text: `\r\u001B[2K${progressDisplayLine(current)}` }));
    }
    if (publicationActive(owner)) transcript?.record({ kind: 'snapshot', snapshot: progressSnapshot(current) });
  });

  const controller: ProgressController = {
    signal: owner.signal,
    async update(next) {
      if (closed || !owner.active || owner.failed) return progress;
      progress = progress.update(next);
      await publish(progress);
      return progress;
    },
    snapshot() {
      return progressSnapshot(progress);
    }
  };

  return {
    current: () => progress,
    async publish() {
      await publish(progress);
    },
    async run(deadline) {
      const task = progressTaskOutcome(prompt, controller);
      const input = progressInputOutcome(prompt, host, transcript, owner.signal, owner.bracketedPaste);
      const timeout = progressTimeoutOutcome(host, owner.signal, deadline);
      const outcome = await Promise.race([task, input, timeout]);
      closed = true;
      return outcome;
    },
    snapshot() {
      return progressSnapshot(progress);
    }
  };
}

function publicationActive(owner: PromptTaskOwner): boolean {
  return owner.active;
}

async function progressTaskOutcome(
  prompt: ProgressPromptDefinition,
  controller: ProgressController
): Promise<ProgressOutcome> {
  try {
    const value = await prompt.progressTask?.(controller);
    return { kind: 'completed', value: value ?? { completed: true } };
  } catch (cause) {
    return { kind: 'failed', cause };
  }
}

async function progressInputOutcome(
  prompt: ProgressPromptDefinition,
  host: TerminalHost | undefined,
  transcript: TranscriptRecorder | undefined,
  signal: AbortSignal,
  bracketedPaste: boolean
): Promise<ProgressOutcome> {
  if (host?.stdin.isTty() !== true) return never();
  for await (const event of promptInputEvents(host, signal, { bracketedPaste })) {
    transcript?.record({ kind: 'input', event: transcriptEvent(prompt, event) });
    const outcome = outcomeFromInputEvent(event);
    if (outcome !== undefined) return outcome;
  }
  return never();
}

async function progressTimeoutOutcome(
  host: TerminalHost | undefined,
  signal: AbortSignal,
  deadline: number | undefined
): Promise<ProgressOutcome> {
  if (deadline === undefined || host === undefined) return never();
  const remaining = deadline - host.clock.monotonicNow();
  if (remaining <= 0) return { kind: 'timeout' };
  const outcome = await host.clock.sleep(remaining, signal);
  if (outcome === 'aborted') return never();
  return { kind: 'timeout' };
}

function outcomeFromInputEvent(event: InputEvent): ProgressOutcome | undefined {
  if (isInterruptKey(event)) return { kind: 'interrupted' };
  if (isCancelKey(event)) return { kind: 'cancelled' };
  return undefined;
}

async function progressResultFromOutcome(
  prompt: ProgressPromptDefinition,
  host: TerminalHost | undefined,
  progress: ProgressState,
  outcome: ProgressOutcome,
  owner: PromptTaskOwner
): Promise<PromptResult<ProgressResult>> {
  const snapshot = progressSnapshot(progress);
  switch (outcome.kind) {
    case 'completed':
      if (host?.stdin.isTty() === true) await owner.publish(async () => {
        requireCommittedTerminalWrite(await host.write({ text: '\n' }));
      });
      return submitPrompt(prompt, outcome.value, snapshot, host);
    case 'cancelled':
      return abortedProgress('cancelled', 'INPUT_CANCELLED', 'Prompt cancelled by user input.', snapshot);
    case 'interrupted':
      return abortedProgress('interrupted', 'INPUT_INTERRUPTED', 'Prompt interrupted by user input.', snapshot);
    case 'timeout':
      return abortedProgress('timeout', 'INPUT_TIMEOUT', 'Prompt timed out before completion.', snapshot);
    case 'failed':
      return failedProgress(prompt, snapshot, outcome.cause);
  }
}

function progressSnapshot(progress: ProgressState): AccessibleSnapshot {
  const snapshot = progress.snapshot();
  return createAccessibleSnapshot({
    source: snapshot.source,
    root: { ...snapshot.root, focused: true }
  });
}

function rejectedProgress(prompt: ProgressPromptDefinition): PromptResult<ProgressResult> {
  return {
    status: 'aborted',
    reason: 'non_tty_denied',
    diagnostics: [
      diagnostic('PROMPT_NON_TTY_DENIED', 'Progress prompt is not allowed to run in non-TTY mode.', {
        target: prompt.id ?? prompt.kind,
        ...nonTtyDiagnosticOptions(prompt)
      })
    ],
    snapshot: progressSnapshot(createProgress({
      id: prompt.accessibility?.id ?? prompt.id ?? 'prompt-progress',
      label: prompt.label,
      ...prompt.progress
    }))
  };
}

function abortedProgress(
  reason: 'cancelled' | 'interrupted' | 'timeout',
  code: 'INPUT_CANCELLED' | 'INPUT_INTERRUPTED' | 'INPUT_TIMEOUT',
  message: string,
  snapshot: AccessibleSnapshot
): PromptResult<ProgressResult> {
  return {
    status: 'aborted',
    reason,
    diagnostics: [diagnostic(code, message)],
    snapshot
  };
}

function failedProgress(
  prompt: ProgressPromptDefinition,
  snapshot: AccessibleSnapshot,
  cause: unknown
): PromptResult<ProgressResult> {
  return {
    status: 'aborted',
    reason: 'host_error',
    diagnostics: [
      diagnostic('HOST_STREAM_CLOSED', 'Progress prompt task failed before completion.', {
        cause,
        target: prompt.id ?? prompt.kind
      })
    ],
    snapshot
  };
}

function never<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}
