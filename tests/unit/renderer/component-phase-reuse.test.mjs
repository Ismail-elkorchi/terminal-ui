import assert from 'node:assert/strict';
import test from 'node:test';
import { defineComponent } from '../../../dist/component/index.js';
import { text } from '../../../dist/components/index.js';
import { column, row } from '../../../dist/layout/index.js';
import { renderElementInternal } from '../../../dist/renderer/internal/render-element.js';

const size = { columns: 30, rows: 8 };
const measure = height => ({ minWidth: 0, minHeight: 0, preferredWidth: 8, preferredHeight: height });
function probe(reuse, counts = { measurement: 0, layout: 0, paint: 0, accessibility: 0 }) {
  const component = defineComponent({
    name: 'external-fixture/phase-reuse', identity: 'required', structure: 'leaf', semantics: 'semantic',
    accessibleRole: 'text', metadata: ['styles', 'layer', 'focus'],
    createModel: options => options.model,
    ...(reuse === undefined ? {} : { reuse }),
    measure: ({ model }) => { counts.measurement += 1; return measure(model.height); },
    focusTargets: ({ bounds, model }) => {
      counts.layout += 1;
      return [{ id: 'self', bounds, cursor: { row: 0, column: model.cursor ?? 0 } }];
    },
    render: ({ model, target }) => { counts.paint += 1; target.write(0, 0, [{ text: model.text }]); },
    accessibility: ({ id, model, focused }) => {
      counts.accessibility += 1;
      return { id, role: 'text', label: model.label, ...(focused ? { focused: true } : {}) };
    },
  });
  return { component, counts };
}
const declared = {
  measurement: model => [model.height], layout: model => [model.cursor],
  paint: model => [model.text], accessibility: model => [model.label],
};
const wrap = element => column([element, text({ content: 'sibling' })], {
  sizes: [{ kind: 'content' }, { kind: 'fill' }],
});

test('all external phases reuse same-element and rebuilt-model inputs by the public declaration', () => {
  const { component, counts } = probe(declared);
  const model = Object.freeze({ height: 1, text: 'stable', label: 'stable' });
  const element = component({ id: 'probe', model });
  let previous = renderElementInternal(wrap(element), size);
  assert.deepEqual(counts, { measurement: 1, layout: 1, paint: 1, accessibility: 1 });
  previous = renderElementInternal(wrap(element), size, { previous });
  previous = renderElementInternal(wrap(component({ id: 'probe', model: { ...model } })), size, { previous });
  assert.deepEqual(counts, { measurement: 1, layout: 1, paint: 1, accessibility: 1 });
  previous = renderElementInternal(wrap(component({ id: 'probe', model: { ...model, text: 'paint only' } })), size, { previous });
  assert.deepEqual(counts, { measurement: 1, layout: 1, paint: 2, accessibility: 1 });
  renderElementInternal(wrap(component({ id: 'probe', model: { ...model, text: 'paint only', label: 'semantics only' } })), size, { previous });
  assert.deepEqual(counts, { measurement: 1, layout: 1, paint: 2, accessibility: 2 });
});

test('omitted declarations never retain same-element measurement, layout, paint or semantics', () => {
  const { component, counts } = probe();
  const model = { height: 1, text: 'before', label: 'before' };
  const element = component({ id: 'probe', model });
  const first = renderElementInternal(wrap(element), size);
  model.height = 3;
  model.text = model.label = 'after';
  const next = renderElementInternal(wrap(element), size, { previous: first });
  assert.deepEqual(counts, { measurement: 2, layout: 2, paint: 2, accessibility: 2 });
  assert.equal(next.layout.children[0].bounds.height, 3);
  assert.deepEqual(next.frame, renderElementInternal(wrap(element), size).frame);
});

test('changed intrinsic measurement invalidates stable layout tuples and ancestor allocations', () => {
  const { component, counts } = probe({ ...declared, layout: () => [] });
  const view = height => wrap(component({ id: 'probe', model: { height, text: 'same', label: 'same' } }));
  const first = renderElementInternal(view(1), size);
  const next = renderElementInternal(view(4), size, { previous: first });
  assert.equal(counts.measurement, 2);
  assert.equal(counts.layout, 2);
  assert.equal(next.layout.children[0].bounds.height, 4);
  assert.equal(next.layout.children[1].bounds.row, 5);
  assert.deepEqual(next.frame, renderElementInternal(view(4), size).frame);
});

