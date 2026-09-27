import assert from 'node:assert/strict';
import test from 'node:test';
import { createTextSearchIndex, compileTextSearchQuery, findTextMatches, textSearchOffset } from '../../dist/text/search-index.js';
import { createFrameBuffer, retainFrameBufferRows, transferFrameBufferSpans } from '../../dist/renderer/frame-buffer.js';
import { countWrappedTextRows } from '../../dist/text/wrap.js';
import { wrapTextCells } from '../../dist/text/index.js';
import { clipRenderSpans } from '../../dist/visual/render-content.js';
import { createClippedRenderTarget } from '../../dist/renderer/internal/scoped-render-target.js';
import { frameSnapshotMetadata } from '../../dist/renderer/internal/frame-snapshot.js';
import { createLogHistory, appendLogHistory, logHistorySegments } from '../../dist/behavior/log-history.js';
import { logViewerLayout, prepareLogViewerSearch, searchLogViewerHistory } from '../../dist/components/internal/log-viewer-layout.js';
import { compileCollectionQuery } from '../../dist/text/query.js';
import { defaultTextWidthProfile, createTextDocument } from '../../dist/text/index.js';
import { layoutTextAreaDocument } from '../../dist/components/internal/text-area-layout.js';
import { logViewer, text, textInput, dataGrid } from '../../dist/components/index.js';
import { row, overlay } from '../../dist/layout/index.js';
import { renderElementInternal } from '../../dist/renderer/internal/render-element.js';
import { createTableCollection } from '../../dist/behavior/index.js';
import { createTuiRuntime, defineTui } from '../../dist/tui/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';

test('compact matching preserves Unicode offsets and uses linear token comparisons', () => {
  const ascii = createTextSearchIndex('TEXT '.repeat(20_000));
  assert.equal(typeof ascii.graphemes, 'string');
  assert.equal(ascii.offsets, undefined);
  const index = createTextSearchIndex('A e\u0301 👩‍💻 É');
  const matches = findTextMatches(index, compileTextSearchQuery('é'));
  assert.deepEqual(matches.map(match => [textSearchOffset(index, match.startGraphemeIndex),
    textSearchOffset(index, match.endGraphemeIndexExclusive)]), [[2, 4], [11, 12]]);
  assert.deepEqual(findTextMatches(index, compileTextSearchQuery('👩')), []);
  const tokens = Array.from({ length: 50_000 }, () => 'a');
  let reads = 0;
  const counted = new Proxy(tokens, { get(target, key) {
    if (typeof key === 'string' && /^\d+$/u.test(key)) reads += 1;
    return Reflect.get(target, key);
  } });
  assert.deepEqual(findTextMatches({ graphemes: counted }, compileTextSearchQuery(`${'a'.repeat(1000)}b`)), []);
  assert.ok(reads < tokens.length * 4, `token comparisons grew unexpectedly: ${reads}`);
});

test('geometry-only wrapping agrees with materialized Unicode, tabs, controls and empty lines', () => {
  for (const text of ['', 'abcdef\n\nlast', '界界é🙂 x', '\u0301界\u200b', 'a\tb\r\nc', '\u001b[31mabc\u001b[0m']) {
    for (const width of [0.5, 1, 2, 3, 40]) {
      assert.equal(countWrappedTextRows(text, width, {}), wrapTextCells(text, width).length, JSON.stringify({ text, width }));
    }
  }
});

test('end clipping never consumes metadata or text beyond the first overflowing span', () => {
  const inaccessible = { get text() { throw new Error('off-screen span was read'); } };
  assert.deepEqual(clipRenderSpans([{ text: 'abcde' }, inaccessible], 4, { ellipsis: '…' }), [{ text: 'abc…' }]);
  assert.deepEqual(clipRenderSpans([{ text: 'é界abc', style: { bold: true } }], 4), [{ text: 'é界a', style: { bold: true } }]);
});

