import assert from 'node:assert/strict';
import test from 'node:test';
import { createTerminalModeResponseProtocol, terminalModeQueryRequest } from './terminal-mode-query.ts';
const bytes = (value: string) => new TextEncoder().encode(value);

void test('mode identities keep standard and private namespaces separate', () => {
  const protocol = createTerminalModeResponseProtocol(['standard:8', 'private:25']);
  assert.equal(protocol.classify(bytes('\u001B[?8;1$y')), undefined);
  assert.equal(protocol.classify(bytes('\u001B[25;2$y')), undefined);
  assert.deepEqual(protocol.classify(bytes('\u001B[8;2$y')), { kind: 'consume' });
  assert.deepEqual(protocol.classify(bytes('\u001B[?25;1$y')), { kind: 'consume' });
  assert.deepEqual(protocol.classify(bytes('\u001B[?1;2c')), { kind: 'consume' });
  assert.deepEqual(protocol.complete?.(), { 'standard:8': 'reset', 'private:25': 'set' });
  assert.deepEqual(protocol.evidence(), {
    reports: { 'standard:8': 'reset', 'private:25': 'set' },
    missingModes: [], conflictingModes: [], complete: true,
  });
  assert.equal(terminalModeQueryRequest(['standard:8']), '\u001B[8$p\u001B[c');
});

void test('bounded readback consumes only requested mode and valid reports', () => {
  const protocol = createTerminalModeResponseProtocol(['standard:8']);
  for (const malformed of ['\u001B[8;5$y', '\u001B[8;11$y', '\u001B[;2$y', '\u001B[8;-1$y', '\u001B[8;2y', '\u001B[?25;2$y']) {
    assert.equal(protocol.classify(bytes(malformed)), undefined);
  }
  assert.deepEqual(protocol.evidence().missingModes, ['standard:8']);
  for (const [number, state] of ['unrecognized', 'set', 'reset', 'permanently_set', 'permanently_reset'].entries()) {
    const observation = createTerminalModeResponseProtocol(['standard:8']);
    assert.deepEqual(observation.classify(bytes(`\u001B[8;${String(number)}$y`)), { kind: 'consume' });
    assert.equal(observation.complete?.(), undefined, 'the requested DA fence still belongs to this query');
    observation.classify(bytes('\u001B[?1;2c'));
    assert.deepEqual(observation.complete?.(), { 'standard:8': state });
  }
});

void test('early DA is only a fence observation and cannot complete missing mode evidence', () => {
  const protocol = createTerminalModeResponseProtocol(['standard:8', 'private:25']);
  protocol.classify(bytes('\u001B[?1c'));
  assert.equal(protocol.complete?.(), undefined);
  protocol.classify(bytes('\u001B[?25;1$y'));
  assert.equal(protocol.complete?.(), undefined);
  assert.deepEqual(protocol.evidence(), {
    reports: { 'private:25': 'set' }, missingModes: ['standard:8'], conflictingModes: [], complete: false,
  });
  protocol.classify(bytes('\u001B[8;2$y'));
  assert.deepEqual(protocol.complete?.(), { 'private:25': 'set', 'standard:8': 'reset' });
  assert.equal(protocol.retire?.(), undefined);
});

void test('duplicates preserve evidence and contradictions remain unusable across later repeats', () => {
  const protocol = createTerminalModeResponseProtocol(['standard:8', 'private:25']);
  protocol.classify(bytes('\u001B[8;2$y'));
  protocol.classify(bytes('\u001B[8;2$y'));
  const first = protocol.evidence();
  assert.deepEqual(first.reports, { 'standard:8': 'reset' });
  protocol.classify(bytes('\u001B[8;1$y'));
  protocol.classify(bytes('\u001B[8;2$y'));
  protocol.classify(bytes('\u001B[?25;1$y'));
  assert.deepEqual(protocol.evidence(), {
    reports: { 'private:25': 'set' }, missingModes: [], conflictingModes: ['standard:8'], complete: true,
  });
  assert.deepEqual(first.reports, { 'standard:8': 'reset' }, 'snapshots do not change retroactively');
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.reports), true);
  assert.equal(Object.isFrozen(first.missingModes), true);
});

void test('retirement seals partial evidence while late responses stay recognizable for quarantine', () => {
  const protocol = createTerminalModeResponseProtocol(['standard:8', 'private:25']);
  protocol.classify(bytes('\u001B[?25;1$y'));
  const before = protocol.evidence();
  const late = protocol.retire?.();
  assert.notEqual(late, undefined);
  assert.equal(late?.quarantineUntilDeadline, true);
  assert.deepEqual(late.classify(bytes('\u001B[8;2$y')), { kind: 'consume' });
  assert.deepEqual(late.classify(bytes('\u001B[?1c')), { kind: 'consume' });
  assert.deepEqual(protocol.evidence(), before);
});
