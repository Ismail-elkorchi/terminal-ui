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
  const node = createNodeTerminalHost({ stdout: { write: () => {}, isTty: () => false } });
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

test('generic host factory forwards adapter-specific explicit host options', async () => {
  const memory = createTerminalHost({
    runtime: 'memory',
    viewport: { columns: 33, rows: 7 },
    isTty: false,
    env: { TERM_PROGRAM: 'memory-test' }
  });
  assert.equal(memory.runtime, 'memory');
  assert.deepEqual(memory.getViewport(), { columns: 33, rows: 7 });
  assert.equal(memory.stdin.isTty(), false);
  assert.equal(memory.env.get('TERM_PROGRAM'), 'memory-test');

  const writes = [];
  const node = createTerminalHost({
    runtime: 'node',
    stdout: { write: (chunk) => writes.push(String(chunk)), isTTY: false, columns: 41, rows: 9 },
    stderr: { write: () => {}, isTTY: false },
    stdin: emptyNodeInput(),
    env: { TERM: 'xterm-256color' }
  });
  await node.write({ text: 'forwarded' });
  assert.equal(node.runtime, 'node');
  assert.deepEqual(node.getViewport(), { columns: 41, rows: 9 });
  assert.deepEqual(writes, ['forwarded']);
  assert.equal(node.env.get('TERM'), 'xterm-256color');

  const ptyWrites = [];
  const pty = createTerminalHost({
    adapter: 'pty',
    id: 'factory-pty',
    viewport: { columns: 64, rows: 16 },
    stdout: { write: (chunk) => ptyWrites.push(String(chunk)) }
  });
  await pty.write({ text: 'pty' });
  assert.equal(pty.id, 'factory-pty');
  assert.equal(pty.runtime, 'node');
  assert.deepEqual(pty.getViewport(), { columns: 64, rows: 16 });
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
    viewport: { columns: 72, rows: 18 },
    stdin: { source: input },
    stdout: { write: (chunk) => writes.push(String(chunk)) },
    resize: (viewport) => {
      resizes.push(viewport);
    }
  });

  assert.equal(pty.id, 'integration-pty');
  assert.equal(pty.runtime, 'node');
  assert.equal(pty.stdin.isTty(), true);
  assert.equal(pty.stdout.isTty(), true);
  assert.deepEqual(pty.getViewport(), { columns: 72, rows: 18 });
  assert.equal(pty.stdout.columns, 72);
  assert.equal((await pty.getCapabilities()).isTty, true);

  await pty.write({ text: 'hello' });
  assert.deepEqual(writes, ['hello']);

  const chunks = [];
  for await (const chunk of pty.stdin.read()) chunks.push(chunk.data);
  assert.deepEqual(chunks, ['typed']);

  await pty.resize({ columns: 100, rows: 30 });
  assert.deepEqual(pty.getViewport(), { columns: 100, rows: 30 });
  assert.equal(pty.stdout.columns, 100);
  assert.deepEqual(resizes, [{ columns: 100, rows: 30 }]);
});

function emptyNodeInput() {
  return {
    isTTY: false,
    async *[Symbol.asyncIterator]() {}
  };
}
