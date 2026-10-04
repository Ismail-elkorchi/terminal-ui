import assert from 'node:assert/strict';
import test from 'node:test';
import { createTuiRuntime, defineTui } from '../../../dist/tui/index.js';
import { createMemoryTerminalHost } from '../../../dist/host/index.js';
import { key } from '../../support/keyboard.mjs';
import { textArea } from '../../../dist/components/index.js';
import { renderElementInternal } from '../../../dist/renderer/internal/render-element.js';
import { createTextAreaState, textAreaReducer } from '../../../dist/behavior/index.js';
import { createTextDocument, defaultTextWidthProfile, textDocumentEdit, textDocumentText } from '../../../dist/text/index.js';
import { defaultTheme } from '../../../dist/theme/index.js';
import { createTextAreaModel } from '../../../dist/components/text-area/model.js';
import { layoutTextAreaDocument } from '../../../dist/components/text-area/layout.js';
import { measureTextArea, textAreaGeometry, textAreaLayoutPending } from '../../../dist/components/text-area/geometry.js';
import { textAreaVisualHandlers, pointerPosition } from '../../../dist/components/text-area/interaction.js';
import { paintTextArea } from '../../../dist/components/text-area/paint.js';
import { prepareTextAreaLayout } from '../../../dist/components/text-area/preparation.js';
import { committedTextAreaLayoutRequest } from '../../../dist/components/text-area/prepared-layout.js';
import { textPointerTarget } from '../../../dist/components/shared/text-pointer-target.js';

// Explicit provider fixtures exercise the consumer contract, not a bidi implementation.
function fixturePresentation() {
  const requests = [];
  const order = new Map();
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const presentation = { map(request) {
    requests.push(request);
    let clusters = order.get(request.text);
    if (clusters === undefined) {
      clusters = Array.from(segmenter.segment(request.text), ({ segment, index }) => ({
        text: segment, startOffset: index, endOffsetExclusive: index + segment.length, direction: 'ltr',
      }));
      for (const word of ['אבג', 'مرحبا']) {
        const start = request.text.indexOf(word);
        if (start < 0) continue;
        const indexes = clusters.flatMap((g, i) => g.startOffset >= start && g.endOffsetExclusive <= start + word.length ? [i] : []);
        const reversed = indexes.map(i => ({ ...clusters[i], direction: 'rtl' })).reverse();
        indexes.forEach((i, n) => { clusters[i] = reversed[n]; });
      }
      order.set(request.text, clusters);
    }
    return clusters.filter(g => g.startOffset >= request.startOffset && g.endOffsetExclusive <= request.endOffsetExclusive);
  } };
  return { presentation, requests };
}

function editorInput(text, presentation, extra = {}, width = 24) {
  const document = createTextDocument(text);
  const value = { state: { document, caret: { position: { offset: 0, affinity: 'downstream' } },
    scroll: { offsetRow: 0, offsetColumn: 0, followTail: false } }, scrollbar: { visible: 'never' }, ...extra };
  const bounds = { row: 0, column: 0, width, height: 5 };
  return { model: createTextAreaModel(value), bounds, viewport: bounds, theme: defaultTheme,
    widthProfile: defaultTextWidthProfile, textPresentation: presentation,
    disabled: false, busy: false, readOnly: false, inert: false };
}

function paint(input) {
  const writes = [];
  paintTextArea({ ...input, focus: 'self', style: ({ base }) => base, frameSource: value => value,
    target: { write: (row, column, spans) => writes.push({ row, column, spans }) } });
  return writes.filter(write => write.spans.some(span => ['value', 'selection', 'decoration'].includes(span.source?.partName)));
}

