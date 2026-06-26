import { diagnostic } from '../diagnostics.ts';
import { createInputDecoder, isCancelKey, isInterruptKey } from '../input/index.ts';
import {
  applyAutocompleteEvent,
  applyMultiSelectEvent,
  applySelectEvent
} from './choice-interaction.ts';
import { resolvePromptChoices } from './choices.ts';
import { runEditorPrompt } from './editor.ts';
import { canSubmitDefaultInNonTty, hasProvidedNonTtyValue, nonTtyDiagnosticOptions, nonTtyMode } from './non-tty.ts';
import { runProgressPrompt } from './progress-runtime.ts';
import { renderPromptText } from './render-theme.ts';
import { setupPromptSession, restoreReasonForPrompt } from './session.ts';
import { createPromptSnapshot, promptValueForSnapshot } from './snapshot.ts';
import { completePromptState, initialPromptState } from './state.ts';
import { submitPrompt } from './submit.ts';
import { applyTextPromptEvent, scheduleInitialValidation } from './text-interaction.ts';
import {
  createPromptTranscript,
  createTranscriptOnlyPromptTranscript,
  recordPromptResult,
  transcriptEvent,
  withPromptDiagnostics,
  withPromptTranscript
} from './transcript.ts';
import type { AccessibleSnapshot } from '../accessibility/index.ts';
import type { TerminalHost, TerminalInputChunk, TerminalRestoreReason } from '../host/index.ts';
import type { InputEvent } from '../input/index.ts';
import type { TranscriptRecorder } from '../transcript/index.ts';
import type { PromptInteractionHooks } from './interaction-hooks.ts';
import type { PromptRuntimeState } from './state.ts';
import type {
  PromptDefinition,
  PromptResult,
  ProgressResult
} from './types.ts';

const promptInteractionHooks: PromptInteractionHooks = {
  render: renderPromptState,
  submit: submitInteractivePrompt
};

export async function runPrompt<TValue>(
  prompt: PromptDefinition<TValue>,
  host?: TerminalHost
): Promise<PromptResult<TValue>> {
  if (prompt.kind === 'progress' && prompt.progressTask !== undefined) {
    return runProgressPrompt(prompt as unknown as PromptDefinition<ProgressResult>, host) as Promise<PromptResult<TValue>>;
  }
  if (host?.stdin.isTty() === true && isInteractivePrompt(prompt)) {
    return runInteractivePrompt(prompt, host);
  }
  const snapshot = createPromptSnapshot(prompt);
  if (nonTtyMode(prompt) === 'transcript_only') {
    return runTranscriptOnlyPrompt(prompt, snapshot, host);
  }
  if (prompt.kind === 'editor') {
    return runEditorPrompt(prompt as unknown as PromptDefinition<string>, snapshot, host) as Promise<PromptResult<TValue>>;
  }
  if (hasProvidedNonTtyValue(prompt)) {
    return submitPrompt(prompt, prompt.nonTty.value, snapshot, host);
  }
  if (canSubmitDefaultInNonTty(prompt)) {
    return submitPrompt(prompt, prompt.defaultValue as TValue, snapshot, host);
  }
  if (host?.stdin.isTty() === false && prompt.kind === 'input' && nonTtyMode(prompt) === 'line_fallback') {
    return runLineFallbackPrompt(prompt as unknown as PromptDefinition<string>, host) as Promise<PromptResult<TValue>>;
  }
  return {
    schemaVersion: 'terminal-ui.prompt-result.v1',
    status: 'aborted',
    reason: 'non_tty_denied',
    diagnostics: [
      diagnostic('PROMPT_NON_TTY_DENIED', 'Prompt has no default value or explicit non-TTY answer.', nonTtyDiagnosticOptions(prompt))
    ],
    snapshot
  };
}

async function runTranscriptOnlyPrompt<TValue>(
  prompt: PromptDefinition<TValue>,
  snapshot: AccessibleSnapshot,
  host: TerminalHost | undefined
): Promise<PromptResult<TValue>> {
  const transcript = createTranscriptOnlyPromptTranscript(prompt);
  transcript.record({ kind: 'snapshot', snapshot });
  if (prompt.defaultValue !== undefined) {
    const result = await submitPrompt(prompt, prompt.defaultValue, snapshot, host);
    return withPromptTranscript(result, transcript.snapshot());
  }
  return {
    schemaVersion: 'terminal-ui.prompt-result.v1',
    status: 'aborted',
    reason: 'non_tty_denied',
    diagnostics: [
      diagnostic(
        'PROMPT_NON_TTY_DENIED',
        'Prompt is transcript-only in non-TTY mode and has no value to submit.',
        nonTtyDiagnosticOptions(prompt)
      )
    ],
    transcript: transcript.snapshot(),
    snapshot
  };
}

