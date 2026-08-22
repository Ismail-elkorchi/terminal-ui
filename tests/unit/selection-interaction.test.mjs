import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createMemoryTerminalHost } from '../../dist/host/index.js';
import { text } from '../../dist/components/index.js';
import {
  ownSelectionState
} from '../../dist/interaction/index.js';
import {
  extractTextBufferSelection,
  extractTextDocumentSelection,
  extractTextSelection,
  prepareTextDocument,
} from '../../dist/text/index.js';
import { createTuiRuntime, defineTui } from '../../dist/tui/index.js';

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

test('selection extraction slices original offsets before sanitizing selected content', () => {
  const before = '\u001B[31mbravo';
  assert.equal(extractTextSelection({
    text: before,
    selection: { startOffset: 5, endOffsetExclusive: 10 },
  }), 'bravo');

  const inside = 'br\u001B[31mavo';
  assert.equal(extractTextSelection({
    text: inside,
    selection: { startOffset: 0, endOffsetExclusive: inside.length },
  }), 'bravo');

  const after = 'bravo\u001B[0m';
  assert.equal(extractTextBufferSelection({
    buffer: {
      text: after,
      cursor: 5,
      selection: { startOffset: 0, endOffsetExclusive: 5 },
    },
  }), 'bravo');

  assert.equal(extractTextDocumentSelection({
    document: prepareTextDocument('alpha\n🙂 bravo'),
    selection: {
      anchor: { offset: 6, affinity: 'downstream' },
      focus: { offset: 14, affinity: 'downstream' },
    },
  }), '🙂 bravo');
});

test('selection interaction writes clipboard text only through explicit policy and host capability', async () => {
  const host = createMemoryTerminalHost({ supportsClipboardWrite: true });
  const runtime = await clipboardRuntime(host);
  const policy = { allowed: true };
  const selection = { sourceId: 'field', text: 'copy' };
  const copying = runtime.copySelectedText({
    policy,
    selection,
  });
  policy.allowed = false;
  selection.text = 'changed';
  const result = await copying;

  assert.equal(result.status, 'copied');
  assert.equal(result.status === 'copied' ? result.selection.text : undefined, 'copy');
  assert.equal(result.status === 'copied' ? result.clipboard.byteLength : undefined, 4);
  assert.equal(host.output().includes('\u001B]52;c;Y29weQ==\u0007'), true);
  await runtime.dispose();
});

test('runtime clipboard boundary rejects malformed dynamic policy before output', async () => {
  const host = createMemoryTerminalHost({ supportsClipboardWrite: true });
  const runtime = await clipboardRuntime(host);

  await assert.rejects(
    runtime.copySelectedText({
      policy: { allowed: 'yes' },
      selection: { sourceId: 'field', text: 'copy' },
    }),
    /allowed must be a boolean/u,
  );
  assert.equal(host.output().includes('\u001B]52;'), false);
  await runtime.dispose();
});

test('selection interaction permits an explicitly authorized bounded attempt when support is unknown', async () => {
  const host = createMemoryTerminalHost();
  const runtime = await clipboardRuntime(host);
  const result = await runtime.copySelectedText({
    policy: { allowed: true },
    selection: { sourceId: 'field', text: 'copy' }
  });

  assert.equal(result.status, 'copied');
  assert.equal(result.status === 'copied' ? result.clipboard.assurance : undefined, 'sent');
  assert.equal(host.output().includes('\u001B]52;c;Y29weQ==\u0007'), true);
  await runtime.dispose();
});

test('selection interaction rejects clipboard writes when terminal support is explicitly absent', async () => {
  const host = createMemoryTerminalHost({ supportsClipboardWrite: false });
  const runtime = await clipboardRuntime(host);
  const result = await runtime.copySelectedText({
    policy: { allowed: true },
    selection: { sourceId: 'field', text: 'copy' }
  });

  assert.equal(result.status, 'unavailable');
  assert.equal(result.diagnostic.code, 'HOST_PROTOCOL_UNSUPPORTED');
  assert.equal(host.output().includes('\u001B]52;'), false);
  await runtime.dispose();
});

test('selection interaction does not write clipboard output when selection is missing', async () => {
  const host = createMemoryTerminalHost({ supportsClipboardWrite: true });
  const runtime = await clipboardRuntime(host);
  const result = await runtime.copySelectedText({
    policy: { allowed: true },
    selection: undefined
  });

  assert.equal(result.status, 'unavailable');
  assert.equal(result.diagnostic.code, 'SELECTION_UNAVAILABLE');
  assert.equal(host.output().includes('\u001B]52;'), false);
  await runtime.dispose();
});

test('effect context exposes runtime-owned clipboard output without exposing the host', async () => {
  const host = createMemoryTerminalHost({ supportsClipboardWrite: true });
  const app = defineTui({
    id: 'clipboard-effect',
    init: () => ({
      state: 'pending',
      effects: [{
        id: 'copy',
        concurrency: 'keep-first',
        run: async (context) => {
          assert.equal('host' in context, false);
          const result = await context.copySelectedText({
            policy: { allowed: true },
            selection: { sourceId: 'field', text: 'effect copy' },
          });
          return { kind: 'message', message: result.status };
        },
      }],
    }),
    update: (_state, message) => ({ state: message }),
    view: (state) => text({ content: state }),
  });
  const runtime = createTuiRuntime({ app, host });
  await runtime.start();
  for (let attempt = 0; attempt < 100 && runtime.state() !== 'copied'; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }

  assert.equal(runtime.state(), 'copied');
  assert.equal(host.output().includes('\u001B]52;c;ZWZmZWN0IGNvcHk=\u0007'), true);
  await runtime.dispose();
});

async function clipboardRuntime(host) {
  const app = defineTui({
    id: 'clipboard-runtime',
    init: () => ({ state: undefined }),
    update: (state) => ({ state }),
    view: () => text({ content: 'clipboard' }),
  });
  const runtime = createTuiRuntime({ app, host });
  await runtime.start();
  return runtime;
}
