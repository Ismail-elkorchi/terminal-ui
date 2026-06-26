import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryTerminalHost } from '../../dist/host/index.js';
import {
  autocomplete,
  confirm,
  editor,
  input,
  multiselect,
  password,
  progress,
  runPrompt,
  select
} from '../../dist/prompts/index.js';
import { createTerminalHarness } from '../../dist/testing/index.js';
import { flushAsync, waitUntil } from '../helpers/async.mjs';

test('prompt factories create typed prompt definitions', () => {
  assert.equal(confirm({ label: 'Continue?', defaultValue: true }).kind, 'confirm');
  assert.equal(input({ label: 'Name', defaultValue: 'Ada' }).kind, 'input');
  assert.equal(password({ label: 'Token', defaultValue: 'secret' }).kind, 'password');
  assert.equal(password({ label: 'Token', mask: '•' }).mask, '•');
  assert.equal(select({ label: 'Pick', choices: [{ label: 'One', value: 1 }], defaultValue: 1 }).kind, 'select');
  assert.equal(multiselect({ label: 'Many', choices: [{ label: 'One', value: 1 }], defaultValue: [1] }).kind, 'multiselect');
  assert.equal(autocomplete({ label: 'Find', choices: [{ label: 'One', value: 1 }], defaultValue: 1 }).kind, 'autocomplete');
  assert.equal(editor({ label: 'Body', defaultValue: 'text' }).kind, 'editor');
  assert.equal(progress({ label: 'Loading' }).kind, 'progress');
  assert.deepEqual(progress({ label: 'Loading' }).nonTty, { mode: 'transcript_only' });
  assert.deepEqual(
    progress({ label: 'Loading', value: 2, max: 5, status: 'Downloading' }).progress,
    { value: 2, max: 5, status: 'Downloading' }
  );
});

test('runPrompt submits defaults, reports validation failures, and redacts password snapshots', async () => {
  const submitted = await runPrompt(input({ label: 'Name', defaultValue: 'Ada' }));
  assert.equal(submitted.status, 'submitted');
  assert.equal(submitted.value, 'Ada');
  assert.equal(submitted.snapshot.root.role, 'textbox');
  assert.equal(submitted.snapshot.root.value, 'Ada');

  const confirmed = await runPrompt(confirm({ label: 'Continue?', defaultValue: true }));
  assert.equal(confirmed.status, 'submitted');
  assert.equal(confirmed.value, true);
  assert.equal(confirmed.snapshot.root.role, 'checkbox');
  assert.equal(confirmed.snapshot.root.value, true);
  assert.equal(confirmed.snapshot.root.checked, true);

  const invalid = await runPrompt(input({
    label: 'Name',
    defaultValue: '',
    validate: () => ({ ok: false, message: 'Name is required.', code: 'required' })
  }));
  assert.equal(invalid.status, 'aborted');
  assert.equal(invalid.reason, 'validation_failed');
  assert.equal(invalid.diagnostics[0]?.code, 'PROMPT_VALIDATION_FAILED');

  const required = await runPrompt(input({ label: 'Name', defaultValue: '', required: true }));
  assert.equal(required.status, 'aborted');
  assert.equal(required.reason, 'validation_failed');
  assert.equal(required.diagnostics[0]?.message, 'Prompt value is required.');
  assert.equal(required.diagnostics[0]?.data?.validationCode, 'required');

  const secret = await runPrompt(password({ label: 'Token', defaultValue: 'super-secret' }));
  assert.equal(secret.status, 'submitted');
  assert.equal(secret.value, 'super-secret');
  assert.equal(secret.snapshot.root.value, null);
  assert.doesNotMatch(JSON.stringify(secret.snapshot), /super-secret/);

  const leakedValidation = await runPrompt(password({
    label: 'Token',
    defaultValue: 'super-secret',
    validate: (value) => ({
      ok: false,
      message: `Rejected password value: ${value}`,
      code: `invalid-${value}`
    })
  }));
  assert.equal(leakedValidation.status, 'aborted');
  assert.equal(leakedValidation.reason, 'validation_failed');
  assert.equal(leakedValidation.diagnostics[0]?.message, 'Rejected password value: [redacted]');
  assert.equal(leakedValidation.diagnostics[0]?.data?.validationCode, 'invalid-[redacted]');
  assert.doesNotMatch(JSON.stringify(leakedValidation.diagnostics), /super-secret/);
  assert.doesNotMatch(JSON.stringify(leakedValidation.snapshot), /super-secret/);

  const thrownValidation = await runPrompt(password({
    label: 'Token',
    defaultValue: 'super-secret',
    validate: (value) => {
      throw new Error(`Rejected ${value}`);
    }
  }));
  assert.equal(thrownValidation.status, 'aborted');
  assert.equal(thrownValidation.reason, 'validation_failed');
  assert.equal(thrownValidation.diagnostics[0]?.message, 'Prompt validation failed before submission.');
  assert.doesNotMatch(JSON.stringify(thrownValidation.diagnostics), /super-secret/);
});