test('text-area owns one paragraph-aware map for wrapped painting, inverse pointer and affinity', () => {
  const { presentation, requests } = fixturePresentation();
  const text = 'abc אבג def';
  const document = createTextDocument(text);
  const layout = layoutTextAreaDocument(document, 6, true, defaultTextWidthProfile, presentation);
  assert.deepEqual(layout.allRowStartOffsets(), [0, 6]);
  assert.deepEqual(layout.linesInRows(0, 2).map(line => line.index.visualGraphemes.map(g => g.text).join('')), ['abc בא', 'ג def']);
  assert.ok(requests.every(request => request.text === text));
  assert.deepEqual(requests.map(request => [request.startOffset, request.endOffsetExclusive]), [[0, 6], [6, 11]]);
  assert.deepEqual(layout.cursorAt(4, 'upstream'), { rowIndex: 0, columnCells: 4 });
  assert.deepEqual(layout.cursorAt(4, 'downstream'), { rowIndex: 0, columnCells: 6 });
  const input = editorInput(text, presentation, { wrap: true }, 8);
  const geometry = textAreaGeometry(input);
  const count = requests.length;
  assert.equal(paint(input)[0].spans.map(span => span.text).join(''), 'abc בא');
  assert.deepEqual(pointerPosition(input, 1, 5), { offset: 6, affinity: 'upstream' });
  assert.deepEqual(geometry.layout.cursorAt(6, 'upstream'), { rowIndex: 0, columnCells: 4 });
  assert.equal(requests.length, count, 'paint and pointer reuse the completed row mapping');
  assert.equal(textDocumentText(input.model.document), text);
});

test('logical selection paints separate visual ranges and preserves source text', () => {
  const { presentation } = fixturePresentation();
  const state = createTextAreaState({ value: 'abc אבג def', caret: { position: { offset: 5, affinity: 'upstream' } },
    selection: { anchor: { offset: 2, affinity: 'downstream' }, focus: { offset: 5, affinity: 'upstream' } } });
  const input = editorInput('', presentation, { state });
  const spans = paint(input)[0].spans;
  assert.deepEqual(spans.map(span => [span.text, span.source.partName]), [
    ['ab', 'value'], ['c ', 'selection'], ['גב', 'value'], ['א', 'selection'], [' def', 'value'],
  ]);
  assert.ok(spans.every(span => span.textOrder === 'visual'));
  assert.equal(textDocumentText(state.document), 'abc אבג def');
});

test('visual horizontal movement and pointer edits retain logical offsets and run-edge affinity', () => {
  const { presentation } = fixturePresentation();
  let state = createTextAreaState({ value: 'abc אבג def', caret: { position: { offset: 7, affinity: 'upstream' } } });
  let input = editorInput('', presentation, { state });
  const moved = textAreaVisualHandlers(input).moveRight();
  state = textAreaReducer(state, moved).state;
  assert.deepEqual(state.caret.position, { offset: 6, affinity: 'downstream' });
  state = textAreaReducer(state, { kind: 'edit', operation: { kind: 'insert', text: '!' } }).state;
  assert.equal(textDocumentText(state.document), 'abc אב!ג def');
  input = editorInput('abc אבג def', presentation);
  const target = textPointerTarget({ id: 'text', bounds: input.bounds,
    offsetAt: (event, origin) => pointerPosition(input, 1, origin === 'press' ? event.pressLocalColumn : event.localColumn),
    onPointer: transition => transition });
  const transition = target.message({ kind: 'drag', button: 'left', localColumn: 5, pressLocalColumn: 7 });
  assert.deepEqual(transition, { kind: 'extendSelection', anchor: 5, anchorAffinity: 'upstream', offset: 7, affinity: 'upstream' });
  const selected = textAreaReducer(createTextAreaState({ value: 'abc אבג def' }), { kind: 'pointer', transition }).state;
  assert.deepEqual(selected.selection.anchor, { offset: 5, affinity: 'upstream' });
  assert.deepEqual(selected.caret.position, { offset: 7, affinity: 'upstream' });
});

test('presentation cache identity and incremental document edits match fresh layouts', () => {
  const { presentation } = fixturePresentation();
  const source = 'abc אבג def\nمرحبا é界🙂';
  const document = createTextDocument(source);
  for (const width of [6, 4, 12, 5]) {
    const actual = layoutTextAreaDocument(document, width, true, defaultTextWidthProfile, presentation);
    const expected = layoutTextAreaDocument(createTextDocument(source), width, true, defaultTextWidthProfile, fixturePresentation().presentation);
    assert.deepEqual(actual.allRowStartOffsets(), expected.allRowStartOffsets());
    assert.deepEqual(actual.linesInRows(0, actual.contentRows).map(line => line.index.visualGraphemes), expected.linesInRows(0, expected.contentRows).map(line => line.index.visualGraphemes));
  }
  const changed = textDocumentEdit(document, { startOffset: 1, endOffsetExclusive: 2 }, 'Z').document;
  const actual = layoutTextAreaDocument(changed, 6, true, defaultTextWidthProfile, presentation);
  const expected = layoutTextAreaDocument(createTextDocument('aZc אבג def\nمرحبا é界🙂'), 6, true, defaultTextWidthProfile, fixturePresentation().presentation);
  assert.deepEqual(actual.linesInRows(0, actual.contentRows).map(line => line.index.visualGraphemes), expected.linesInRows(0, expected.contentRows).map(line => line.index.visualGraphemes));
  const logical = layoutTextAreaDocument(changed, 6, true, defaultTextWidthProfile);
  assert.notStrictEqual(actual, logical);
  assert.equal(logical.lineAtRow(0).text, 'aZc אב');
});

