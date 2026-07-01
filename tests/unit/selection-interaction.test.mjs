import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryTerminalHost } from '../../dist/host/index.js';
import {
  copySelectedTextToClipboard,
  resolveSelectedText
} from '../../dist/tui/index.js';

test('selection interaction resolves the active application-owned source', () => {
  const result = resolveSelectedText({
    activeSourceId: 'details',
    sources: [
      { id: 'table', text: 'alpha beta', selection: { start: 0, end: 5 }, priority: 10 },
      { id: 'details', label: 'Details', text: 'charlie delta', selection: { start: 8, end: 13 } }
    ]
  });

  assert.deepEqual(result, {
    ok: true,
    mode: 'application',
    sourceId: 'details',
    label: 'Details',
    text: 'delta',
    byteLength: 5
  });
});

test('selection interaction falls back to the highest-priority selected source', () => {
  const result = resolveSelectedText({
    activeSourceId: 'missing',
    sources: [
      { id: 'low', text: 'low value', selection: { start: 0, end: 3 } },
      { id: 'high', text: 'high value', selection: { start: 0, end: 4 }, priority: 3 }
    ]
  });

  assert.deepEqual(result, {
    ok: true,
    mode: 'application',
    sourceId: 'high',
    text: 'high',
    byteLength: 4
  });
});

test('selection interaction reports terminal-native delegation as non-copyable app state', () => {
  const result = resolveSelectedText({
    mode: 'terminalNative',
    sources: [{ id: 'source', text: 'selected', selection: { start: 0, end: 8 } }]
  });

  assert.equal(result.ok, false);
  assert.equal(result.mode, 'terminalNative');
  assert.equal(result.diagnostic.code, 'SELECTION_UNAVAILABLE');
  assert.equal(result.diagnostic.severity, 'info');
});

test('selection interaction returns a typed diagnostic when no source has selected text', () => {
  const result = resolveSelectedText({
    activeSourceId: 'empty',
    sources: [
      { id: 'empty', text: 'text', selection: { start: 1, end: 1 } },
      { id: 'none', text: 'text' }
    ]
  });

  assert.equal(result.ok, false);
  assert.equal(result.mode, 'application');
  assert.equal(result.diagnostic.code, 'SELECTION_UNAVAILABLE');
  assert.deepEqual(result.diagnostic.data, {
    sourceCount: 2,
    activeSourceId: 'empty'
  });
});

test('selection interaction writes clipboard text only through explicit policy and host capability', async () => {
  const host = createMemoryTerminalHost({ clipboard: true });
  const result = await copySelectedTextToClipboard({
    host,
    policy: { allow: true },
    sources: [{ id: 'field', text: 'copy this', selection: { start: 0, end: 4 } }]
  });

  assert.equal(result.ok, true);
  assert.equal(result.ok ? result.selection.text : undefined, 'copy');
  assert.equal(result.ok ? result.clipboard.byteLength : undefined, 4);
  assert.equal(host.output().includes('\u001B]52;c;Y29weQ==\u0007'), true);
});

test('selection interaction does not write clipboard output when selection is missing', async () => {
  const host = createMemoryTerminalHost({ clipboard: true });
  const result = await copySelectedTextToClipboard({
    host,
    policy: { allow: true },
    sources: [{ id: 'field', text: 'copy this' }]
  });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostic.code, 'SELECTION_UNAVAILABLE');
  assert.equal(host.output(), '');
});
