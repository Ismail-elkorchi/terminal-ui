import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { decodeAccessibleSnapshot } from '../../../dist/accessibility/index.js';
import { createTableCollection } from '../../../dist/behavior/index.js';
import { defineComponent } from '../../../dist/component/index.js';
import { dataGrid, text } from '../../../dist/components/index.js';
import { column, overlay } from '../../../dist/layout/index.js';
import { renderElementInternal } from '../../../dist/renderer/internal/render-element.js';

const size = { columns: 40, rows: 8 };
function counts() {
  const work = {};
  return { work, instrumentation: { now: () => 0, record() {}, recordWork({ kind, count }) {
    work[kind] = (work[kind] ?? 0) + count;
  } } };
}
const collection = createTableCollection(Array.from({ length: 20 }, (_, index) => ({ name: `row ${index}` })), (_, index) => String(index));
const value = row => row.name;
function grid(active = '0', callback = action => action, extra = {}) {
  return dataGrid({ id: 'grid', meta: { accessibleName: 'Results' }, collection,
    columns: [{ id: 'name', header: 'Name', width: { kind: 'fill' }, value }],
    state: { interaction: { kind: 'row', activeRowId: active, selection: { mode: 'single', selectedRowId: active } } },
    onTransition: callback, ...extra });
}
function descendant(node, id) {
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const match = descendant(child, id);
    if (match) return match;
  }
}

test('ordinary rebuilt views reuse unchanged layout and semantic work without stale callbacks', () => {
  const view = (count, callback) => column([
    text({ id: 'stable', content: 'Stable heading' }), grid('0', callback), text({ id: 'counter', content: `Count ${count}` }),
  ], { id: 'root', sizes: [{ kind: 'fixed', cells: 1 }, { kind: 'fill' }, { kind: 'fixed', cells: 1 }] });
  const first = renderElementInternal(view(0, () => 'old'), size);
  const retained = counts();
  const next = renderElementInternal(view(1, () => 'new'), size, { previous: first, instrumentation: retained.instrumentation });
  const fresh = counts();
  const expected = renderElementInternal(view(1, () => 'new'), size, { instrumentation: fresh.instrumentation });
  assert.deepEqual(next.frame, expected.frame);
  assert.ok((retained.work.layout_nodes ?? 0) < fresh.work.layout_nodes);
  assert.ok((retained.work.accessibility_hooks ?? 0) < fresh.work.accessibility_hooks);
  assert.strictEqual(descendant(first.frame.accessibility.root, 'grid'), descendant(next.frame.accessibility.root, 'grid'));
  const target = next.regions.flatMap(region => region.hitTargets).find(item => item.ownerElementId === 'grid')
    ?? next.regions.flatMap(region => region.hitTargets)[0];
  assert.equal(target.message({ kind: 'pointerDown', button: 'left', row: target.bounds.row, column: target.bounds.column }), 'new');
});

test('grid activity retains unchanged semantic rows and refreshes selection and focus', () => {
  const first = renderElementInternal(grid('0'), size, { focusPath: ['grid'] });
  const next = renderElementInternal(grid('1'), size, { previous: first, focusPath: ['grid'] });
  const fresh = renderElementInternal(grid('1'), size, { focusPath: ['grid'] });
  assert.deepEqual(next.frame, fresh.frame);
  assert.strictEqual(descendant(first.frame.accessibility.root, 'grid:row:2'), descendant(next.frame.accessibility.root, 'grid:row:2'));
  assert.equal(descendant(next.frame.accessibility.root, 'grid:row:0').selected, false);
  assert.equal(descendant(next.frame.accessibility.root, 'grid:row:1').selected, true);
  assert.equal(next.frame.accessibility.root.activeDescendant, 'grid:row:1');
});

