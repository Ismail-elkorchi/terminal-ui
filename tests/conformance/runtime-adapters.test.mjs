import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createBunTerminalHost,
  createDenoTerminalHost,
  createMemoryTerminalHost,
  createNodeTerminalHost,
  createPtyTerminalHost,
  createTerminalHost
} from '../../dist/host/index.js';

test('runtime host constructors expose stable runtime identities with explicit streams', async () => {
  const node = createNodeTerminalHost({ stdout: immediateNodeOutput() });
  const deno = createDenoTerminalHost({ stdout: { write: () => {}, isTty: () => false } });
  const bun = createBunTerminalHost({ stdout: { write: () => {}, isTty: () => false } });
  const memory = createMemoryTerminalHost();

  assert.equal((await node.getCapabilities()).runtime, 'node');
  assert.equal((await deno.getCapabilities()).runtime, 'deno');
  assert.equal((await bun.getCapabilities()).runtime, 'bun');
  assert.equal((await memory.getCapabilities()).runtime, 'memory');
  assert.equal(createTerminalHost().runtime, 'node');
  assert.equal(createTerminalHost({ runtime: 'memory' }).runtime, 'memory');
});

test('runtime host clocks distinguish elapsed deadlines from cancellation', async () => {
  const hosts = [
    createNodeTerminalHost({ stdout: immediateNodeOutput() }),
    createDenoTerminalHost({ stdout: { write: () => {}, isTty: () => false } }),
    createBunTerminalHost({ stdout: { write: () => {}, isTty: () => false } }),
    createMemoryTerminalHost(),
    createPtyTerminalHost({
      id: 'clock-pty',
      terminalSize: { columns: 8, rows: 2 },
      stdout: { write: () => {} }
    })
  ];
  const controller = new globalThis.AbortController();
  controller.abort('test-cancellation');

  for (const host of hosts) {
    assert.equal(await host.clock.sleep(0), 'elapsed');
    assert.equal(await host.clock.sleep(10, controller.signal), 'aborted');
    await host.dispose();
  }
});

test('controlled clocks reject non-finite time instead of corrupting their timeline', () => {
  const host = createMemoryTerminalHost();
  assert.throws(() => host.clock.advance(Number.NaN), /finite non-negative/u);
  assert.throws(() => host.clock.advance(Number.POSITIVE_INFINITY), /finite non-negative/u);
  assert.throws(() => host.clock.sleep(Number.NaN), /finite non-negative/u);
  assert.equal(host.clock.monotonicNow(), 0);
});

test('generic host factory rejects untyped invalid selector objects', () => {
  assert.throws(() => createTerminalHost({}), /must select a runtime or PTY adapter/u);
  assert.throws(() => createTerminalHost({ adapter: 'unknown' }), /Unsupported terminal host adapter/u);
});

test('generic host factory forwards adapter-specific explicit host options', async () => {
  const memory = createTerminalHost({
    runtime: 'memory',
    terminalSize: { columns: 33, rows: 7 },
    isTty: false,
    env: { TERM_PROGRAM: 'memory-test' }
  });
  assert.equal(memory.runtime, 'memory');
  assert.deepEqual(memory.getTerminalSize(), { columns: 33, rows: 7 });
  assert.equal(memory.stdin.isTty(), false);
  assert.equal(memory.env.get('TERM_PROGRAM'), 'memory-test');

  const writes = [];
  const node = createTerminalHost({
    runtime: 'node',
    stdout: immediateNodeOutput(writes, { columns: 41, rows: 9 }),
    stderr: immediateNodeOutput(),
    stdin: emptyNodeInput(),
    env: { TERM: 'xterm-256color' }
  });
  await node.write({ text: 'forwarded' });
  assert.equal(node.runtime, 'node');
  assert.deepEqual(node.getTerminalSize(), { columns: 41, rows: 9 });
  assert.deepEqual(writes, ['forwarded']);
  assert.equal(node.env.get('TERM'), 'xterm-256color');

  const ptyWrites = [];
  const pty = createTerminalHost({
    adapter: 'pty',
    id: 'factory-pty',
    terminalSize: { columns: 64, rows: 16 },
    stdout: { write: (chunk) => ptyWrites.push(String(chunk)) }
  });
  await pty.write({ text: 'pty' });
  assert.equal(pty.id, 'factory-pty');
  assert.equal(pty.runtime, 'node');
  assert.deepEqual(pty.getTerminalSize(), { columns: 64, rows: 16 });
  assert.deepEqual(ptyWrites, ['pty']);
});

test('PTY-style host wraps caller-supplied terminal streams without owning process supervision', async () => {
  const writes = [];
  const resizes = [];
  const input = (async function* inputSource() {
    yield 'typed';
  })();
  const pty = createPtyTerminalHost({
    id: 'integration-pty',
    runtime: 'node',
    terminalSize: { columns: 72, rows: 18 },
    stdin: { source: { read: () => input } },
    stdout: { write: (chunk) => writes.push(String(chunk)) },
    resize: (terminalSize) => {
      resizes.push(terminalSize);
    }
  });

  assert.equal(pty.id, 'integration-pty');
  assert.equal(pty.runtime, 'node');
  assert.equal(pty.stdin.isTty(), true);
  assert.equal(pty.stdout.isTty(), true);
  assert.deepEqual(pty.getTerminalSize(), { columns: 72, rows: 18 });
  assert.equal(pty.stdout.columns, 72);
  assert.equal((await pty.getCapabilities()).isTty, true);

  await pty.write({ text: 'hello' });
  assert.deepEqual(writes, ['hello']);

  const chunks = [];
  for await (const chunk of pty.stdin.read()) chunks.push(chunk.data);
  assert.deepEqual(chunks, ['typed']);

  await pty.terminalSizeControl.setTerminalSize({ columns: 100, rows: 30 });
  assert.deepEqual(pty.getTerminalSize(), { columns: 100, rows: 30 });
  assert.equal(pty.stdout.columns, 100);
  assert.deepEqual(resizes, [{ columns: 100, rows: 30 }]);
});

function emptyNodeInput() {
  return {
    isTTY: false,
    async *[Symbol.asyncIterator]() {}
  };
}

function immediateNodeOutput(writes = [], dimensions = {}) {
  return {
    isTTY: false,
    ...dimensions,
    write(chunk, callback) {
      writes.push(String(chunk));
      callback();
      return true;
    },
    once() {},
    off() {}
  };
}
