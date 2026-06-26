import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { createClipboardWriteSequence, writeClipboardText } from '../../dist/protocol/index.js';
import { extractTextSelection } from '../../dist/text/index.js';

test('extractTextSelection is pure and sanitizes terminal controls by default', () => {
  const selected = extractTextSelection({
    text: 'alpha \u001B[31mbravo\u001B[0m charlie',
    selection: { start: 6, end: 17 }
  });

  assert.equal(selected, 'bravo charl');
});

test('clipboard OSC 52 sequence is gated by explicit policy', () => {
  const denied = createClipboardWriteSequence('copy me', { allow: false });
  const allowed = createClipboardWriteSequence('copy me', { allow: true });
  const oversized = createClipboardWriteSequence('copy me', { allow: true, maxBytes: 2 });

  assert.equal(denied.ok, false);
  assert.equal(denied.diagnostic.code, 'HOST_CAPABILITY_UNAVAILABLE');
  assert.equal(allowed.ok, true);
  assert.equal(allowed.sequence, '\u001B]52;c;Y29weSBtZQ==\u0007');
  assert.equal(oversized.ok, false);
  assert.equal(oversized.diagnostic.data?.maxBytes, 2);
});

test('writeClipboardText requires host clipboard capability before emitting OSC 52', async () => {
  const host = createMemoryTerminalHost();
  const blocked = await writeClipboardText(host, 'copy me', { allow: true });

  assert.equal(blocked.ok, false);
  assert.equal(blocked.diagnostic.code, 'HOST_PROTOCOL_UNSUPPORTED');
  assert.equal(host.output(), '');
});

test('memory host can opt into clipboard capability for protocol tests', async () => {
  const host = createMemoryTerminalHost({ clipboard: true });
  const copied = await writeClipboardText(host, 'copy me', { allow: true });

  assert.equal(copied.ok, true);
  assert.match(host.output(), /^\u001B\]52;c;Y29weSBtZQ==\u0007$/u);
});