async function runLineFallbackPrompt(
  prompt: PromptDefinition<string>,
  host: TerminalHost
): Promise<PromptResult<string>> {
  const line = await readLineFallback(host);
  const snapshot = createPromptSnapshot(prompt, line ?? null);
  if (line === undefined) {
    return {
      schemaVersion: 'terminal-ui.prompt-result.v1',
      status: 'aborted',
      reason: 'non_tty_denied',
      diagnostics: [
        diagnostic(
          'PROMPT_NON_TTY_DENIED',
          'Prompt input did not receive a line from non-TTY stdin.',
          nonTtyDiagnosticOptions(prompt)
        )
      ],
      snapshot
    };
  }
  const transcript = createPromptTranscript(prompt);
  transcript?.record({ kind: 'input', event: { kind: 'text', text: line, paste: false } });
  const result = await submitPrompt(prompt, line, snapshot, host);
  recordPromptResult(transcript, result);
  return withPromptTranscript(result, transcript?.snapshot());
}

async function readLineFallback(host: TerminalHost): Promise<string | undefined> {
  let text = '';
  for await (const chunk of host.stdin.read()) {
    text += typeof chunk.data === 'string' ? chunk.data : new TextDecoder().decode(chunk.data);
    const newline = text.search(/\r?\n/u);
    if (newline !== -1) return text.slice(0, newline).replace(/\r$/u, '');
  }
  return text.length === 0 ? undefined : text;
}

async function runInteractivePrompt<TValue>(
  prompt: PromptDefinition<TValue>,
  host: TerminalHost
): Promise<PromptResult<TValue>> {
  const session = await host.beginSession({ id: prompt.id ?? `prompt-${prompt.kind}` });
  const transcript = createPromptTranscript(prompt);
  const setupDiagnostics = await setupPromptSession(session);
  let result: PromptResult<TValue> | undefined;
  let restoreReason: TerminalRestoreReason;
  try {
    result = await runPromptLoop(prompt, host, transcript);
    restoreReason = restoreReasonForPrompt(result);
  } catch (cause) {
    restoreReason = 'error';
    const snapshot = createPromptSnapshot(prompt);
    result = {
      schemaVersion: 'terminal-ui.prompt-result.v1',
      status: 'aborted',
      reason: 'host_error',
      diagnostics: [
        diagnostic('HOST_STREAM_CLOSED', 'Prompt failed while reading terminal input.', {
          cause,
          target: prompt.id ?? prompt.kind
        })
      ],
      snapshot
    };
  }
  const restore = await session.restore(restoreReason);
  const finalResult = withPromptDiagnostics(result, [...setupDiagnostics, ...restore.diagnostics]);
  recordPromptResult(transcript, finalResult);
  return withPromptTranscript(finalResult, transcript?.snapshot());
}

async function runPromptLoop<TValue>(
  prompt: PromptDefinition<TValue>,
  host: TerminalHost,
  transcript: TranscriptRecorder | undefined
): Promise<PromptResult<TValue>> {
  const decoder = createInputDecoder();
  const input = host.stdin.read()[Symbol.asyncIterator]();
  const choices = await resolvePromptChoices(prompt);
  if (!choices.ok) {
    return {
      schemaVersion: 'terminal-ui.prompt-result.v1',
      status: 'aborted',
      reason: 'host_error',
      diagnostics: choices.diagnostics,
      snapshot: createPromptSnapshot(prompt)
    };
  }
  const state = initialPromptState(prompt, choices);
  scheduleInitialValidation(prompt, host, state, promptInteractionHooks);
  await renderPromptState(host, prompt, state);
  for (;;) {
    const next = await readPromptInput(input, host, prompt.timeoutMs);
    if (next.kind === 'timeout') {
      void input.return?.().catch(() => undefined);
      completePromptState(state);
      const snapshot = createPromptSnapshot(prompt, promptValueForSnapshot(prompt, state), state);
      const timeoutDiagnostic = diagnostic('INPUT_TIMEOUT', 'Prompt timed out before submission.', {
        target: prompt.id ?? prompt.kind,
        data: { timeoutMs: prompt.timeoutMs ?? null }
      });
      return {
        schemaVersion: 'terminal-ui.prompt-result.v1',
        status: 'aborted',
        reason: 'timeout',
        diagnostics: [timeoutDiagnostic],
        snapshot
      };
    }
    const events = next.value.done === true ? decoder.flush() : decoder.decode(next.value.value);
    for (const event of events) {
      transcript?.record({ kind: 'input', event: transcriptEvent(prompt, event) });
      const nextResult = await applyPromptEvent(prompt, host, state, event);
      if (nextResult !== undefined) return nextResult;
    }
    if (next.value.done === true) break;
  }
  completePromptState(state);
  return {
    schemaVersion: 'terminal-ui.prompt-result.v1',
    status: 'aborted',
    reason: 'host_error',
    diagnostics: [diagnostic('HOST_STREAM_CLOSED', 'Prompt input ended before submission.')],
    snapshot: createPromptSnapshot(prompt, promptValueForSnapshot(prompt, state), state)
  };
}

