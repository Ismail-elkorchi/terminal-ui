import assert from 'node:assert/strict';
import test from 'node:test';
import { defineComponent } from '../../../dist/component/index.js';
import { button, text } from '../../../dist/components/index.js';
import { column } from '../../../dist/layout/index.js';
import { inspectElement } from '../../../dist/element/index.js';
import { renderElementFrame } from '../../../dist/renderer/index.js';
import { beginSlotComposition, copySlotProvenance } from '../../../dist/renderer/internal/render-tree/slot-provenance.js';
import { mapElementMessages, markImplementationStructure, scopeElement, toRenderNode } from '../../../dist/renderer/internal/render-tree/element.js';

function wrapper(messages, compose, accessibility) {
  return defineComponent({
    name: `terminal-ui-tests/provenance/${messages}`,
    identity: 'required', structure: 'composed', semantics: 'semantic', accessibleRole: 'group',
    states: ['disabled', 'inert'],
    ...(messages === 'capture' ? { emitsActions: true, capture: ({ message }) => message } : {}),
    slots: { body: { cardinality: 'one', owner: 'caller', messages } },
    compose: compose ?? (({ slots }) => column([slots.body])),
    accessibility: accessibility ?? (({ id, slots }) => ({ id, children: slots.body })),
  });
}

for (const outerMode of ['bubble', 'capture', 'none']) {
  for (const innerMode of ['bubble', 'capture', 'none']) {
    test(`nested ${outerMode}/${innerMode} preserves accessibility, caller focus and inspection`, () => {
      const inner = wrapper(innerMode);
      let projected;
      const outer = wrapper(outerMode, ({ slots }) => inner({
        id: 'inner', slots: { body: slots.body },
        ...(innerMode === 'capture' ? { onAction: (message) => message } : {}),
      }), ({ id, slots }) => {
        projected = slots.body;
        return { id, children: slots.body };
      });
      const child = column([button({ id: 'action', label: 'Go', onPress: () => 'go' })]);
      const element = outer({ id: 'outer', disabled: true, slots: { body: child },
        ...(outerMode === 'capture' ? { onAction: (message) => message } : {}),
      });
      const frame = renderElementFrame(element, { columns: 20, rows: 3 });
      assert.equal(projected[0].children[0].id, 'action');
      assert.equal(projected[0].disabled, undefined);
      assert.ok(frame.focusPath?.includes('action'));
      const root = toRenderNode(element);
      const caller = root.children[0].children[0].children[0];
      assert.equal(caller.transparentFocusIdentity, undefined);
      assert.equal(caller.state?.disabled, undefined);
      assert.deepEqual(inspectElement(element).children, [inspectElement(child)]);
      const inert = outer({ id: 'inert', inert: true, slots: { body: child },
        ...(outerMode === 'capture' ? { onAction: (message) => message } : {}),
      });
      assert.equal(renderElementFrame(inert, { columns: 20, rows: 3 }).focusPath, undefined);
    });
  }
}

test('mapping and scoping chains preserve each live context without confusing siblings', () => {
  const original = text({ id: 'original', content: 'Text' });
  const a = mapElementMessages(original, (x) => x);
  const b = mapElementMessages(original, (x) => x);
  const outer = beginSlotComposition([[toRenderNode(a)], [toRenderNode(b)]]);
  try {
    const inner = beginSlotComposition([[toRenderNode(a)]]);
    try {
      const scoped = scopeElement(mapElementMessages(a, (x) => x), (x) => x, (id) => `scope/${id}`);
      const mapped = mapElementMessages(scoped, (x) => x);
      assert.deepEqual(outer.paths([toRenderNode(b), toRenderNode(mapped)]), [[[1]], [[0]]]);
      assert.deepEqual(inner.paths([toRenderNode(mapped)]), [[[0]]]);
      assert.equal(inspectElement(mapped).id, 'scope/original');
    } finally { inner.close(); }
  } finally { outer.close(); }
  const later = beginSlotComposition([[toRenderNode(original)]]);
  try {
    assert.deepEqual(later.paths([toRenderNode(a)]), [[[0]]]);
    assert.throws(() => later.paths([toRenderNode(a), toRenderNode(b)]), /rendered at most once/u);
  }
  finally { later.close(); }
});

test('required supplied slots can be conditionally omitted from rendering', () => {
  const owner = wrapper('bubble', () => text({ content: 'Hidden' }));
  const element = owner({ id: 'owner', slots: { body: text({ id: 'unused', content: 'Unused' }) } });
  const frame = renderElementFrame(element, { columns: 20, rows: 3 });
  assert.deepEqual(frame.accessibility.root.children, []);
});

test('duplicate supplied roots and duplicate rendered placements fail deterministically', () => {
  const root = toRenderNode(text({ content: 'same' }));
  assert.throws(() => beginSlotComposition([[root], [root]]), /supplied only once/u);
  const context = beginSlotComposition([[root]]);
  try {
    const clone = { ...root };
    copySlotProvenance(root, clone);
    assert.throws(() => context.paths([root, clone]), /rendered at most once/u);
  } finally { context.close(); }
});

test('all-slot collection reads each node once and matches a reference projection', () => {
  let reads = 0;
  const leaves = Array.from({ length: 40 }, (_, index) => ({ kind: 'text', index }));
  const nodes = leaves.map((leaf) => ({ kind: 'row', get children() { reads++; return [leaf]; } }));
  const context = beginSlotComposition(leaves.map((leaf) => [leaf]));
  try {
    const actual = context.paths(nodes);
    assert.equal(reads, nodes.length);
    const reference = leaves.map((target) => {
      const paths = [];
      const walk = (items, prefix) => items.forEach((node, index) => {
        const path = [...prefix, index];
        if (node === target) paths.push(path);
        if (node.children) walk(node.children, path);
      });
      walk(nodes, []);
      return paths;
    });
    assert.deepEqual(actual, reference);
    assert.ok(Object.isFrozen(actual) && Object.isFrozen(actual[0]) && Object.isFrozen(actual[0][0]));
  } finally { context.close(); }
});