test('runPrompt reports unavailable editor prompts instead of submitting draft defaults', async () => {
  const result = await runPrompt(editor({ label: 'Body', defaultValue: 'draft' }));

  assert.equal(result.status, 'aborted');
  assert.equal(result.reason, 'host_error');
  assert.equal(result.diagnostics[0]?.code, 'PROMPT_EDITOR_UNAVAILABLE');
});

test('runPrompt accepts explicit provided values for editor prompts', async () => {
  const result = await runPrompt(editor({
    label: 'Body',
    nonTty: { mode: 'provided_value', value: 'final body' }
  }));

  assert.equal(result.status, 'submitted');
  assert.equal(result.value, 'final body');
});

test('runPrompt uses explicit editor adapters for long-form editor prompts', async () => {
  const requests = [];
  const host = createMemoryTerminalHost({ env: { VISUAL: 'ignored-visual', EDITOR: 'ignored-editor' } });
  const result = await runPrompt(editor({
    label: 'Body',
    defaultValue: 'draft',
    editorCommand: ['edit-safe', '--wait'],
    editorAdapter: {
      edit: async (request) => {
        requests.push(request);
        return { status: 'submitted', value: `${request.initialValue}\nfinal` };
      }
    }
  }), host);

  assert.equal(result.status, 'submitted');
  assert.equal(result.value, 'draft\nfinal');
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].command, { source: 'option', argv: ['edit-safe', '--wait'] });
  assert.equal(requests[0].host, host);
  assert.equal(result.snapshot.root.value, 'draft\nfinal');
});

test('runPrompt resolves VISUAL before EDITOR without shell-splitting env commands', async () => {
  const commands = [];
  const host = createMemoryTerminalHost({ env: { VISUAL: 'visual editor --flag', EDITOR: 'editor --fallback' } });
  const result = await runPrompt(editor({
    label: 'Body',
    editorAdapter: {
      edit: async (request) => {
        commands.push(request.command);
        return { status: 'submitted', value: 'from visual' };
      }
    }
  }), host);

  assert.equal(result.status, 'submitted');
  assert.equal(result.value, 'from visual');
  assert.deepEqual(commands, [{ source: 'VISUAL', argv: ['visual editor --flag'] }]);
});

test('runPrompt aborts editor adapters on timeout', async () => {
  const host = createMemoryTerminalHost({ env: { EDITOR: 'safe-editor' } });
  let aborted = false;
  const running = runPrompt(editor({
    label: 'Body',
    timeoutMs: 10,
    editorAdapter: {
      edit: async ({ signal }) => new Promise((resolve) => {
        signal.addEventListener('abort', () => {
          aborted = true;
          resolve({ status: 'failed' });
        }, { once: true });
      })
    }
  }), host);

  await flushAsync();
  assert.equal(aborted, false);
  host.clock.advance(10);
  const result = await running;

  assert.equal(aborted, true);
  assert.equal(result.status, 'aborted');
  assert.equal(result.reason, 'host_error');
  assert.equal(result.diagnostics.some((item) => item.code === 'INPUT_TIMEOUT'), true);
});

test('runPrompt reads interactive input from a terminal host', async () => {
  const harness = createTerminalHarness();
  const running = runPrompt(input({ label: 'Name', transcript: { enabled: true } }), harness.host);

  harness.host.input('Ada\r');
  harness.host.stdin.close();
  const result = await running;

  assert.equal(result.status, 'submitted');
  assert.equal(result.value, 'Ada');
  assert.equal(result.snapshot.root.value, 'Ada');
  assert.match(harness.output(), /Name: Ada/);
  assert.equal(result.transcript?.source, 'prompt');
});

