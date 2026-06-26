import { diagnostic } from '../diagnostics.ts';
import { createInputDecoder, isCancelKey, isInterruptKey } from '../input/index.ts';
import { toAccessibleSnapshot } from '../accessibility/index.ts';
import { createProgress } from './progress.ts';
import { progressDisplayLine } from './progress-view.ts';
import { nonTtyDiagnosticOptions } from './non-tty.ts';
import { setupPromptSession, restoreReasonForPrompt } from './session.ts';
import { submitPrompt } from './submit.ts';
import {
  createPromptTranscript,
  createTranscriptOnlyPromptTranscript,
  recordPromptResult,
  transcriptEvent,
  withPromptDiagnostics,
  withPromptTranscript
} from './transcript.ts';
import type { AccessibleSnapshot } from '../accessibility/index.ts';
import type { TerminalHost, TerminalRestoreReason } from '../host/index.ts';
import type { InputEvent } from '../input/index.ts';
import type { TranscriptRecorder } from '../transcript/index.ts';
import type {
  ProgressController,
  ProgressResult,
  ProgressState,
  PromptDefinition,
  PromptResult
} from './types.ts';

type ProgressOutcome =
  | { readonly kind: 'completed'; readonly value: ProgressResult }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'interrupted' }
  | { readonly kind: 'timeout' }
  | { readonly kind: 'failed'; readonly cause: unknown };

export async function runProgressPrompt(
  prompt: PromptDefinition<ProgressResult>,
  host: TerminalHost | undefined
): Promise<PromptResult<ProgressResult>> {
  if (host?.stdin.isTty() !== true && prompt.nonTty?.mode === 'provided_value' && prompt.nonTty.value !== undefined) {
    return submitPrompt(prompt, prompt.nonTty.value, progressSnapshot(createProgress({
      id: prompt.accessibility?.id ?? prompt.id ?? 'prompt-progress',
      label: prompt.label,
      ...(prompt.progress ?? {})
    })), host);
  }
  if (prompt.nonTty?.mode === 'reject' && host?.stdin.isTty() !== true) {
    return rejectedProgress(prompt);
  }

  const interactive = host?.stdin.isTty() === true;
  const transcript = interactive
    ? createPromptTranscript(prompt)
    : createTranscriptOnlyPromptTranscript(prompt);
  const session = interactive ? await host.beginSession({ id: prompt.id ?? 'prompt-progress' }) : undefined;
  const setupDiagnostics = session === undefined ? [] : await setupPromptSession(session);
  const abortController = new AbortController();
  let restoreReason: TerminalRestoreReason;
  let result: PromptResult<ProgressResult> | undefined;
  const progressRuntime = createProgressRuntime(prompt, host, transcript, abortController.signal);

  try {
    await progressRuntime.publish();
    const outcome = await progressRuntime.run();
    result = await progressResultFromOutcome(prompt, host, progressRuntime.current(), outcome);
    restoreReason = restoreReasonForPrompt(result);
  } catch (cause) {
    restoreReason = 'error';
    result = failedProgress(prompt, progressRuntime.snapshot(), cause);
  } finally {
    abortController.abort();
  }

  const restore = session === undefined ? { diagnostics: [] } : await session.restore(restoreReason);
  const finalResult = withPromptDiagnostics(result, [...setupDiagnostics, ...restore.diagnostics]);
  recordPromptResult(transcript, finalResult);
  return withPromptTranscript(finalResult, transcript?.snapshot());
}

function createProgressRuntime(
  prompt: PromptDefinition<ProgressResult>,
  host: TerminalHost | undefined,
  transcript: TranscriptRecorder | undefined,
  signal: AbortSignal
): {
  current(): ProgressState;
  publish(): Promise<void>;
  run(): Promise<ProgressOutcome>;
  snapshot(): AccessibleSnapshot;
} {
  let progress = createProgress({
    id: prompt.accessibility?.id ?? prompt.id ?? 'prompt-progress',
    label: prompt.label,
    ...(prompt.progress ?? {})
  });
  let closed = false;
  let publishQueue = Promise.resolve();

  const publish = async (): Promise<void> => {
    const snapshot = progressSnapshot(progress);
    transcript?.record({ kind: 'snapshot', snapshot });
    if (host?.stdin.isTty() === true) {
      await host.write({ text: `\r\u001B[2K${progressDisplayLine(progress)}` });
    }
  };

  const controller: ProgressController = {
    signal,
    async update(next) {
      if (closed) return progress;
      progress = progress.update(next);
      publishQueue = publishQueue.then(publish);
      await publishQueue;
      return progress;
    },
    snapshot() {
      return progressSnapshot(progress);
    }
  };

  return {
    current: () => progress,
    async publish() {
      await publish();
    },
    async run() {
      const task = progressTaskOutcome(prompt, controller);
      const input = progressInputOutcome(prompt, host, transcript);
      const timeout = progressTimeoutOutcome(prompt, host, signal);
      const outcome = await Promise.race([task, input, timeout]);
      closed = true;
      await publishQueue;
      return outcome;
    },
    snapshot() {
      return progressSnapshot(progress);
    }
  };
}

async function progressTaskOutcome(
  prompt: PromptDefinition<ProgressResult>,
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
  prompt: PromptDefinition<ProgressResult>,
  host: TerminalHost | undefined,
  transcript: TranscriptRecorder | undefined
): Promise<ProgressOutcome> {
  if (host?.stdin.isTty() !== true) return never();
  const decoder = createInputDecoder();
  for await (const chunk of host.stdin.read()) {
    for (const event of decoder.decode(chunk)) {
      transcript?.record({ kind: 'input', event: transcriptEvent(prompt, event) });
      const outcome = outcomeFromInputEvent(event);
      if (outcome !== undefined) return outcome;
    }
  }
  return never();
}

async function progressTimeoutOutcome(
  prompt: PromptDefinition<ProgressResult>,
  host: TerminalHost | undefined,
  signal: AbortSignal
): Promise<ProgressOutcome> {
  if (prompt.timeoutMs === undefined || host === undefined) return never();
  await host.clock.sleep(prompt.timeoutMs, signal);
  return { kind: 'timeout' };
}

function outcomeFromInputEvent(event: InputEvent): ProgressOutcome | undefined {
  if (isInterruptKey(event)) return { kind: 'interrupted' };
  if (isCancelKey(event)) return { kind: 'cancelled' };
  return undefined;
}

async function progressResultFromOutcome(
  prompt: PromptDefinition<ProgressResult>,
  host: TerminalHost | undefined,
  progress: ProgressState,
  outcome: ProgressOutcome
): Promise<PromptResult<ProgressResult>> {
  const snapshot = progressSnapshot(progress);
  switch (outcome.kind) {
    case 'completed':
      if (host?.stdin.isTty() === true) await host.write({ text: '\n' });
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
  return toAccessibleSnapshot({
    source: snapshot.source,
    root: { ...snapshot.root, focused: true }
  });
}

function rejectedProgress(prompt: PromptDefinition<ProgressResult>): PromptResult<ProgressResult> {
  return {
    schemaVersion: 'terminal-ui.prompt-result.v1',
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
      ...(prompt.progress ?? {})
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
    schemaVersion: 'terminal-ui.prompt-result.v1',
    status: 'aborted',
    reason,
    diagnostics: [diagnostic(code, message)],
    snapshot
  };
}

function failedProgress(
  prompt: PromptDefinition<ProgressResult>,
  snapshot: AccessibleSnapshot,
  cause: unknown
): PromptResult<ProgressResult> {
  return {
    schemaVersion: 'terminal-ui.prompt-result.v1',
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
