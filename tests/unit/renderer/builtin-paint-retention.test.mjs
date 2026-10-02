import assert from 'node:assert/strict';
import test from 'node:test';
import { createTableCollection } from '../../../dist/behavior/index.js';
import { dataGrid, text, textInput } from '../../../dist/components/index.js';
import { createTableModel, ownTableModel } from '../../../dist/components/data-table/model.js';
import { paintTable } from '../../../dist/components/data-table/paint.js';
import { tableAccessibility } from '../../../dist/components/data-table/accessibility.js';
import { column } from '../../../dist/layout/index.js';
import { renderElementInternal } from '../../../dist/renderer/internal/render-element.js';
import { defaultTheme, minimalTheme } from '../../../dist/theme/index.js';
import { decodeElementStyles } from '../../../dist/element/styles.js';
import { modelDependencies, ownModelDependencies, sameModelDependencies } from '../../../dist/visual/model-dependencies.js';

function gridFixture(count = 30) {
  const collection = createTableCollection(Array.from({ length: count }, (_, index) => ({ name: `row${index}` })), (_, index) => String(index));
  const value = row => row.name;
  return (interaction = { kind: 'row', activeRowId: '0', selection: { mode: 'multiple', selectedRowIds: ['0'] } }, extra = {}) => ({
    id: 'grid', meta: { accessibleName: 'Grid' }, collection,
    columns: [{ id: 'name', header: 'Name', value, width: { kind: 'fill' } }],
    state: { interaction, scroll: { offsetRow: 0, offsetColumn: 0, followTail: false } },
    scrollbar: { visible: 'never' },
    onTransition: transition => transition,
    ...extra,
  });
}

function instrument() {
  const counts = new Map();
  return {
    counts,
    instrumentation: { now: () => 0, record() {}, recordWork({ kind, count }) {
      counts.set(kind, (counts.get(kind) ?? 0) + count);
    } },
  };
}

test('rebuilt selected grids retain paint while sibling typing and action callbacks stay fresh', () => {
  const options = gridFixture();
  const view = (typed, revision, extra = {}) => column([
    textInput({ id: 'query', meta: { accessibleName: 'Query' }, state: { text: typed, cursor: typed.length }, onTransition: x => x }),
    dataGrid(options(undefined, {
      styles: { parts: { row: { bold: true } } },
      onTransition: transition => ({ revision, transition }),
      onActivate: event => ({ revision, event }),
      ...extra,
    })),
  ], { id: 'workbench', sizes: [{ kind: 'fixed', cells: 1 }, { kind: 'fill' }] });
  const size = { columns: 30, rows: 8 };
  let previous = renderElementInternal(view('', 0), size);
  for (let revision = 1; revision <= 8; revision += 1) {
    const typed = 'x'.repeat(revision);
    const work = instrument();
    const next = renderElementInternal(view(typed, revision), size, { previous, instrumentation: work.instrumentation });
    const freshWork = instrument();
    const fresh = renderElementInternal(view(typed, revision), size, { instrumentation: freshWork.instrumentation });
    assert.equal(work.counts.get('render_hooks'), freshWork.counts.get('render_hooks') - 1, 'the rebuilt grid painter is skipped');
    const target = next.regions.flatMap(region => region.hitTargets).find(target => target.id === 'grid:row:0');
    assert.deepEqual(target.message({ kind: 'pointerDown', button: 'left' }), {
      revision, transition: { kind: 'setActiveRow', rowId: '0' },
    });
    assert.deepEqual(target.message({ kind: 'click', button: 'left', clickCount: 2 }), {
      revision, event: { kind: 'activate', target: { kind: 'row', rowId: '0' } },
    });
    assert.deepEqual(next.frame, fresh.frame);
    previous = next;
  }
  const changed = renderElementInternal(view('xxxxxxxx', 9, {
    columns: [{ id: 'name', header: 'Name', value: row => row.name.toUpperCase(), width: { kind: 'fill' } }],
  }), size, { previous });
  assert.match(changed.frame.cells.map(cell => cell.text).join(''), /ROW0/u);
});

function rowPaintProbe(options) {
  let rowPaints = 0;
  const bounds = { row: 0, column: 0, width: 30, height: 6 };
  const input = {
    id: 'grid', bounds, viewport: bounds, widthProfile: { emoji: 'wide', ambiguous: 'narrow' },
    theme: minimalTheme, disabled: false, busy: false, readOnly: false, inert: false, focus: 'none',
    style: request => { if (request.part === 'row') rowPaints += 1; return request.base; },
    frameSource: request => ({ rendererFamily: 'component', cellRole: 'content', ...request }),
    target: { write() {} },
  };
  return (interaction, overrides = {}) => {
    rowPaints = 0;
    paintTable({ ...input, model: createTableModel(options(interaction), 'grid'), ...overrides });
    return rowPaints;
  };
}

