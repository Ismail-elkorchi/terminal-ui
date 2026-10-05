import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryTerminalHost } from '../../../dist/host/index.js';
import { failedTerminalWrite, indeterminateTerminalWrite } from '../../../dist/host/index.js';

const report = (state) => `\u001B[8;${state}$y\u001B[?1;2c`;
const modeWrites = (text) => text.match(/\u001B\[8[hl]/gu) ?? [];
async function observedHost(state = 1, options = {}) {
  const host = createMemoryTerminalHost(options);
  host.input(report(state));
  await host.getCapabilities({ activeProbes: ['terminalModes'] });
  return host;
}
async function preparedSession(host) {
  const session = await host.beginSession();
  assert.equal((await session.enableRawInput()).status, 'applied');
  return session;
}

test('mode 8 is standard namespace, and establishment and restoration are observed', async () => {
  const host = await observedHost();
  const session = await preparedSession(host);
  assert.equal(session.initialState.cellPresentation, 'implicit');
  assert.equal(session.initialState.provenance.cellPresentation, 'observed');
  assert.match(host.output(), /\u001B\[8\$p/u);
  assert.doesNotMatch(host.output(), /\u001B\[\?8\$p/u);
  host.input(report(2));
  assert.deepEqual(await session.enableCellPresentation(), {
    status: 'applied', assurance: 'observed', change: { kind: 'cellPresentation', state: 'explicit' }, diagnostics: [],
  });
  assert.equal((await session.currentState()).provenance.cellPresentation, 'observed');
  host.input(report(1));
  const restored = await session.restore('success');
  assert.equal(restored.status, 'restored');
  assert.equal(restored.resultingState.cellPresentation, 'implicit');
  assert.equal(restored.completed.find((item) => item.kind === 'cellPresentation')?.assurance, 'observed');
  assert.equal(host.stdin.isRawModeEnabled(), false);
  assert.deepEqual(modeWrites(host.output()), ['\u001B[8l', '\u001B[8h']);
});

test('terminal identity and configured support cannot invent an unknown baseline', async () => {
  for (const state of [undefined, 0]) {
    const options = { env: { TERM: 'xterm-256color', VTE_VERSION: '8001' }, capabilities: { overrides: { cellPresentation: true } } };
    const host = state === undefined ? createMemoryTerminalHost(options) : await observedHost(state, options);
    const session = await preparedSession(host);
    assert.equal(session.initialState.cellPresentation, 'unknown');
    assert.equal((await session.enableCellPresentation()).status, 'rejected');
    assert.equal((await session.restore('error')).status, 'restored');
    assert.deepEqual(modeWrites(host.output()), []);
  }
});

test('permanent implicit state rejects reset while permanent explicit state needs no write', async () => {
  const implicit = await observedHost(3);
  const cannot = await preparedSession(implicit);
  const rejected = await cannot.enableCellPresentation();
  assert.equal(rejected.status, 'rejected');
  assert.match(rejected.diagnostic.message, /standard:8 is permanent/u);
  await cannot.restore();
  assert.deepEqual(modeWrites(implicit.output()), []);
  const explicit = await observedHost(4);
  const already = await explicit.beginSession();
  const accepted = await already.enableCellPresentation();
  assert.equal(accepted.status, 'applied');
  assert.equal(accepted.assurance, 'observed');
  assert.equal((await already.restore()).status, 'restored');
  assert.deepEqual(modeWrites(explicit.output()), []);
});

test('a reset write alone never establishes cell presentation', async () => {
  const host = await observedHost();
  const session = await preparedSession(host);
  host.input(report(1));
  assert.equal((await session.enableCellPresentation()).status, 'rejected');
  assert.equal((await session.currentState()).cellPresentation, 'implicit');
  assert.equal((await session.restore('error')).status, 'restored');
  assert.deepEqual(modeWrites(host.output()), ['\u001B[8l']);
});

test('cancelled verification remains uncertain and cleanup restores the known initial state', async () => {
  const host = await observedHost();
  const session = await preparedSession(host);
  const abort = new globalThis.AbortController();
  const original = host.write;
  host.write = async (chunk, context) => {
    const result = await original(chunk, context);
    if (chunk.text === '\u001B[8l') abort.abort('cancel after mode write');
    return result;
  };
  assert.equal((await session.enableCellPresentation({ signal: abort.signal })).status, 'indeterminate');
  assert.equal((await session.currentState()).provenance.cellPresentation, 'indeterminate');
  host.input(report(1));
  assert.equal((await session.restore('cancelled')).status, 'restored');
  assert.deepEqual(modeWrites(host.output()), ['\u001B[8l', '\u001B[8h']);
  assert.equal(host.stdin.isRawModeEnabled(), false);
});

test('mode write failure distinguishes no mutation from possible mutation', async () => {
  for (const receipt of [failedTerminalWrite('test', new Error('failed')), indeterminateTerminalWrite('test', new Error('uncertain'))]) {
    const host = await observedHost();
    const session = await preparedSession(host);
    const original = host.write;
    host.write = (chunk, context) => chunk.text === '\u001B[8l' ? Promise.resolve(receipt) : original(chunk, context);
    const outcome = await session.enableCellPresentation();
    assert.equal(outcome.status, receipt.status === 'failed_before_write' ? 'rejected' : 'indeterminate');
    if (receipt.status === 'indeterminate') host.input(report(1));
    assert.equal((await session.restore('error')).status, 'restored');
    assert.deepEqual(modeWrites(host.output()), receipt.status === 'indeterminate' ? ['\u001B[8h'] : []);
  }
});

test('restoration readback failure is retryable and uses recovery output', async () => {
  const host = await observedHost();
  const session = await preparedSession(host);
  host.input(report(2));
  await session.enableCellPresentation();
  host.input(report(2));
  const failed = await session.restore('error');
  assert.equal(failed.status, 'partial');
  assert.equal(failed.resultingState.provenance.cellPresentation, 'indeterminate');
  assert.equal(host.stdin.isRawModeEnabled(), false);
  host.write = async () => failedTerminalWrite('test', new Error('normal transport closed'));
  host.input(report(1));
  const recovered = await host.recoverTerminalState('error');
  assert.equal(recovered.status, 'restored');
  assert.equal(recovered.resultingState.cellPresentation, 'implicit');
  assert.equal(host.stdin.isRawModeEnabled(), false);
});

test('nested explicit sessions do not reset the outer owner and disposal restores it', async () => {
  const host = await observedHost();
  const outer = await preparedSession(host);
  host.input(report(2));
  await outer.enableCellPresentation();
  const inner = await host.beginSession();
  assert.equal((await inner.enableCellPresentation()).assurance, 'observed');
  assert.equal((await inner.restore()).status, 'restored');
  assert.deepEqual(modeWrites(host.output()), ['\u001B[8l']);
  host.input(report(1));
  await host.dispose();
  assert.deepEqual(modeWrites(host.output()), ['\u001B[8l', '\u001B[8h']);
  assert.equal(host.stdin.isRawModeEnabled(), false);
});

test('capability refresh discards old mode-8 knowledge and preserves unrelated input', async () => {
  const host = await observedHost();
  host.input('typing\u001B[?1;2c');
  const profile = await host.getCapabilities({ activeProbes: ['terminalModes'], refresh: true });
  assert.equal(profile.cellPresentation.support, 'unknown');
  const session = await preparedSession(host);
  assert.equal(session.initialState.cellPresentation, 'unknown');
  assert.equal((await session.enableCellPresentation()).status, 'rejected');
  const input = host.stdin.read()[Symbol.asyncIterator]();
  const chunk = (await input.next()).value.data;
  assert.equal(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk), 'typing');
  await input.return?.();
  await session.restore();
});

test('missing mode readback is bounded and cannot establish a sent reset', async () => {
  const host = await observedHost();
  const session = await preparedSession(host);
  const queries = (host.output().match(/\u001B\[8\$p/gu) ?? []).length;
  const establishing = session.enableCellPresentation();
  while ((host.output().match(/\u001B\[8\$p/gu) ?? []).length === queries) await Promise.resolve();
  host.clock.advance(100);
  assert.equal((await establishing).status, 'indeterminate');
  assert.equal((await session.currentState()).provenance.cellPresentation, 'indeterminate');
  // The existing response quarantine owns late replies before restoration starts a new query.
  host.input(report(2));
  const restoring = session.restore('timeout');
  while ((host.output().match(/\u001B\[8\$p/gu) ?? []).length === queries + 1) {
    await Promise.resolve(); host.clock.advance(1);
  }
  host.input(report(1));
  const result = await restoring;
  assert.equal(result.status, 'restored');
  assert.equal(result.resultingState.cellPresentation, 'implicit');
});

test('caller-qualified visual-cell host needs no mode implementation or state change', async () => {
  const host = await observedHost(0, { initialState: { cellPresentation: 'explicit' } });
  const profile = await host.getCapabilities();
  assert.equal(profile.cellPresentation.support, 'supported');
  assert.ok(profile.cellPresentation.facts.some(fact => fact.kind === 'override' && fact.name === 'initialState.cellPresentation'));
  assert.ok(profile.cellPresentation.facts.some(fact => fact.name === 'standard:8' && fact.value === 'unrecognized'));
  const session = await host.beginSession();
  assert.equal(session.initialState.cellPresentation, 'explicit');
  assert.equal(session.initialState.provenance.cellPresentation, 'explicit');
  const result = await session.enableCellPresentation();
  assert.equal(result.status, 'applied');
  assert.equal(result.assurance, 'assumed', 'caller qualification is not a terminal observation');
  assert.equal((await session.restore()).status, 'restored');
  assert.deepEqual(modeWrites(host.output()), []);
});

test('an observed implicit mode overrides a contradictory caller visual-cell qualification', async () => {
  const host = await observedHost(1, { initialState: { cellPresentation: 'explicit' } });
  const session = await preparedSession(host);
  assert.equal(session.initialState.cellPresentation, 'implicit');
  assert.equal(session.initialState.provenance.cellPresentation, 'observed');
  host.input(report(2));
  assert.equal((await session.enableCellPresentation()).assurance, 'observed');
  host.input(report(1));
  assert.equal((await session.restore()).status, 'restored');
  assert.deepEqual(modeWrites(host.output()), ['\u001B[8l', '\u001B[8h']);
});

test('a retry raw-input setter that mutates then throws still restores raw input', async () => {
  const host = await observedHost();
  const session = await preparedSession(host);
  host.input(report(2));
  await session.enableCellPresentation();
  host.input(report(2));
  assert.equal((await session.restore('error')).status, 'partial');
  const setRaw = host.stdin.setRawMode.bind(host.stdin);
  host.stdin.setRawMode = async enabled => {
    await setRaw(enabled);
    if (enabled) throw new Error('raw enabled then adapter rejected');
  };
  const failed = await session.restore('error');
  assert.equal(failed.status, 'partial');
  assert.equal(host.stdin.isRawModeEnabled(), false);
  host.stdin.setRawMode = setRaw;
  host.input(report(1));
  assert.equal((await session.restore('error')).status, 'restored');
  assert.equal(host.stdin.isRawModeEnabled(), false);
});

test('a contradicted caller qualification cannot return after an inconclusive refresh', async () => {
  const host = await observedHost(1, { initialState: { cellPresentation: 'explicit' } });
  host.input('\u001B[?1;2c');
  const profile = await host.getCapabilities({ activeProbes: ['terminalModes'], refresh: true });
  assert.equal(profile.cellPresentation.support, 'unknown');
  const session = await preparedSession(host);
  assert.equal(session.initialState.cellPresentation, 'unknown');
  assert.equal((await session.enableCellPresentation()).status, 'rejected');
  assert.equal((await session.restore()).status, 'restored');
  assert.deepEqual(modeWrites(host.output()), []);
});

for (const reply of ['\u001B[?1;2c', '\u001B[8;0$y\u001B[?1;2c']) {
  test(`missing or unrecognized mode-8 query cannot authorize a qualified implicit transition: ${JSON.stringify(reply)}`, async () => {
    const host = createMemoryTerminalHost({ initialState: { cellPresentation: 'implicit' },
      capabilities: { probes: { cellPresentation: 'supported' } } });
    host.input(reply);
    const profile = await host.getCapabilities({ activeProbes: ['terminalModes'] });
    assert.equal(profile.cellPresentation.support, 'supported', 'independent operation evidence survives');
    const session = await preparedSession(host);
    const result = await session.enableCellPresentation();
    assert.equal(result.status, 'rejected');
    assert.match(result.diagnostic.message, /observed mutable standard mode 8/u);
    assert.match(result.diagnostic.hint, /independently qualifying/u);
    assert.equal((await session.restore()).status, 'restored');
    assert.deepEqual(modeWrites(host.output()), []);
  });
}

test('mode-1049 unrecognized readback preserves independent set/reset support and safe restoration', async () => {
  const host = createMemoryTerminalHost({ initialState: { alternateScreen: false },
    capabilities: { probes: { alternateScreen: 'supported' } } });
  // Exact unrecognized private-mode response, alongside working standard mode 8.
  host.input('\u001B[?1049;0$y\u001B[8;1$y\u001B[?1;2c');
  const profile = await host.getCapabilities({ activeProbes: ['terminalModes'] });
  assert.equal(profile.alternateScreen.support, 'supported');
  const session = await preparedSession(host);
  assert.equal(session.initialState.provenance.alternateScreen, 'explicit');
  assert.equal((await session.enableAlternateScreen()).status, 'applied');
  host.input(report(2));
  assert.equal((await session.enableCellPresentation()).status, 'applied');
  host.input(report(1));
  assert.equal((await session.restore()).status, 'restored');
  assert.deepEqual(host.output().match(/\u001B\[\?1049[hl]/gu), ['\u001B[?1049h', '\u001B[?1049l']);
  assert.deepEqual(modeWrites(host.output()), ['\u001B[8l', '\u001B[8h']);
});

test('a failed-before-write retry does not erase uncertainty from an earlier partial mutation', async () => {
  const host = await observedHost();
  const session = await preparedSession(host);
  let attempts = 0;
  const write = host.write.bind(host);
  host.write = (chunk, context) => chunk.text === '\u001B[8l'
    ? Promise.resolve(++attempts === 1
      ? indeterminateTerminalWrite('test', new Error('partial mode write'))
      : failedTerminalWrite('test', new Error('retry never wrote')))
    : write(chunk, context);
  assert.equal((await session.enableCellPresentation()).status, 'indeterminate');
  assert.equal((await session.enableCellPresentation()).status, 'rejected');
  assert.equal((await session.currentState()).provenance.cellPresentation, 'indeterminate');
  host.input(report(1));
  const restored = await session.restore('error');
  assert.equal(restored.status, 'restored');
  assert.ok(restored.completed.some(item => item.kind === 'cellPresentation'));
  assert.deepEqual(modeWrites(host.output()), ['\u001B[8h']);
});
