import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createBunTerminalHost,
  createDenoTerminalHost,
  createNodeTerminalHost
} from '../../dist/host/index.js';

test('Node host write waits for callback and drain before admitting the next write', async () => {
  const stream = controlledNodeOutput();
  const host = createNodeTerminalHost({
    stdin: emptyNodeInput(),
    stdout: stream,
    stderr: immediateNodeOutput()
  });
  let firstSettled = false;
  const first = host.write({ text: 'first' }).then(() => { firstSettled = true; });
  const second = host.write({ text: 'second' });

  await Promise.resolve();
  assert.deepEqual(stream.writes(), ['first']);
  assert.equal(firstSettled, false);

  stream.completeWrite();
  await Promise.resolve();
  assert.equal(firstSettled, false);
  stream.emit('drain');
  await first;
  assert.deepEqual(stream.writes(), ['first', 'second']);

  stream.completeWrite();
  stream.emit('drain');
  await second;
  await host.flush();
});

test('Node host propagates write callback failures and remains flushable', async () => {
  const stream = controlledNodeOutput({ backpressured: false });
  const host = createNodeTerminalHost({
    stdin: emptyNodeInput(),
    stdout: stream,
    stderr: immediateNodeOutput()
  });
  const writing = host.write({ text: 'broken' });
  stream.completeWrite(new Error('write callback failed'));

  await assert.rejects(writing, /write callback failed/u);
  await assert.rejects(host.flush(), /write callback failed/u);
});

test('Node host waits for drain when a synchronous callback accompanies backpressure', async () => {
  const stream = controlledNodeOutput({ completeSynchronously: true });
  const host = createNodeTerminalHost({
    stdin: emptyNodeInput(),
    stdout: stream,
    stderr: immediateNodeOutput()
  });
  let settled = false;
  const writing = host.write({ text: 'synchronous' }).then(() => { settled = true; });

  await Promise.resolve();
  assert.equal(settled, false);
  assert.deepEqual(stream.listenerCounts(), { close: 1, drain: 1, error: 1 });

  stream.emit('drain');
  await writing;
  assert.deepEqual(stream.listenerCounts(), { close: 0, drain: 0, error: 0 });
});

for (const event of ['error', 'close']) {
  test(`Node host settles an interrupted write once on stream ${event}`, async () => {
    const stream = controlledNodeOutput({ backpressured: false });
    const host = createNodeTerminalHost({
      stdin: emptyNodeInput(),
      stdout: stream,
      stderr: immediateNodeOutput()
    });
    const writing = host.write({ text: 'interrupted' });

    if (event === 'error') stream.emit(event, new Error('stream interrupted'));
    else stream.emit(event);
    stream.completeWrite(new Error('late callback'));

    await assert.rejects(writing, /stream interrupted|closed before the write completed/u);
    assert.deepEqual(stream.listenerCounts(), { close: 0, drain: 0, error: 0 });
  });
}

test('Node output queue admits later writes and reports an earlier failure once at flush', async () => {
  const stream = controlledNodeOutput({ backpressured: false });
  const host = createNodeTerminalHost({
    stdin: emptyNodeInput(),
    stdout: stream,
    stderr: immediateNodeOutput()
  });
  const failed = host.write({ text: 'failed' });
  const recovered = host.write({ text: 'recovered' });

  stream.completeWrite(new Error('first write failed'));
  await assert.rejects(failed, /first write failed/u);
  await Promise.resolve();
  assert.deepEqual(stream.writes(), ['failed', 'recovered']);
  stream.completeWrite();
  await recovered;

  await assert.rejects(host.flush(), /first write failed/u);
  await host.flush();
});

test('Bun built-in host uses the Node-compatible process stream when Bun stdout is a BunFile', async () => {
  const previousBun = Reflect.get(globalThis, 'Bun');
  const previousProcess = Reflect.get(globalThis, 'process');
  const writes = [];
  Reflect.set(globalThis, 'Bun', {
    stdin: { stream: () => emptyAsyncIterable(), isTTY: true },
    stdout: { name: 'stdout' },
    stderr: { name: 'stderr' }
  });
  Reflect.set(globalThis, 'process', processLike(writes));
  try {
    const host = createBunTerminalHost();
    await host.write({ text: 'bun-output' });
    await host.flush();

    assert.equal(host.runtime, 'bun');
    assert.deepEqual(writes, ['bun-output']);
    assert.deepEqual(host.getViewport(), { columns: 91, rows: 27 });
  } finally {
    restoreGlobal('Bun', previousBun);
    restoreGlobal('process', previousProcess);
  }
});