test('accepted preparation retains presentation identity and completes mapping before paint', async () => {
  const { presentation, requests } = fixturePresentation();
  const input = editorInput('abc אבג def\nمرحبا é界🙂', presentation,
    { wrap: true, error: 'abc אבג def', preparedLayout: null, onLayoutRequest: () => ({ kind: 'request' }) }, 8);
  measureTextArea({ ...input, constraints: input.bounds, childCount: 0,
    measureChild: () => ({}), slots: { count: () => 0, measure: () => ({}) } });
  const request = committedTextAreaLayoutRequest({ ...input, allocatedBounds: input.bounds, commitId: 'one' });
  assert.strictEqual(request.textPresentation, presentation);
  const preparedLayout = await prepareTextAreaLayout(request, { signal: new globalThis.AbortController().signal, yield: async () => {} });
  const ready = { ...input, model: createTextAreaModel({ state: { document: input.model.document, caret: input.model.caret, scroll: input.model.scroll },
    wrap: true, error: input.model.rawError, scrollbar: { visible: 'never' }, preparedLayout, onLayoutRequest: () => ({ kind: 'request' }) }) };
  const count = requests.length;
  assert.equal(textAreaLayoutPending(ready), false);
  paint(ready);
  pointerPosition(ready, 1, 5);
  assert.equal(requests.length, count);
  const replaced = { ...ready, textPresentation: fixturePresentation().presentation };
  assert.equal(textAreaLayoutPending(replaced), true, 'different session providers cannot adopt stale geometry');
});

test('wrapped presentation reuses owned grapheme boundaries across resize without native segmentation', () => {
  const document = createTextDocument('אבג é界🙂 '.repeat(2_000));
  const presentation = { map: request => request.graphemes.map(grapheme => ({ ...grapheme, direction: 'ltr' })) };
  const first = layoutTextAreaDocument(document, 80, true, defaultTextWidthProfile, presentation);
  assert.equal(first.contentRows, 250);
  const segment = Intl.Segmenter.prototype.segment;
  Intl.Segmenter.prototype.segment = function() { assert.fail('resize must reuse source-owned grapheme boundaries'); };
  try {
    for (const width of [60, 40, 90]) {
      const layout = layoutTextAreaDocument(document, width, true, defaultTextWidthProfile, presentation);
      assert.ok(layout.contentRows > 200);
      assert.ok(layout.lineAtRow(20).index.visualGraphemes.length > 0);
    }
  } finally { Intl.Segmenter.prototype.segment = segment; }
});

test('retained bidi editor frames and routed pointers match fresh frames through selection, edits and resize', () => {
  const { presentation } = fixturePresentation();
  let state = createTextAreaState({ value: 'abc אבג def\nمرحبا é界🙂' });
  let previous;
  for (const [pass, width] of [24, 8, 12, 24].entries()) {
    if (pass === 1) state = { ...state, caret: { position: { offset: 5, affinity: 'upstream' } },
      selection: { anchor: { offset: 2, affinity: 'downstream' }, focus: { offset: 5, affinity: 'upstream' } } };
    if (pass === 2) state = textAreaReducer(state, { kind: 'edit', operation: { kind: 'insert', text: 'Z' } }).state;
    const element = textArea({ id: 'editor', meta: { accessibleName: 'Editor' }, state, wrap: true,
      scrollbar: { visible: 'never' }, onTransition: transition => transition });
    const size = { columns: width, rows: 5 };
    const options = { textPresentation: presentation, focusPath: ['editor'] };
    const retained = renderElementInternal(element, size, { ...options, previous });
    const fresh = renderElementInternal(element, size, options);
    assert.deepEqual(retained.frame, fresh.frame, `pass ${pass}`);
    if (pass === 0) {
      const target = retained.regions.flatMap(region => region.hitTargets).find(target => target.id === 'editor:text');
      const clicked = target.message({ kind: 'pointerDown', button: 'left', localRow: 1, localColumn: 5,
        row: target.bounds.row, column: target.bounds.column + 4 });
      assert.deepEqual(clicked, { kind: 'pointer', transition: { kind: 'placeCaret', offset: 7, affinity: 'upstream' } });
    }
    previous = retained;
  }
});