test('runPrompt applies prompt theme symbols and terminal styling safely', async () => {
  const themedHarness = createTerminalHarness();
  const themedRun = runPrompt(multiselect({
    label: 'Pick',
    choices: [
      { label: 'One\u001B[31m', value: 'one' },
      { label: 'Two', value: 'two' }
    ],
    defaultValue: ['one'],
    theme: {
      symbols: { pointer: '=>\u001B[31m', checked: '{yes}\u001B[0m', unchecked: '{no}' },
      styles: { tones: { normal: { color: 'brightCyan' } } }
    }
  }), themedHarness.host);

  await waitUntil(() => themedHarness.output().includes('Pick:'));
  const themedOutput = themedHarness.output();
  assert.match(themedOutput, /\u001B\[96m/u);
  assert.match(themedOutput, /=> \{yes\} One/u);
  assert.doesNotMatch(themedOutput, /\u001B\[31m/u);

  themedHarness.host.input('\r');
  themedHarness.host.stdin.close();
  const themedResult = await themedRun;
  assert.equal(themedResult.status, 'submitted');

  const plainHost = createMemoryTerminalHost({ isTty: false });
  plainHost.input('Ada\n');
  plainHost.stdin.close();
  const plainResult = await runPrompt(input({
    label: 'Name',
    theme: { styles: { tones: { normal: { color: 'brightCyan' } } } }
  }), plainHost);

  assert.equal(plainResult.status, 'submitted');
  assert.doesNotMatch(plainHost.output(), /\u001B\[/u);
});

test('runPrompt enforces required interactive text input', async () => {
  const harness = createTerminalHarness();
  const running = runPrompt(input({ label: 'Name', required: true, transcript: { enabled: true } }), harness.host);

  await waitUntil(() => /Prompt value is required\./u.test(harness.output()));
  harness.host.input('\r');
  harness.host.stdin.close();
  const result = await running;

  assert.equal(result.status, 'aborted');
  assert.equal(result.reason, 'validation_failed');
  assert.equal(result.diagnostics[0]?.message, 'Prompt value is required.');
  assert.equal(result.diagnostics[0]?.data?.validationCode, 'required');
  assert.equal(result.transcript?.diagnostics[0]?.message, 'Prompt value is required.');
  assert.equal(result.transcript?.steps.some((step) => step.kind === 'snapshot'), true);
});

test('runPrompt keeps interactive transcripts opt-in', async () => {
  const harness = createTerminalHarness();
  const running = runPrompt(input({ label: 'Name' }), harness.host);

  harness.host.input('Ada\r');
  harness.host.stdin.close();
  const result = await running;

  assert.equal(result.status, 'submitted');
  assert.equal(result.value, 'Ada');
  assert.equal(result.transcript, undefined);
});

test('runPrompt times out interactive prompts through the terminal clock', async () => {
  const harness = createTerminalHarness();

  const running = runPrompt(input({ label: 'Name', timeoutMs: 10, transcript: { enabled: true } }), harness.host);
  await flushAsync();
  harness.clock.advance(10);
  const result = await running;

  assert.equal(result.status, 'aborted');
  assert.equal(result.reason, 'timeout');
  assert.equal(result.diagnostics[0]?.code, 'INPUT_TIMEOUT');
  assert.equal(result.transcript?.diagnostics[0]?.code, 'INPUT_TIMEOUT');
  assert.equal(result.transcript?.steps.some((step) => step.kind === 'snapshot'), true);
});

test('runPrompt accepts queued input before timeout expiry', async () => {
  const host = createMemoryTerminalHost();
  host.input('Ada\r');
  host.stdin.close();

  const result = await runPrompt(input({ label: 'Name', timeoutMs: 10 }), host);

  assert.equal(result.status, 'submitted');
  assert.equal(result.value, 'Ada');
  assert.equal(result.snapshot.root.value, 'Ada');
});

test('runPrompt restores terminal protocols on success, cancellation, interruption, and timeout', async () => {
  const submittedHarness = createTerminalHarness();
  const submittedRun = runPrompt(input({ label: 'Name' }), submittedHarness.host);
  submittedHarness.host.input('Ada\r');
  const submitted = await submittedRun;

  const cancelledHarness = createTerminalHarness();
  const cancelledRun = runPrompt(confirm({ label: 'Continue?' }), cancelledHarness.host);
  cancelledHarness.host.input('\u001B');
  const cancelled = await cancelledRun;

  const interruptedHarness = createTerminalHarness();
  const interruptedRun = runPrompt(input({ label: 'Name' }), interruptedHarness.host);
  interruptedHarness.host.input('\u0003');
  const interrupted = await interruptedRun;

  const timedOutHarness = createTerminalHarness();
  const timedOutRun = runPrompt(input({ label: 'Name', timeoutMs: 10 }), timedOutHarness.host);
  await flushAsync();
  timedOutHarness.clock.advance(10);
  const timedOut = await timedOutRun;

  assert.equal(submitted.status, 'submitted');
  assert.equal(cancelled.status, 'aborted');
  assert.equal(cancelled.reason, 'cancelled');
  assert.equal(interrupted.status, 'aborted');
  assert.equal(interrupted.reason, 'interrupted');
  assert.equal(timedOut.status, 'aborted');
  assert.equal(timedOut.reason, 'timeout');

  for (const harness of [submittedHarness, cancelledHarness, interruptedHarness, timedOutHarness]) {
    assert.equal(harness.restores().length, 1);
    assert.equal(harness.host.stdin.isRawModeEnabled(), false);
  }
});

test('runPrompt uses non-TTY line fallback for input prompts', async () => {
  const host = createMemoryTerminalHost({ isTty: false });
  host.input('Ada\n');
  host.stdin.close();

  const result = await runPrompt(input({ label: 'Name', transcript: { enabled: true } }), host);

  assert.equal(result.status, 'submitted');
  assert.equal(result.value, 'Ada');
  assert.equal(result.snapshot.root.value, 'Ada');
  assert.equal(result.transcript?.steps[0]?.kind, 'input');
  assert.equal((await host.getCapabilities()).isTty, false);
});

test('runPrompt includes non-TTY hints when line fallback receives no input', async () => {
  const host = createMemoryTerminalHost({ isTty: false });
  host.stdin.close();

  const result = await runPrompt(input({
    label: 'Name',
    nonTty: { mode: 'line_fallback', diagnosticHint: 'Pipe a name on stdin.' }
  }), host);

  assert.equal(result.status, 'aborted');
  assert.equal(result.reason, 'non_tty_denied');
  assert.equal(result.diagnostics[0]?.code, 'PROMPT_NON_TTY_DENIED');
  assert.equal(result.diagnostics[0]?.hint, 'Pipe a name on stdin.');
});

test('runPrompt respects explicit non-TTY rejection policy', async () => {
  const host = createMemoryTerminalHost({ isTty: false });
  host.input('Ada\n');
  host.stdin.close();

  const result = await runPrompt(input({
    label: 'Name',
    nonTty: { mode: 'reject', diagnosticHint: 'Pass --name.' }
  }), host);

  assert.equal(result.status, 'aborted');
  assert.equal(result.reason, 'non_tty_denied');
  assert.equal(result.diagnostics[0]?.code, 'PROMPT_NON_TTY_DENIED');
  assert.equal(result.diagnostics[0]?.hint, 'Pass --name.');
});

test('runPrompt reports transcript-only prompts without values as deterministic non-TTY denials', async () => {
  const host = createMemoryTerminalHost({ isTty: false });

  const result = await runPrompt(input({
    label: 'Name',
    nonTty: { mode: 'transcript_only', diagnosticHint: 'Set NAME in the environment.' }
  }), host);

  assert.equal(result.status, 'aborted');
  assert.equal(result.reason, 'non_tty_denied');
  assert.equal(result.diagnostics[0]?.code, 'PROMPT_NON_TTY_DENIED');
  assert.equal(result.diagnostics[0]?.hint, 'Set NAME in the environment.');
  assert.equal(result.snapshot?.root.label, 'Name');
  assert.equal(result.transcript?.steps[0]?.kind, 'snapshot');
});

test('runPrompt supports interactive confirm answers', async () => {
  const harness = createTerminalHarness();
  const running = runPrompt(confirm({ label: 'Continue?' }), harness.host);

  harness.host.input('y');
  harness.host.stdin.close();
  const result = await running;

  assert.equal(result.status, 'submitted');
  assert.equal(result.value, true);
  assert.equal(result.snapshot.root.role, 'checkbox');
  assert.equal(result.snapshot.root.value, true);
  assert.equal(result.snapshot.root.checked, true);
});

test('runPrompt records interactive cancellation diagnostics in transcripts', async () => {
  const harness = createTerminalHarness();
  const running = runPrompt(confirm({ label: 'Continue?', transcript: { enabled: true } }), harness.host);

  harness.host.input('\u001B');
  harness.host.stdin.close();
  const result = await running;

  assert.equal(result.status, 'aborted');
  assert.equal(result.reason, 'cancelled');
  assert.equal(result.diagnostics[0]?.code, 'INPUT_CANCELLED');
  assert.equal(result.transcript?.diagnostics[0]?.code, 'INPUT_CANCELLED');
  assert.equal(result.transcript?.steps.some((step) => step.kind === 'diagnostic'), true);
  assert.equal(result.transcript?.steps.some((step) => step.kind === 'snapshot'), true);
});

test('runPrompt masks password rendering and redacts password transcripts', async () => {
  const harness = createTerminalHarness();
  const running = runPrompt(password({ label: 'Token', mask: '•', transcript: { enabled: true } }), harness.host);

  harness.host.input('s🙂\r');
  harness.host.stdin.close();
  const result = await running;

  assert.equal(result.status, 'submitted');
  assert.equal(result.value, 's🙂');
  assert.equal(result.snapshot.root.value, null);
  assert.doesNotMatch(harness.output(), /s🙂/u);
  assert.doesNotMatch(JSON.stringify(result.transcript), /s🙂/u);
  assert.match(harness.output(), /Token: ••/u);
});

test('runPrompt rejects multiline paste in single-line prompts', async () => {
  const harness = createTerminalHarness();
  const running = runPrompt(input({ label: 'Name' }), harness.host);

  harness.host.input('\u001B[200~Ada\nLovelace\u001B[201~');
  harness.host.stdin.close();
  const result = await running;

  assert.equal(result.status, 'aborted');
  assert.equal(result.reason, 'validation_failed');
  assert.equal(result.diagnostics[0]?.code, 'PROMPT_VALIDATION_FAILED');
});

test('runPrompt suppresses stale interactive validation results', async () => {
  const harness = createTerminalHarness();
  const requests = [];
  const running = runPrompt(input({
    label: 'Name',
    validate: (value, { signal }) => new Promise((resolve) => {
      requests.push({ value, resolve, signal });
    })
  }), harness.host);

  await waitUntil(() => requests.some((request) => request.value === ''));
  harness.host.input('a');
  await waitUntil(() => requests.some((request) => request.value === 'a'));
  harness.host.input('b');
  await waitUntil(() => requests.some((request) => request.value === 'ab'));

  const aRequest = requests.find((request) => request.value === 'a');
  const abRequest = requests.find((request) => request.value === 'ab');
  assert.equal(aRequest.signal.aborted, true);
  aRequest.resolve({ ok: false, message: 'Stale one-character value.' });
  await flushAsync();
  assert.doesNotMatch(harness.output(), /Stale one-character value/u);

  abRequest.resolve({ ok: false, message: 'Use a longer value.' });
  await waitUntil(() => /Use a longer value\./u.test(harness.output()));
  assert.doesNotMatch(harness.output(), /Stale one-character value/u);

  harness.host.input('\u0003');
  harness.host.stdin.close();
  const result = await running;
  assert.equal(result.status, 'aborted');
  assert.equal(result.reason, 'interrupted');
});

test('runPrompt redacts password values from live validation feedback', async () => {
  const harness = createTerminalHarness();
  const running = runPrompt(password({
    label: 'Token',
    validate: (value) => ({
      ok: false,
      message: `Rejected password value: ${value}`
    })
  }), harness.host);

  harness.host.input('super-secret');
  await waitUntil(() => /Rejected password value: \[redacted\]/u.test(harness.output()));
  assert.doesNotMatch(harness.output(), /super-secret/u);

  harness.host.input('\u0003');
  harness.host.stdin.close();
  const result = await running;
  assert.equal(result.status, 'aborted');
  assert.equal(result.reason, 'interrupted');
});