test('composite parent reuse includes child phases and named slot topology', () => {
  let layouts = 0;
  const parent = defineComponent({
    name: 'external-fixture/composite-reuse', identity: 'required', structure: 'composite', semantics: 'semantic',
    accessibleRole: 'group', slots: { content: { cardinality: 'one', owner: 'caller', messages: 'none' } },
    reuse: { measurement: () => [], layout: () => [], accessibility: () => [] },
    measure: ({ slots }) => slots.measure('content'),
    layout: ({ bounds }) => { layouts += 1; return { content: bounds }; },
    accessibility: ({ id, slots }) => ({ id, role: 'group', children: slots.content }),
  });
  const { component } = probe({ ...declared, layout: () => [] });
  const view = height => wrap(parent({ id: 'parent', slots: {
    content: component({ id: 'probe', model: { height, text: `height ${height}`, label: 'child' } }),
  } }));
  const first = renderElementInternal(view(1), size);
  const second = renderElementInternal(view(1), size, { previous: first });
  assert.equal(layouts, 1);
  const changed = renderElementInternal(view(3), size, { previous: second });
  assert.equal(layouts, 2);
  assert.equal(changed.layout.children[0].bounds.height, 3);
  assert.deepEqual(changed.frame, renderElementInternal(view(3), size).frame);
});

test('accessibility reuse observes current focus-target declarations even without layout reuse', () => {
  let extra = false;
  let calls = 0;
  const component = defineComponent({
    name: 'external-fixture/current-focus', identity: 'required', structure: 'leaf', semantics: 'semantic',
    accessibleRole: 'text', reuse: { accessibility: () => [] },
    measure: () => measure(1), render() {},
    focusTargets: ({ bounds }) => [{ id: 'self', bounds }, ...(extra ? [{ id: 'other', bounds }] : [])],
    accessibility: ({ id, focused, focusedTargetId }) => { calls += 1; return { id, role: 'text', label: 'focus targets', ...(focused || focusedTargetId !== undefined ? { focused: true } : {}) }; },
  });
  const element = component({ id: 'probe' });
  const first = renderElementInternal(element, size);
  extra = true;
  renderElementInternal(element, size, { previous: first });
  assert.equal(calls, 2);
});

test('reuse snapshots are owned; changed cursor geometry and width allocation stay current', () => {
  const slots = ['first'];
  const { component } = probe({ ...declared, paint: () => slots });
  const view = (value, cursor) => row([component({ id: 'probe', model: { height: 1, text: value, label: value, cursor } })]);
  const first = renderElementInternal(view('first', 0), size, { focusPath: ['row:0', 'probe'] });
  slots[0] = 'second';
  const next = renderElementInternal(view('second', 3), size, { previous: first, focusPath: ['row:0', 'probe'] });
  assert.equal(next.layout.children[0].focusTargets[0].cursor.column, 4);
  assert.deepEqual(next.frame, renderElementInternal(view('second', 3), size, { focusPath: ['row:0', 'probe'] }).frame);
});

test('reuse rejects oversized, sparse and non-tuple outputs, and the retired paint flag', () => {
  for (const value of [Array(129).fill(0), Array(1), 1, Promise.resolve([])]) {
    const { component } = probe({ paint: () => value });
    assert.throws(() => component({ id: 'invalid', model: {} }), /reuse.*tuple/u);
  }
  const base = { name: 'external-fixture/invalid-reuse', identity: 'required', structure: 'leaf', semantics: 'decorative',
    measure: () => measure(1), render() {} };
  assert.throws(() => defineComponent({ ...base, retainPaint: true }), /retainPaint/u);
  assert.throws(() => defineComponent({ ...base, reuse: { equal: () => [] } }), /reuse.equal/u);
  assert.throws(() => defineComponent({ ...base, reuse: { paint: true } }), /reuse.paint/u);
});

test('retained phases still run accepted-layout notifications with current model callbacks', async () => {
  const { createTuiRuntime, defineTui } = await import('../../../dist/tui/index.js');
  const { createMemoryTerminalHost } = await import('../../../dist/host/index.js');
  const { ignoreMessage } = await import('../../../dist/component/index.js');
  const seen = [];
  const component = defineComponent({
    name: 'external-fixture/current-layout-callback', identity: 'required', structure: 'leaf', semantics: 'semantic',
    accessibleRole: 'text',
    reuse: { measurement: () => [], layout: () => [], paint: () => [], accessibility: () => [] },
    measure: () => measure(1), render() {},
    onLayout: ({ model }) => { model.notify(); return ignoreMessage(); },
    accessibility: ({ id }) => ({ id, role: 'text', label: 'stable' }),
  });
  const runtime = createTuiRuntime({ host: createMemoryTerminalHost({ terminalSize: size }), app: defineTui({
    init: () => ({ state: 0 }), update: state => ({ state: state + 1 }),
    view: state => component({ id: 'probe', notify: () => seen.push(state), onAction: value => value }),
  }) });
  try {
    await runtime.start();
    await runtime.dispatch('next');
    await runtime.dispatch('next');
    assert.deepEqual(seen, [0, 1, 2]);
  } finally { await runtime.dispose(); }
});
