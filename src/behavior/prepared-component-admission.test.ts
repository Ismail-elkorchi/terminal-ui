import assert from 'node:assert/strict';
import test from 'node:test';
import { createSearchPickerIndex, prepareSearchPickerQuery, matchingSearchPickerQuery } from './search-picker-index.ts';
import { createTreeSource, prepareTreeView, matchingTreeView } from './tree-operations.ts';
import { createLogHistory } from './log-history.ts';
import { prepareLogViewerView, matchingLogViewerView, preparedLogLayout } from './log-viewer-view.ts';
import { searchPicker } from '../components/search-picker/definition.ts';
import { tree } from '../components/tree/definition.ts';
import { logViewer } from '../components/log-viewer/definition.ts';
import { renderElementFrame } from '../renderer/index.ts';

void test('admitted large queries are never normalized or indexed again during matching and component creation', async () => {
  const context = { signal: new AbortController().signal, yield: () => Promise.resolve() };
  const query = { text: 'needle'.repeat(2_000), mode: 'contains' as const };
  const pickerSource = createSearchPickerIndex([{ id: 'one', label: 'one', value: 1 }]);
  const pickerResult = await prepareSearchPickerQuery(pickerSource, query, context);
  const source = createTreeSource([{ kind: 'leaf', id: 'one', label: 'one' }]);
  const state = { expandedIds: [], selection: { mode: 'none' as const }, query };
  const treeResult = await prepareTreeView(source, state, context);
  const history = createLogHistory([{ id: 'one', text: 'one' }]);
  const logInput = { history, query };
  const logResult = await prepareLogViewerView(logInput, context);
  // eslint-disable-next-line @typescript-eslint/unbound-method -- Restored verbatim; calls explicitly bind their string receiver.
  const normalize = String.prototype.normalize;
  let normalizationWork = 0;
  String.prototype.normalize = function (form?: string): string {
    if (this.length >= 2_048) normalizationWork += this.length;
    return normalize.call(this, form);
  };
  try {
    for (let count = 0; count < 4; count += 1) {
      assert.equal(matchingSearchPickerQuery(pickerSource, { ...query }, pickerResult), pickerResult);
      assert.equal(matchingTreeView(source, state, treeResult), treeResult);
      assert.equal(matchingLogViewerView(logInput, logResult), logResult);
      searchPicker({ id: 'picker', searchPickerIndex: pickerSource, queryResult: pickerResult,
        view: { input: { text: query.text, cursor: 0 }, query: { mode: 'contains' } }, onTransition: () => 0 });
      renderElementFrame(tree({ id: 'tree', meta: { accessibleName: 'Tree' }, source, state, view: treeResult, onTransition: () => 0 }), { columns: 20, rows: 3 });
      renderElementFrame(logViewer({ id: 'log', ...logInput, view: logResult }), { columns: 20, rows: 3 });
    }
  } finally {
    String.prototype.normalize = normalize;
  }
  assert.equal(normalizationWork, 0, 'matching and render must use accepted query indexes');
});

void test('pending logs defer folded-ID content validation to owned preparation', async () => {
  const history = createLogHistory([{ id: 'one', text: 'one' }]);
  const foldedIds = [42] as unknown as readonly string[];
  assert.doesNotThrow(() => renderElementFrame(logViewer({ id: 'log', history, foldedIds, view: null }), { columns: 20, rows: 3 }));
  await assert.rejects(prepareLogViewerView({ history, foldedIds }, {
    signal: new AbortController().signal, yield: () => Promise.resolve(),
  }), /folded IDs must be strings/u);
});

void test('painting prepared large visible fields never rebuilds their search indexes in any mode', async () => {
  const context = { signal: new AbortController().signal, yield: () => Promise.resolve() };
  const body = `needle ${'x'.repeat(12_000)}`;
  for (const mode of ['contains', 'prefix', 'exact', 'fuzzy'] as const) {
    const query = { text: mode === 'exact' ? body : 'needle', mode };
    const source = createTreeSource([{ kind: 'leaf', id: 'one', label: body }]);
    const state = { expandedIds: [], selection: { mode: 'none' as const }, query };
    const view = await prepareTreeView(source, state, context);
    const history = createLogHistory([{ id: 'one', text: body, metadata: { source: body } }]);
    const logInput = { history, query };
    const logView = await prepareLogViewerView(logInput, context);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Instrument source indexing, then restore the original method.
    const normalize = String.prototype.normalize;
    let normalizedUnits = 0;
    String.prototype.normalize = function (form?: string): string {
      normalizedUnits += this.length;
      return normalize.call(this, form);
    };
    try {
      renderElementFrame(tree({ id: 'tree', meta: { accessibleName: 'Tree' }, source, state, view, onTransition: () => 0 }), { columns: 30, rows: 3 });
      renderElementFrame(logViewer({ id: 'log', ...logInput, view: logView }), { columns: 30, rows: 3 });
    } finally {
      String.prototype.normalize = normalize;
    }
    assert.equal(normalizedUnits, 0, `${mode} paint must consume prepared ranges`);
  }
});

