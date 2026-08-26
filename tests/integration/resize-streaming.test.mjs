import assert from 'node:assert/strict';
import test from 'node:test';

import {
  defineTui,
  reliableSourceMessage,
  runTui
} from '../../dist/tui/index.js';
import { createPtyTerminalHarness } from '../../dist/testing/index.js';
import {
  logViewer,
  statusBar
} from '../../dist/components/index.js';
import { column } from '../../dist/layout/index.js';
import { appendLogHistory, createLogHistory } from '../../dist/behavior/index.js';
import { waitUntil } from '../helpers/async.ts';

const enterKey = { kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' };

test('PTY harness handles resize while async stream messages are rendering', async () => {
  const result = createPtyTerminalHarness({ terminalSize: { columns: 36, rows: 8 } });
  assert.equal(result.status, 'available');
  const harness = result.harness;
  const app = defineTui({
    id: 'pty-resize-streaming',
    init: () => ({ state: ({ history: createLogHistory([]) }) }),
    inputBindings: [{
      id: 'finish-stream',
      triggers: [{ kind: 'key', key: 'enter' }],
      message: { type: 'finish' }
    }],
    update: (state, message) => {
      if (message.type === 'append') {
        return {
          state: {
            history: appendLogHistory(state.history, [{ id: String(state.history.entryCount), text: message.text }])
          }
        };
      }
      return { state, exit: { reason: 'done' } };
    },
    subscriptions: () => [{
      id: 'stream',
      generation: 0,
      source: 'external',
      async run(context, sink) {
        for (let index = 1; index <= 8; index += 1) {
          await new Promise((resolve) => { setImmediate(resolve); });
          if (context.signal.aborted) break;
          await sink.emit(reliableSourceMessage({ type: 'append', text: `stream item ${index}` }));
        }
      }
    }],
    view: (state, context) => column([
      logViewer({
        id: 'stream-log',
        history: state.history
      }),
      statusBar({
        id: 'status',
        leading: [{ id: 'viewport', kind: 'text', text: `cols:${context.terminalSize.columns}` }],
        trailing: [{ id: 'items', kind: 'text', text: `items:${state.history.entryCount}` }]
      })
    ], { id: 'root' })
  });

  const running = runTui(app, { host: harness.host });
  await waitUntil(() => harness.frames().length >= 2);
  await harness.resize({ columns: 52, rows: 8 });
  await waitUntil(() => harness.frames().at(-1)?.width === 52);
  await waitUntil(() => /stream item/u.test(harness.output()));
  await harness.input(enterKey);
  const exit = await running;

  assert.equal(exit.status, 'completed');
  assert.equal(exit.reason, 'done');
  assert.equal(harness.frames().at(-1)?.width, 52);
  assert.match(harness.output(), /cols:52/u);
  assert.match(harness.output(), /stream item/u);
  assert.equal(harness.host.stdin.isRawModeEnabled?.(), false);
  assert.equal(harness.restores().length, 3);
});
