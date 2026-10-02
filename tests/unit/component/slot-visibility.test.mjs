import assert from 'node:assert/strict';
import test from 'node:test';
import { ComponentExecutionError, defineComponent, ignoreMessage } from '../../../dist/component/index.js';
import { disclosure, text } from '../../../dist/components/index.js';
import { measuredViewport, portal } from '../../../dist/layout/index.js';
import { createMemoryTerminalHost } from '../../../dist/host/index.js';
import { layoutElement, renderElementFrame, renderFramePlain } from '../../../dist/renderer/index.js';
import { createTuiRuntime, defineTui } from '../../../dist/tui/index.js';

const measurement = { minWidth: 0, minHeight: 0, preferredWidth: 8, preferredHeight: 1 };
const slots = {
  content: { cardinality: 'one', owner: 'caller', messages: 'bubble' },
  optional: { cardinality: 'optional', owner: 'caller', messages: 'bubble' },
  items: { cardinality: 'many', owner: 'caller', messages: 'bubble' }
};
const owner = defineComponent({
  name: 'terminal-ui-tests/components/slot-visibility-owner',
  identity: 'required',
  structure: 'composite',
  semantics: 'semantic',
  accessibleRole: 'group',
  slots,
  measure: () => measurement,
  layout: ({ bounds, model, slots }) => ({
    content: model.hidden ? null : bounds,
    optional: slots.count('optional') === 0 ? undefined : null,
    items: Array.from({ length: slots.count('items') }, () => null)
  }),
  accessibility: ({ id, children }) => ({ id, role: 'group', children })
});

function forbiddenChild(id, phase) {
  return defineComponent({
    name: 'terminal-ui-tests/components/forbidden-hidden-child',
    identity: 'required',
    structure: 'composite',
    semantics: 'semantic',
    accessibleRole: 'group',
    slots: { content: { cardinality: 'one', owner: 'caller', messages: 'bubble' } },
    measure: () => measurement,
    layout() { phase('layout'); throw new Error('hidden layout executed'); },
    renderBeforeChildren() { phase('paint'); throw new Error('hidden paint executed'); },
    focusTargets() { phase('focus'); throw new Error('hidden focus executed'); },
    hitTargets() { phase('pointer'); throw new Error('hidden pointer executed'); },
    onLayout() { phase('commit'); throw new Error('hidden layout commit executed'); },
    accessibility() { phase('accessibility'); throw new Error('hidden accessibility executed'); }
  })({ id, slots: { content: text({ id: `${id}:descendant`, content: 'hidden' }) }, onAction: (action) => action });
}

test('null allocations hide retained one, optional, and many slot subtrees even in empty hosts', () => {
  const calls = [];
  const hidden = (id) => forbiddenChild(id, (phase) => calls.push(phase));
  const element = owner({
    id: 'hidden-owner', hidden: true,
    slots: { content: hidden('one'), optional: hidden('optional'), items: [hidden('first'), hidden('second')] }
  });
  for (const size of [
    { columns: 12, rows: 3 }, { columns: 0, rows: 3 }, { columns: 12, rows: 0 }, { columns: 0, rows: 0 }
  ]) {
    const layout = layoutElement(element, size);
    assert.deepEqual(layout.children.map((node) => ({ visible: node.visible, focusable: node.focusable, children: node.children })),
      Array.from({ length: 4 }, () => ({ visible: false, focusable: false, children: [] })));
    const frame = renderElementFrame(element, size);
    assert.deepEqual(frame.accessibility.root.children ?? [], []);
    assert.deepEqual(frame.hitTargets ?? [], []);
    assert.deepEqual(calls, []);
  }
  assert.doesNotThrow(() => renderElementFrame(owner({
    id: 'absent-optional', hidden: true, slots: { content: hidden('one-again'), items: [] }
  }), { columns: 8, rows: 2 }));
});

