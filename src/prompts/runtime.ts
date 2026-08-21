import type { AccessibleSnapshot } from '../accessibility/index.ts';
import { diagnostic } from '../diagnostics.ts';
import { requireCommittedTerminalWrite } from '../host/write-receipt.ts';
import { createTerminalHost } from '../host/index.ts';
import type { TerminalHost, TerminalRestoreReason } from '../host/index.ts';
import { isCancelKey, isInterruptKey } from '../input/index.ts';
import type { InputEvent } from '../input/index.ts';
import type { TranscriptRecorder } from '../transcript/index.ts';
import {
  applyAutocompleteEvent,
  applyMultiSelectEvent,
  applySelectEvent
} from './choice-interaction.ts';
import { resolvePromptChoices } from './choices.ts';
import { assertPromptDefinition } from './definition.ts';
import { runEditorPrompt } from './editor.ts';
import type { PromptInteractionHooks } from './interaction-hooks.ts';
import { nonTtyDiagnosticOptions, nonTtyMode } from './non-tty.ts';
import { runProgressPrompt } from './progress-runtime.ts';
import { promptInputEvents } from './input-events.ts';
import { renderPromptText } from './render-theme.ts';
import { setupPromptSession, restoreReasonForPrompt } from './session.ts';
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
  let text = '';
  for await (const chunk of host.stdin.read()) {
    text += typeof chunk.data === 'string' ? chunk.data : new TextDecoder().decode(chunk.data);
    const newline = text.search(/\r?\n/u);
    if (newline !== -1) return text.slice(0, newline).replace(/\r$/u, '');
  }
  return text.length === 0 ? undefined : text;
}

async function runInteractivePrompt<TChoice>(
  prompt: InteractivePromptDefinition<TChoice>,
  host: TerminalHost
): Promise<PromptResult<InteractivePromptValue<TChoice>>> {
  const session = await host.beginSession({ id: prompt.id ?? `prompt-${prompt.kind}` });
  const transcript = createPromptTranscript(prompt);
  const setup = await setupPromptSession(session);
  let result: PromptResult<InteractivePromptValue<TChoice>>;
  let restoreReason: TerminalRestoreReason;
  try {
    result = await runPromptLoop(prompt, host, transcript, setup.bracketedPaste);
    restoreReason = restoreReasonForPrompt(result);
  } catch (cause) {
    restoreReason = 'error';
    result = {
      status: 'aborted',
      reason: 'host_error',
      diagnostics: [
        diagnostic('HOST_STREAM_CLOSED', 'Prompt failed while reading terminal input.', {
          cause,
          target: prompt.id ?? prompt.kind
        })
      ],
      snapshot: createPromptSnapshot(prompt)
    };
  }
  const restore = await session.restore(restoreReason);
  const finalResult = withPromptDiagnostics(result, [...setup.diagnostics, ...restore.diagnostics]);
  recordPromptResult(transcript, finalResult);
  return withPromptTranscript(finalResult, transcript?.snapshot());
}

async function runPromptLoop<TChoice>(
  prompt: InteractivePromptDefinition<TChoice>,
  host: TerminalHost,
  transcript: TranscriptRecorder | undefined,
  bracketedPaste: boolean
): Promise<PromptResult<InteractivePromptValue<TChoice>>> {
  const inputController = new AbortController();
  const input = promptInputEvents(host, inputController.signal, { bracketedPaste })[Symbol.asyncIterator]();
  const choices = isChoicePrompt(prompt)
    ? await resolvePromptChoices(prompt)
    : { status: 'resolved' as const, choices: [], diagnostics: [], hasMore: false };
  if (choices.status === 'failed') {
    return {
      status: 'aborted',
      reason: 'host_error',
      diagnostics: choices.diagnostics,
      snapshot: createPromptSnapshot(prompt)
    };
  }
  const state = initialPromptState(prompt, choices);
  try {
    scheduleInitialValidation(prompt, host, state, { render: renderPromptState });
    await renderPromptState(host, prompt, state);
    for (;;) {
      const next = await readPromptInput(input, host, prompt.timeoutMs);
      if (next.kind === 'timeout') {
        completePromptState(state);
        return {
          status: 'aborted',
          reason: 'timeout',
          diagnostics: [
            diagnostic('INPUT_TIMEOUT', 'Prompt timed out before submission.', {
              target: prompt.id ?? prompt.kind,
              data: { timeoutMs: prompt.timeoutMs ?? null }
            })
          ],
          snapshot: createPromptSnapshot(prompt, promptValueForSnapshot(prompt, state), state)
        };
      }
      if (next.value.done === true) break;
      const event = next.value.value;
      transcript?.record({ kind: 'input', event: transcriptEvent(prompt, event) });
      const nextResult = await applyPromptEvent(prompt, host, state, event);
      if (nextResult !== undefined) return nextResult;
    }
    completePromptState(state);
    return {
      status: 'aborted',
      reason: 'host_error',
      diagnostics: [diagnostic('HOST_STREAM_CLOSED', 'Prompt input ended before submission.')],
      snapshot: createPromptSnapshot(prompt, promptValueForSnapshot(prompt, state), state)
    };
  } finally {
    inputController.abort();
    await input.return?.();
  }
}