test('wrapped bidi vertical movement retains visual columns and uses row visual Home and End', () => {
  const { presentation } = fixturePresentation();
  let state = createTextAreaState({ value: 'abc אבג def', caret: { position: { offset: 6, affinity: 'upstream' } } });
  const move = action => {
    const input = editorInput('', presentation, { state, wrap: true }, 8);
    state = textAreaReducer(state, textAreaVisualHandlers(input)[action]()).state;
  };
  move('moveLineDown');
  assert.deepEqual(state.caret, { position: { offset: 10, affinity: 'downstream' }, preferredColumnCells: 4 });
  move('selectHome');
  assert.deepEqual(state.caret.position, { offset: 7, affinity: 'upstream' });
  assert.deepEqual(state.selection.anchor, { offset: 10, affinity: 'downstream' });
  move('moveEnd');
  assert.deepEqual(state.caret.position, { offset: 11, affinity: 'upstream' });
  move('moveLineUp');
  assert.deepEqual(state.caret.position, { offset: 5, affinity: 'upstream' });
});

test('bidi scroll clipping shares the grapheme-snapped origin with pointer and visible caret', () => {
  const { presentation } = fixturePresentation();
  const state = createTextAreaState({ value: 'é界🙂 abc אבג', caret: { position: { offset: 3, affinity: 'downstream' } },
    scroll: { offsetRow: 0, offsetColumn: 2, followTail: false } });
  const input = editorInput('', presentation, { state }, 8);
  assert.deepEqual(pointerPosition(input, 1, 2), { offset: 2, affinity: 'downstream' }, 'both cells of the visible wide glyph hit its source boundary');
  assert.ok(paint(input)[0].spans[0].text.startsWith('界🙂'));
  const rendered = renderElementInternal(textArea({ id: 'editor', meta: { accessibleName: 'Editor' }, state,
    scrollbar: { visible: 'never' }, onTransition: transition => transition }), { columns: 8, rows: 5 },
    { textPresentation: presentation, focusPath: ['editor'] });
  assert.equal(rendered.frame.cursor.column, 5);
});

test('large unwrapped presentation validation remains cancellable before a layout is admitted', async () => {
  let mapped = false;
  let maps = 0;
  const presentation = { map: request => {
    mapped = true;
    maps += 1;
    return request.graphemes.map(grapheme => ({ ...grapheme, direction: 'ltr' }));
  } };
  const input = editorInput('é界 '.repeat(8_000), presentation,
    { preparedLayout: null, onLayoutRequest: () => ({ kind: 'request' }) });
  layoutTextAreaDocument(input.model.document, 80, false, defaultTextWidthProfile);
  const request = committedTextAreaLayoutRequest({ ...input, allocatedBounds: input.bounds, commitId: 'cancel' });
  const controller = new globalThis.AbortController();
  await assert.rejects(prepareTextAreaLayout(request, { signal: controller.signal, operationLimit: 128,
    yield: async () => { if (mapped) controller.abort(); } }), { name: 'AbortError' });
  assert.equal(mapped, true, 'cancellation reaches framework validation after the provider callback');
  assert.equal(textAreaLayoutPending(input), true);
  const preparedLayout = await prepareTextAreaLayout(request, { signal: new globalThis.AbortController().signal, yield: async () => {} });
  const ready = { ...input, model: createTextAreaModel({ state: { document: input.model.document, caret: input.model.caret, scroll: input.model.scroll },
    scrollbar: { visible: 'never' }, preparedLayout, onLayoutRequest: () => ({ kind: 'request' }) }) };
  const beforePaint = maps;
  assert.equal(textAreaLayoutPending(ready), false);
  assert.ok(paint(ready)[0].spans[0].text.length < 100);
  assert.equal(maps, beforePaint);
});