test('hidden slots resume the same child model and post-commit lifecycle when shown again', async () => {
  const commits = [];
  const models = [];
  const child = defineComponent({
    name: 'terminal-ui-tests/components/retained-slot-child',
    identity: 'required',
    structure: 'leaf',
    semantics: 'semantic',
    accessibleRole: 'text',
    measure: () => measurement,
    render: ({ model, target }) => { models.push(model); target.write(0, 0, [{ text: model.value }]); },
    onLayout: ({ model, allocatedBounds }) => { commits.push({ model, allocatedBounds }); return ignoreMessage(); },
    accessibility: ({ id, model }) => ({ id, role: 'text', label: model.value })
  })({ id: 'retained-child', value: 'preserved', onAction: (action) => action });
  const runtime = createTuiRuntime({
    host: createMemoryTerminalHost({ terminalSize: { columns: 20, rows: 3 } }),
    app: defineTui({
      init: () => ({ state: true }),
      update: (_state, hidden) => ({ state: hidden }),
      view: (hidden) => owner({ id: 'lifecycle-owner', hidden, slots: { content: child, items: [] } })
    })
  });
  try {
    await runtime.start();
    await runtime.redraw();
    assert.deepEqual(commits, []);
    assert.deepEqual(models, []);
    await runtime.dispatch(false);
    assert.equal(commits.length, 1);
    assert.match(renderFramePlain(runtime.frame()), /preserved/u);
    const firstModel = models[0];
    await runtime.dispatch(true);
    await runtime.resize({ columns: 30, rows: 4 });
    assert.equal(commits.length, 1);
    const hiddenPaints = models.length;
    await runtime.dispatch(false);
    assert.equal(commits.length, 2);
    assert.ok(models.length > hiddenPaints);
    assert.ok(models.every((model) => model === firstModel));
    assert.ok(commits.every(({ model }) => model === firstModel));
    assert.deepEqual(commits[1].allocatedBounds, { row: 1, column: 1, width: 30, height: 4 });
  } finally {
    await runtime.dispose();
  }
});

test('visible empty allocations and genuine component errors are not hidden', () => {
  const failure = new Error('visible component failure');
  const faulty = defineComponent({
    name: 'terminal-ui-tests/components/visible-slot-error', identity: 'required',
    structure: 'leaf', semantics: 'semantic', accessibleRole: 'text',
    measure: () => measurement,
    render() { throw failure; },
    accessibility: ({ id }) => ({ id, role: 'text' })
  })({ id: 'faulty-child' });
  for (const size of [{ columns: 10, rows: 2 }, { columns: 0, rows: 2 }]) {
    const element = owner({ id: 'visible-owner', hidden: false, slots: { content: faulty, items: [] } });
    assert.equal(layoutElement(element, size).children[0].visible, true);
    assert.throws(() => renderElementFrame(element, size), (error) =>
      error instanceof ComponentExecutionError && error.phase === 'paint' && error.cause === failure);
  }
});

test('collapsed disclosure does not execute its retained content subtree', () => {
  const phases = [];
  const content = forbiddenChild('collapsed-content', (phase) => phases.push(phase));
  const element = disclosure({
    id: 'details', label: 'Details', expanded: false, slots: { content },
    onTransition: (transition) => transition
  });
  const frame = renderElementFrame(element, { columns: 20, rows: 4 });
  assert.deepEqual(phases, []);
  assert.equal(layoutElement(element, { columns: 20, rows: 4 }).children[0].visible, false);
  assert.match(renderFramePlain(frame), /Details/u);
});


test('hidden slot paths do not reuse accessibility output from an active occurrence of the same element', () => {
  const shared = text({ id: 'shared-child', content: 'Shared' });
  const withAccessibleSlots = defineComponent({
    name: 'terminal-ui-tests/components/shared-slot-owner', identity: 'required',
    structure: 'composite', semantics: 'semantic', accessibleRole: 'group', slots,
    measure: () => measurement,
    layout: ({ bounds }) => ({ content: bounds, optional: undefined, items: [null] }),
    accessibility: ({ id, slots }) => ({ id, role: 'group', children: [...slots.content, ...slots.items] }),
  });
  const frame = renderElementFrame(withAccessibleSlots({
    id: 'shared-owner', slots: { content: shared, items: [shared] },
  }), { columns: 20, rows: 3 });
  assert.deepEqual(frame.accessibility.root.children.map((node) => node.id), ['shared-child']);
});

test('hidden structural slot roots do not resolve measured viewports or escape through portals', () => {
  let layouts = 0;
  const children = [
    measuredViewport([text({ id: 'measured-content', content: 'Measured' })], {
      id: 'hidden-viewport', onScroll: (scroll) => scroll,
      onLayout: () => { layouts += 1; },
    }),
    portal(text({ id: 'portal-content', content: 'Escaped' }), { anchor: { kind: 'allocation' }, placement: 'center' }),
  ];
  for (const content of children) {
    const element = owner({ id: 'structural-owner', hidden: true, slots: { content, items: [] } });
    const frame = renderElementFrame(element, { columns: 20, rows: 3 });
    assert.equal(layouts, 0);
    assert.doesNotMatch(renderFramePlain(frame), /Measured|Escaped/u);
    assert.deepEqual(frame.accessibility.root.children ?? [], []);
  }
});
