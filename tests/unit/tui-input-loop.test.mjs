import assert from 'node:assert/strict';
import test from 'node:test';

import { listbox, text } from '../../dist/components/index.js';
import { listboxReducer } from '../../dist/behavior/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { createTuiRuntime, defineTui } from '../../dist/tui/index.js';
import {
  createTuiSignalQueue,
  runTuiInputLoop
} from '../../dist/tui/input-loop.js';
import { TuiInputSuspensionController } from '../../dist/tui/input-suspension.js';

test('the interactive input loop watches each pending event source exactly once', async () => {
  const app = defineTui({
    id: 'bounded-input-loop',
    init: () => ({ state: 0 }),
    update: (state, message) => message === 'exit'
      ? { state, exit: {} }
      : { state: state + 1 },
    view: (state) => text({ id: 'bounded-input-loop-value', content: String(state) })
  });
  const memory = createMemoryTerminalHost({ terminalSize: { columns: 20, rows: 3 } });
  const runtimeHost = { ...memory, observer: undefined };
  const runtime = createTuiRuntime({ app, host: runtimeHost });
  const inputRead = trackedDeferred();
  const signalRead = trackedDeferred();
  const input = pendingTerminalInput(inputRead);
  const loopHost = { ...runtimeHost, stdin: input };
  const signals = {
    interruption: new globalThis.AbortController().signal,
    next: () => signalRead.promise,
    dispose: () => undefined
  };
  let inputRetirement = Promise.resolve();

  await runtime.start();
  const loop = runTuiInputLoop(
    runtime,
    loopHost,
    app.id,
    undefined,
    (retirement) => { inputRetirement = retirement; },
    undefined,
    signals
  );

  for (let index = 0; index < 40; index += 1) {
    await runtime.dispatch('tick');
    await new Promise((resolve) => setImmediate(resolve));
    memory.stdout.clear();
  }

  assert.equal(inputRead.subscriptions(), 1);
  assert.equal(signalRead.subscriptions(), 1);

  await runtime.dispatch('exit');
  const exit = await loop;
  await inputRetirement;
  await runtime.dispose();

  assert.equal(exit.status, 'completed');
});

test('the interactive input loop reduces separately chunked navigation before rendering', async () => {
  const items = Array.from({ length: 10 }, (_value, index) => `item-${String(index)}`);
  const reducerOptions = { items, projectItem: (item) => ({ id: item, label: item }) };
  const app = defineTui({
    id: 'read-ahead-navigation',
    init: () => ({
      state: {
        presentation: {
          activeId: 'item-0',
          selection: { mode: 'single', selectedId: 'item-0', selectionFollowsActive: true }
        }
      },
      focus: { kind: 'element', elementId: 'read-ahead-listbox' }
    }),
    update: (state, message) => message === 'exit'
      ? { state, exit: {} }
      : {
        state: {
          presentation: listboxReducer(state.presentation, message, reducerOptions)
        }
      },
    inputBindings: [
      { id: 'exit', triggers: [{ kind: 'text', text: 'q' }], message: 'exit' }
    ],
    view: (state) => listbox({
      id: 'read-ahead-listbox',
      meta: { accessibleName: 'Read-ahead navigation' },
      items,
      projectItem: reducerOptions.projectItem,
      presentation: state.presentation,
      onTransition: (transition) => transition
    })
  });
  const host = createMemoryTerminalHost({ terminalSize: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host });
  const signals = createTuiSignalQueue(host.signals.subscribe.bind(host.signals));
  let inputRetirement = Promise.resolve();

  await runtime.start();
  const write = host.write.bind(host);
  const writeStarted = Promise.withResolvers();
  const releaseWrite = Promise.withResolvers();
  let blockNextWrite = true;
  host.write = async (output, context) => {
    if (blockNextWrite) {
      blockNextWrite = false;
      writeStarted.resolve();
      await releaseWrite.promise;
    }
    return write(output, context);
  };
  const loop = runTuiInputLoop(
    runtime,
    host,
    app.id,
    undefined,
    (retirement) => { inputRetirement = retirement; },
    undefined,
    signals
  );
  for (let index = 0; index < 100; index += 1) host.input('\u001B[B');
  host.input('q');
  host.endInput();
  await writeStarted.promise;
  await new Promise((resolve) => setImmediate(resolve));
  releaseWrite.resolve();

  const exit = await loop;
  await inputRetirement;
  signals.dispose();

  assert.equal(exit.status, 'completed');
  assert.equal(exit.state.presentation.activeId, 'item-9');
  assert.ok(runtime.metrics().frameCommits <= 4, `frame commits: ${String(runtime.metrics().frameCommits)}`);
  await runtime.dispose();
});

test('the signal queue rejects pending and future reads when disposed', async () => {
  const queue = createTuiSignalQueue(() => () => undefined);
  const pending = assert.rejects(queue.next(), /signal queue is disposed/u);

  queue.dispose();

  await pending;
  await assert.rejects(queue.next(), /signal queue is disposed/u);
});

test('the input suspension controller has one consumer and settles it on close', async () => {
  const suspension = new TuiInputSuspensionController();
  const pending = assert.rejects(suspension.next(), /input loop ended/u);

  await assert.rejects(suspension.next(), /already has a pending consumer/u);
  suspension.close();

  await pending;
  await assert.rejects(suspension.next(), /unavailable after the input loop ends/u);
});

function trackedDeferred() {
  const deferred = Promise.withResolvers();
  const then = deferred.promise.then.bind(deferred.promise);
  let subscriptionCount = 0;
  Object.defineProperty(deferred.promise, 'then', {
    value(...arguments_) {
      subscriptionCount += 1;
      return then(...arguments_);
    }
  });
  return {
    promise: deferred.promise,
    resolve: deferred.resolve,
    subscriptions: () => subscriptionCount
  };
}

function pendingTerminalInput(read) {
  let closed = false;
  const close = async () => {
    if (!closed) {
      closed = true;
      read.resolve({ done: true, value: undefined });
    }
    return { done: true, value: undefined };
  };
  const iterator = {
    next: () => read.promise,
    return: close
  };
  return {
    read(options = {}) {
      const abort = () => { void close(); };
      options.signal?.addEventListener('abort', abort, { once: true });
      return { [Symbol.asyncIterator]: () => iterator };
    },
    release: async () => { await close(); },
    isTty: () => true
  };
}
