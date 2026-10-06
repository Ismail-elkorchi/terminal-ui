import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryTerminalHost, createPtyTerminalHost } from '../../../dist/host/index.js';
import { failedTerminalWrite, indeterminateTerminalWrite } from '../../../dist/host/index.js';
import { resolveCellPresentation } from '../../../dist/host/cell-presentation.js';
import { queriedModes } from '../../../dist/host/terminal-mode-query.js';
import { flushAsync, waitUntil } from '../../support/async.ts';

const report = (state) => `\u001B[8;${state}$y\u001B[?1;2c`;
const modeWrites = (text) => text.match(/\u001B\[8[hl]/gu) ?? [];
async function observedHost(state = 1, options = {}) {
  const host = createMemoryTerminalHost(options);
  host.input(report(state));
  await detectModes(host);
  return host;
}

async function settleWithClock(host, promise) {
  let settled = false;
  const result = promise.finally(() => { settled = true; });
  void result.catch(() => undefined);
  while (!settled) {
    await flushAsync();
    if (!settled) host.clock.advance(100);
  }
  return result;
}
async function detectModes(host, options = {}) {
  return settleWithClock(host, host.getCapabilities({ activeProbes: ['terminalModes'], ...options }));
}
async function readInputText(host, length) {
  const input = host.stdin.read()[Symbol.asyncIterator]();
  let text = '';
  try {
    while (text.length < length) {
      const chunk = (await input.next()).value.data;
      text += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
    }
    return text;
  } finally {
    await input.return?.();
  }
}

async function preparedSession(host) {
  const session = await host.beginSession();
  assert.equal((await session.enableRawInput()).status, 'applied');
  return session;
}

test('raw mode 8 uses the standard namespace and reset/restoration are observed', async () => {
  const host = await observedHost();
  const session = await preparedSession(host);
  assert.equal(session.initialState.bidiMode, 'implicit');
  assert.equal(session.initialState.provenance.bidiMode, 'observed');
  assert.match(host.output(), /\u001B\[8\$p/u);
  assert.doesNotMatch(host.output(), /\u001B\[\?8\$p/u);
  host.input(report(2));
  assert.deepEqual(await session.enableCellPresentation(), {
    status: 'applied', assurance: 'assumed', change: { kind: 'cellPresentation', state: 'application-ordered' }, diagnostics: [],
  });
  assert.equal((await session.currentState()).provenance.cellPresentation, 'assumed');
  host.input(report(1));
  const restored = await session.restore('success');
  assert.equal(restored.status, 'restored');
  assert.equal(restored.resultingState.bidiMode, 'implicit');
  assert.equal(restored.completed.find((item) => item.kind === 'bidiMode')?.assurance, 'observed');
  assert.equal(host.stdin.isRawModeEnabled(), false);
  assert.deepEqual(modeWrites(host.output()), ['\u001B[8l', '\u001B[8h']);
});

for (const state of [undefined, 0]) {
  test(`default automatic admission does not invent a raw baseline (${state ?? 'unreported'})`, async () => {
    const host = state === undefined ? createMemoryTerminalHost() : await observedHost(state);
    const profile = await host.getCapabilities();
    assert.equal(profile.cellPresentation.support, 'supported');
    const session = await host.beginSession();
    assert.equal(session.initialState.bidiMode, 'unknown');
    assert.equal(session.initialState.provenance.bidiMode, 'assumed');
    assert.equal(session.initialState.cellPresentation, 'application-ordered');
    assert.equal(session.initialState.provenance.cellPresentation, 'assumed');
    const outcome = await session.enableCellPresentation();
    assert.equal(outcome.status, 'applied');
    assert.equal(outcome.assurance, 'assumed');
    const restored = await session.restore();
    assert.equal(restored.status, 'restored');
    assert.equal(restored.attempted.some(item => item.kind === 'bidiMode'), false);
    assert.equal(host.stdin.isRawModeEnabled(), false);
    assert.deepEqual(modeWrites(host.output()), []);
  });
}

test('a no-option VT transport admits its unknown baseline without terminal mutation', async () => {
  const host = createPtyTerminalHost();
  const session = await host.beginSession();
  assert.equal(session.initialState.bidiMode, 'unknown');
  assert.equal(session.initialState.cellPresentation, 'application-ordered');
  assert.equal(session.initialState.provenance.cellPresentation, 'assumed');
  assert.equal((await session.enableCellPresentation()).assurance, 'assumed');
  const restored = await session.restore();
  assert.equal(restored.status, 'restored');
  assert.deepEqual(restored.attempted, []);
  await host.dispose();
});

test('permanent implicit state rejects reset while permanent explicit state needs no write', async () => {
  const implicit = await observedHost(3);
  const cannot = await preparedSession(implicit);
  const rejected = await cannot.enableCellPresentation();
  assert.equal(rejected.status, 'rejected');
  assert.match(rejected.diagnostic.message, /standard mode 8 is permanently/u);
  await cannot.restore();
  assert.deepEqual(modeWrites(implicit.output()), []);
  const explicit = await observedHost(4);
  const already = await explicit.beginSession();
  const accepted = await already.enableCellPresentation();
  assert.equal(accepted.status, 'applied');
  assert.equal(accepted.assurance, 'assumed');
  assert.equal((await already.restore()).status, 'restored');
  assert.deepEqual(modeWrites(explicit.output()), []);
});

test('a reset write alone never establishes cell presentation', async () => {
  const host = await observedHost();
  const session = await preparedSession(host);
  host.input(report(1));
  assert.equal((await session.enableCellPresentation()).status, 'rejected');
  assert.equal((await session.currentState()).bidiMode, 'implicit');
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
  assert.equal(recovered.resultingState.bidiMode, 'implicit');
  assert.equal(host.stdin.isRawModeEnabled(), false);
});

test('nested explicit sessions do not reset the outer owner and disposal restores it', async () => {
  const host = await observedHost();
  const outer = await preparedSession(host);
  host.input(report(2));
  await outer.enableCellPresentation();
  const inner = await host.beginSession();
  assert.equal((await inner.enableCellPresentation()).assurance, 'assumed');
  assert.equal((await inner.restore()).status, 'restored');
  assert.deepEqual(modeWrites(host.output()), ['\u001B[8l']);
  host.input(report(1));
  await host.dispose();
  assert.deepEqual(modeWrites(host.output()), ['\u001B[8l', '\u001B[8h']);
  assert.equal(host.stdin.isRawModeEnabled(), false);
});

test('inconclusive capability refresh retains negative mode evidence and preserves unrelated input', async () => {
  const host = await observedHost();
  host.input('typing\u001B[?1;2c');
  const profile = await detectModes(host, { refresh: true });
  assert.equal(profile.cellPresentation.support, 'unknown');
  const session = await preparedSession(host);
  assert.equal(session.initialState.bidiMode, 'unknown');
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
  await flushAsync();
  host.input(report(2));
  assert.equal((await settleWithClock(host, establishing)).status, 'indeterminate');
  assert.equal((await session.currentState()).provenance.cellPresentation, 'indeterminate');
  // A retained late reply stays owned by the previous query until its bounded quarantine settles.
  const restoring = session.restore('timeout');
  while ((host.output().match(/\u001B\[8\$p/gu) ?? []).length === queries + 1) {
    await flushAsync();
    if ((host.output().match(/\u001B\[8\$p/gu) ?? []).length === queries + 1) host.clock.advance(1);
  }
  host.input(report(1));
  const result = await restoring;
  assert.equal(result.status, 'restored');
  assert.equal(result.resultingState.bidiMode, 'implicit');
});

test('automatic admission records policy, context and the unrecognized raw report separately', async () => {
  const host = await observedHost(0);
  const profile = await host.getCapabilities();
  assert.equal(profile.cellPresentation.support, 'supported');
  assert.ok(profile.cellPresentation.facts.some(fact => fact.name === 'cellPresentation.policy' && fact.value === 'auto'));
  assert.ok(profile.cellPresentation.facts.some(fact => fact.name === 'cellPresentation.context' && typeof fact.value === 'string'));
  assert.ok(profile.cellPresentation.facts.some(fact => fact.name === 'cellPresentation.conditions' && Array.isArray(fact.value)));
  assert.ok(profile.cellPresentation.facts.some(fact => fact.name === 'standard:8' && fact.value === 'unrecognized'));
  const session = await host.beginSession();
  assert.equal(session.initialState.bidiMode, 'unknown');
  assert.equal(session.initialState.cellPresentation, 'application-ordered');
  assert.equal(session.initialState.provenance.cellPresentation, 'assumed');
  assert.equal((await session.enableCellPresentation()).assurance, 'assumed');
  assert.equal((await session.restore()).status, 'restored');
  assert.deepEqual(modeWrites(host.output()), []);
});

test('an observed implicit mode requires reset and readback rather than an assumption fallback', async () => {
  const host = await observedHost(1);
  const session = await preparedSession(host);
  assert.equal(session.initialState.bidiMode, 'implicit');
  assert.equal(session.initialState.cellPresentation, 'unknown');
  host.input(report(2));
  const result = await session.enableCellPresentation();
  assert.equal(result.status, 'applied');
  assert.equal(result.assurance, 'assumed');
  assert.equal((await session.currentState()).provenance.bidiMode, 'observed');
  assert.equal((await session.currentState()).provenance.cellPresentation, 'assumed');
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

test('negative implicit evidence cannot become automatic admission after an inconclusive refresh', async () => {
  const host = await observedHost(1);
  host.input('\u001B[?1;2c');
  const profile = await detectModes(host, { refresh: true });
  assert.equal(profile.cellPresentation.support, 'unknown');
  const session = await preparedSession(host);
  assert.equal(session.initialState.bidiMode, 'unknown');
  assert.equal(session.initialState.cellPresentation, 'unknown');
  assert.equal((await session.enableCellPresentation()).status, 'rejected');
  assert.equal((await session.restore()).status, 'restored');
  assert.deepEqual(modeWrites(host.output()), []);
});

for (const reply of ['\u001B[?1;2c', '\u001B[8;0$y\u001B[?1;2c']) {
  test(`missing or unrecognized mode-8 query cannot authorize a supplied implicit baseline: ${JSON.stringify(reply)}`, async () => {
    const host = createMemoryTerminalHost({ initialState: { bidiMode: 'implicit' } });
    host.input(reply);
    const profile = await detectModes(host);
    assert.equal(profile.cellPresentation.support, 'unknown', 'an implicit baseline cannot be assumed safe without a verified transition');
    const session = await preparedSession(host);
    const result = await session.enableCellPresentation();
    assert.equal(result.status, 'rejected');
    assert.equal(result.diagnostic.data.reason, reply.includes('[8;0') ? 'bidi-mode-unrecognized' : 'bidi-mode-unreported');
    assert.equal((await session.restore()).status, 'restored');
    assert.deepEqual(modeWrites(host.output()), []);
  });
}

test('mode-1049 unrecognized readback preserves independent set/reset support and safe restoration', async () => {
  const host = createMemoryTerminalHost({ initialState: { alternateScreen: false },
    capabilities: { probes: { alternateScreen: 'supported' } } });
  // Exact unrecognized private-mode response, alongside working standard mode 8.
  host.input('\u001B[?1049;0$y\u001B[8;1$y\u001B[?1;2c');
  const profile = await detectModes(host);
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

test('an indeterminate mutation prevents admission retries until the known baseline is restored', async () => {
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
  assert.equal((await session.enableCellPresentation()).status, 'indeterminate');
  assert.equal(attempts, 1, 'uncertainty must not trigger another mutation or an assumption fallback');
  assert.equal((await session.currentState()).provenance.cellPresentation, 'indeterminate');
  host.input(report(1));
  const restored = await session.restore('error');
  assert.equal(restored.status, 'restored');
  assert.ok(restored.completed.some(item => item.kind === 'bidiMode'));
  assert.deepEqual(modeWrites(host.output()), ['\u001B[8h']);
});

for (const state of [2, 4]) {
  test(`observed mode-8 reset ${state} admits by assumption without changing its raw state`, async () => {
    const host = await observedHost(state, { env: { TERM_PROGRAM: 'WezTerm', VTE_VERSION: '8400' } });
    const profile = await host.getCapabilities();
    assert.equal(profile.cellPresentation.support, 'supported');
    assert.ok(profile.cellPresentation.facts.some(fact => fact.name === 'standard:8'));
    const session = await host.beginSession();
    assert.equal(session.initialState.bidiMode, 'explicit');
    assert.equal(session.initialState.provenance.bidiMode, 'observed');
    assert.equal(session.initialState.cellPresentation, 'application-ordered');
    assert.equal(session.initialState.provenance.cellPresentation, 'assumed');
    const outcome = await session.enableCellPresentation();
    assert.equal(outcome.status, 'applied');
    assert.equal(outcome.assurance, 'assumed', 'a raw mode report does not observe the full physical invariant');
    await session.restore();
    assert.deepEqual(modeWrites(host.output()), []);
    assert.doesNotMatch(host.output(), /\u001B\[[012] k/u, 'no guessed SCP direction/restoration');
  });
}

test('a supplied explicit raw baseline remains distinct from automatic physical-cell assumptions', async () => {
  const host = createMemoryTerminalHost({ initialState: { bidiMode: 'explicit' } });
  const session = await host.beginSession();
  assert.equal(session.initialState.bidiMode, 'explicit');
  assert.equal(session.initialState.provenance.bidiMode, 'explicit');
  assert.equal(session.initialState.cellPresentation, 'application-ordered');
  assert.equal(session.initialState.provenance.cellPresentation, 'assumed');
  assert.equal((await session.enableCellPresentation()).assurance, 'assumed');
  await session.restore();
  assert.deepEqual(modeWrites(host.output()), []);
});

test('automatic admission assumes physical semantics but observes only raw BDSM', async () => {
  const host = await observedHost(2);
  const session = await host.beginSession();
  assert.equal(session.initialState.cellPresentation, 'application-ordered');
  assert.equal(session.initialState.provenance.cellPresentation, 'assumed');
  assert.equal(session.initialState.provenance.bidiMode, 'observed');
  assert.equal((await session.enableCellPresentation()).assurance, 'assumed');
  const restored = await session.restore();
  assert.equal(restored.status, 'restored');
  assert.equal(restored.attempted.some(operation => operation.kind === 'cellPresentation'), false);
  assert.deepEqual(modeWrites(host.output()), []);
});

test('removed qualification options and malformed admission policies fail loudly', () => {
  for (const cellPresentation of [undefined, 'explicit', 'application-ordered', {}, { qualification: 'existing' }, { qualification: 'mode-8-reset' }]) {
    assert.throws(() => createMemoryTerminalHost({ cellPresentation }), TypeError);
  }
  for (const cellPresentation of ['auto', { policy: 'qualified' }, { qualification: 'existing' },
    { exceptions: [{ condition: 'any-terminal', context: 'example' }] },
    { exceptions: [{ condition: 'kitty-force-ltr' }] }]) {
    assert.throws(() => createMemoryTerminalHost({ capabilities: { cellPresentation } }), TypeError);
  }
  assert.throws(() => createMemoryTerminalHost({ initialState: { cellPresentation: 'explicit' } }), /not raw terminal state/u);
});

test('conflicting reports reject admission and an inconclusive refresh retains the rejection', async () => {
  const host = createMemoryTerminalHost();
  host.input('\u001B[8;2$y\u001B[8;1$y\u001B[?1;2c');
  const profile = await detectModes(host);
  assert.equal(profile.cellPresentation.support, 'unknown');
  const collection = profile.cellPresentation.facts.find(fact => fact.name === 'terminalModes.collection').value;
  assert.equal(collection.complete, false);
  assert.deepEqual(collection.conflictingModes, ['standard:8']);
  assert.ok(collection.missingModes.includes('private:25'));
  const session = await preparedSession(host);
  assert.equal(session.initialState.cellPresentation, 'unknown');
  assert.equal((await session.enableCellPresentation()).status, 'rejected');
  await session.restore();
  host.input('\u001B[?1;2c');
  await detectModes(host, { refresh: true });
  const inconclusive = await preparedSession(host);
  assert.equal((await inconclusive.enableCellPresentation()).status, 'rejected');
  await inconclusive.restore();
  host.input(report(2));
  await detectModes(host, { refresh: true });
  const resumed = await host.beginSession();
  assert.equal(resumed.initialState.bidiMode, 'explicit');
  assert.equal(resumed.initialState.cellPresentation, 'application-ordered');
  assert.equal((await resumed.enableCellPresentation()).assurance, 'assumed');
  await resumed.restore();
  assert.deepEqual(modeWrites(host.output()), []);
});

test('unrecognized refresh preserves auto policy without claiming observation of physical direction', async () => {
  const host = await observedHost(0);
  host.input(report(0));
  const profile = await detectModes(host, { refresh: true });
  assert.equal(profile.cellPresentation.support, 'supported');
  const session = await host.beginSession();
  assert.equal(session.initialState.bidiMode, 'unknown');
  assert.equal(session.initialState.cellPresentation, 'application-ordered');
  assert.equal((await session.enableCellPresentation()).assurance, 'assumed');
  await session.restore();
});

test('raw-input and verification failures carry precise evidence without an assumption fallback', async () => {
  const host = await observedHost();
  const session = await host.beginSession();
  const raw = await session.enableCellPresentation();
  assert.equal(raw.status, 'rejected');
  assert.equal(raw.diagnostic.code, 'HOST_CAPABILITY_UNAVAILABLE');
  assert.equal(raw.diagnostic.data.reason, 'raw-input-inactive');
  await session.enableRawInput();
  host.input(report(1));
  const mismatch = await session.enableCellPresentation();
  assert.equal(mismatch.status, 'rejected');
  assert.equal(mismatch.diagnostic.data.reason, 'verification-mismatch');
  assert.equal(mismatch.diagnostic.data.expected, 'explicit');
  assert.equal(mismatch.diagnostic.data.observed, 'implicit');
  await session.restore();
});

test('a supplied implicit raw baseline cannot be overridden by default automatic admission', async () => {
  const host = createMemoryTerminalHost({ initialState: { bidiMode: 'implicit' } });
  const session = await preparedSession(host);
  assert.equal(session.initialState.bidiMode, 'implicit');
  assert.equal(session.initialState.provenance.bidiMode, 'explicit');
  assert.equal(session.initialState.cellPresentation, 'unknown');
  assert.equal((await session.enableCellPresentation()).status, 'rejected');
  assert.deepEqual(modeWrites(host.output()), []);
  await session.restore();
});

test('an unrecognized verification retains its exact raw report and remains indeterminate', async () => {
  const host = await observedHost();
  const session = await preparedSession(host);
  host.input(report(0));
  const outcome = await session.enableCellPresentation();
  assert.equal(outcome.status, 'indeterminate');
  assert.equal(outcome.diagnostic.data.reason, 'verification-missing');
  assert.equal(outcome.diagnostic.data.report, 'unrecognized');
  assert.equal((await session.currentState()).cellPresentation, 'unknown');
  host.input(report(1));
  assert.equal((await session.restore()).status, 'restored');
});


test('generic capability flags cannot override physical-cell admission', () => {
  for (const capabilities of [{ probes: { cellPresentation: 'supported' } }, { overrides: { cellPresentation: true } }]) {
    assert.throws(() => createMemoryTerminalHost({ capabilities }), /cannot be supplied as generic capability support/u);
  }
});


test('automatic admission refuses conflicting mutability reports even when both report explicit mode', async () => {
  const host = createMemoryTerminalHost();
  host.input('\u001B[8;2$y\u001B[8;4$y\u001B[?1;2c');
  await detectModes(host);
  const session = await preparedSession(host);
  assert.equal(session.initialState.cellPresentation, 'unknown');
  assert.equal(session.initialState.provenance.bidiMode, 'indeterminate');
  const outcome = await session.enableCellPresentation();
  assert.equal(outcome.status, 'rejected');
  assert.equal(outcome.diagnostic.data.reason, 'mode-reports-conflicting');
  const restored = await session.restore();
  assert.equal(restored.status, 'restored');
  assert.deepEqual(modeWrites(host.output()), []);
});

for (const state of [undefined, 0, 1, 2, 3, 4]) {
  test(`strict policy rejects assumed full physical semantics (mode ${state ?? 'unreported'})`, async () => {
    const options = { capabilities: { cellPresentation: { policy: 'strict' } } };
    const host = state === undefined ? createMemoryTerminalHost(options) : await observedHost(state, options);
    const session = await preparedSession(host);
    assert.equal(session.initialState.cellPresentation, 'unknown');
    const outcome = await session.enableCellPresentation();
    assert.equal(outcome.status, 'rejected');
    if (state === 2 || state === 4) {
      assert.equal(session.initialState.bidiMode, 'explicit');
      assert.equal(session.initialState.provenance.bidiMode, 'observed');
    }
    assert.equal((await session.restore()).status, 'restored');
    assert.deepEqual(modeWrites(host.output()), []);
  });
}

for (const [condition, env] of [
  ['kitty-force-ltr', { TERM: 'xterm-kitty', KITTY_WINDOW_ID: '42' }],
  ['konsole-bidi-disabled', { TERM: 'xterm-256color', KONSOLE_VERSION: '240800' }],
]) {
  test(`${condition} is blocked until its exact-context condition exception is supplied`, async () => {
    const inspecting = createMemoryTerminalHost({ env });
    const profile = await inspecting.getCapabilities();
    const context = profile.cellPresentation.facts.find(fact => fact.name === 'cellPresentation.context')?.value;
    const conditions = profile.cellPresentation.facts.find(fact => fact.name === 'cellPresentation.conditions')?.value;
    assert.equal(typeof context, 'string');
    assert.ok(Array.isArray(conditions) && conditions.includes(condition));
    const unconfigured = await inspecting.beginSession();
    assert.equal((await unconfigured.enableCellPresentation()).status, 'rejected');
    await unconfigured.restore();
    await inspecting.dispose();

    for (const exception of [{ condition, context }, { condition, context: `${context}:different` },
      { condition: condition === 'kitty-force-ltr' ? 'konsole-bidi-disabled' : 'kitty-force-ltr', context }]) {
      const host = createMemoryTerminalHost({ env,
        capabilities: { cellPresentation: { exceptions: [exception] } } });
      const session = await host.beginSession();
      const outcome = await session.enableCellPresentation();
      const matching = exception.condition === condition && exception.context === context;
      assert.equal(outcome.status, matching ? 'applied' : 'rejected');
      if (matching) {
        assert.equal(outcome.assurance, 'assumed');
        assert.equal(session.initialState.provenance.cellPresentation, 'assumed');
      }
      await session.restore();
      assert.deepEqual(modeWrites(host.output()), []);
    }

    const changed = createMemoryTerminalHost({ env: { ...env, TMUX: '/tmp/tmux-1000/default,1,0' },
      capabilities: { cellPresentation: { exceptions: [{ condition, context }] } } });
    const changedSession = await changed.beginSession();
    assert.equal((await changedSession.enableCellPresentation()).status, 'rejected', 'exceptions do not cross transport contexts');
    await changedSession.restore();
    assert.deepEqual(modeWrites(changed.output()), []);
  });

  test(`${condition} exceptions do not override negative mode evidence or strict policy`, async () => {
    const inspecting = createMemoryTerminalHost({ env });
    const profile = await inspecting.getCapabilities();
    const context = profile.cellPresentation.facts.find(fact => fact.name === 'cellPresentation.context').value;
    await inspecting.dispose();
    const exceptions = [{ condition, context }];
    for (const state of [2, 3]) {
      const host = await observedHost(state, { env, capabilities: { cellPresentation: {
        ...(state === 2 ? { policy: 'strict' } : {}), exceptions,
      } } });
      const session = await preparedSession(host);
      assert.equal((await session.enableCellPresentation()).status, 'rejected');
      await session.restore();
      assert.deepEqual(modeWrites(host.output()), []);
    }
    const conflicting = createMemoryTerminalHost({ env, capabilities: { cellPresentation: { exceptions } } });
    conflicting.input('\u001B[8;2$y\u001B[8;1$y\u001B[?1;2c');
    await detectModes(conflicting);
    const conflictSession = await preparedSession(conflicting);
    assert.equal((await conflictSession.enableCellPresentation()).status, 'rejected');
    await conflictSession.restore();
    assert.deepEqual(modeWrites(conflicting.output()), []);
  });
}

for (const env of [
  { TERM: 'xterm-kitty', KONSOLE_VERSION: '240800' },
  { TERM: 'xterm-256color', TERM_PROGRAM: 'ghostty', KITTY_WINDOW_ID: '10' },
]) {
  test(`mixed terminal identity cannot bind a saved configuration exception (${JSON.stringify(env)})`, async () => {
    const host = createMemoryTerminalHost({ env, capabilities: { cellPresentation: { exceptions: [
      { condition: 'kitty-force-ltr', context: 'a-previously-saved-direct-context' },
      { condition: 'konsole-bidi-disabled', context: 'a-previously-saved-direct-context' },
    ] } } });
    const profile = await host.getCapabilities();
    assert.equal(profile.cellPresentation.facts.find(fact => fact.name === 'cellPresentation.context').value, null);
    assert.ok(profile.cellPresentation.facts.find(fact => fact.name === 'cellPresentation.conditions').value.includes('kitty-force-ltr'));
    const session = await host.beginSession();
    const outcome = await session.enableCellPresentation();
    assert.equal(outcome.status, 'rejected');
    assert.equal(outcome.diagnostic.data.reason, 'terminal-configuration-required');
    assert.equal(outcome.diagnostic.data.contextAvailable, false);
    await session.restore();
    assert.deepEqual(modeWrites(host.output()), []);
  });
}

test('host creation snapshots policy, exception entries and environment before first admission', async () => {
  const env = { TERM: 'xterm-kitty', KITTY_WINDOW_ID: '10', KITTY_VERSION: '0.43.0' };
  const inspecting = createMemoryTerminalHost({ env });
  const profile = await inspecting.getCapabilities();
  const context = profile.cellPresentation.facts.find(fact => fact.name === 'cellPresentation.context').value;
  await inspecting.dispose();

  const strictPolicy = { policy: 'strict' };
  const strict = createMemoryTerminalHost({ capabilities: { cellPresentation: strictPolicy } });
  strictPolicy.policy = 'auto';
  const strictSession = await strict.beginSession();
  assert.equal((await strictSession.enableCellPresentation()).status, 'rejected');
  assert.ok((await strict.getCapabilities()).cellPresentation.facts.some(fact => fact.name === 'cellPresentation.policy' && fact.value === 'strict'));
  await strictSession.restore();

  const exceptions = [];
  const blocked = createMemoryTerminalHost({ env, capabilities: { cellPresentation: { exceptions } } });
  exceptions.push({ condition: 'kitty-force-ltr', context });
  delete env.KITTY_WINDOW_ID;
  env.TERM = 'xterm-256color';
  const blockedSession = await blocked.beginSession();
  assert.equal((await blockedSession.enableCellPresentation()).status, 'rejected', 'later configuration cannot remove or satisfy a captured hazard');
  assert.deepEqual((await blocked.getCapabilities()).cellPresentation.facts.find(fact => fact.name === 'cellPresentation.conditions').value, ['kitty-force-ltr']);
  await blockedSession.restore();

  const capturedEnv = { TERM: 'xterm-kitty', KITTY_WINDOW_ID: '10', KITTY_VERSION: '0.43.0' };
  const capturedException = { condition: 'kitty-force-ltr', context };
  const admitted = createMemoryTerminalHost({ env: capturedEnv,
    capabilities: { cellPresentation: { exceptions: [capturedException] } } });
  capturedException.context = 'different';
  capturedException.condition = 'konsole-bidi-disabled';
  capturedEnv.KITTY_VERSION = '0.44.0';
  const admittedSession = await admitted.beginSession();
  assert.equal((await admittedSession.enableCellPresentation()).assurance, 'assumed');
  assert.equal((await admitted.getCapabilities()).cellPresentation.facts.find(fact => fact.name === 'cellPresentation.context').value, context);
  await admittedSession.restore();
  for (const host of [strict, blocked, admitted]) assert.deepEqual(modeWrites(host.output()), []);
});

test('Kitty context ignores transient window IDs but binds terminal version', async () => {
  const env = { TERM: 'xterm-kitty', KITTY_WINDOW_ID: '10', KITTY_VERSION: '0.43.0' };
  const inspecting = createMemoryTerminalHost({ env });
  const profile = await inspecting.getCapabilities();
  const context = profile.cellPresentation.facts.find(fact => fact.name === 'cellPresentation.context').value;
  await inspecting.dispose();
  for (const version of ['0.43.0', '0.44.0']) {
    const host = createMemoryTerminalHost({ env: { ...env, KITTY_WINDOW_ID: '999', KITTY_VERSION: version },
      capabilities: { cellPresentation: { exceptions: [{ condition: 'kitty-force-ltr', context }] } } });
    const currentContext = (await host.getCapabilities()).cellPresentation.facts.find(fact => fact.name === 'cellPresentation.context').value;
    assert.equal(currentContext === context, version === '0.43.0');
    const session = await host.beginSession();
    assert.equal((await session.enableCellPresentation()).status, version === '0.43.0' ? 'applied' : 'rejected');
    await session.restore();
    assert.deepEqual(modeWrites(host.output()), []);
  }
});

for (const transport of [
  { SSH_CONNECTION: '192.0.2.1 51234 198.51.100.1 22' },
  { SSH_CLIENT: '192.0.2.1 51234 22' },
  { SSH_TTY: '/dev/pts/1' },
  { TMUX: '/tmp/tmux-1000/default,1,0' },
  { STY: '1234.session' },
  { ZELLIJ: '0' },
  { ZELLIJ_SESSION_NAME: 'session' },
  { TERM: 'screen-256color' },
  { TERM: 'tmux-256color' },
  { TERM_PROGRAM: 'tmux' },
  { TERM_PROGRAM: 'screen' },
  { TERM_PROGRAM: 'zellij' },
]) {
  test(`remote/shared contexts cannot reuse direct configuration exceptions (${JSON.stringify(transport)})`, async () => {
    const env = { TERM: 'xterm-kitty', KITTY_WINDOW_ID: '10' };
    const inspecting = createMemoryTerminalHost({ env });
    const profile = await inspecting.getCapabilities();
    const context = profile.cellPresentation.facts.find(fact => fact.name === 'cellPresentation.context').value;
    await inspecting.dispose();
    const host = createMemoryTerminalHost({ env: { ...env, ...transport },
      capabilities: { cellPresentation: { exceptions: [{ condition: 'kitty-force-ltr', context }] } } });
    const current = await host.getCapabilities();
    assert.equal(current.cellPresentation.facts.find(fact => fact.name === 'cellPresentation.context').value, null);
    const session = await host.beginSession();
    const outcome = await session.enableCellPresentation();
    assert.equal(outcome.status, 'rejected');
    assert.equal(outcome.diagnostic.data.reason, 'terminal-configuration-required');
    await session.restore();
    assert.deepEqual(modeWrites(host.output()), []);
  });
}

test('ordinary SSH admits the native-grid assumption without claiming an exception context', async () => {
  const host = createMemoryTerminalHost({ env: { TERM: 'xterm-256color', SSH_CONNECTION: '192.0.2.1 51234 198.51.100.1 22' } });
  const profile = await host.getCapabilities();
  assert.equal(profile.cellPresentation.support, 'supported');
  assert.equal(profile.cellPresentation.facts.find(fact => fact.name === 'cellPresentation.context').value, null);
  assert.deepEqual(profile.cellPresentation.facts.find(fact => fact.name === 'cellPresentation.conditions').value, []);
  const session = await host.beginSession();
  assert.equal((await session.enableCellPresentation()).assurance, 'assumed');
  assert.equal(session.initialState.bidiMode, 'unknown');
  assert.equal(session.initialState.provenance.cellPresentation, 'assumed');
  await session.restore();
  assert.deepEqual(modeWrites(host.output()), []);
});


test('a failed initial mode query cannot fall back to an assumed presentation or be cleared by missing evidence', async () => {
  const host = createMemoryTerminalHost();
  const write = host.stdout.write.bind(host.stdout);
  host.stdout.write = async (chunk, context) => {
    if (String(chunk).includes('\u001B[8$p')) throw new Error('injected mode-query write failure');
    return write(chunk, context);
  };
  await assert.rejects(detectModes(host));
  host.stdout.write = write;
  assert.equal(host.stdin.isRawModeEnabled(), false, 'failed probing restores temporary raw input');

  for (const reply of [undefined, '\u001B[?1;2c', report(0)]) {
    if (reply !== undefined) {
      host.input(reply);
      await detectModes(host, { refresh: true });
    }
    const profile = await host.getCapabilities();
    assert.equal(profile.cellPresentation.support, 'unknown');
    assert.ok(profile.cellPresentation.facts.some(fact => fact.name === 'cellPresentation.evidence' && fact.value === 'indeterminate'));
    const session = await host.beginSession();
    assert.equal(session.initialState.bidiMode, 'unknown', 'a failed query does not imply a mode mutation');
    assert.equal(session.initialState.provenance.bidiMode, 'assumed');
    assert.equal(session.initialState.cellPresentation, 'unknown');
    assert.equal(session.initialState.provenance.cellPresentation, 'indeterminate');
    const outcome = await session.enableCellPresentation();
    assert.equal(outcome.status, 'rejected');
    assert.equal(outcome.diagnostic.data.reason, 'presentation-indeterminate');
    const restored = await session.restore();
    assert.equal(restored.status, 'restored');
    assert.equal(restored.attempted.some(item => item.kind === 'bidiMode'), false);
    assert.deepEqual(modeWrites(host.output()), []);
  }

  host.input(report(2));
  const recovered = await detectModes(host, { refresh: true });
  assert.equal(recovered.cellPresentation.support, 'supported');
  const session = await host.beginSession();
  assert.equal(session.initialState.bidiMode, 'explicit');
  assert.equal(session.initialState.provenance.bidiMode, 'observed');
  assert.equal(session.initialState.cellPresentation, 'application-ordered');
  assert.equal(session.initialState.provenance.cellPresentation, 'assumed');
  assert.equal((await session.enableCellPresentation()).assurance, 'assumed');
  const restored = await session.restore();
  assert.equal(restored.status, 'restored');
  assert.equal(restored.attempted.some(item => item.kind === 'bidiMode'), false);
  assert.deepEqual(modeWrites(host.output()), []);
});


test('a current set-mode report always requires reset despite inconsistent derived implicit evidence', () => {
  const result = resolveCellPresentation({
    host: { inputIsTty: true, outputIsTty: true, supportsTerminalProtocols: true },
  }, { report: 'set', implicit: false });
  assert.equal(result.capability.support, 'supported');
  assert.equal(result.resetRequired, true, 'a raw set report cannot be reinterpreted as already explicit');
  assert.ok(result.capability.facts.some(fact => fact.name === 'cellPresentation.decision' && fact.value === 'reset-required'));
});


for (const earlyFence of [false, true]) {
  test(`final restoration owns split DA and preserves concurrent user keys (early fence ${earlyFence})`, async () => {
    const host = await observedHost();
    const session = await preparedSession(host);
    host.input(report(2));
    assert.equal((await session.enableCellPresentation()).status, 'applied');
    const queries = (host.output().match(/\u001B\[8\$p/gu) ?? []).length;
    let settled = false;
    const restoring = session.restore('success').finally(() => { settled = true; });
    await waitUntil(() => (host.output().match(/\u001B\[8\$p/gu) ?? []).length > queries);
    host.input(earlyFence ? 'before\u001B[?1;2c' : 'before\u001B[8;1$y\u001B[?1;');
    await flushAsync();
    assert.equal(settled, false, 'neither early DA nor an unfenced mode reply completes restoration');
    assert.equal(host.stdin.isRawModeEnabled(), true, 'raw input stays owned until the requested responses are consumed');
    host.input(earlyFence ? '\u001B[8;1$yafter' : '2cafter');
    const restored = await restoring;
    assert.equal(restored.status, 'restored');
    assert.equal(host.stdin.isRawModeEnabled(), false);
    assert.equal(restored.resultingState.bidiMode, 'implicit');
    assert.equal(restored.resultingState.provenance.bidiMode, 'observed');
    assert.equal(await readInputText(host, 'beforeafter'.length), 'beforeafter', 'no DA reply or partial tail leaks into ordinary input');
    assert.deepEqual(modeWrites(host.output()), ['\u001B[8l', '\u001B[8h']);
  });
}

for (const lateFence of [false, true]) {
  test(`a missing restoration fence preserves valid mode evidence through bounded raw-input quarantine (late DA ${lateFence})`, async () => {
    const host = await observedHost();
    const session = await preparedSession(host);
    host.input(report(2));
    assert.equal((await session.enableCellPresentation()).status, 'applied');
    const queries = (host.output().match(/\u001B\[8\$p/gu) ?? []).length;
    let settled = false;
    const restoring = session.restore('success').finally(() => { settled = true; });
    await waitUntil(() => (host.output().match(/\u001B\[8\$p/gu) ?? []).length > queries);
    host.input('before\u001B[8;1$y');
    await flushAsync();
    assert.equal(settled, false);
    host.clock.advance(100);
    await flushAsync();
    assert.equal(settled, false, 'query timeout does not release raw input before its bounded drain');
    assert.equal(host.stdin.isRawModeEnabled(), true);
    host.input(lateFence ? 'after\u001B[?1;' : 'after');
    host.clock.advance(99);
    await flushAsync();
    assert.equal(settled, false);
    assert.equal(host.stdin.isRawModeEnabled(), true);
    if (lateFence) {
      host.input('2c');
      await flushAsync();
      assert.equal(settled, false, 'late split DA is consumed without shortening the bounded quarantine');
    }
    host.clock.advance(1);
    await flushAsync();
    assert.equal(settled, true, 'the existing 100ms quarantine deadline bounds the drain without a fence');
    const restored = await restoring;
    assert.equal(restored.status, 'restored');
    assert.equal(restored.resultingState.bidiMode, 'implicit');
    assert.equal(restored.resultingState.provenance.bidiMode, 'observed', 'valid mode evidence survives the missing DA fence');
    assert.equal(host.stdin.isRawModeEnabled(), false);
    assert.equal(await readInputText(host, 'beforeafter'.length), 'beforeafter');
    assert.deepEqual(modeWrites(host.output()), ['\u001B[8l', '\u001B[8h']);
  });
}

test('initial discovery consumes a split DA after all mode replies before releasing temporary raw input', async () => {
  const host = createMemoryTerminalHost();
  let settled = false;
  const detecting = host.getCapabilities({ activeProbes: ['terminalModes'] }).finally(() => { settled = true; });
  await waitUntil(() => host.output().includes('\u001B[8$p'));
  const replies = queriedModes.map(mode => {
    const [namespace, number] = mode.split(':');
    return `\u001B[${namespace === 'private' ? '?' : ''}${number};${mode === 'standard:8' ? '2' : '0'}$y`;
  }).join('');
  host.input(`before${replies}\u001B[?1;`);
  await flushAsync();
  assert.equal(settled, false);
  assert.equal(host.stdin.isRawModeEnabled(), true);
  host.input('2cafter');
  const profile = await detecting;
  assert.equal(profile.cellPresentation.support, 'supported');
  assert.equal(profile.cellPresentation.facts.find(fact => fact.name === 'terminalModes.collection').value.complete, true);
  assert.equal(host.stdin.isRawModeEnabled(), false);
  assert.equal(await readInputText(host, 'beforeafter'.length), 'beforeafter');
  assert.deepEqual(modeWrites(host.output()), []);
});
