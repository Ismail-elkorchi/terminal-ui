import assert from 'node:assert/strict';
import test from 'node:test';
import { createTextAreaState, prepareTextAreaReduction, prepareTextAreaState, textAreaReducer, textAreaReductionWork } from './text-editing.ts';
import type { TextAreaTransition } from './text-area.ts';
import { createTextDocument, textDocumentText } from '../text/document.ts';
import { textCaretAt } from '../text/coordinates.ts';

void test('cold near-end reducer work yields before publishing document, caret, inverse and history', async () => {
  const document = createTextDocument('a'.repeat(200_000));
  const initial = createTextAreaState({ document });
  const state = { ...initial, caret: textCaretAt(199_999) };
  let yields = 0;
  const result = await prepareTextAreaReduction(state, { kind: 'edit', operation: { kind: 'insert', text: '🙂' } }, {
    signal: new AbortController().signal, operationLimit: 512,
    yield: () => { yields++; assert.equal(state.document, document); assert.equal(state.history.undo.length, 0); return Promise.resolve(); },
  });
  assert.ok(yields > 100);
  assert.equal(textDocumentText(result.state.document), `${'a'.repeat(199_999)}🙂a`);
  assert.equal(result.state.caret.position.offset, 200_001);
  assert.equal(result.state.history.undo.length, 1);
  assert.equal(textDocumentText(textAreaReducer(result.state, { kind: 'undo' }).state.document), 'a'.repeat(200_000));
});

void test('large paste payload encoding and every reduction phase remain cancellable', async () => {
  const initial = createTextAreaState({ value: 'x' });
  const transition: TextAreaTransition = { kind: 'edit', operation: { kind: 'insert', text: '🙂'.repeat(100_000) } };
  const charges = [...textAreaReductionWork(initial, transition)];
  assert.ok(charges.length > 500);
  assert.ok(charges.every((cost) => Number.isFinite(cost) && cost >= 0));
  let totalYields = 0;
  await prepareTextAreaReduction(initial, transition, { signal: new AbortController().signal, operationLimit: 2048,
    yield: () => { totalYields++; return Promise.resolve(); } });
  // Beginning, middle and late byte-accounting cancellation all leave the caller untouched.
  for (const target of [1, Math.floor(totalYields / 2), totalYields - 1]) {
    const controller = new AbortController();
    let count = 0;
    await assert.rejects(prepareTextAreaReduction(initial, transition, { signal: controller.signal, operationLimit: 2048,
      yield: () => { if (++count === target) controller.abort(); return Promise.resolve(); } }), { name: 'AbortError' });
    assert.equal(textDocumentText(initial.document), 'x');
    assert.equal(initial.history.undo.length, 0);
  }
});

void test('cooperative state adopts an immutable document and reductions match Unicode/CRLF synchronous history', async () => {
  const document = createTextDocument(`A\r\n👩🏽‍💻e\u0301\tZ`);
  const context = { signal: new AbortController().signal, operationLimit: 1, yield: () => Promise.resolve() };
  let prepared = await prepareTextAreaState({ document, caret: textCaretAt(5) }, context);
  let direct = createTextAreaState({ document, caret: textCaretAt(5) });
  assert.equal(prepared.document, document);
  const transitions: TextAreaTransition[] = [
    { kind: 'edit', operation: { kind: 'moveDocumentEnd' } },
    { kind: 'edit', operation: { kind: 'insert', text: '\r' } },
    { kind: 'edit', operation: { kind: 'insert', text: '\n🇲🇦' } },
    { kind: 'edit', operation: { kind: 'moveLeft' } },
    { kind: 'edit', operation: { kind: 'deleteBackward' } },
    { kind: 'undo' }, { kind: 'redo' },
    { kind: 'edit', operation: { kind: 'moveLineUp', extendSelection: true } },
    { kind: 'edit', operation: { kind: 'replaceSelection', text: '𝄞' } },
  ];
  for (const transition of transitions) {
    const expected = textAreaReducer(direct, transition);
    const actual = await prepareTextAreaReduction(prepared, transition, context);
    assert.equal(textDocumentText(actual.state.document), textDocumentText(expected.state.document));
    assert.deepEqual(actual.state.caret, expected.state.caret);
    assert.deepEqual(actual.state.selection, expected.state.selection);
    assert.deepEqual(actual.state.history, expected.state.history);
    assert.deepEqual(actual.changeSet, expected.changeSet);
    direct = expected.state; prepared = actual.state;
  }
});

