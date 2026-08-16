import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createMemoryTerminalHost } from '../../dist/host/index.js';
import {
  ownSelectionState,
  resolveSelectedText
} from '../../dist/interaction/index.js';
import { copySelectedTextToClipboard } from '../../dist/tui/index.js';

test('collection selection ownership detaches mutable multiple-selection state', () => {
  const selectedIds = ['first'];
  const supplied = {
    mode: 'multiple',
    selectedIds,
    anchorId: 'first',
    rangeSelectionEnabled: true
  };
  const owned = ownSelectionState(supplied, 'test selection');

  selectedIds.push('second');
  supplied.anchorId = 'second';

  assert.deepEqual(owned, {
    mode: 'multiple',
    selectedIds: ['first'],
    anchorId: 'first',
    rangeSelectionEnabled: true
  });
  assert.equal(Object.isFrozen(owned), true);
  assert.equal(Object.isFrozen(owned.selectedIds), true);
  assert.throws(
    () => ownSelectionState({ mode: 'multiple', selectedIds: ['duplicate', 'duplicate'] }, 'test selection'),
    /test selection\.selectedIds must be unique/u
  );
  assert.throws(
    () => ownSelectionState({ mode: 'single', selectionFollowsActive: 'yes' }, 'test selection'),
    /test selection\.selectionFollowsActive must be a boolean/u
  );
});

test('selection interaction resolves the active caller-controlled source', () => {
  const result = resolveSelectedText({
    activeSourceId: 'details',
    sources: [
      { id: 'table', text: 'alpha beta', selection: { startOffset: 0, endOffsetExclusive: 5 }, priority: 10 },
      { id: 'details', label: 'Details', text: 'charlie delta', selection: { startOffset: 8, endOffsetExclusive: 13 } }
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
      { id: 'low', text: 'low value', selection: { startOffset: 0, endOffsetExclusive: 3 } },
      { id: 'high', text: 'high value', selection: { startOffset: 0, endOffsetExclusive: 4 }, priority: 3 }
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
    sources: [{ id: 'source', text: 'selected', selection: { startOffset: 0, endOffsetExclusive: 8 } }]
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
      { id: 'empty', text: 'text', selection: { startOffset: 1, endOffsetExclusive: 1 } },
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
  const host = createMemoryTerminalHost({ supportsClipboardWrite: true });
  const result = await copySelectedTextToClipboard({
    host,
    policy: { allowed: true },
    sources: [{ id: 'field', text: 'copy this', selection: { startOffset: 0, endOffsetExclusive: 4 } }]
  });

  assert.equal(result.ok, true);
  assert.equal(result.ok ? result.selection.text : undefined, 'copy');
  assert.equal(result.ok ? result.clipboard.byteLength : undefined, 4);
  assert.equal(host.output().includes('\u001B]52;c;Y29weQ==\u0007'), true);
});

test('selection interaction permits an explicitly authorized bounded attempt when support is unknown', async () => {
  const host = createMemoryTerminalHost();
  const result = await copySelectedTextToClipboard({
    host,
    policy: { allowed: true },
    sources: [{ id: 'field', text: 'copy this', selection: { startOffset: 0, endOffsetExclusive: 4 } }]
  });

  assert.equal(result.ok, true);
  assert.equal(result.ok ? result.clipboard.assurance : undefined, 'sent');
  assert.equal(host.output().includes('\u001B]52;c;Y29weQ==\u0007'), true);
});

test('selection interaction rejects clipboard writes when terminal support is explicitly absent', async () => {
  const host = createMemoryTerminalHost({ supportsClipboardWrite: false });
  const result = await copySelectedTextToClipboard({
    host,
    policy: { allowed: true },
    sources: [{ id: 'field', text: 'copy this', selection: { startOffset: 0, endOffsetExclusive: 4 } }]
  });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostic.code, 'HOST_PROTOCOL_UNSUPPORTED');
  assert.equal(host.output(), '');
});

test('selection interaction does not write clipboard output when selection is missing', async () => {
  const host = createMemoryTerminalHost({ supportsClipboardWrite: true });
  const result = await copySelectedTextToClipboard({
    host,
    policy: { allowed: true },
    sources: [{ id: 'field', text: 'copy this' }]
  });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostic.code, 'SELECTION_UNAVAILABLE');
  assert.equal(host.output(), '');
});