test('textarea adapter routes Ctrl arrows and Ctrl selection through physical RTL words', async () => {
  const { presentation } = fixturePresentation();
  const runtime = createTuiRuntime({ textPresentation: presentation,
    host: createMemoryTerminalHost({ terminalSize: { columns: 12, rows: 3 } }),
    app: defineTui({ id: 'bidi-word-navigation',
      init: () => ({ state: createTextAreaState({ value: 'אבג', caret: { position: { offset: 3, affinity: 'upstream' } } }) }),
      update: (state, transition) => ({ state: textAreaReducer(state, transition).state }),
      view: state => textArea({ id: 'editor', meta: { accessibleName: 'Editor' }, state, onTransition: transition => transition }),
    }) });
  try {
    await runtime.start();
    await runtime.handleInput(key('arrowRight', { ctrl: true }));
    assert.deepEqual(runtime.state().caret.position, { offset: 0, affinity: 'downstream' });
    await runtime.handleInput(key('arrowLeft', { ctrl: true, shift: true }));
    assert.deepEqual(runtime.state().caret.position, { offset: 3, affinity: 'upstream' });
    assert.deepEqual(runtime.state().selection.anchor, { offset: 0, affinity: 'downstream' });
  } finally { await runtime.dispose(); }
});

test('visual word navigation follows complete source words across soft wraps and whitespace rows', () => {
  const { presentation } = fixturePresentation();
  let state = createTextAreaState({ value: 'abcdefghij    tail', caret: { position: { offset: 0, affinity: 'downstream' } } });
  const move = action => {
    const input = editorInput('', presentation, { state, wrap: true }, 6);
    state = textAreaReducer(state, textAreaVisualHandlers(input)[action]()).state;
  };
  move('moveWordRight');
  assert.deepEqual(state.caret.position, { offset: 10, affinity: 'upstream' });
  move('selectWordRight');
  assert.deepEqual(state.caret.position, { offset: 18, affinity: 'upstream' });
  assert.equal(state.selection.anchor.offset, 10);
  move('moveWordLeft');
  assert.equal(state.caret.position.offset, 10, 'unshifted motion first collapses the existing selection');
  move('moveWordLeft');
  assert.deepEqual(state.caret.position, { offset: 0, affinity: 'downstream' });
});

test('pending mapped textarea rejects word navigation through the actual key adapter', async () => {
  const { presentation } = fixturePresentation();
  const runtime = createTuiRuntime({ textPresentation: presentation,
    host: createMemoryTerminalHost({ terminalSize: { columns: 12, rows: 3 } }),
    app: defineTui({ id: 'pending-bidi-word-navigation',
      init: () => ({ state: { editor: createTextAreaState({ value: 'אבג', caret: { position: { offset: 3, affinity: 'upstream' } } }), rejected: 0 } }),
      update: (state, transition) => transition.kind === 'request' ? { state }
        : transition.kind === 'unavailable' ? { state: { ...state, rejected: state.rejected + 1 } }
        : { state: { ...state, editor: textAreaReducer(state.editor, transition).state } },
      view: state => textArea({ id: 'editor', meta: { accessibleName: 'Editor' }, state: state.editor,
        preparedLayout: null, onLayoutRequest: () => ({ kind: 'request' }), onTransition: transition => transition }),
    }) });
  try {
    await runtime.start();
    for (const name of ['arrowLeft', 'arrowRight']) for (const shift of [false, true]) await runtime.handleInput(key(name, { ctrl: true, shift }));
    assert.equal(runtime.state().rejected, 4);
    assert.deepEqual(runtime.state().editor.caret.position, { offset: 3, affinity: 'upstream' });
    assert.equal(runtime.state().editor.selection, undefined);
  } finally { await runtime.dispose(); }
});

