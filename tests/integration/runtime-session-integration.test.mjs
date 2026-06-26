import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createBunTerminalHost,
  createDenoTerminalHost,
  createMemoryTerminalHost,
  createNodeTerminalHost
} from '../../dist/host/index.js';

test('runtime hosts integrate session-managed protocols and restoration', async () => {
  const cases = [
    explicitNodeHost(),
    explicitStreamHost('deno'),
    explicitStreamHost('bun'),
    memoryHost()
  ];

  for (const item of cases) {
    const session = await item.host.beginSession({ id: `${item.id}-session` });
    await session.enableRawInput();
    await session.enableAlternateScreen();
    await session.enableBracketedPaste();
    await session.hideCursor();
    const result = await session.restore('success');

    assert.equal(result.ok, true, item.id);
    assert.deepEqual(item.rawModes, [true, false], item.id);
    assert.match(item.output(), /\u001B\[\?1049h/u, item.id);
    assert.match(item.output(), /\u001B\[\?1049l/u, item.id);
    assert.match(item.output(), /\u001B\[\?2004h/u, item.id);
    assert.match(item.output(), /\u001B\[\?2004l/u, item.id);
    assert.match(item.output(), /\u001B\[\?25l/u, item.id);
    assert.match(item.output(), /\u001B\[\?25h/u, item.id);
  }
});

function explicitNodeHost() {
  const output = [];
  const rawModes = [];
  const input = asyncIterable([]);
  const host = createNodeTerminalHost({
    id: 'node-integration',
    stdin: {
      isTTY: true,
      setRawMode: (enabled) => {
        rawModes.push(enabled);
      },
      [Symbol.asyncIterator]: input[Symbol.asyncIterator].bind(input)
    },
    stdout: {
      isTTY: true,
      columns: 80,
      rows: 24,
      write: (chunk) => {
        output.push(String(chunk));
      }
    },
    stderr: {
      isTTY: true,
      columns: 80,
      rows: 24,
      write: () => {}
    },
    env: {},
    process: {
      stdin: {
        isTTY: true,
        setRawMode: (enabled) => {
          rawModes.push(enabled);
        },
        [Symbol.asyncIterator]: input[Symbol.asyncIterator].bind(input)
      },
      stdout: { isTTY: true, columns: 80, rows: 24, write: () => {} },
      stderr: { isTTY: true, columns: 80, rows: 24, write: () => {} },
      env: {},
      on: () => {},
      off: () => {}
    }
  });
  return { id: 'node', host, rawModes, output: () => output.join('') };
}

function explicitStreamHost(runtime) {
  const output = [];
  const rawModes = [];
  const factory = runtime === 'deno' ? createDenoTerminalHost : createBunTerminalHost;
  const host = factory({
    id: `${runtime}-integration`,
    stdin: {
      source: asyncIterable([]),
      isTty: true,
      setRawMode: (enabled) => {
        rawModes.push(enabled);
      }
    },
    stdout: {
      isTty: true,
      columns: 80,
      rows: 24,
      write: (chunk) => {
        output.push(String(chunk));
      }
    }
  });
  return { id: runtime, host, rawModes, output: () => output.join('') };
}

function memoryHost() {
  const host = createMemoryTerminalHost({ id: 'memory-integration' });
  const rawModes = [];
  const rawMode = host.stdin.setRawMode.bind(host.stdin);
  host.stdin.setRawMode = (enabled) => {
    rawModes.push(enabled);
    rawMode(enabled);
  };
  return { id: 'memory', host, rawModes, output: () => host.output() };
}

async function* asyncIterable(values) {
  for (const value of values) yield value;
}
