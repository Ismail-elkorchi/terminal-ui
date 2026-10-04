import assert from 'node:assert/strict';
import test from 'node:test';
import { createTerminalModeResponseProtocol, terminalModeQueryRequest } from './terminal-mode-query.ts';
const bytes = (value: string) => new TextEncoder().encode(value);

void test('mode identities keep standard and private namespaces separate', () => {
  const protocol = createTerminalModeResponseProtocol();
  assert.equal(protocol.classify(bytes('\u001B[?8;1$y')), undefined);
  assert.equal(protocol.classify(bytes('\u001B[25;2$y')), undefined);
  assert.deepEqual(protocol.classify(bytes('\u001B[8;2$y')), { kind: 'consume' });
  assert.deepEqual(protocol.classify(bytes('\u001B[?25;1$y')), { kind: 'consume' });
  assert.deepEqual(protocol.classify(bytes('\u001B[?1;2c')), {
    kind: 'matched', value: { 'standard:8': 'reset', 'private:25': 'set' },
  });
  assert.equal(terminalModeQueryRequest(['standard:8']), '\u001B[8$p\u001B[c');
});

void test('bounded readback consumes only requested mode and valid reports', () => {
  const protocol = createTerminalModeResponseProtocol(['standard:8']);
  for (const malformed of ['\u001B[8;5$y', '\u001B[8;11$y', '\u001B[;2$y', '\u001B[8;-1$y', '\u001B[8;2y', '\u001B[?25;2$y']) {
    assert.equal(protocol.classify(bytes(malformed)), undefined);
  }
  for (const [number, state] of ['unrecognized', 'set', 'reset', 'permanently_set', 'permanently_reset'].entries()) {
    assert.deepEqual(protocol.classify(bytes(`\u001B[8;${String(number)}$y`)), { kind: 'consume' });
    assert.deepEqual(protocol.classify(bytes('\u001B[?1c')), { kind: 'matched', value: { 'standard:8': state } });
  }
});