test('admitted runs reuse matching cells, refresh metadata, and preserve wide overlap and combining marks', () => {
  const first = createFrameBuffer(4, 1);
  first.write(1, 1, [{ text: 'abcd', style: { bold: true } }]);
  const frame = first.snapshot();
  const next = createFrameBuffer(4, 1);
  retainFrameBufferRows(next, frame);
  transferFrameBufferSpans(next, 1, 1, [{ graphemes: [{ text: 'a', cells: 1 }, { text: 'b', cells: 1 }], style: { bold: true } }]);
  assert.strictEqual(next.readCell(1, 1), frame.cells[0]);
  transferFrameBufferSpans(next, 1, 3, [{ graphemes: [{ text: 'c', cells: 1 }], style: { italic: true } }]);
  assert.equal(next.readCell(1, 3).style.italic, true);
  assert.notStrictEqual(next.readCell(1, 3), frame.cells[2]);
  next.write(1, 2, [{ text: '界' }]);
  transferFrameBufferSpans(next, 1, 3, [{ graphemes: [{ text: 'x', cells: 1 }, { text: '̈', cells: 0 }] }]);
  assert.equal(next.readCell(1, 2), undefined);
  assert.equal(next.readCell(1, 3).text, 'ẍ');
});

test('clipping a long span bounds segmentation and preserves combining marks at the edge', () => {
  let segmented = 0;
  const buffer = createFrameBuffer(4, 1, { instrumentation: { recordWork(sample) {
    if (sample.kind === 'buffer_segmented_code_units') segmented += sample.count;
  } } });
  const target = createClippedRenderTarget(buffer, { row: 1, column: 1, width: 4, height: 1 },
    { row: 1, column: 1, width: 4, height: 1 });
  target.write(1, 1, [{ text: `abce\u0301${'x'.repeat(100_000)}` }, { text: '\u0308' }]);
  assert.equal(buffer.snapshot().cells.map(cell => cell.text).join(''), 'abcé');
  assert.ok(segmented <= 8, `segmented ${segmented} code units for four cells`);
  target.write(1, 4, [{ text: 'e' }, { text: '\u0308' }]);
  assert.equal(buffer.readCell(1, 4)?.text, 'ë');
});

test('unwrapped log geometry is shared across widths and folding does not scan a cached history', () => {
  const history = createLogHistory(Array.from({ length: 10_000 }, (_, index) => ({ id: String(index), text: 'first\nsecond' })));
  let reads = 0;
  const folds = new Set(['3', '7']);
  const has = folds.has.bind(folds);
  folds.has = id => { reads += 1; return has(id); };
  const first = logViewerLayout(history, 40, false, defaultTextWidthProfile, folds);
  assert.equal(first.totalRows, 10_000);
  assert.equal(reads, 0);
  assert.strictEqual(logViewerLayout(history, 39, false, defaultTextWidthProfile, folds), first);
  const wrapped = logViewerLayout(history, 40, true, defaultTextWidthProfile, folds);
  reads = 0;
  assert.strictEqual(logViewerLayout(history, 40, true, defaultTextWidthProfile, folds), wrapped);
  assert.equal(reads, 0);
});

test('appends keep completed log segments stable and bound merge invalidation', () => {
  let history = createLogHistory(Array.from({ length: 256 }, (_, index) => ({ id: String(index), text: 'match' })));
  const original = logHistorySegments(history)[0];
  for (let index = 256; index < 800; index += 1) history = appendLogHistory(history, [{ id: String(index), text: 'match' }]);
  assert.strictEqual(logHistorySegments(history)[0], original);
  assert.ok(logHistorySegments(history).every(segment => segment.records.length <= 256));
});

test('cooperative log search yields, cancels without publishing partial results, and resumes correctly', async () => {
  const history = createLogHistory(Array.from({ length: 6000 }, (_, index) => ({ id: String(index), text: 'needle' })));
  const query = compileCollectionQuery({ text: 'needle' });
  const controller = new globalThis.AbortController();
  let yields = 0;
  await assert.rejects(prepareLogViewerSearch(history, query, new Set(), {
    signal: controller.signal,
    yield: async () => { yields += 1; controller.abort(new Error('cancelled search')); },
  }), /cancelled search/u);
  assert.equal(yields, 1);
  await prepareLogViewerSearch(history, query, new Set(), {
    signal: new globalThis.AbortController().signal,
    yield: async () => { yields += 1; },
  });
  assert.ok(yields > 1);
  assert.equal(searchLogViewerHistory(history, query, new Set()).matchingEntries, 6000);
});

