import assert from 'node:assert/strict';
import test from 'node:test';

import {
  defineTui,
  runTui
} from '../../dist/tui/index.js';
import { createPtyTerminalHarness } from '../../dist/testing/index.js';
import {
  textInput,
  text
} from '../../dist/components/index.js';
import { ignoreMessage } from '../../dist/component/index.js';
import { waitUntil } from '../helpers/async.ts';

const enterKey = { kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' };

test('PTY harness runs full-screen TUI and captures protocol restoration on success', async () => {
  const result = createPtyTerminalHarness({ terminalSize: { columns: 32, rows: 5 } });
  assert.equal(result.ok, true);
  const harness = result.harness;
  assert.equal(harness.snapshot().source, 'test_harness');
  assert.equal(harness.snapshot().root.role, 'group');
  const app = defineTui({
    id: 'pty-success',
    init: () => ({ submitted: false }),
    update: (_state, message) => ({
      state: { submitted: message.submitted },
      ...(message.submitted ? { exit: { reason: 'submitted' } } : {})
    }),
    view: (state) => textInput({
      id: 'submit',
      presentation: { value: state.submitted ? 'submitted' : 'waiting', cursor: 0 },
      onAction: (action) => action.kind === 'submit'
        ? { submitted: true }
        : ignoreMessage()
    })
  });

  const running = runTui(app, harness.host);
  await waitUntil(() => harness.frames().length === 1);
  await harness.input(enterKey);
  const exit = await running;

  assert.equal(exit.status, 'completed');
  assert.equal(exit.reason, 'submitted');
  assert.equal(harness.host.stdin.isRawModeEnabled?.(), false);
  assert.equal(harness.restores().length, 1);
  assert.ok(harness.frames().length >= 2);
  assert.ok(harness.diffs().length >= 2);
  assert.equal(harness.snapshot().source, 'tui');
  assert.match(harness.output(), /\u001B\[\?1049h/u);
  assert.match(harness.output(), /\u001B\[\?1049l/u);
  assert.match(harness.output(), /\u001B\[\?2004h/u);
  assert.match(harness.output(), /\u001B\[\?2004l/u);
  assert.match(harness.output(), /\u001B\[\?1006h\u001B\[\?1002h/u);
  assert.match(harness.output(), /\u001B\[\?1000l\u001B\[\?1006l/u);
  assert.match(harness.output(), /\u001B\[\?1004h/u);
  assert.match(harness.output(), /\u001B\[\?1004l/u);
  assert.match(harness.output(), /\u001B\[\?25l/u);
  assert.match(harness.output(), /\u001B\[\?25h/u);
});

test('PTY harness restores full-screen protocols on interrupt signals', async () => {
  const result = createPtyTerminalHarness({ terminalSize: { columns: 24, rows: 4 } });
  assert.equal(result.ok, true);
  const harness = result.harness;
  const app = defineTui({
    id: 'pty-interrupt',
    init: () => ({ ready: true }),
    update: (state) => ({ state }),
    view: () => text({ content: 'waiting', id: 'waiting' })
  });

  const running = runTui(app, harness.host);
  await waitUntil(() => harness.frames().length === 1);
  await harness.input({ kind: 'signal', signal: 'SIGINT' });
  const exit = await running;

  assert.equal(exit.status, 'interrupted');
  assert.equal(harness.host.stdin.isRawModeEnabled?.(), false);
  assert.equal(harness.restores().length, 1);
  assert.match(harness.output(), /\u001B\[\?1049l/u);
  assert.match(harness.output(), /\u001B\[\?25h/u);
});

test('PTY harness reports a typed unavailable result when no adapter is available', () => {
  const result = createPtyTerminalHarness({ available: false });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostic.code, 'HOST_CAPABILITY_UNAVAILABLE');
  assert.equal(result.diagnostic.target, 'pty-harness');
});