test('Deno host reads native dimensions only for an attached terminal', () => {
  const previousDeno = Reflect.get(globalThis, 'Deno');
  let sizeReads = 0;
  let viewport = { columns: 123, rows: 41 };
  let signalListener;
  Reflect.set(globalThis, 'Deno', denoLike({
    terminal: true,
    consoleSize: () => {
      sizeReads += 1;
      return viewport;
    }
  }));
  try {
    const attached = createDenoTerminalHost({
      subscribeSignals: (listener) => {
        signalListener = listener;
        return () => { signalListener = undefined; };
      }
    });
    const signals = [];
    const unsubscribe = attached.signals.subscribe((signal) => { signals.push(signal); });
    assert.deepEqual(attached.getViewport(), { columns: 123, rows: 41 });
    viewport = { columns: 151, rows: 52 };
    signalListener?.('resize');
    assert.deepEqual(signals, ['resize']);
    assert.deepEqual(attached.getViewport(), { columns: 151, rows: 52 });
    assert.equal(sizeReads, 3);
    unsubscribe();

    Reflect.set(globalThis, 'Deno', denoLike({
      terminal: false,
      consoleSize: () => {
        sizeReads += 1;
        throw new Error('consoleSize must not run for detached streams');
      }
    }));
    const detached = createDenoTerminalHost();
    assert.deepEqual(detached.getViewport(), { columns: 80, rows: 24 });
    assert.equal(sizeReads, 3);
  } finally {
    restoreGlobal('Deno', previousDeno);
  }
});

test('host writes preserve complete mixed chunks as one ordered operation', async () => {
  const writes = [];
  let releaseFirstWrite;
  const firstWrite = new Promise((resolve) => { releaseFirstWrite = resolve; });
  const host = createDenoTerminalHost({
    stdout: {
      isTty: true,
      write: async (chunk) => {
        writes.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
        if (writes.length === 1) await firstWrite;
      }
    }
  });

  const first = host.write({ text: 'A-text', bytes: new TextEncoder().encode('A-bytes') });
  const second = host.write({ text: 'B-text', bytes: new TextEncoder().encode('B-bytes') });
  let flushed = false;
  const flushing = host.flush().then(() => { flushed = true; });

  await Promise.resolve();
  assert.deepEqual(writes, ['A-text']);
  assert.equal(flushed, false);

  releaseFirstWrite();
  await Promise.all([first, second, flushing]);

  assert.deepEqual(writes, ['A-text', 'A-bytes', 'B-text', 'B-bytes']);
  assert.equal(flushed, true);
});

function controlledNodeOutput(options = {}) {
  const writes = [];
  const callbacks = [];
  const listeners = new Map();
  return {
    isTTY: true,
    columns: 80,
    rows: 24,
    write(chunk, callback) {
      writes.push(String(chunk));
      callbacks.push(callback);
      if (options.completeSynchronously === true) callbacks.shift()?.();
      return options.backpressured === false;
    },
    once(event, listener) {
      const values = listeners.get(event) ?? [];
      values.push({ listener, once: true });
      listeners.set(event, values);
    },
    off(event, listener) {
      listeners.set(event, (listeners.get(event) ?? []).filter((item) => item.listener !== listener));
    },
    emit(event, value) {
      const values = [...(listeners.get(event) ?? [])];
      for (const item of values) item.listener(value);
      listeners.set(event, values.filter((item) => !item.once));
    },
    completeWrite(error) {
      const callback = callbacks.shift();
      assert.equal(typeof callback, 'function');
      callback(error);
    },
    listenerCounts: () => Object.fromEntries(
      [...listeners.entries()].map(([event, values]) => [event, values.length]).sort(([left], [right]) => left.localeCompare(right))
    ),
    writes: () => [...writes]
  };
}

function immediateNodeOutput() {
  return {
    isTTY: false,
    write(_chunk, callback) {
      callback?.();
      return true;
    },
    once() {},
    off() {}
  };
}

function emptyNodeInput() {
  return {
    isTTY: true,
    setRawMode() {},
    async *[Symbol.asyncIterator]() {}
  };
}

function processLike(writes) {
  return {
    stdin: Object.assign(emptyAsyncIterable(), { isTTY: true, setRawMode() {} }),
    stdout: {
      isTTY: true,
      columns: 91,
      rows: 27,
      write(chunk, callback) {
        writes.push(String(chunk));
        callback?.();
        return true;
      },
      once() {},
      off() {}
    },
    stderr: immediateNodeOutput(),
    env: {},
    on() {},
    off() {}
  };
}

function denoLike({ terminal, consoleSize }) {
  return {
    stdin: {
      readable: new globalThis.ReadableStream({ start(controller) { controller.close(); } }),
      isTerminal: () => terminal,
      setRaw() {}
    },
    stdout: {
      writable: new globalThis.WritableStream(),
      isTerminal: () => terminal
    },
    stderr: {
      writable: new globalThis.WritableStream(),
      isTerminal: () => terminal
    },
    consoleSize,
    env: { toObject: () => ({}) }
  };
}

function emptyAsyncIterable() {
  return Object.assign((async function* empty() {})(), { isTTY: true });
}

function restoreGlobal(name, value) {
  if (value === undefined) Reflect.deleteProperty(globalThis, name);
  else Reflect.set(globalThis, name, value);
}