test('runtime prepares interactive log search through the host scheduler before committing', async () => {
  const history = createLogHistory(Array.from({ length: 6000 }, (_, index) => ({ id: String(index), text: 'runtime needle' })));
  const memory = createMemoryTerminalHost({ terminalSize: { columns: 40, rows: 8 } });
  let batches = 0;
  const host = { ...memory, clock: {
    now: () => memory.clock.now(),
    sleep: (ms, signal) => { if (ms === 0) batches += 1; return memory.clock.sleep(ms, signal); },
  } };
  const app = defineTui({ id: 'prepared-log-search', init: () => ({ state: 0 }), update: state => ({ state }),
    view: () => logViewer({ id: 'prepared-log', history, query: { text: 'needle' }, onTransition: value => value }),
  });
  const runtime = createTuiRuntime({ app, host });
  try {
    await runtime.start();
    assert.ok(batches >= 2, `expected scheduler batches, got ${batches}`);
    assert.match(JSON.stringify(runtime.frame().accessibility), /Matching entries: 6000/u);
  } finally {
    await runtime.dispose();
  }
});

test('unwrapped editor geometry is independent of scrollbar width', () => {
  const document = createTextDocument('first\n界 second\nthird');
  const first = layoutTextAreaDocument(document, 40, false, defaultTextWidthProfile);
  assert.strictEqual(layoutTextAreaDocument(document, 39, false, defaultTextWidthProfile), first);
  assert.equal(first.lineAtRow(1).index.cells, 9);
});

test('unchanged painters on the same layer are retained while changed rows remain fresh', () => {
  const history = createLogHistory([{ id: '1', text: 'retained' }]);
  const view = count => row([logViewer({ id: 'log', history }), text({ content: `Count ${count}` })]);
  const size = { columns: 40, rows: 3 };
  const first = renderElementInternal(view(1), size);
  let retainedHooks = 0;
  let freshHooks = 0;
  const options = counter => ({ instrumentation: { now: () => 0, record() {}, recordWork(sample) {
    if (sample.kind === 'render_hooks') counter(sample.count);
  } } });
  const next = renderElementInternal(view(2), size, { previous: first, ...options(count => { retainedHooks += count; }) });
  const fresh = renderElementInternal(view(2), size, options(count => { freshHooks += count; }));
  assert.deepEqual(next.frame, fresh.frame);
  assert.ok(retainedHooks < freshHooks, `${retainedHooks} retained hooks vs ${freshHooks} fresh`);
  const beforeRows = frameSnapshotMetadata(first.frame).rowIndexes;
  const afterRows = frameSnapshotMetadata(next.frame).rowIndexes;
  for (const previous of beforeRows) {
    const current = afterRows.find(candidate => candidate.row === previous.row);
    if (current && JSON.stringify([...previous.cells]) === JSON.stringify([...current.cells])) assert.strictEqual(current, previous);
  }
});

test('a simultaneous state and focus change refreshes other layers', () => {
  const view = value => overlay([
    textInput({ id: 'first', meta: { accessibleName: 'First', layer: { zIndex: 2 } }, state: { text: '', cursor: 0 }, onTransition: () => 0 }),
    textInput({ id: 'second', meta: { accessibleName: 'Second', layer: { zIndex: 2 } }, state: { text: '', cursor: 0 }, onTransition: () => 0 }),
    text({ id: 'label', content: value, meta: { layer: { zIndex: 3 } } }),
  ], { id: 'layers' });
  const size = { columns: 20, rows: 2 };
  const first = renderElementInternal(view('old'), size, { focusPath: ['layers', 'first'] });
  const next = renderElementInternal(view('new'), size, { previous: first, focusPath: ['layers', 'second'] });
  const fresh = renderElementInternal(view('new'), size, { focusPath: ['layers', 'second'] });
  assert.deepEqual(next.frame, fresh.frame);
});

test('retained table painting never retains old application callbacks', async () => {
  const collection = createTableCollection([{ id: 'a', value: 'A' }, { id: 'b', value: 'B' }], item => item.id);
  const columns = [{ id: 'value', header: 'Value', value: item => item.value }];
  let version = 1;
  const app = defineTui({ id: 'retained-callback', init: () => ({ state: 0 }),
    update: (_state, message) => ({ state: message }), view() {
      const current = version;
      return dataGrid({ id: 'table', meta: { accessibleName: 'Table' }, collection, columns,
        state: { interaction: { kind: 'row', activeRowId: 'a', selection: { mode: 'single' } } },
        onTransition: () => current });
    } });
  const runtime = createTuiRuntime({ app, host: createMemoryTerminalHost({ terminalSize: { columns: 30, rows: 4 } }) });
  try {
    await runtime.start();
    version = 2;
    await runtime.redraw();
    await runtime.handleInputChunk({ data: '\u001b[B' });
    assert.equal(runtime.state(), 2);
  } finally { await runtime.dispose(); }
});
