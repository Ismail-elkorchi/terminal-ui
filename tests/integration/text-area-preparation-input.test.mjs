import assert from 'node:assert/strict';
import test from 'node:test';
import { createTuiPreparedQuery, createTuiRuntime, defineTui } from '../../dist/tui/index.js';
import { prepareTextAreaLayout, text, textArea } from '../../dist/components/index.js';
import { column, splitPane } from '../../dist/layout/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { createTextDocument, editTextDocument, textDocumentText } from '../../dist/text/index.js';

async function settle(runtime) {
  for (let attempt = 0; attempt < 500; attempt++) {
    await new Promise(resolve => setImmediate(resolve));
    if (!runtime.state().pending && runtime.state().result !== null && runtime.state().observed > 0) break;
  }
  assert.equal(runtime.state().pending, false);
  assert.equal(runtime.state().error, null);
}

for (const nested of [false, true]) test(`wrapped real TUI ${nested ? 'nested column/split-pane' : 'full-screen'} preparation keeps input ordered through activation and resize`, async () => {
  const blocked = Promise.withResolvers();
  const started = Promise.withResolvers();
  let hold = true;
  let constructedDuringPaint = 0;
  let measuredDuringPaint = 0;
  let preparing = 0;
  let requests = 0;
  const freeze = Object.freeze;
  const editorOptions = editor => ({ id: 'editor', meta: { accessibleName: 'Prepared editor' }, state: editor, wrap: true, lineNumbers: true,
    scrollbar: { visible: 'auto', axis: 'vertical' }, onLayout: snapshot => ({ kind: 'layout', snapshot }),
    onLayoutRequest: request => ({ kind: 'request', request }),
    onTransition: transition => ({ kind: 'transition', transition }) });
  const query = createTuiPreparedQuery({ id: 'prepare-wrapped-editor',
    async prepare(request, context) {
      preparing++;
      try {
        return await prepareTextAreaLayout(request.layout, {
          signal: context.signal,
          yield: () => { started.resolve(); return hold ? blocked.promise : Promise.resolve(); },
        });
      } finally { preparing--; }
    },
    toMessage: message => ({ kind: 'prepared', message }),
  });
  const original = createTextDocument(`input:${'·界é😀 '.repeat(22_000)}`);
  const runtime = createTuiRuntime({ initialFocus: { kind: 'element', elementId: 'editor' }, host: createMemoryTerminalHost({ terminalSize: { columns: 80, rows: 12 } }),
    app: defineTui({
      init: () => ({ state: { ...query.init(), editor: { document: original,
        caret: { position: { offset: 0, affinity: 'downstream' } },
        scroll: { offsetRow: 0, offsetColumn: 0, followTail: false } },
        admitted: [], stale: 0, observed: 0 } }),
      update(state, message) {
        if (message.kind === 'request') {
          requests++;
          return query.request(state, { editor: state.editor, layout: message.request });
        }
        if (message.kind === 'insert') return { state: { ...state,
          editor: { ...state.editor, ...editTextDocument(state.editor, { kind: 'insert', text: message.text }) },
          admitted: [...state.admitted, message.text] } };
        if (message.kind === 'move') return { state: { ...state, editor: { ...state.editor, ...editTextDocument(state.editor, { kind: 'moveRight' }) } } };
        if (message.kind === 'transition') {
          if (message.transition.kind !== 'edit') return { state };
          const operation = message.transition.operation;
          return { state: { ...state, editor: { ...state.editor, ...editTextDocument(state.editor, operation) },
            admitted: operation.kind === 'insert' ? [...state.admitted, operation.text] : state.admitted } };
        }
        if (message.kind === 'noop') return { state: { ...state } };
        if (message.kind === 'layout') return { state: { ...state, observed: state.observed + 1 } };
        if (message.message.kind === 'ready' && message.message.result.document !== state.editor.document) {
          return { state: { ...state, pending: false, stale: state.stale + 1 } };
        }
        return query.update(state, message.message);
      },
      view(state) {
        const editor = textArea({ ...editorOptions(state.editor), preparedLayout: state.result });
        return nested ? column([text({ content: 'Header' }), splitPane([editor, text({ content: 'Other' })], {
          direction: 'horizontal', sizes: [{ kind: 'percent', value: 50 }, { kind: 'percent', value: 50 }],
        }), text({ content: 'Footer' })]) : editor;
      },
    }) });
  Object.freeze = value => {
    if (preparing === 0 && value !== null && typeof value === 'object') {
      if ('localStart' in value && 'firstVisualLine' in value) constructedDuringPaint++;
      if ('startOffset' in value && 'cells' in value && 'text' in value) measuredDuringPaint++;
    }
    return freeze(value);
  };
  try {
    await runtime.start();
    await started.promise;
    assert.equal(runtime.state().observed, 0, 'pending frames cannot claim accepted source geometry');
    assert.equal(constructedDuringPaint, 0, 'pending hooks cannot construct cold editor geometry');
    assert.ok(measuredDuringPaint < 1_000, 'pending inspection/AX/focus cannot build a full source index');
    assert.match(JSON.stringify(runtime.frame().accessibility), /"busy":true/u);
    const pendingRequests = requests;
    await runtime.dispatchMany([{ kind: 'noop' }, { kind: 'noop' }]);
    assert.equal(requests, pendingRequests, 'stable pending accepted frames must deduplicate their request');
    await runtime.dispatchMany(['1', '2'].map(value => ({ kind: 'insert', text: value })));
    await runtime.handleInput({ kind: 'text', text: '3', paste: false });
    await runtime.handleInput({ kind: 'paste', text: '4', bracketed: true });
    assert.deepEqual(runtime.state().admitted, ['1', '2', '3', '4']);
    assert.ok(textDocumentText(runtime.state().editor.document).startsWith('1234input:'));
    assert.equal(runtime.state().pending, true);
    hold = false; blocked.resolve();
    await settle(runtime);
    assert.equal(runtime.state().result.document, runtime.state().editor.document);
    assert.ok(runtime.state().observed > 0);
    assert.equal(constructedDuringPaint, 0, 'accepted first paint must consume already-built rows');
    assert.ok(measuredDuringPaint < 2_000, 'accepted first paint may materialize only visible indexes');
    const stableRequests = requests;
    await runtime.dispatchMany([{ kind: 'move' }, { kind: 'move' }]);
    assert.equal(requests, stableRequests, 'stable ready geometry must not issue duplicate requests');
    const accepted = runtime.state().result;
    const acceptedRevision = runtime.state().revision;
    await runtime.resize({ columns: 41, rows: 10 });
    await settle(runtime);
    assert.notEqual(runtime.state().result, accepted);
    assert.equal(runtime.state().result.width, nested ? 20 : 41);
    const resized = runtime.state().result;
    await runtime.dispatch({ kind: 'prepared', message: { kind: 'ready', revision: acceptedRevision, result: accepted } });
    assert.equal(runtime.state().result, resized, 'ordinary query revisions reject stale resize completion');
    assert.equal(constructedDuringPaint, 0, 'accepted resize must consume cooperative rewrap');
    assert.deepEqual(runtime.state().admitted, ['1', '2', '3', '4']);
    assert.equal(runtime.state().editor.caret.position.offset, 6);
    assert.deepEqual(runtime.diagnostics(), []);
  } finally { Object.freeze = freeze; hold = false; blocked.resolve(); await runtime.dispose(); }
});
