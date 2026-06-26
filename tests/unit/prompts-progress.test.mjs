import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { createProgress, progress, runPrompt } from '../../dist/prompts/index.js';
import { validateAccessibleSnapshot } from '../../dist/accessibility/index.js';
import { waitUntil } from '../helpers/async.mjs';

test('progress primitive exposes accessible progress state', () => {
  const progressState = createProgress({ label: 'Loading', value: 2, max: 5 });
  const snapshot = progressState.snapshot();

  assert.equal(snapshot.source, 'progress');
  assert.equal(snapshot.root.role, 'progressbar');
  assert.equal(snapshot.root.progress.value, 2);
});

test('progress primitive normalizes accessible progress values across updates', () => {
  const progressState = createProgress({ label: 'Sync', value: 20, max: 10 });
  const updated = progressState.update({ value: -5, max: 0, status: 'retrying' });

  assert.deepEqual(progressState.snapshot().root.progress, { value: 10, max: 10, indeterminate: false });
  assert.deepEqual(updated.snapshot().root.progress, { value: 0, max: 100, indeterminate: false });
  assert.equal(updated.snapshot().root.description, 'retrying');
  assert.equal(validateAccessibleSnapshot(progressState.snapshot()).ok, true);
  assert.equal(validateAccessibleSnapshot(updated.snapshot()).ok, true);
});

test('runPrompt supports transcript-only non-TTY progress results', async () => {
  const host = createMemoryTerminalHost({ isTty: false });

  const result = await runPrompt(progress({ label: 'Loading', value: 2, max: 5, status: 'Downloading' }), host);

  assert.equal(result.status, 'submitted');
  assert.deepEqual(result.value, { completed: false });
  assert.equal(result.snapshot.source, 'progress');
  assert.equal(result.snapshot.root.role, 'progressbar');
  assert.equal(result.snapshot.root.description, 'Downloading');
  assert.deepEqual(result.snapshot.root.progress, { value: 2, max: 5, indeterminate: false });
  assert.equal(result.transcript?.source, 'prompt');
  assert.equal(result.transcript?.steps[0]?.kind, 'snapshot');
  assert.equal(result.transcript?.steps[0]?.snapshot.root.label, 'Loading');
  assert.deepEqual(result.transcript?.steps[0]?.snapshot.root.progress, { value: 2, max: 5, indeterminate: false });
});

test('runPrompt includes non-TTY hints when progress prompts are rejected', async () => {
  const host = createMemoryTerminalHost({ isTty: false });

  const result = await runPrompt(progress({
    label: 'Loading',
    nonTty: { mode: 'reject', diagnosticHint: 'Run with --no-progress in CI.' }
  }), host);

  assert.equal(result.status, 'aborted');
  assert.equal(result.reason, 'non_tty_denied');
  assert.equal(result.diagnostics[0]?.code, 'PROMPT_NON_TTY_DENIED');
  assert.equal(result.diagnostics[0]?.hint, 'Run with --no-progress in CI.');
});

test('runPrompt renders progress task updates and submits completion', async () => {
  const host = createMemoryTerminalHost();

  const result = await runPrompt(progress({
    label: 'Build',
    value: 0,
    max: 2,
    transcript: { enabled: true },
    task: async (controller) => {
      await controller.update({ value: 1, status: 'Compiling' });
      await controller.update({ value: 2, status: 'Done' });
      return { completed: true };
    }
  }), host);

  assert.equal(result.status, 'submitted');
  assert.deepEqual(result.value, { completed: true });
  assert.equal(result.snapshot.root.role, 'progressbar');
  assert.equal(result.snapshot.root.description, 'Done');
  assert.deepEqual(result.snapshot.root.progress, { value: 2, max: 2, indeterminate: false });
  assert.match(host.output(), /Build/u);
  assert.match(host.output(), /Compiling/u);
  assert.match(host.output(), /Done/u);
  assert.equal(host.stdin.isRawModeEnabled(), false);
  assert.ok((result.transcript?.steps.filter((step) => step.kind === 'snapshot').length ?? 0) >= 3);
});

test('runPrompt cancels progress tasks and aborts the task signal', async () => {
  const host = createMemoryTerminalHost();
  let signalAborted = false;

  const running = runPrompt(progress({
    label: 'Sync',
    value: 0,
    max: 10,
    task: async (controller) => {
      await controller.update({ value: 1, status: 'Running' });
      await new Promise((resolve) => {
        controller.signal.addEventListener('abort', () => {
          signalAborted = controller.signal.aborted;
          resolve();
        }, { once: true });
      });
    }
  }), host);

  await waitUntil(() => /Running/u.test(host.output()));
  host.input('\u001B');
  const result = await running;

  assert.equal(result.status, 'aborted');
  assert.equal(result.reason, 'cancelled');
  assert.equal(signalAborted, true);
  assert.equal(result.snapshot?.root.description, 'Running');
  assert.equal(host.stdin.isRawModeEnabled(), false);
});

test('runPrompt executes progress tasks in non-TTY transcript-only mode', async () => {
  const host = createMemoryTerminalHost({ isTty: false });
  let ran = false;

  const result = await runPrompt(progress({
    label: 'Package',
    value: 0,
    max: 1,
    task: async (controller) => {
      ran = true;
      await controller.update({ value: 1, status: 'Packed' });
    }
  }), host);

  assert.equal(ran, true);
  assert.equal(result.status, 'submitted');
  assert.deepEqual(result.value, { completed: true });
  assert.equal(result.snapshot.root.description, 'Packed');
  assert.deepEqual(result.snapshot.root.progress, { value: 1, max: 1, indeterminate: false });
  assert.equal(host.output(), '');
  assert.ok((result.transcript?.steps.filter((step) => step.kind === 'snapshot').length ?? 0) >= 2);
});
