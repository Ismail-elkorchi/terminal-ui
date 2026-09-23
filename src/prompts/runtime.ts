import type { AccessibleSnapshot } from '../accessibility/index.ts';
import { diagnostic } from '../diagnostics.ts';
import { requireCommittedTerminalWrite } from '../host/write-receipt.ts';
import { createTerminalHost } from '../host/index.ts';
import type { TerminalHost } from '../host/index.ts';
import { isCancelKey, isInterruptKey } from '../input/index.ts';
import type { InputEvent } from '../input/index.ts';
import type { TranscriptRecorder } from '../transcript/index.ts';
import {
  applyAutocompleteEvent,
  applyMultiSelectEvent,
  applySelectEvent
} from './choice-interaction.ts';
import { resolvePromptChoices } from './choices.ts';
import type { ChoiceResolution } from './choices.ts';
import { assertPromptDefinition } from './definition.ts';
import { runEditorPrompt } from './editor.ts';
import type { PromptInteractionHooks } from './interaction-hooks.ts';
import { nonTtyDiagnosticOptions, nonTtyMode } from './non-tty.ts';
import { runProgressPrompt } from './progress-runtime.ts';
import { promptInputEvents } from './input-events.ts';
import { renderPromptText } from './render-theme.ts';
import { raisePromptCleanupFailure, runOwnedPrompt, type PromptTaskOwner } from './session.ts';
import { createPromptSnapshot, promptValueForSnapshot } from './snapshot.ts';
import { completePromptState, initialPromptState } from './state.ts';
import type { PromptRuntimeState } from './state.ts';
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
import type {
  AutocompletePromptDefinition,
  ConfirmPromptDefinition,
  EditorPromptDefinition,
  InputPromptDefinition,
  InteractivePromptDefinition,
  MultiSelectPromptDefinition,
  PasswordPromptDefinition,
  ProgressPromptDefinition,
  ProgressResult,
  PromptDefinition,
  PromptAbortResult,
  PromptResult,
  PromptValueContract,
  SelectPromptDefinition,
  TextPromptDefinition
} from './types.ts';

type InteractivePromptValue<TChoice> = boolean | string | TChoice | readonly TChoice[];
type PromptRunValue<TChoice> = InteractivePromptValue<TChoice> | ProgressResult;

/** Runs one prompt. An omitted host is owned and disposed by the call; a supplied host stays caller-owned. */
export function runPrompt(
  prompt: ConfirmPromptDefinition,
  host?: TerminalHost
): Promise<PromptResult<boolean>>;
export function runPrompt(
  prompt: InputPromptDefinition | PasswordPromptDefinition | EditorPromptDefinition,
  host?: TerminalHost
): Promise<PromptResult<string>>;
export function runPrompt<TValue>(
  prompt: SelectPromptDefinition<TValue> | AutocompletePromptDefinition<TValue>,
  host?: TerminalHost
): Promise<PromptResult<TValue>>;
export function runPrompt<TValue>(
  prompt: MultiSelectPromptDefinition<TValue>,
  host?: TerminalHost
): Promise<PromptResult<readonly TValue[]>>;
export function runPrompt(
  prompt: ProgressPromptDefinition,
  host?: TerminalHost
): Promise<PromptResult<ProgressResult>>;
export async function runPrompt<TChoice>(
  prompt: PromptDefinition<TChoice>,
  host?: TerminalHost
): Promise<PromptResult<PromptRunValue<TChoice>>> {
  assertPromptDefinition(prompt);
  const ownsHost = host === undefined;
  const terminalHost = host ?? createTerminalHost();
  let result: PromptResult<PromptRunValue<TChoice>>;
  try {
    result = await runPromptWithHost(prompt, terminalHost);
  } catch (cause) {
    if (ownsHost) {
      try {
        await terminalHost.dispose();
      } catch (cleanupCause) {
        throw new AggregateError(
          [cause, cleanupCause],
          'Prompt execution and default terminal host cleanup both failed.',
          { cause: cleanupCause }
        );
      }
    }
    throw cause;
  }
  if (!ownsHost) return result;
  try {
    await terminalHost.dispose();
    return result;
  } catch (cause) {
    return withPromptDiagnostics(result, [
      diagnostic('HOST_RESTORE_FAILED', 'Default terminal host cleanup failed after prompt execution.', {
        cause,
        target: prompt.id ?? prompt.kind
      })
    ]);
  }
}

