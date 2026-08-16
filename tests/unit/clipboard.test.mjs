import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { createClipboardWriteSequence, writeClipboardText } from '../../dist/protocol/index.js';
import { extractTextSelection } from '../../dist/text/index.js';

test('extractTextSelection is pure and sanitizes terminal controls by default', () => {
  const selected = extractTextSelection({
    text: 'alpha \u001B[31mbravo\u001B[0m charlie',
    selection: { startOffset: 6, endOffsetExclusive: 17 }
  });

  assert.equal(selected, 'bravo charl');
});

test('clipboard OSC 52 sequence is gated by explicit policy', () => {
  const denied = createClipboardWriteSequence('copy me', { allowed: false });
  const allowed = createClipboardWriteSequence('copy me', { allowed: true });
  const oversized = createClipboardWriteSequence('copy me', { allowed: true, maxBytes: 2 });

  assert.equal(denied.ok, false);
  assert.equal(denied.diagnostic.code, 'HOST_CAPABILITY_UNAVAILABLE');
  assert.equal(allowed.ok, true);
  assert.equal(allowed.assurance, 'sent');
  assert.equal(allowed.sequence, '\u001B]52;c;Y29weSBtZQ==\u0007');
  assert.equal(oversized.ok, false);
  assert.equal(oversized.diagnostic.data?.maxBytes, 2);
});

test('clipboard OSC 52 Base64 output covers complete UTF-8 byte groups and padding', () => {
  const cases = [
    ['', ''],
    ['f', 'Zg=='],
    ['fo', 'Zm8='],
    ['foo', 'Zm9v'],
    ['界🙂', '55WM8J+Zgg==']
  ];

  for (const [value, encoded] of cases) {
    const result = createClipboardWriteSequence(value, { allowed: true });
    assert.equal(result.ok, true);
    assert.equal(result.sequence, `\u001B]52;c;${encoded}\u0007`);
  }
});

test('clipboard limits apply to sanitized UTF-8 bytes before Base64 encoding', () => {
  const exact = createClipboardWriteSequence('界🙂', { allowed: true, maxBytes: 7 });
  const oversized = createClipboardWriteSequence('界🙂', { allowed: true, maxBytes: 6 });
  const sanitized = createClipboardWriteSequence('\u001B[31mf', { allowed: true, maxBytes: 1 });

  assert.equal(exact.ok, true);
  assert.equal(exact.byteLength, 7);
  assert.equal(oversized.ok, false);
  assert.equal(oversized.diagnostic.data?.byteLength, 7);
  assert.equal(sanitized.ok, true);
  assert.equal(sanitized.sequence, '\u001B]52;c;Zg==\u0007');
});

test('clipboard limits must be finite non-negative safe integers', () => {
  for (const maxBytes of [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1
  ]) {
    assert.throws(
      () => createClipboardWriteSequence('copy', { allowed: true, maxBytes }),
      /maxBytes must be a finite non-negative safe integer/u
    );
  }
  assert.equal(
    createClipboardWriteSequence('', { allowed: true, maxBytes: Number.MAX_SAFE_INTEGER }).ok,
    true
  );
});

test('writeClipboardText writes through an explicit protocol sink', async () => {
  const host = createMemoryTerminalHost();
  const copied = await writeClipboardText(protocolSink(host), 'copy me', { allowed: true });

  assert.equal(copied.ok, true);
  assert.match(host.output(), /^\u001B\]52;c;Y29weSBtZQ==\u0007$/u);
});

test('writeClipboardText preserves explicit caller policy at the protocol boundary', async () => {
  const host = createMemoryTerminalHost();
  const copied = await writeClipboardText(protocolSink(host), 'copy me', { allowed: false });

  assert.equal(copied.ok, false);
  assert.equal(host.output(), '');
});

function protocolSink(host) {
  return { write: (sequence) => host.write({ text: sequence }) };
}