type PromptInputRead =
  | { readonly kind: 'input'; readonly value: IteratorResult<TerminalInputChunk> }
  | { readonly kind: 'timeout' };

async function readPromptInput(
  input: AsyncIterator<TerminalInputChunk>,
  host: TerminalHost,
  timeoutMs: number | undefined
): Promise<PromptInputRead> {
  if (timeoutMs === undefined) return { kind: 'input', value: await input.next() };
  const timeoutController = new AbortController();
  const inputRead = input.next().then((value): PromptInputRead => ({ kind: 'input', value }));
  const immediate = await Promise.race([inputRead, Promise.resolve<undefined>(undefined)]);
  if (immediate !== undefined) return immediate;
  const timeout = host.clock.sleep(timeoutMs, timeoutController.signal).then((): PromptInputRead => ({ kind: 'timeout' }));
  const result = await Promise.race([inputRead, timeout]);
  if (result.kind === 'input') timeoutController.abort();
  return result;
}

async function applyPromptEvent<TValue>(
  prompt: PromptDefinition<TValue>,
  host: TerminalHost,
  state: PromptRuntimeState,
  event: InputEvent
): Promise<PromptResult<TValue> | undefined> {
  if (isInterruptKey(event)) {
    completePromptState(state);
    return {
      schemaVersion: 'terminal-ui.prompt-result.v1',
      status: 'aborted',
      reason: 'interrupted',
      diagnostics: [diagnostic('INPUT_INTERRUPTED', 'Prompt interrupted by user input.')],
      snapshot: createPromptSnapshot(prompt, promptValueForSnapshot(prompt, state), state)
    };
  }
  if (isCancelKey(event)) {
    completePromptState(state);
    return {
      schemaVersion: 'terminal-ui.prompt-result.v1',
      status: 'aborted',
      reason: 'cancelled',
      diagnostics: [diagnostic('INPUT_CANCELLED', 'Prompt cancelled by user input.')],
      snapshot: createPromptSnapshot(prompt, promptValueForSnapshot(prompt, state), state)
    };
  }
  if (prompt.kind === 'confirm') {
    const result = await applyConfirmEvent(prompt as unknown as PromptDefinition<boolean>, host, state, event);
    return result as PromptResult<TValue> | undefined;
  }
  if (prompt.kind === 'select') {
    const result = await applySelectEvent(prompt, host, state, event, promptInteractionHooks);
    return result;
  }
  if (prompt.kind === 'multiselect') {
    const result = await applyMultiSelectEvent(prompt, host, state, event, promptInteractionHooks);
    return result as PromptResult<TValue> | undefined;
  }
  if (prompt.kind === 'autocomplete') {
    const result = await applyAutocompleteEvent(prompt, host, state, event, promptInteractionHooks);
    return result;
  }
  const result = await applyTextPromptEvent(
    prompt as unknown as PromptDefinition<string>,
    host,
    state,
    event,
    promptInteractionHooks
  );
  return result as PromptResult<TValue> | undefined;
}

async function applyConfirmEvent(
  prompt: PromptDefinition<boolean>,
  host: TerminalHost,
  state: PromptRuntimeState,
  event: InputEvent
): Promise<PromptResult<boolean> | undefined> {
  if (event.kind === 'key' && event.key === 'enter') {
    const value = state.confirmValue ?? prompt.defaultValue;
    if (value !== undefined) return submitInteractivePrompt(prompt, value, host, state);
    return undefined;
  }
  if (event.kind !== 'text') return undefined;
  const normalized = event.text.trim().toLowerCase();
  if (normalized === 'y' || normalized === 'yes') {
    state.confirmValue = true;
    return submitInteractivePrompt(prompt, true, host, state);
  }
  if (normalized === 'n' || normalized === 'no') {
    state.confirmValue = false;
    return submitInteractivePrompt(prompt, false, host, state);
  }
  return undefined;
}

async function submitInteractivePrompt<TValue>(
  prompt: PromptDefinition<TValue>,
  value: TValue,
  host: TerminalHost,
  state: PromptRuntimeState
): Promise<PromptResult<TValue>> {
  completePromptState(state);
  await host.write({ text: '\n' });
  const snapshot = createPromptSnapshot(prompt, promptValueForSnapshot(prompt, state, value), state);
  return withPromptDiagnostics(await submitPrompt(prompt, value, snapshot, host), state.choiceDiagnostics);
}

async function renderPromptState<TValue>(
  host: TerminalHost,
  prompt: PromptDefinition<TValue>,
  state: PromptRuntimeState
): Promise<void> {
  const capabilities = await host.getCapabilities();
  await host.write({ text: `\r\u001B[2K${renderPromptText(prompt, state, capabilities)}` });
}

function isInteractivePrompt<TValue>(prompt: PromptDefinition<TValue>): boolean {
  return prompt.kind === 'input'
    || prompt.kind === 'password'
    || prompt.kind === 'confirm'
    || prompt.kind === 'select'
    || prompt.kind === 'multiselect'
    || prompt.kind === 'autocomplete';
}