async function runPromptWithHost<TChoice>(
  prompt: PromptDefinition<TChoice>,
  host: TerminalHost
): Promise<PromptResult<PromptRunValue<TChoice>>> {
  if (prompt.kind === 'progress' && prompt.progressTask !== undefined) {
    return runProgressPrompt(prompt, host);
  }
  if (host.stdin.isTty() && isInteractivePrompt(prompt)) {
    return runInteractivePrompt(prompt, host);
  }

  const snapshot = createPromptSnapshot(prompt);
  if (nonTtyMode(prompt) === 'transcript_only') {
    return runTranscriptOnlyPrompt(prompt, snapshot, host);
  }
  if (prompt.kind === 'editor') return runEditorPrompt(prompt, snapshot, host);

  const provided = await submitProvidedNonTtyValue(prompt, snapshot, host);
  if (provided !== undefined) return provided;

  const defaultResult = await submitDefaultNonTtyValue(prompt, snapshot, host);
  if (defaultResult !== undefined) return defaultResult;

  if (!host.stdin.isTty() && prompt.kind === 'input' && nonTtyMode(prompt) === 'line_fallback') {
    return runLineFallbackPrompt(prompt, host);
  }
  return nonTtyDenied(prompt, snapshot);
}

async function runTranscriptOnlyPrompt<TChoice>(
  prompt: PromptDefinition<TChoice>,
  snapshot: AccessibleSnapshot,
  host: TerminalHost | undefined
): Promise<PromptResult<PromptRunValue<TChoice>>> {
  const transcript = createTranscriptOnlyPromptTranscript(prompt);
  transcript.record({ kind: 'snapshot', snapshot });
  const result = await submitDefaultValue(prompt, snapshot, host);
  if (result !== undefined) return withPromptTranscript(result, transcript.snapshot());
  return {
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

async function submitProvidedNonTtyValue<TChoice>(
  prompt: PromptDefinition<TChoice>,
  snapshot: AccessibleSnapshot,
  host: TerminalHost | undefined
): Promise<PromptResult<PromptRunValue<TChoice>> | undefined> {
  switch (prompt.kind) {
    case 'confirm':
      return prompt.nonTty?.mode === 'provided_value' ? submitPrompt(prompt, prompt.nonTty.value, snapshot, host) : undefined;
    case 'input':
      return prompt.nonTty?.mode === 'provided_value' ? submitPrompt(prompt, prompt.nonTty.value, snapshot, host) : undefined;
    case 'password':
      return prompt.nonTty?.mode === 'provided_value' ? submitPrompt(prompt, prompt.nonTty.value, snapshot, host) : undefined;
    case 'select':
      return prompt.nonTty?.mode === 'provided_value' ? submitPrompt(prompt, prompt.nonTty.value, snapshot, host) : undefined;
    case 'multiselect':
      return prompt.nonTty?.mode === 'provided_value' ? submitPrompt(prompt, prompt.nonTty.value, snapshot, host) : undefined;
    case 'autocomplete':
      return prompt.nonTty?.mode === 'provided_value' ? submitPrompt(prompt, prompt.nonTty.value, snapshot, host) : undefined;
    case 'progress':
      return prompt.nonTty?.mode === 'provided_value' ? submitPrompt(prompt, prompt.nonTty.value, snapshot, host) : undefined;
    case 'editor':
      return undefined;
  }
}

async function submitDefaultNonTtyValue<TChoice>(
  prompt: PromptDefinition<TChoice>,
  snapshot: AccessibleSnapshot,
  host: TerminalHost | undefined
): Promise<PromptResult<PromptRunValue<TChoice>> | undefined> {
  if (prompt.nonTty?.mode === 'reject') return undefined;
  switch (prompt.kind) {
    case 'confirm':
      return prompt.defaultValue === undefined ? undefined : submitPrompt(prompt, prompt.defaultValue, snapshot, host);
    case 'input':
      return prompt.defaultValue === undefined ? undefined : submitPrompt(prompt, prompt.defaultValue, snapshot, host);
    case 'password':
      return prompt.defaultValue === undefined ? undefined : submitPrompt(prompt, prompt.defaultValue, snapshot, host);
    default:
      return undefined;
  }
}

async function submitDefaultValue<TChoice>(
  prompt: PromptDefinition<TChoice>,
  snapshot: AccessibleSnapshot,
  host: TerminalHost | undefined
): Promise<PromptResult<PromptRunValue<TChoice>> | undefined> {
  switch (prompt.kind) {
    case 'confirm':
      return prompt.defaultValue === undefined ? undefined : submitPrompt(prompt, prompt.defaultValue, snapshot, host);
    case 'input':
      return prompt.defaultValue === undefined ? undefined : submitPrompt(prompt, prompt.defaultValue, snapshot, host);
    case 'password':
      return prompt.defaultValue === undefined ? undefined : submitPrompt(prompt, prompt.defaultValue, snapshot, host);
    case 'select':
      return prompt.defaultValue === undefined ? undefined : submitPrompt(prompt, prompt.defaultValue, snapshot, host);
    case 'multiselect':
      return prompt.defaultValue === undefined ? undefined : submitPrompt(prompt, prompt.defaultValue, snapshot, host);
    case 'autocomplete':
      return prompt.defaultValue === undefined ? undefined : submitPrompt(prompt, prompt.defaultValue, snapshot, host);
    case 'editor':
      return prompt.defaultValue === undefined ? undefined : submitPrompt(prompt, prompt.defaultValue, snapshot, host);
    case 'progress':
      return submitPrompt(prompt, { completed: false }, snapshot, host);
  }
}

function nonTtyDenied<TChoice>(
  prompt: PromptDefinition<TChoice>,
  snapshot: AccessibleSnapshot
): PromptAbortResult {
  return {
    status: 'aborted',
    reason: 'non_tty_denied',
    diagnostics: [
      diagnostic('PROMPT_NON_TTY_DENIED', 'Prompt has no default value or explicit non-TTY answer.', nonTtyDiagnosticOptions(prompt))
    ],
    snapshot
  };
}

async function runLineFallbackPrompt(
  prompt: InputPromptDefinition,
  host: TerminalHost
): Promise<PromptResult<string>> {
  const line = await readLineFallback(host);
  const snapshot = createPromptSnapshot(prompt, line ?? null);
  if (line === undefined) return nonTtyDenied(prompt, snapshot);
  const transcript = createPromptTranscript(prompt);
  transcript?.record({ kind: 'input', event: { kind: 'text', text: line, paste: false } });
  const result = await submitPrompt(prompt, line, snapshot, host);
  recordPromptResult(transcript, result);
  return withPromptTranscript(result, transcript?.snapshot());
}

async function readLineFallback(host: TerminalHost): Promise<string | undefined> {
  const decoder = new TextDecoder();
  const parts: string[] = [];
  for await (const chunk of host.stdin.read()) {
    const text = typeof chunk.data === 'string'
      ? decoder.decode() + chunk.data
      : decoder.decode(chunk.data, { stream: true });
    const newline = text.indexOf('\n');
    if (newline !== -1) {
      parts.push(text.slice(0, newline));
      return parts.join('').replace(/\r$/u, '');
    }
    parts.push(text);
  }
  parts.push(decoder.decode());
  const text = parts.join('');
  return text.length === 0 ? undefined : text;
}

async function runInteractivePrompt<TChoice>(
  prompt: InteractivePromptDefinition<TChoice>,
  host: TerminalHost
): Promise<PromptResult<InteractivePromptValue<TChoice>>> {
  const transcript = createPromptTranscript(prompt);
  const deadline = prompt.timeoutMs === undefined ? undefined : host.clock.monotonicNow() + prompt.timeoutMs;
  const result = await runOwnedPrompt<InteractivePromptValue<TChoice>>(
    host,
    prompt.id ?? `prompt-${prompt.kind}`,
    (owner) => runPromptLoop(prompt, host, transcript, owner, deadline),
    (cause) => ({
      status: 'aborted',
      reason: 'host_error',
      diagnostics: [
        diagnostic('HOST_STREAM_CLOSED', 'Prompt failed during terminal session.', {
          cause,
          target: prompt.id ?? prompt.kind
        })
      ],
      snapshot: createPromptSnapshot(prompt)
    }),
    true
  );
  recordPromptResult(transcript, result);
  return withPromptTranscript(result, transcript?.snapshot());
}

async function runPromptLoop<TChoice>(
  prompt: InteractivePromptDefinition<TChoice>,
  host: TerminalHost,
  transcript: TranscriptRecorder | undefined,
  owner: PromptTaskOwner,
  deadline: number | undefined
): Promise<PromptResult<InteractivePromptValue<TChoice>>> {
  const inputController = new AbortController();
  const abortInput = (): void => { inputController.abort(owner.signal.reason); };
  owner.signal.addEventListener('abort', abortInput, { once: true });
  if (owner.signal.aborted) abortInput();
  const input = promptInputEvents(host, inputController.signal, { bracketedPaste: owner.bracketedPaste })[Symbol.asyncIterator]();
  let state: PromptRuntimeState<TChoice> | undefined;
  let loopFailure: unknown;
  let loopFailed = false;
  try {
    let choices: ChoiceResolution<TChoice> = { status: 'resolved', choices: [], diagnostics: [], hasMore: false };
    const buffered: InputEvent[] = [];
    let pendingRead: Promise<PromptInputRead> | undefined;
    if (isChoicePrompt(prompt)) {
      const load = resolvePromptChoices(prompt, owner.signal);
      for (;;) {
        pendingRead ??= readPromptInput(input, host, deadline, owner.signal);
        const next = await owner.wait(Promise.race([
          load.then((value) => ({ kind: 'choices' as const, value })),
          pendingRead.then((value) => ({ kind: 'read' as const, value }))
        ]));
        if (next.kind === 'choices') {
          choices = next.value;
          break;
        }
        pendingRead = undefined;
        if (next.value.kind === 'timeout') return timeoutPromptResult(prompt);
        if (next.value.value.done === true) return inputEndedPromptResult(prompt);
        const event = next.value.value.value;
        const abort = isInterruptKey(event) || isCancelKey(event)
          ? terminalInputAbort(prompt, initialPromptState(prompt), event)
          : undefined;
        if (abort !== undefined) return abort;
        buffered.push(event);
      }
    }
    if (choices.status === 'failed') {
      return {
        status: 'aborted', reason: 'host_error', diagnostics: choices.diagnostics,
        snapshot: createPromptSnapshot(prompt)
      };
    }
    state = initialPromptState(prompt, choices);
    scheduleInitialValidation(prompt, host, state, {
      owner, render: (renderHost, renderPrompt, renderState) => renderPromptState(renderHost, renderPrompt, renderState, owner)
    });
    await owner.wait(renderPromptState(host, prompt, state, owner));
    for (;;) {
      const queued = buffered.shift();
      const next = queued !== undefined
        ? { kind: 'input' as const, value: { done: false as const, value: queued } }
        : await owner.wait(pendingRead ?? readPromptInput(input, host, deadline, owner.signal));
      pendingRead = undefined;
      if (next.kind === 'timeout') {
        completePromptState(state);
        return timeoutPromptResult(prompt, state);
      }
      if (next.value.done === true) break;
      const event = next.value.value;
      transcript?.record({ kind: 'input', event: transcriptEvent(prompt, event) });
      const nextResult = await owner.wait(applyPromptEvent(prompt, host, state, event, owner));
      if (nextResult !== undefined) return nextResult;
    }
    completePromptState(state);
    return inputEndedPromptResult(prompt, state);
  } catch (cause) {
    loopFailure = cause;
    loopFailed = true;
    throw cause;
  } finally {
    if (state !== undefined) completePromptState(state);
    inputController.abort();
    owner.signal.removeEventListener('abort', abortInput);
    try {
      await input.return?.();
    } catch (cleanup) {
      raisePromptCleanupFailure(loopFailure, cleanup, loopFailed);
    }
  }
}

function timeoutPromptResult<TChoice>(
  prompt: InteractivePromptDefinition<TChoice>,
  state?: PromptRuntimeState<TChoice>
): PromptAbortResult {
  return {
    status: 'aborted', reason: 'timeout',
    diagnostics: [diagnostic('INPUT_TIMEOUT', 'Prompt timed out before submission.', {
      target: prompt.id ?? prompt.kind, data: { timeoutMs: prompt.timeoutMs ?? null }
    })],
    snapshot: state === undefined
      ? createPromptSnapshot(prompt)
      : createPromptSnapshot(prompt, promptValueForSnapshot(prompt, state), state)
  };
}

function inputEndedPromptResult<TChoice>(
  prompt: InteractivePromptDefinition<TChoice>,
  state?: PromptRuntimeState<TChoice>
): PromptAbortResult {
  return {
    status: 'aborted', reason: 'host_error',
    diagnostics: [diagnostic('HOST_STREAM_CLOSED', 'Prompt input ended before submission.')],
    snapshot: state === undefined
      ? createPromptSnapshot(prompt)
      : createPromptSnapshot(prompt, promptValueForSnapshot(prompt, state), state)
  };
}

type PromptInputRead =
  | { readonly kind: 'input'; readonly value: IteratorResult<InputEvent> }
  | { readonly kind: 'timeout' };

async function readPromptInput(
  input: AsyncIterator<InputEvent>,
  host: TerminalHost,
  deadline: number | undefined,
  signal: AbortSignal
): Promise<PromptInputRead> {
  if (deadline === undefined) return { kind: 'input', value: await input.next() };
  const timeoutController = new AbortController();
  const abort = (): void => { timeoutController.abort(); };
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) timeoutController.abort();
  try {
    const inputRead = input.next().then((value): PromptInputRead => ({ kind: 'input', value }));
    const immediate = await Promise.race([inputRead, Promise.resolve<undefined>(undefined)]);
    if (immediate !== undefined) return immediate;
    const remaining = deadline - host.clock.monotonicNow();
    if (remaining <= 0) return { kind: 'timeout' };
    const timeout = host.clock.sleep(remaining, timeoutController.signal)
      .then((outcome): Promise<PromptInputRead> | PromptInputRead => outcome === 'elapsed'
        ? { kind: 'timeout' }
        : new Promise<PromptInputRead>(() => undefined));
    const result = await Promise.race([inputRead, timeout]);
    if (result.kind === 'input') timeoutController.abort();
    return result;
  } finally {
    timeoutController.abort();
    signal.removeEventListener('abort', abort);
  }
}

async function applyPromptEvent<TChoice>(
  prompt: InteractivePromptDefinition<TChoice>,
  host: TerminalHost,
  state: PromptRuntimeState<TChoice>,
  event: InputEvent,
  owner: PromptTaskOwner
): Promise<PromptResult<InteractivePromptValue<TChoice>> | undefined> {
  const interrupted = terminalInputAbort(prompt, state, event);
  if (interrupted !== undefined) return interrupted;
  if (prompt.kind === 'confirm') return applyConfirmEvent(prompt, host, state, event, owner);
  if (prompt.kind === 'select') {
    return applySelectEvent(prompt, host, state, event, interactionHooks<TChoice, SelectPromptDefinition<TChoice>, TChoice>(owner));
  }
  if (prompt.kind === 'multiselect') {
    return applyMultiSelectEvent(
      prompt,
      host,
      state,
      event,
      interactionHooks<TChoice, MultiSelectPromptDefinition<TChoice>, readonly TChoice[]>(owner)
    );
  }
  if (prompt.kind === 'autocomplete') {
    return applyAutocompleteEvent(
      prompt,
      host,
      state,
      event,
      interactionHooks<TChoice, AutocompletePromptDefinition<TChoice>, TChoice>(owner)
    );
  }
  return applyTextPromptEvent(
    prompt,
    host,
    state,
    event,
    interactionHooks<TChoice, TextPromptDefinition, string>(owner)
  );
}

function terminalInputAbort<TChoice>(
  prompt: InteractivePromptDefinition<TChoice>,
  state: PromptRuntimeState<TChoice>,
  event: InputEvent
): PromptAbortResult | undefined {
  const abort = isInterruptKey(event)
    ? { reason: 'interrupted' as const, code: 'INPUT_INTERRUPTED' as const, message: 'Prompt interrupted by user input.' }
    : isCancelKey(event)
      ? { reason: 'cancelled' as const, code: 'INPUT_CANCELLED' as const, message: 'Prompt cancelled by user input.' }
      : undefined;
  if (abort === undefined) return undefined;
  completePromptState(state);
  return {
    status: 'aborted',
    reason: abort.reason,
    diagnostics: [diagnostic(abort.code, abort.message)],
    snapshot: createPromptSnapshot(prompt, promptValueForSnapshot(prompt, state), state)
  };
}

async function applyConfirmEvent<TChoice>(
  prompt: ConfirmPromptDefinition,
  host: TerminalHost,
  state: PromptRuntimeState<TChoice>,
  event: InputEvent,
  owner: PromptTaskOwner
): Promise<PromptResult<boolean> | undefined> {
  if (event.kind === 'key' && event.key === 'enter') {
    const value = state.confirmValue ?? prompt.defaultValue;
    return value === undefined ? undefined : submitInteractiveValue<TChoice, boolean>(prompt, value, host, state, owner);
  }
  if (event.kind !== 'text') return undefined;
  const normalized = event.text.trim().toLowerCase();
  if (normalized === 'y' || normalized === 'yes') {
    state.confirmValue = true;
    return submitInteractiveValue<TChoice, boolean>(prompt, true, host, state, owner);
  }
  if (normalized === 'n' || normalized === 'no') {
    state.confirmValue = false;
    return submitInteractiveValue<TChoice, boolean>(prompt, false, host, state, owner);
  }
  return undefined;
}

function interactionHooks<
  TChoice,
  TPrompt extends PromptDefinition<TChoice> & PromptValueContract<TValue>,
  TValue
>(owner: PromptTaskOwner): PromptInteractionHooks<TChoice, TPrompt, TValue> {
  return {
    owner,
    render: (host, prompt, state) => renderPromptState<TChoice>(host, prompt, state, owner),
    submit: (prompt, value, host, state) => submitInteractiveValue<TChoice, TValue>(prompt, value, host, state, owner)
  };
}

async function submitInteractiveValue<TChoice, TValue>(
  prompt: PromptDefinition<TChoice> & PromptValueContract<TValue>,
  value: TValue,
  host: TerminalHost,
  state: PromptRuntimeState<TChoice>,
  owner: PromptTaskOwner
): Promise<PromptResult<TValue>> {
  completePromptState(state);
  await owner.publish(async () => { requireCommittedTerminalWrite(await host.write({ text: '\n' })); });
  const snapshot = createPromptSnapshot<TChoice>(
    prompt,
    promptValueForSnapshot<TChoice>(prompt, state, value),
    state
  );
  return withPromptDiagnostics(await submitPrompt(prompt, value, snapshot, host), state.choiceDiagnostics);
}

async function renderPromptState<TChoice>(
  host: TerminalHost,
  prompt: PromptDefinition<TChoice>,
  state: PromptRuntimeState<TChoice>,
  owner: PromptTaskOwner
): Promise<void> {
  await owner.publish(async () => {
    const capabilities = await host.getCapabilities();
    if (!owner.active || owner.failed) return;
    requireCommittedTerminalWrite(await host.write({
      text: `\r\u001B[2K${renderPromptText(prompt, state, capabilities)}`
    }));
  });
}

function isInteractivePrompt<TChoice>(
  prompt: PromptDefinition<TChoice>
): prompt is InteractivePromptDefinition<TChoice> {
  return prompt.kind === 'input'
    || prompt.kind === 'password'
    || prompt.kind === 'confirm'
    || prompt.kind === 'select'
    || prompt.kind === 'multiselect'
    || prompt.kind === 'autocomplete';
}

function isChoicePrompt<TChoice>(
  prompt: InteractivePromptDefinition<TChoice>
): prompt is SelectPromptDefinition<TChoice> | MultiSelectPromptDefinition<TChoice> | AutocompletePromptDefinition<TChoice> {
  return prompt.kind === 'select' || prompt.kind === 'multiselect' || prompt.kind === 'autocomplete';
}