test('document insertion replacement deletion and history keep the visible caret attached to the edited edge', () => {
  const { presentation } = fixturePresentation();
  for (const [value, offset, operation, expectedText, expectedOffset, column] of [
    ['abcאבג', 3, { kind: 'insert', text: 'X' }, 'abcXאבג', 4, 4],
    ['abcאבג', 3, { kind: 'replaceRange', range: { startOffset: 2, endOffsetExclusive: 3 }, text: 'X' }, 'abXאבג', 3, 3],
    ['abcאבג', 3, { kind: 'deleteBackward' }, 'abאבג', 2, 2],
    ['abcאבג', 3, { kind: 'deleteForward' }, 'abcבג', 3, 3],
    ['aאבג', 1, { kind: 'insert', text: '\u0301' }, 'áאבג', 2, 1],
    ['👩👧אבג', 2, { kind: 'insert', text: '\u200d' }, '👩‍👧אבג', 5, 2],
  ]) {
    const before = createTextAreaState({ value, caret: { position: { offset, affinity: 'upstream' } } });
    const changed = textAreaReducer(before, { kind: 'edit', operation });
    assert.equal(textDocumentText(changed.state.document), expectedText);
    assert.deepEqual(changed.state.caret.position, { offset: expectedOffset, affinity: 'upstream' });
    const layout = textAreaGeometry(editorInput('', presentation, { state: changed.state })).layout;
    assert.equal(layout.cursorAt(expectedOffset, 'upstream').columnCells, column);
    const undo = textAreaReducer(changed.state, { kind: 'undo' }).state;
    assert.equal(textDocumentText(undo.document), value);
    assert.deepEqual(undo.caret.position, before.caret.position);
    const redo = textAreaReducer(undo, { kind: 'redo' }).state;
    assert.equal(textDocumentText(redo.document), expectedText);
    assert.deepEqual(redo.caret.position, changed.state.caret.position);
  }
  const before = createTextAreaState({ value: 'abcאבג', caret: { position: { offset: 3, affinity: 'upstream' } } });
  const applied = textAreaReducer(before, { kind: 'applyChanges', changeSet: { changes: [{ startOffset: 3, endOffsetExclusive: 3, insertedText: 'X' }] } }).state;
  assert.deepEqual(applied.caret.position, { offset: 4, affinity: 'upstream' });
});

test('mapped textarea arrows skip visual-only tab expansion positions', () => {
  const { presentation } = fixturePresentation();
  let state = createTextAreaState({ value: 'a\tb', caret: { position: { offset: 1, affinity: 'upstream' } } });
  const move = action => {
    const input = editorInput('', presentation, { state });
    state = textAreaReducer(state, textAreaVisualHandlers(input)[action]()).state;
  };
  move('moveRight');
  assert.equal(state.caret.position.offset, 2);
  move('moveLeft');
  assert.equal(state.caret.position.offset, 1);
  move('selectRight');
  assert.equal(state.caret.position.offset, 2);
  assert.equal(state.selection.anchor.offset, 1);
});

test('wrapped RTL words stop when adjacent visual row edges are not source-contiguous', () => {
  const presentation = { map: request => request.graphemes.toReversed().map(grapheme => ({ ...grapheme, direction: 'rtl' })) };
  const state = createTextAreaState({ value: 'אבגדהוזח', caret: { position: { offset: 4, affinity: 'upstream' } } });
  const input = editorInput('', presentation, { state, wrap: true }, 6);
  const selected = textAreaReducer(state, textAreaVisualHandlers(input).selectWordRight()).state;
  assert.deepEqual(selected.caret.position, { offset: 0, affinity: 'downstream' });
  assert.deepEqual(selected.selection, { anchor: { offset: 4, affinity: 'upstream' }, focus: { offset: 0, affinity: 'downstream' } });
});

test('automatic change-set caret markers use the same normalized trailing edge and history', () => {
  const state = createTextAreaState({ value: '👩👧אבג', caret: { position: { offset: 2, affinity: 'upstream' } } });
  const transition = { kind: 'applyChanges', changeSet: { changes: [{ startOffset: 2, endOffsetExclusive: 2, insertedText: '\u200d' }] } };
  const after = textAreaReducer(state, transition).state;
  assert.equal(textDocumentText(after.document), '👩‍👧אבג');
  assert.deepEqual(after.caret.position, { offset: 5, affinity: 'upstream' });
  const undone = textAreaReducer(after, { kind: 'undo' }).state;
  assert.deepEqual(undone.caret.position, state.caret.position);
  const redone = textAreaReducer(undone, { kind: 'redo' }).state;
  assert.deepEqual(redone.caret.position, after.caret.position);
});