test('warm snapshot validation still rejects duplicate IDs and removed relationship targets', () => {
  const first = renderElementInternal(column([grid(), text({ id: 'status', content: 'Ready' })], { id: 'root' }), size);
  assert.throws(() => renderElementInternal(column([grid(), text({ id: 'grid:row:0', content: 'Duplicate' })], { id: 'root' }), size,
    { previous: first }), /unique/u);
  const owned = first.frame.accessibility;
  const row = descendant(owned.root, 'grid:row:0');
  const snapshot = root => ({ source: 'renderer', root, focusPath: root.focused ? [root.id] : [], diagnostics: [] });
  const duplicate = decodeAccessibleSnapshot(snapshot({ id: 'new-root', role: 'group', children: [row, row] }));
  assert.equal(duplicate.status, 'failure');
  assert.match(duplicate.error.message, /unique/u);
  const root = descendant(owned.root, 'grid');
  const missing = decodeAccessibleSnapshot(snapshot({ ...root, children: [] }));
  assert.equal(missing.status, 'failure');
  assert.match(missing.error.message, /activeDescendant/u);
  const unnamed = decodeAccessibleSnapshot(snapshot({ ...root, label: undefined }));
  assert.equal(unnamed.status, 'failure');
  assert.match(unnamed.error.message, /label/u);
  assert.throws(() => renderElementInternal(column([grid(), text({ id: 'status', content: 'Ready' })], { id: 'root' }), size,
    { previous: first, limits: { accessibilityNodes: 2 } }), /accessibility|node limit/u);
  for (const limits of [{ nodes: 1 }, { accessibilityStringCodeUnits: 1 }]) {
    assert.throws(() => renderElementInternal(column([grid(), text({ id: 'status', content: 'Ready' })], { id: 'root' }), size,
      { previous: first, limits }), /budget exceeded/u);
  }
});

test('reparenting, ID reuse, visibility and custom invalid output are checked after warm renders', () => {
  const view = (parent, content, visible = true) => overlay([
    column([text({ id: 'same-id', content, meta: { layer: { visible } } })], { id: parent }),
  ], { id: 'root' });
  let previous = renderElementInternal(view('before', 'old'), size);
  for (const [parent, content, visible] of [['after', 'new', true], ['after', 'hidden', false], ['after', 'back', true]]) {
    const next = renderElementInternal(view(parent, content, visible), size, { previous });
    assert.deepEqual(next.frame, renderElementInternal(view(parent, content, visible), size).frame);
    previous = next;
  }
  let invalid = false;
  const custom = defineComponent({ name: 'test/warm-invalid', identity: 'required', structure: 'leaf', semantics: 'semantic',
    accessibleRole: 'text', measure: () => ({ minWidth: 1, minHeight: 1, preferredWidth: 1, preferredHeight: 1 }),
    render() {}, accessibility: ({ id }) => ({ id, role: 'text', ...(invalid ? { unknownField: true } : {}) }) });
  const element = custom({ id: 'custom' });
  const first = renderElementInternal(element, size);
  invalid = true;
  assert.throws(() => renderElementInternal(element, size, { previous: first }), /unsupported/u);
});

test('sequential retained layouts do not keep predecessor render histories alive', () => {
  execFileSync(process.execPath, ['--expose-gc', '--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { text } from './dist/components/index.js';
    import { column } from './dist/layout/index.js';
    import { renderElementInternal } from './dist/renderer/internal/render-element.js';
    let current;
    const old = [];
    for (let count = 0; count < 40; count++) {
      current = renderElementInternal(column([text({ content: String(count) })]), { columns: 20, rows: 2 }, { previous: current });
      old.push(new WeakRef(current.layout));
    }
    for (let i = 0; i < 4; i++) {
      await new Promise(resolve => setImmediate(resolve));
      global.gc();
    }
    assert.ok(old.slice(0, 30).every(reference => reference.deref() === undefined));
    assert.ok(current.layout);
  `]);
});

test('caller-owned structural metadata never hides mutations behind retained identity', () => {
  const layer = { visible: true };
  const accessibility = { label: 'Old label' };
  const make = () => column([text({ content: 'child' })], { id: 'parent', meta: { layer, accessibility } });
  const first = renderElementInternal(make(), size);
  accessibility.label = 'New label';
  const second = renderElementInternal(make(), size, { previous: first });
  assert.equal(second.frame.accessibility.root.label, 'New label');
  layer.visible = false;
  const third = renderElementInternal(make(), size, { previous: second });
  assert.deepEqual(third.frame, renderElementInternal(make(), size).frame);
  assert.equal(third.layout.visible, false);
});