type PromptInputRead =
  | { readonly kind: 'input'; readonly value: IteratorResult<InputEvent> }
  | { readonly kind: 'timeout' };

async function readPromptInput(
  input: AsyncIterator<InputEvent>,
  host: TerminalHost,
  timeoutMs: number | undefined
): Promise<PromptInputRead> {
  if (timeoutMs === undefined) return { kind: 'input', value: await input.next() };
  const timeoutController = new AbortController();
  const inputRead = input.next().then((value): PromptInputRead => ({ kind: 'input', value }));
  const immediate = await Promise.race([inputRead, Promise.resolve<undefined>(undefined)]);
  if (immediate !== undefined) return immediate;
  const timeout = host.clock.sleep(timeoutMs, timeoutController.signal)
    .then((outcome): Promise<PromptInputRead> | PromptInputRead => outcome === 'elapsed'
      ? { kind: 'timeout' }
      : new Promise<PromptInputRead>(() => undefined));
  const result = await Promise.race([inputRead, timeout]);
  if (result.kind === 'input') timeoutController.abort();
  return result;
}

async function applyPromptEvent<TChoice>(
  prompt: InteractivePromptDefinition<TChoice>,
  host: TerminalHost,
  state: PromptRuntimeState<TChoice>,
  event: InputEvent
): Promise<PromptResult<InteractivePromptValue<TChoice>> | undefined> {
  const interrupted = terminalInputAbort(prompt, state, event);
  if (interrupted !== undefined) return interrupted;
  if (prompt.kind === 'confirm') return applyConfirmEvent(prompt, host, state, event);
  if (prompt.kind === 'select') {
    return applySelectEvent(prompt, host, state, event, interactionHooks<TChoice, SelectPromptDefinition<TChoice>, TChoice>());
  }
  if (prompt.kind === 'multiselect') {
    return applyMultiSelectEvent(
      prompt,
      host,
      state,
      event,
      interactionHooks<TChoice, MultiSelectPromptDefinition<TChoice>, readonly TChoice[]>()
    );
  }
  if (prompt.kind === 'autocomplete') {
    return applyAutocompleteEvent(
      prompt,
      host,
      state,
      event,
      interactionHooks<TChoice, AutocompletePromptDefinition<TChoice>, TChoice>()
    );
  }
  return applyTextPromptEvent(
    prompt,
    host,
    state,
    event,
    interactionHooks<TChoice, TextPromptDefinition, string>()
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
  event: InputEvent
): Promise<PromptResult<boolean> | undefined> {
  if (event.kind === 'key' && event.key === 'enter') {
    const value = state.confirmValue ?? prompt.defaultValue;
    return value === undefined ? undefined : submitInteractiveValue<TChoice, boolean>(prompt, value, host, state);
  }
  if (event.kind !== 'text') return undefined;
  const normalized = event.text.trim().toLowerCase();
  if (normalized === 'y' || normalized === 'yes') {
    state.confirmValue = true;
    return submitInteractiveValue<TChoice, boolean>(prompt, true, host, state);
  }
  if (normalized === 'n' || normalized === 'no') {
    state.confirmValue = false;
    return submitInteractiveValue<TChoice, boolean>(prompt, false, host, state);
  }
  return undefined;
}

function interactionHooks<
  TChoice,
  TPrompt extends PromptDefinition<TChoice> & PromptValueContract<TValue>,
  TValue
>(): PromptInteractionHooks<TChoice, TPrompt, TValue> {
  return {
    render: (host, prompt, state) => renderPromptState<TChoice>(host, prompt, state),
    submit: (prompt, value, host, state) => submitInteractiveValue<TChoice, TValue>(prompt, value, host, state)
  };
}

async function submitInteractiveValue<TChoice, TValue>(
  prompt: PromptDefinition<TChoice> & PromptValueContract<TValue>,
  value: TValue,
  host: TerminalHost,
  state: PromptRuntimeState<TChoice>
): Promise<PromptResult<TValue>> {
  completePromptState(state);
  requireCommittedTerminalWrite(await host.write({ text: '\n' }));
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
  state: PromptRuntimeState<TChoice>
): Promise<void> {
  const capabilities = await host.getCapabilities();
  requireCommittedTerminalWrite(await host.write({
    text: `\r\u001B[2K${renderPromptText(prompt, state, capabilities)}`
  }));
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
