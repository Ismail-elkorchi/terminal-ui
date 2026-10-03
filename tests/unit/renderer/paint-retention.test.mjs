import assert from 'node:assert/strict';
import test from 'node:test';
import { frameSnapshotMetadata } from '../../../dist/renderer/internal/frame-snapshot.js';
import { defineComponent } from '../../../dist/component/index.js';
import { createLogHistory } from '../../../dist/behavior/log-history.js';
import { createTableCollection } from '../../../dist/behavior/index.js';
import { dataGrid } from '../../../dist/components/index.js';
import { createTableModel, tableSourceFor } from '../../../dist/components/data-table/model.js';
import { logViewer, text, textInput } from '../../../dist/components/index.js';
import { row, overlay } from '../../../dist/layout/index.js';
import { renderElementInternal } from '../../../dist/renderer/internal/render-element.js';

test('unchanged painters on the same layer are retained while changed rows remain fresh', () => {
  const history = createLogHistory([{ id: '1', text: 'retained' }]);
  const view = count => row([logViewer({ view: null, id: 'log', history }), text({ content: `Count ${count}` })]);
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

function retentionProbe(reusePaint, painted = () => {}) {
  return defineComponent({
    name: 'terminal-ui-tests/paint-dependencies',
    identity: 'required', structure: 'leaf', semantics: 'semantic', accessibleRole: 'text',
    metadata: ['styles', 'layer', 'focus'],
    createModel: options => options.model,
    ...(reusePaint ? { reuse: { paint: model => [model] } } : {}),
    measure: () => ({ minWidth: 0, minHeight: 0, preferredWidth: 8, preferredHeight: 1 }),
    render({ model, target, disabled, pointerState, widthProfile }) {
      painted();
      target.write(0, 0, [{ text: `${model.label ?? model.values?.[0] ?? '-'}${disabled ? 'D' : ''}${pointerState?.hoveredTargetId ? 'H' : ''}${widthProfile.emoji === 'narrow' ? 'N' : ''}` }]);
    },
    hitTargets: ({ bounds }) => [{ id: 'press', bounds, accepts: ['pointerDown'], message: () => ({ kind: 'press' }) }],
    accessibility: ({ id }) => ({ id, role: 'text', label: 'probe' })
  });
}

test('retained painting compares opaque model identities rather than sparse arrays or hidden data', () => {
  const retained = retentionProbe(true);
  const fresh = retentionProbe(false);
  const size = { columns: 20, rows: 2 };
  const models = [
    Object.freeze({ values: Object.freeze(Array(1)) }),
    Object.freeze({ values: Object.freeze(['changed']) }),
    Object.freeze({ label: 'selected' }),
    Object.freeze(Object.defineProperty({}, 'label', { value: 'private', enumerable: false })),
    Object.freeze({ label: 'resource' })
  ];
  let previous;
  for (const model of models) {
    const result = renderElementInternal(retained({ id: 'probe', model, onAction: x => x }), size, { previous });
    const expected = renderElementInternal(fresh({ id: 'probe', model, onAction: x => x }), size);
    assert.deepEqual(result.frame.cells, expected.frame.cells);
    previous = result;
  }
});

test('paint hits do not inspect large domain models and refresh interaction callbacks', () => {
  let ownKeys = 0;
  let reads = 0;
  let paints = 0;
  const model = new Proxy(Object.freeze({ label: 'stable', collection: Object.freeze(Array(100_000).fill(7)) }), {
    ownKeys(target) { ownKeys += 1; return Reflect.ownKeys(target); },
    get(target, key, receiver) { reads += 1; return Reflect.get(target, key, receiver); }
  });
  const leaf = retentionProbe(true, () => { paints += 1; });
  const size = { columns: 20, rows: 2 };
  let previous = renderElementInternal(leaf({ id: 'probe', model, onAction: () => 'old' }), size);
  const afterFirstPaint = paints;
  ownKeys = 0;
  reads = 0;
  for (let i = 0; i < 30; i += 1) {
    previous = renderElementInternal(leaf({ id: 'probe', model, onAction: () => `current-${i}` }), size, { previous });
    const target = previous.regions.flatMap(region => region.hitTargets).find(target => target.id === 'press');
    assert.equal(target.message({ kind: 'pointerDown' }), `current-${i}`);
  }
  assert.equal(paints, afterFirstPaint);
  assert.equal(ownKeys, 0);
  assert.equal(reads, 0, 'cache hits must not read the application model, even its small fields');
});

test('geometry, width policy and owned resource replacement invalidate retained painting', () => {
  let paints = 0;
  const leaf = retentionProbe(true, () => { paints += 1; });
  const model = Object.freeze({ label: 'stable' });
  const view = value => leaf({ id: 'probe', model: value, onAction: x => x });
  let previous = renderElementInternal(view(model), { columns: 12, rows: 1 });
  for (const [value, size, widthProfile] of [
    [model, { columns: 13, rows: 1 }, { emoji: 'wide', ambiguous: 'narrow' }],
    [model, { columns: 13, rows: 1 }, { emoji: 'narrow', ambiguous: 'narrow' }],
    [Object.freeze({ label: 'new' }), { columns: 13, rows: 1 }, { emoji: 'narrow', ambiguous: 'narrow' }]
  ]) {
    const before = paints;
    const next = renderElementInternal(view(value), size, { previous, widthProfile });
    assert.equal(paints, before + 1);
    const expected = renderElementInternal(view(value), size, { widthProfile });
    assert.deepEqual(next.frame, expected.frame);
    previous = next;
  }
});

test('table descriptors retain owned sources, refresh changed callbacks and bound decoded rows to the window', () => {
  const collection = createTableCollection(Array.from({ length: 1000 }, (_, index) => ({ name: `row${index}` })), (_, index) => String(index));
  let reads = 0;
  const value = row => { reads += 1; return row.name; };
  const options = (active, read = value) => ({
    id: 'grid', meta: { accessibleName: 'Grid' }, collection, columns: [{ id: 'name', value: read, width: { kind: 'fill' } }],
    state: { interaction: { kind: 'row', activeRowId: String(active), selection: { mode: 'single', selectedRowId: String(active) } } },
    onTransition: x => x
  });
  const firstModel = createTableModel(options(0), 'grid');
  const nextModel = createTableModel(options(1), 'grid');
  assert.strictEqual(firstModel.source, nextModel.source);
  assert.strictEqual(firstModel.columns, nextModel.columns);
  const size = { columns: 20, rows: 5 };
  let previous = renderElementInternal(dataGrid(options(0)), size);
  const initialReads = reads;
  const unchanged = renderElementInternal(dataGrid(options(0)), size, { previous });
  assert.equal(reads, initialReads, 'stable visible records are not decoded again');
  previous = unchanged;
  for (const active of [1, 2, 10, 100, 500, 999]) {
    const next = renderElementInternal(dataGrid(options(active)), size, { previous });
    const fresh = renderElementInternal(dataGrid(options(active)), size);
    assert.deepEqual(next.frame, fresh.frame);
    assert.ok(tableSourceFor(firstModel).rowModels.size <= 5, 'visited windows do not accumulate');
    previous = next;
  }
  const changedValue = row => row.name.toUpperCase();
  const changed = createTableModel(options(0, changedValue), 'grid');
  assert.notStrictEqual(changed.source, firstModel.source);
  const changedFrame = renderElementInternal(dataGrid(options(0, changedValue)), size, { previous });
  assert.match(changedFrame.frame.cells.map(cell => cell.text).join(''), /ROW0/u);
});