void test('prepared log ranges preserve metadata occurrences and highlights split by selection', async () => {
  const history = createLogHistory([{ id: 'one', text: 'needle needle', metadata: { needle: 'needle needle' } }]);
  const query = { text: 'needle', mode: 'contains' as const };
  const view = await prepareLogViewerView({ history, query }, { signal: new AbortController().signal, yield: () => Promise.resolve() });
  const active = view.matches.find(match => match.field === 'body');
  assert.ok(active);
  const frame = renderElementFrame(logViewer({ id: 'log', history, query, view, activeMatchId: active.id,
    selection: { anchor: { entryId: 'one', offset: 2 }, focus: { entryId: 'one', offset: 4 } },
  }), { columns: 80, rows: 3 });
  assert.equal(view.matches.length, 5);
  assert.equal(frame.cells.filter(cell => cell.source?.partType === 'match').map(cell => cell.text).join(''), 'needle'.repeat(5));
  assert.equal(frame.cells.filter(cell => cell.source?.interactionState === 'active').map(cell => cell.text).join(''), 'needle');
});

void test('cold log paint, resize and deep wrapped windows measure only visible graphemes', async () => {
  const { defaultTextWidthProfile } = await import('../text/width-profile.ts');
  const context = { signal: new AbortController().signal, yield: () => Promise.resolve() };
  const history = createLogHistory([{ id: 'one', text: `${'x'.repeat(100_000)}needle` }]);
  const query = { text: 'needle', mode: 'contains' as const };
  const plain = await prepareLogViewerView({ history, query }, context);
  const wrapped = await prepareLogViewerView({ history, query, wrap: true, width: 30, widthProfile: defaultTextWidthProfile }, context);
  const resized = await prepareLogViewerView({ history, query, wrap: true, width: 40, widthProfile: defaultTextWidthProfile }, context);
  // eslint-disable-next-line @typescript-eslint/unbound-method -- Counts individual grapheme-width work; restored after the probe.
  const charCodeAt = String.prototype.charCodeAt;
  let measured = 0;
  String.prototype.charCodeAt = function (position: number): number {
    if (this.length === 1) measured++;
    return charCodeAt.call(this, position);
  };
  try {
    for (const [view, columns] of [[plain, 30], [plain, 40], [wrapped, 30], [wrapped, 30], [resized, 40]] as const) {
      measured = 0;
      const active = view.matches[0];
      assert.ok(active);
      const frame = renderElementFrame(logViewer({ id: 'log', history, query, view,
        ...(view.wrap ? { wrap: true } : {}), activeMatchId: active.id,
      }), { columns, rows: 3 });
      assert.ok(measured < 2_000, `paint measured ${String(measured)} graphemes for ${String(columns)} visible columns`);
      assert.ok(frame.cells.length <= columns * 3);
      if (view.wrap) assert.match(frame.cells.map(cell => cell.text).join(''), /needle/u);
    }
  } finally {
    String.prototype.charCodeAt = charCodeAt;
  }
});

void test('one long wrapped record yields during geometry and cancellation publishes no partial view', async () => {
  const { defaultTextWidthProfile } = await import('../text/width-profile.ts');
  const history = createLogHistory([{ id: 'one', text: '界'.repeat(30_000) }]);
  const controller = new AbortController();
  let yields = 0;
  await assert.rejects(prepareLogViewerView({ history, wrap: true, width: 20, widthProfile: defaultTextWidthProfile }, {
    signal: controller.signal,
    yield: () => { yields++; controller.abort(new Error('superseded width')); return Promise.resolve(); },
  }), /superseded width/u);
  assert.equal(yields, 1);
  const view = await prepareLogViewerView({ history, wrap: true, width: 20, widthProfile: defaultTextWidthProfile }, {
    signal: new AbortController().signal, yield: () => Promise.resolve(),
  });
  assert.equal(preparedLogLayout(view, 20)?.totalRows, 3_000);
});