test('table row retention observes actual row selection, cell selection and pointer inputs', () => {
  const paint = rowPaintProbe(gridFixture());
  const row = (selected = ['0'], active = '0') => ({ kind: 'row', activeRowId: active, selection: { mode: 'multiple', selectedRowIds: selected } });
  assert.equal(paint(row()), 5);
  assert.equal(paint(row()), 0, 'fresh decoded selection arrays do not repaint rows');
  assert.equal(paint(row(['1'])), 2, 'only formerly and newly selected rows repaint');
  assert.equal(paint(row(['1'], '1')), 2, 'only formerly and newly active rows repaint');
  assert.equal(paint(row(['1'], '1'), { pointerState: { hoveredTargetId: 'grid:row:2' } }), 1);
  assert.equal(paint(row(['1'], '1'), { pointerState: { pressedTargetId: 'grid:row:2' } }), 1);
  const cell = (rowId = '0') => ({ kind: 'cell', activeCell: { rowId: '0', columnId: 'name' }, selection: { mode: 'multiple', selectedCells: [{ rowId, columnId: 'name' }] } });
  assert.equal(paint(cell()), 5);
  assert.equal(paint(cell()), 0);
  assert.equal(paint(cell('1')), 2);
  assert.equal(paint(cell('1'), { pointerState: { hoveredTargetId: 'grid:row:3:cell:0' } }), 1);
});

test('large selection descriptors fall back to visible-row retention without visiting unrelated models', () => {
  const options = gridFixture(5000);
  const selection = Array.from({ length: 1000 }, (_, index) => String(index + 1000));
  const state = ids => ({ kind: 'row', selection: { mode: 'multiple', selectedRowIds: ids } });
  const a = ownTableModel(createTableModel(options(state(selection)), 'grid'));
  const b = ownTableModel(createTableModel(options(state([...selection])), 'grid'));
  assert.equal(sameModelDependencies(a, b, 'paint'), false);
  const paint = rowPaintProbe(options);
  assert.equal(paint(state(selection)), 5);
  assert.equal(paint(state([...selection, '4000'])), 0, 'off-screen selection changes do not repaint visible rows');
});

test('large selections are indexed once for both visible paint and accessibility membership', () => {
  const options = gridFixture(20);
  const offscreen = Array.from({ length: 10000 }, (_, index) => `offscreen-${index}`);
  const selections = [
    { kind: 'row', selection: { mode: 'multiple', selectedRowIds: ['0', ...offscreen] } },
    { kind: 'cell', selection: { mode: 'multiple', selectedCells: ['0', ...offscreen].map(rowId => ({ rowId, columnId: 'name' })) } },
  ];
  for (const interaction of selections) {
    const model = createTableModel(options(interaction), 'grid');
    const bounds = { row: 0, column: 0, width: 30, height: 6 };
    const input = { id: 'grid', model, bounds, viewport: bounds,
      widthProfile: { emoji: 'wide', ambiguous: 'narrow' }, theme: minimalTheme,
      disabled: false, busy: false, readOnly: false, inert: false, focus: 'none', focused: false,
      style: request => request.base,
      frameSource: request => ({ rendererFamily: 'component', cellRole: 'content', ...request }),
      target: { write() {} },
    };
    const includes = Array.prototype.includes;
    const some = Array.prototype.some;
    let scannedMembers = 0;
    const selected = array => array === model.selectedRowIds || array === model.selectedCells;
    Array.prototype.includes = function (...args) {
      if (selected(this)) scannedMembers += this.length;
      return includes.apply(this, args);
    };
    Array.prototype.some = function (...args) {
      if (selected(this)) scannedMembers += this.length;
      return some.apply(this, args);
    };
    let semantic;
    try {
      for (let update = 0; update < 4; update += 1) {
        paintTable(input);
        semantic = tableAccessibility(input);
      }
    } finally {
      Array.prototype.includes = includes;
      Array.prototype.some = some;
    }
    assert.equal(scannedMembers, 0, 'neither retained phase scans normalized selection arrays');
    const row = semantic.children.find(node => node.id === 'grid:row:0');
    assert.equal(interaction.kind === 'row' ? row.selected : row.children[0].selected, true);
    const unselected = semantic.children.find(node => node.id === 'grid:row:1');
    assert.equal(interaction.kind === 'row' ? unselected.selected : unselected.children[0].selected, false);
  }
});

