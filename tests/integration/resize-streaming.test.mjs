import assert from 'node:assert/strict';
import test from 'node:test';

import { createPtyTerminalHarness } from '../../dist/testing/index.js';
import { defineTui, runTui } from '../../dist/tui/index.js';
import { scrollback, stack, statusBar } from '../../dist/widgets/index.js';
import { waitUntil } from '../helpers/async.mjs';

const enterKey = { kind: 'key', key: 'enter', ctrl: false, alt: false, shift: false, meta: false };

test('PTY harness handles resize while async stream messages are rendering', async () => {
  const result = createPtyTerminalHarness({ viewport: { columns: 36, rows: 8 } });
  assert.equal(result.ok, true);
  const harness = result.harness;
  const app = defineTui({
    id: 'pty-resize-streaming',
    init: () => ({ items: [] }),
    update: (state, message) => {
      if (message.type === 'append') return { state: { items: [...state.items, message.text] } };
      return { state, exit: { reason: 'done' } };
    },
    subscriptions: () => [{
      id: 'stream',
      source: 'external',
      async *messages(context) {
        for (let index = 1; index <= 8; index += 1) {
          await new Promise((resolve) => { setImmediate(resolve); });
          if (context.signal.aborted) break;
          yield { type: 'append', text: `stream item ${index}` };
        }
      }
    }],
    view: (state, context) => stack([
      scrollback({
        id: 'stream-log',
        items: state.items.map((text, index) => ({ id: String(index), text }))
      }),
      statusBar({
        id: 'status',
        text: `cols:${context.viewport.columns} items:${state.items.length}`,
        message: { type: 'exit' }
      })
    ], { id: 'root' })
  });

  const running = runTui(app, harness.host);
  await waitUntil(() => harness.frames().length >= 2);
  await harness.resize({ columns: 52, rows: 8 });
  await waitUntil(() => harness.frames().at(-1)?.width === 52);
  await waitUntil(() => /stream item 2/u.test(harness.output()));
  await harness.input(enterKey);
  const exit = await running;

  assert.equal(exit.status, 'completed');
  assert.equal(exit.reason, 'done');
  assert.equal(harness.frames().at(-1)?.width, 52);
  assert.match(harness.output(), /cols:52/u);
  assert.match(harness.output(), /stream item/u);
  assert.equal(harness.host.stdin.isRawModeEnabled?.(), false);
  assert.equal(harness.restores().length, 1);
});