test('deep implementation marking and path collection avoid recursive stack growth', () => {
  const leaf = { kind: 'row' };
  const context = beginSlotComposition([[leaf]]);
  try {
    let root = leaf;
    for (let depth = 0; depth < 20000; depth++) root = { kind: 'row', children: [root] };
    const marked = markImplementationStructure(root, context, true);
    const paths = context.paths([marked]);
    assert.equal(paths[0][0].length, 20001);
    assert.equal(leaf.state, undefined);
  } finally { context.close(); }
});

test('scoping within compose retains accessible slot projection through chained clones', () => {
  const owner = wrapper('bubble', ({ slots }) => column([
    mapElementMessages(scopeElement(slots.body, (message) => message, (id) => `child/${id}`), (message) => message),
  ]));
  const element = owner({ id: 'owner', disabled: true,
    slots: { body: button({ id: 'action', label: 'Go', onPress: () => 'go' }) },
  });
  const frame = renderElementFrame(element, { columns: 20, rows: 3 });
  assert.equal(frame.accessibility.root.children[0].id, 'child/action');
  assert.equal(frame.accessibility.root.children[0].disabled, undefined);
  assert.ok(frame.focusPath?.includes('child/action'));
});

for (const messages of ['bubble', 'capture', 'none']) {
  test(`preconstructed ${messages} forwarding preserves caller ownership and projection`, () => {
    const child = column([button({ id: 'cached-action', label: 'Go', onPress: () => 'go' })]);
    const inner = wrapper(messages);
    const cached = inner({ id: 'cached-inner', slots: { body: child },
      ...(messages === 'capture' ? { onAction: (message) => message } : {}),
    });
    const outer = wrapper('bubble', () => cached);
    const frame = renderElementFrame(outer({ id: 'outer', disabled: true, slots: { body: child } }),
      { columns: 20, rows: 3 });
    assert.equal(frame.accessibility.root.children[0].children[0].id, 'cached-action');
    assert.equal(frame.accessibility.root.children[0].disabled, undefined);
    assert.ok(frame.focusPath?.includes('cached-action'));
  });
}

test('cached clone chains reject ambiguous supplied ancestry independently of slot order', () => {
  const original = toRenderNode(text({ id: 'source', content: 'Text' }));
  const first = { ...original };
  copySlotProvenance(original, first);
  const second = { ...first };
  copySlotProvenance(first, second);
  const sibling = { ...original };
  copySlotProvenance(original, sibling);
  for (const ordered of [[original, first], [first, original]]) {
    const context = beginSlotComposition(ordered.map((node) => [node]));
    try {
      assert.throws(() => context.paths([second, sibling]), /ambiguous supplied provenance/u);
    } finally { context.close(); }
  }
});

test('deep cached clone ancestry resolves iteratively', () => {
  const original = { kind: 'row' };
  let latest = original;
  for (let index = 0; index < 20000; index++) {
    const clone = { kind: 'row' };
    copySlotProvenance(latest, clone);
    latest = clone;
  }
  const context = beginSlotComposition([[original]]);
  try { assert.deepEqual(context.paths([latest]), [[[0]]]); }
  finally { context.close(); }
});

for (const messages of ['bubble', 'capture', 'none']) {
  test(`raw duplicate slot handles reject before ${messages} mapping while distinct clones remain valid`, () => {
    const owner = defineComponent({
      name: `terminal-ui-tests/provenance/duplicates-${messages}`,
      identity: 'required', structure: 'composed', semantics: 'semantic', accessibleRole: 'group',
      ...(messages === 'capture' ? { emitsActions: true, capture: ({ message }) => message } : {}),
      slots: {
        body: { cardinality: 'many', owner: 'caller', messages },
        note: { cardinality: 'optional', owner: 'caller', messages },
      },
      compose: ({ slots }) => column([...slots.body, ...(slots.note ? [slots.note] : [])]),
      accessibility: ({ id, slots }) => ({ id, children: [...slots.body, ...slots.note] }),
    });
    const child = text({ content: 'Text' });
    const make = (slots) => owner({ id: 'owner', slots,
      ...(messages === 'capture' ? { onAction: (message) => message } : {}),
    });
    assert.throws(() => make({ body: [child, child] }), /supplied only once/u);
    assert.throws(() => make({ body: [child], note: child }), /supplied only once/u);
    assert.doesNotThrow(() => make({ body: [
      mapElementMessages(child, (message) => message),
      mapElementMessages(child, (message) => message),
    ] }));
  });
}

for (const messages of ['capture', 'none']) {
  test(`cached raw-ancestor sibling is not attributed to the actual ${messages} slot binding`, () => {
    const child = button({ id: 'raw-action', label: 'Go', onPress: () => 'go' });
    const cachedSibling = mapElementMessages(child, (message) => message);
    const owner = wrapper(messages, () => cachedSibling);
    const element = owner({ id: 'owner', disabled: true, slots: { body: child },
      ...(messages === 'capture' ? { onAction: (message) => message } : {}),
    });
    const implementation = toRenderNode(element).children[0];
    assert.equal(implementation.state.disabled, true);
    assert.equal(implementation.messageMap('go'), 'go');
    const frame = renderElementFrame(element, { columns: 20, rows: 3 });
    assert.deepEqual(frame.accessibility.root.children, []);
    assert.equal(frame.focusPath, undefined);
  });
}