test('fresh built-in descriptors still invalidate for style, state, geometry, theme and width policy', () => {
  const options = gridFixture();
  const size = { columns: 30, rows: 6 };
  const initial = renderElementInternal(dataGrid(options()), size);
  const selected = { kind: 'row', activeRowId: '0', selection: { mode: 'multiple', selectedRowIds: ['2'] } };
  const cases = [
    [options(selected), size, {}],
    [options(undefined, { styles: { parts: { row: { bold: true } } } }), size, {}],
    [options(undefined, { density: 'compact' }), size, {}],
    [options(), { columns: 28, rows: 7 }, {}],
    [options(), size, { theme: minimalTheme }],
    [options(), size, { widthProfile: { emoji: 'narrow', ambiguous: 'wide' } }],
    [options(undefined, { collection: createTableCollection([{ name: 'replacement' }], () => '0') }), size, {}],
  ];
  for (const [value, dimensions, environment] of cases) {
    const work = instrument();
    const next = renderElementInternal(dataGrid(value), dimensions, { previous: initial, ...environment, instrumentation: work.instrumentation });
    assert.equal(work.counts.get('render_hooks'), 1);
    assert.deepEqual(next.frame, renderElementInternal(dataGrid(value), dimensions, environment).frame);
  }
  assert.notEqual(defaultTheme, minimalTheme);
});

test('primitive text retention no longer relies on a global interning window', () => {
  const size = { columns: 30, rows: 1 };
  const first = renderElementInternal(text({ content: 'stable' }), size);
  for (let index = 0; index < 300; index += 1) text({ content: `unrelated-${index}` });
  const work = instrument();
  const next = renderElementInternal(text({ content: 'stable' }), size, { previous: first, instrumentation: work.instrumentation });
  assert.equal(work.counts.get('render_hooks') ?? 0, 0);
  assert.deepEqual(next.frame, first.frame);
});


test('owned style descriptors snapshot mutations and bound large style matrices', () => {
  const contract = { subject: 'styles', parts: new Set(['row']) };
  const caller = { parts: { row: { bold: true } }, states: { selected: { root: { underline: true } } } };
  const first = decodeElementStyles(caller, contract);
  assert.equal(sameModelDependencies(first, decodeElementStyles(structuredClone(caller), contract), 'paint'), true);
  caller.parts.row.bold = false;
  const changed = decodeElementStyles(caller, contract);
  assert.equal(first.parts.row.bold, true);
  assert.equal(sameModelDependencies(first, changed, 'paint'), false);
  const parts = Object.fromEntries(Array.from({ length: 1000 }, (_, index) => [`part${index}`, { bold: true }]));
  const large = decodeElementStyles({ parts }, { subject: 'large styles', parts: new Set(Object.keys(parts)) });
  assert.equal(modelDependencies(large, 'paint'), undefined);
  const nested = decodeElementStyles({
    parts: Object.fromEntries(Object.entries(parts).slice(0, 62)),
    states: { selected: { root: { bold: true } } },
  }, { subject: 'nested styles', parts: new Set(Object.keys(parts)) });
  assert.equal(modelDependencies(nested, 'paint'), undefined);
});

test('one bounded model owner keeps paint and semantic phase invalidation distinct', () => {
  const a = ownModelDependencies({}, { paint: ['same'], measurement: [1], layout: [1], accessibility: ['old'] });
  const b = ownModelDependencies({}, { paint: ['same'], measurement: [1], layout: [1], accessibility: ['new'] });
  assert.equal(sameModelDependencies(a, b, 'paint'), true);
  assert.equal(sameModelDependencies(a, b, 'measurement'), true);
  assert.equal(sameModelDependencies(a, b, 'layout'), true);
  assert.equal(sameModelDependencies(a, b, 'accessibility'), false);
  const opaque = {};
  assert.equal(sameModelDependencies(opaque, opaque, 'paint'), true);
  assert.equal(sameModelDependencies(opaque, opaque, 'layout'), false);
  const slots = ['owned'];
  const owned = ownModelDependencies({}, { paint: slots, accessibility: slots });
  slots[0] = 'changed';
  assert.deepEqual(modelDependencies(owned, 'paint'), ['owned']);
  assert.strictEqual(modelDependencies(owned, 'paint'), modelDependencies(owned, 'accessibility'));
  const large = ownModelDependencies({}, { layout: Array(129).fill('large') });
  assert.equal(modelDependencies(large, 'layout'), undefined);
  assert.equal(Object.isFrozen(owned), true);
});