void test('cooperative history reports bounded retention rejection and preserves atomic text acceptance', async () => {
  const initial = createTextAreaState({ value: '', historyPolicy: { maxEntries: 100, maxRetainedBytes: 120 } });
  const result = await prepareTextAreaReduction(initial, { kind: 'edit', operation: { kind: 'insert', text: '界'.repeat(2000) } }, {
    signal: new AbortController().signal, operationLimit: 16, yield: () => Promise.resolve(),
  });
  assert.equal(result.historyRejection?.reason, 'retained-byte-limit');
  assert.equal(result.state.history.undo.length, 0);
  assert.equal(textDocumentText(result.state.document), '界'.repeat(2000));
});

void test('UTF-8 accounting handles a surrogate pair formed across a rope edit seam', async () => {
  const { textDocumentBytes } = await import('../text/document.ts');
  const prefix = 'a'.repeat(4095);
  const initial = createTextAreaState({ value: `${prefix}\ud83d`, caret: textCaretAt(4096) });
  const edited = await prepareTextAreaReduction(initial, { kind: 'edit', operation: { kind: 'insert', text: '\ude42' } }, {
    signal: new AbortController().signal, yield: () => Promise.resolve(),
  });
  assert.equal(textDocumentText(edited.state.document), `${prefix}🙂`);
  assert.equal(textDocumentBytes(edited.state.document), 4099);
  const undone = textAreaReducer(edited.state, { kind: 'undo' });
  assert.equal(textDocumentBytes(undone.state.document), 4098);
});

void test('cold logical-line seeks are charged before a near-end edit in a deep document', async () => {
  const source = 'x\r\n'.repeat(70_000);
  const initial = createTextAreaState({ value: source });
  const state = { ...initial, caret: textCaretAt(source.length - 3) };
  let yields = 0;
  const result = await prepareTextAreaReduction(state, { kind: 'edit', operation: { kind: 'insert', text: 'Z' } }, {
    signal: new AbortController().signal, operationLimit: 256,
    yield: () => { yields++; return Promise.resolve(); },
  });
  assert.ok(yields > 10, 'line-index traversal must share the edit budget');
  assert.equal(textDocumentText(result.state.document), `${source.slice(0, -3)}Zx\r\n`);
});

void test('cancellation during inverse extraction and undo/redo leaves the original history intact', async () => {
  const context = { signal: new AbortController().signal, yield: () => Promise.resolve() };
  const pasted = (await prepareTextAreaReduction(createTextAreaState({ value: '' }), { kind: 'edit', operation: { kind: 'insert', text: 'a'.repeat(200_000) } }, context)).state;
  const undone = (await prepareTextAreaReduction(pasted, { kind: 'undo' }, context)).state;
  for (const [state, transition] of [
    [pasted, { kind: 'undo' }], [undone, { kind: 'redo' }],
    [pasted, { kind: 'applyChanges', changeSet: { changes: [{ startOffset: 0, endOffsetExclusive: 200_000, insertedText: '' }] } }],
  ] as const) {
    const controller = new AbortController();
    const document = state.document;
    const history = state.history;
    await assert.rejects(prepareTextAreaReduction(state, transition, { signal: controller.signal, operationLimit: 256,
      yield: () => { controller.abort(); return Promise.resolve(); } }), { name: 'AbortError' });
    assert.equal(state.document, document); assert.equal(state.history, history);
    const result = await prepareTextAreaReduction(state, transition, context);
    assert.equal(textDocumentText(result.state.document), transition.kind === 'redo' ? 'a'.repeat(200_000) : '');
  }
});
