import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createBunTerminalHost,
  resolveTerminalCapabilities,
  createDenoTerminalHost,
  createMemoryTerminalHost,
  restoreTerminalState
} from '../../dist/host/index.js';
import { createProtocolWriter, createRestorePlan } from '../../dist/protocol/index.js';
import { applySessionProtocolPolicy, createSessionProtocolPlan } from '../../dist/tui/index.js';

test('memory host captures output and exposes capabilities', async () => {
  const host = createMemoryTerminalHost();
  await host.write({ text: 'hello' });
  assert.equal(host.output(), 'hello');
  assert.equal((await host.getCapabilities()).runtime, 'memory');
});

test('host capability helper distinguishes input and output protocol support', () => {
  const capabilities = resolveTerminalCapabilities({
    host: {
      runtime: 'node',
      inputIsTty: true,
      outputIsTty: true,
      rawInput: false,
      columns: 80
    }
  });

  assert.equal(capabilities.isTty, true);
  assert.equal(capabilities.rawInput.status, 'unavailable');
  assert.equal(capabilities.rawInput.diagnostics[0]?.code, 'HOST_CAPABILITY_UNAVAILABLE');
  assert.equal(capabilities.alternateScreen.status, 'supported');
});

test('protocol writer emits typed mouse mode and sanitized title sequences', async () => {
  const host = createMemoryTerminalHost();
  const protocol = createProtocolWriter(host);

  await protocol.enableMouseReporting('drag');
  await protocol.disableMouseReporting();
  await protocol.setTitle('Build\u001B[31m');

  assert.match(host.output(), /\u001B\[\?1002h/u);
  assert.match(host.output(), /\u001B\[\?1006h/u);
  assert.match(host.output(), /\u001B\[\?1003l\u001B\[\?1002l\u001B\[\?1000l\u001B\[\?1006l/u);
  assert.equal(host.output().includes('\u001B]0;Build\u0007'), true);
  assert.doesNotMatch(host.output(), /\u001B\[31m/u);
});

test('protocol writer rejects invalid typed protocol parameters', async () => {
  const host = createMemoryTerminalHost();
  const protocol = createProtocolWriter(host);

  await assert.rejects(() => protocol.moveCursor(0, 1), /row must be a positive integer/u);
  await assert.rejects(() => protocol.moveCursor(1, Number.NaN), /column must be a positive integer/u);
  await assert.rejects(() => protocol.enableMouseReporting('hover'), /mouse reporting mode/u);
  assert.equal(host.output(), '');
});

test('restore plans expose ordered state operations consumed by terminal sessions', async () => {
  const snapshot = {
    rawInput: false,
    alternateScreen: false,
    bracketedPaste: false,
    mouseReporting: 'none',
    focusReporting: false,
    cursorVisible: true
  };
  const plan = createRestorePlan(snapshot);
  assert.deepEqual(plan.operations.map((operation) => operation.kind), [
    'cursorVisible',
    'focusReporting',
    'mouseReporting',
    'bracketedPaste',
    'alternateScreen',
    'rawInput'
  ]);

  const host = createMemoryTerminalHost();
  const session = await host.beginSession({ id: 'restore-plan-test' });
  await session.enableRawInput();
  await session.enableAlternateScreen();
  await session.enableBracketedPaste();
  await session.enableMouseReporting('all');
  await session.enableFocusReporting();
  await session.hideCursor();
  const result = await session.restore('success');

  assert.equal(result.ok, true);
  assert.deepEqual(result.restored.map((operation) => operation.kind), plan.operations.map((operation) => operation.kind));
  assert.deepEqual(host.restores()[0], snapshot);
});

test('session protocol policies plan and apply only requested operations', async () => {
  const host = createMemoryTerminalHost();
  const session = await host.beginSession({ id: 'policy-apply-session' });
  const policy = {
    alternateScreen: 'disabled',
    rawInput: 'required',
    bracketedPaste: 'disabled',
    focusReporting: 'disabled',
    cursorVisibility: { state: 'hide', requirement: 'disabled' },
    mouseReporting: { mode: 'drag', requirement: 'optional' }
  };

  const plan = createSessionProtocolPlan(policy);
  const result = await applySessionProtocolPolicy(session, policy);

  assert.equal(plan.length, 6);
  assert.equal(result.ok, true);
  assert.deepEqual(result.applied.map((item) => item.kind), ['rawInput', 'mouseReporting']);
  assert.deepEqual(result.skipped.map((item) => item.kind), [
    'alternateScreen',
    'bracketedPaste',
    'focusReporting',
    'cursorVisibility'
  ]);
  assert.equal(result.diagnostics.some((item) => item.code === 'HOST_PROTOCOL_SKIPPED'), true);
  assert.match(host.output(), /\u001B\[\?1002h/u);
  assert.doesNotMatch(host.output(), /\u001B\[\?1049h/u);
});

test('session protocol policies fail only required unavailable operations', async () => {
  const host = createDenoTerminalHost({
    stdin: { source: asyncIterable([]), isTty: true },
    stdout: { write: () => {}, isTty: true }
  });
  const session = await host.beginSession({ id: 'policy-required-unavailable' });
  const result = await applySessionProtocolPolicy(session, {
    alternateScreen: 'disabled',
    rawInput: 'required',
    bracketedPaste: 'disabled',
    focusReporting: 'disabled',
    cursorVisibility: { state: 'hide', requirement: 'disabled' },
    mouseReporting: { mode: 'none', requirement: 'disabled' }
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.applied, []);
  assert.deepEqual(result.skipped.map((item) => item.kind), [
    'alternateScreen',
    'bracketedPaste',
    'rawInput',
    'mouseReporting',
    'focusReporting',
    'cursorVisibility'
  ]);
  assert.equal(result.diagnostics.some((item) => item.code === 'HOST_PROTOCOL_UNSUPPORTED'), true);
});

test('terminal sessions preserve raw input state that existed before the session', async () => {
  const host = createMemoryTerminalHost();
  host.stdin.setRawMode(true);
  const session = await host.beginSession({ id: 'restore-existing-raw' });

  await session.enableRawInput();
  const result = await session.restore('success');

  assert.equal(result.ok, true);
  assert.equal(host.stdin.isRawModeEnabled(), true);
  assert.equal(result.restored.some((operation) => operation.kind === 'rawInput'), false);
  host.stdin.setRawMode(false);
});

test('terminal sessions continue restoring later state after one restore operation fails', async () => {
  const host = createMemoryTerminalHost();
  const originalWrite = host.write.bind(host);
  const session = await host.beginSession({ id: 'restore-best-effort' });
  await session.enableRawInput();
  await session.enableAlternateScreen();
  host.write = async (output) => {
    if (output.text === '\u001B[?1049l') throw new Error('alternate screen restore failed');
    await originalWrite(output);
  };

  const result = await session.restore('error');

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0]?.code, 'HOST_RESTORE_FAILED');
  assert.equal(result.diagnostics[0]?.data?.operation, 'alternateScreen');
  assert.deepEqual(result.restored.map((operation) => operation.kind), ['rawInput']);
  assert.equal(host.stdin.isRawModeEnabled(), false);
  assert.equal(host.restores()[0]?.alternateScreen, true);
  assert.equal(host.restores()[0]?.rawInput, false);
});

test('restoreTerminalState restores active sessions instead of opening a fresh no-op session', async () => {
  const host = createMemoryTerminalHost();
  const session = await host.beginSession({ id: 'active-restore' });
  await session.enableRawInput();
  await session.enableAlternateScreen();
  await session.enableBracketedPaste();
  await session.hideCursor();

  const result = await restoreTerminalState(host);
  const second = await restoreTerminalState(host);

  assert.equal(result.ok, true);
  assert.equal(result.reason, 'disposed');
  assert.deepEqual(result.restored.map((operation) => operation.kind), [
    'cursorVisible',
    'bracketedPaste',
    'alternateScreen',
    'rawInput'
  ]);
  assert.equal(host.stdin.isRawModeEnabled(), false);
  assert.match(host.output(), /\u001B\[\?1049h/u);
  assert.match(host.output(), /\u001B\[\?1049l/u);
  assert.match(host.output(), /\u001B\[\?2004h/u);
  assert.match(host.output(), /\u001B\[\?2004l/u);
  assert.match(host.output(), /\u001B\[\?25l/u);
  assert.match(host.output(), /\u001B\[\?25h/u);
  assert.equal(second.ok, true);
  assert.deepEqual(second.restored, []);
});

test('memory host disposal restores active terminal sessions before closing input', async () => {
  const host = createMemoryTerminalHost();
  const session = await host.beginSession({ id: 'memory-dispose-restore' });
  await session.enableRawInput();
  await session.enableAlternateScreen();
  await session.enableBracketedPaste();
  await session.hideCursor();

  await host.dispose();
  const afterDisposeRestore = await restoreTerminalState(host);
  const chunks = await readInputChunks(host);

  assert.equal(host.stdin.isRawModeEnabled(), false);
  assert.match(host.output(), /\u001B\[\?1049h/u);
  assert.match(host.output(), /\u001B\[\?1049l/u);
  assert.match(host.output(), /\u001B\[\?2004h/u);
  assert.match(host.output(), /\u001B\[\?2004l/u);
  assert.match(host.output(), /\u001B\[\?25l/u);
  assert.match(host.output(), /\u001B\[\?25h/u);
  assert.equal(host.restores().at(-1)?.rawInput, false);
  assert.deepEqual(afterDisposeRestore.restored, []);
  assert.deepEqual(chunks, []);
});

test('stream host disposal restores active terminal sessions', async () => {
  const output = [];
  const rawModes = [];
  const host = createDenoTerminalHost({
    id: 'stream-dispose-restore',
    stdin: {
      source: asyncIterable([]),
      isTty: true,
      setRawMode: (enabled) => rawModes.push(enabled)
    },
    stdout: { write: (chunk) => output.push(String(chunk)), isTty: true }
  });
  const session = await host.beginSession({ id: 'stream-dispose-session' });
  await session.enableRawInput();
  await session.enableAlternateScreen();
  await session.enableBracketedPaste();
  await session.hideCursor();

  await host.dispose?.();
  const afterDisposeRestore = await restoreTerminalState(host);

  assert.deepEqual(rawModes, [true, false]);
  assert.match(output.join(''), /\u001B\[\?1049h/u);
  assert.match(output.join(''), /\u001B\[\?1049l/u);
  assert.match(output.join(''), /\u001B\[\?2004h/u);
  assert.match(output.join(''), /\u001B\[\?2004l/u);
  assert.match(output.join(''), /\u001B\[\?25l/u);
  assert.match(output.join(''), /\u001B\[\?25h/u);
  assert.deepEqual(afterDisposeRestore.restored, []);
});

test('Deno and Bun host adapters work with explicit runtime streams', async () => {
  const denoOutput = [];
  const deno = createDenoTerminalHost({
    id: 'deno-test',
    stdin: { source: asyncIterable(['deno-input']), isTty: true },
    stdout: {
      write: (chunk) => denoOutput.push(String(chunk)),
      isTty: true,
      columns: 100,
      rows: 30
    },
    env: { DENO_ENV: 'test' }
  });
  await deno.write({ text: 'hello-deno' });
  const [denoInput] = await readInputChunks(deno);

  assert.equal(deno.runtime, 'deno');
  assert.equal((await deno.getCapabilities()).runtime, 'deno');
  assert.equal(deno.getViewport().columns, 100);
  assert.equal(deno.env.get('DENO_ENV'), 'test');
  assert.deepEqual(denoOutput, ['hello-deno']);
  assert.equal(denoInput, 'deno-input');

  const bunOutput = [];
  const bun = createBunTerminalHost({
    id: 'bun-test',
    stdin: { source: asyncIterable(['bun-input']), isTty: false },
    stdout: {
      write: (chunk) => bunOutput.push(String(chunk)),
      isTty: false,
      columns: 90,
      rows: 20
    }
  });
  await bun.write({ text: 'hello-bun' });
  const [bunInput] = await readInputChunks(bun);

  assert.equal(bun.runtime, 'bun');
  assert.equal((await bun.getCapabilities()).runtime, 'bun');
  assert.equal(bun.getViewport().rows, 20);
  assert.deepEqual(bunOutput, ['hello-bun']);
  assert.equal(bunInput, 'bun-input');
});

test('runtime stream hosts only advertise raw input when a raw-mode setter exists', async () => {
  const withoutRawSetter = createDenoTerminalHost({
    stdin: { source: asyncIterable([]), isTty: true },
    stdout: { write: () => {}, isTty: true }
  });
  const unsupportedCapabilities = await withoutRawSetter.getCapabilities();
  const unsupportedSession = await withoutRawSetter.beginSession({ id: 'unsupported-raw' });
  const unsupportedRaw = await unsupportedSession.enableRawInput();

  assert.equal(unsupportedCapabilities.isTty, true);
  assert.equal(unsupportedCapabilities.rawInput.status, 'unavailable');
  assert.equal(unsupportedRaw.ok, false);
  assert.equal(unsupportedRaw.error.code, 'HOST_PROTOCOL_UNSUPPORTED');

  const rawModes = [];
  const withRawSetter = createBunTerminalHost({
    stdin: {
      source: asyncIterable([]),
      isTty: true,
      setRawMode: (enabled) => rawModes.push(enabled)
    },
    stdout: { write: () => {}, isTty: true }
  });
  const supportedCapabilities = await withRawSetter.getCapabilities();
  const supportedSession = await withRawSetter.beginSession({ id: 'supported-raw' });
  const supportedRaw = await supportedSession.enableRawInput();
  await supportedSession.restore('success');

  assert.equal(supportedCapabilities.rawInput.status, 'supported');
  assert.equal(supportedRaw.ok, true);
  assert.deepEqual(rawModes, [true, false]);
});

async function* asyncIterable(values) {
  for (const value of values) yield value;
}

async function readInputChunks(host) {
  const chunks = [];
  for await (const chunk of host.stdin.read()) {
    chunks.push(typeof chunk.data === 'string' ? chunk.data : new TextDecoder().decode(chunk.data));
  }
  return chunks;
}
