import assert from 'node:assert/strict';
import test from 'node:test';
import { combineTuiResults, createTuiChild, createTuiRuntime, defineTui, liftTuiResult } from '@ismail-elkorchi/terminal-ui/tui';
import { createMemoryTerminalHost } from '@ismail-elkorchi/terminal-ui/host';
import { text } from '@ismail-elkorchi/terminal-ui/components';
import { flushAsync, waitUntil } from '../../support/async.ts';

const transforms = [
  { name: 'plain local work', effect: (effect) => effect },
  { name: 'decorated local work', effect: (effect) => ({ ...effect, concurrency: 'enqueue', run: (context) => effect.run(context) }) },
];

for (const transform of transforms) {
  test(`${transform.name} remains owned through lifted contributions, child removal and sibling isolation`, async () => {
    const finish = Promise.withResolvers();
    const effects = [];
    const sources = [];
    const delivered = [];
    const panels = Object.fromEntries(['left', 'right'].map((label) => [label, createPanel(label)]));
    const runtime = createTuiRuntime({ host: createMemoryTerminalHost(), app: defineTui({
      init(context) {
        const left = panels.left.init({ id: 'left', generation: 1 }, context);
        const right = panels.right.init({ id: 'right', generation: 1 }, context);
        return combineTuiResults({ left: left.state, right: right.state }, { ...left }, { ...right });
      },
      update(state, message, context) {
        if (message === 'remove-left') {
          const result = panels.left.update(state.left, { id: 'left', generation: 1, message: 'remove' }, context);
          return liftTuiResult(state, 'left', result);
        }
        delivered.push(message);
        return { state };
      },
      view: () => text({ content: 'nested children' }),
      subscriptions: (state, context) => [
        ...panels.left.subscriptions(state.left, context),
        ...panels.right.subscriptions(state.right, context),
      ],
    }) });

    function createPanel(label) {
      const child = createTuiChild({
        init: () => ({ state: 0, effects: [0, 1].map(() => ({
          id: 'read', concurrency: 'enqueue',
          async run(context) {
            effects.push({ label, signal: context.signal });
            await finish.promise;
            return { kind: 'message', message: 'done' };
          },
        })).map(transform.effect) }),
        update: (state) => ({ state }),
        view: () => text({ content: label }),
        subscriptions: () => [{
          id: 'feed', generation: 1,
          run(context, sink) {
            sources.push({ label, signal: context.signal, sink });
            return new Promise((resolve) => context.signal.addEventListener('abort', resolve, { once: true }));
          },
        }],
      }, (message) => message);
      return createTuiChild({
        init(context) {
          const result = child.init({ id: 'leaf', generation: 1 }, context);
          return { ...result };
        },
        update: (state) => child.remove(state),
        view: () => text({ content: label }),
        subscriptions: (state, context) => state === undefined ? [] : child.subscriptions(state, context),
      }, (message) => message);
    }

    try {
      await runtime.start();
      await waitUntil(() => effects.length === 2 && sources.length === 2);
      const left = effects.find((effect) => effect.label === 'left');
      const right = effects.find((effect) => effect.label === 'right');
      const leftSource = sources.find((source) => source.label === 'left');
      const rightSource = sources.find((source) => source.label === 'right');
      await runtime.dispatch('remove-left');
      assert.equal(left.signal.aborted, true);
      assert.equal(right.signal.aborted, false);
      assert.equal(leftSource.signal.aborted, true);
      assert.equal(rightSource.signal.aborted, false);
      await leftSource.sink.emit({ kind: 'reliable', message: 'stale' });
      finish.resolve();
      await waitUntil(() => delivered.length >= 2);
      await flushAsync();
      assert.deepEqual(effects.map((effect) => effect.label), ['left', 'right', 'right']);
      assert.deepEqual(delivered.map((message) => message.id), ['right', 'right']);
    } finally {
      finish.resolve();
      await runtime.dispose();
    }
  });
}
