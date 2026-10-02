import assert from 'node:assert/strict';
import test from 'node:test';
import { createTuiPreparedQuery, createTuiRuntime, defineTui } from '../../dist/tui/index.js';
import { text, textArea } from '../../dist/components/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { createTextDocument, editTextDocument, prepareTextDocumentLine, textDocumentText } from '../../dist/text/index.js';
import { waitUntil } from '../support/async.ts';

test('a cold real editor admits prepared geometry without replacing reliable input or stale revisions', async () => {
  const blocked = Promise.withResolvers();
  const started = Promise.withResolvers();
  let hold = true;
  let editorPaints = 0;
  const completions = [];
  const query = createTuiPreparedQuery({ id: 'prepare-editor',
    prepare: (document, context) => prepareTextDocumentLine(document, 0, { words: true, geometry: true }, {
      signal: context.signal,
      yield: () => { started.resolve(); return hold ? blocked.promise : Promise.resolve(); },
    }),
    toMessage: message => ({ kind: 'prepared', message }),
  });
  const original = createTextDocument(`input:${'·a b '.repeat(26_000)}`);
  const runtime = createTuiRuntime({ host: createMemoryTerminalHost(), app: defineTui({
    init: () => ({ state: { ...query.init(), editor: { document: original,
      caret: { position: { offset: 0, affinity: 'downstream' } },
    }, admitted: [], stale: 0 } }),
    update(state, message) {
      if (message.kind === 'prepare') return query.request(state, state.editor.document);
      if (message.kind === 'insert') return { state: { ...state,
        editor: editTextDocument(state.editor, { kind: 'insert', text: message.text }),
        admitted: [...state.admitted, message.text],
      } };
      if (message.kind === 'move') return { state: { ...state, editor: editTextDocument(state.editor, { kind: 'moveWordRight' }) } };
      if (message.kind === 'transition') return { state };
      completions.push(message.message);
      if (message.message.kind === 'ready' && message.message.result.document !== state.editor.document) {
        // Even with no replacement effect request, ordered input can make the
        // earlier data preparation stale. Never restore its document snapshot.
        return { state: { ...state, pending: false, stale: state.stale + 1 } };
      }
      return query.update(state, message.message);
    },
    view(state) {
      if (state.result?.document !== state.editor.document) return text({ content: 'Preparing editor' });
      editorPaints++;
      return textArea({ id: 'editor', meta: { accessibleName: 'Prepared editor' }, state: state.editor,
        onTransition: transition => ({ kind: 'transition', transition }),
      });
    },
  }) });
  try {
    await runtime.start();
    await runtime.dispatch({ kind: 'prepare' });
    await started.promise;
    await runtime.dispatchMany(['1', '2', '3', '4'].map(value => ({ kind: 'insert', text: value })));
    assert.deepEqual(runtime.state().admitted, ['1', '2', '3', '4']);
    assert.ok(textDocumentText(runtime.state().editor.document).startsWith('1234input:'));
    assert.equal(runtime.state().pending, true);
    assert.equal(editorPaints, 0, 'pending activation must not synchronously construct cold editor geometry');
    hold = false;
    blocked.resolve();
    await waitUntil(() => !runtime.state().pending);
    assert.equal(runtime.state().stale, 1);
    assert.equal(runtime.state().result, null);
    assert.equal(editorPaints, 0);
    const segment = Object.getOwnPropertyDescriptor(Intl.Segmenter.prototype, 'segment');
    const native = segment.value;
    const freeze = Object.freeze;
    let admissionMeasuredObjects = 0;
    Object.defineProperty(Intl.Segmenter.prototype, 'segment', { configurable: true,
      value(value) {
        if (!runtime.state().pending && editorPaints > 0) {
          assert.ok(value.length < 1_024, 'accepted editor paint/navigation must consume owned source geometry');
        }
        return native.call(this, value);
      },
    });
    Object.freeze = value => {
      if (!runtime.state().pending && typeof value === 'object' && value !== null
        && 'cells' in value && 'startOffset' in value && 'text' in value) admissionMeasuredObjects++;
      return freeze(value);
    };
    try {
      await runtime.dispatch({ kind: 'prepare' });
      await waitUntil(() => !runtime.state().pending);
      assert.equal(runtime.state().result.document, runtime.state().editor.document);
      assert.ok(editorPaints > 0, 'accepted result activates the actual textArea component');
      assert.ok(admissionMeasuredObjects < 500, 'first accepted paint must not allocate a full-line measured index');
      await runtime.dispatchMany([{ kind: 'move' }, { kind: 'move' }]);
    } finally {
      Object.defineProperty(Intl.Segmenter.prototype, 'segment', segment);
      Object.freeze = freeze;
    }
    assert.equal(runtime.state().editor.caret.position.offset, 12);
    assert.deepEqual(runtime.state().admitted, ['1', '2', '3', '4']);
    assert.equal(completions.length, 2);
  } finally { hold = false; blocked.resolve(); await runtime.dispose(); }
});
