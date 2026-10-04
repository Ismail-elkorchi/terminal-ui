import assert from 'node:assert/strict';
import test from 'node:test';
import { createListboxCollection, createListboxView } from '../../../dist/behavior/index.js';
import { defineComponent } from '../../../dist/component/index.js';
import { button, combobox, text } from '../../../dist/components/index.js';
import { rasterImage } from '../../../dist/graphics/index.js';
import { absolute, column, overlay, viewport } from '../../../dist/layout/index.js';
import { renderElementFrame, renderFramePlain } from '../../../dist/renderer/index.js';
import { createFrameBuffer } from '../../../dist/renderer/frame-buffer.js';
import { collectLayoutFocusTargets } from '../../../dist/renderer/internal/focus.js';
import { renderElementInternal } from '../../../dist/renderer/internal/render-element.js';
import { createMemoryTerminalHost, failedTerminalWrite, indeterminateTerminalWrite } from '../../../dist/host/index.js';
import { createTuiRuntime, defineTui } from '../../../dist/tui/index.js';

const size = { columns: 40, rows: 12 };
const collection = createListboxCollection(['English', 'French', 'Spanish'], (label, index) => ({ id: String(index), label }));
const optionsView = createListboxView(collection);
function popup(open = true, revision = 0) {
  return column([
    combobox({ id: 'language', label: 'Language', collection, optionsView,
      state: { kind: 'select', open, interaction: { activeId: '0', selection: { mode: 'single', selectedId: '0' } } },
      onTransition: transition => ({ revision, transition }), onCommit: event => ({ revision, event }),
    }),
    text({ id: 'later-sibling', content: 'draft' }),
  ], { id: 'content' });
}
function wrapped(child, depth, options = {}) {
  for (let index = 0; index < depth; index++) child = viewport(child, { id: `vp-${index}`, ...options });
  return child;
}
function find(node, id) {
  if (node.id === id) return node;
  return (node.children ?? []).map(child => find(child, id)).find(Boolean);
}
function targets(result) { return result.regions.flatMap(region => region.hitTargets); }
function pointer(target, kind = 'click') {
  return { kind, clickCount: 2, button: 'left', row: target.bounds.row, column: target.bounds.column };
}

for (const depth of [0, 1, 2]) {
  test(`popup keeps cells, owned targets and accessible relationships through ${depth} viewports`, () => {
    let previous;
    let previousCopy;
    for (const [revision, open] of [true, false, true, true, false].entries()) {
      const element = wrapped(popup(open, revision), depth);
      const next = renderElementInternal(element, size, { previous });
      assert.deepEqual(next.frame, renderElementFrame(element, size));
      const plain = renderFramePlain(next.frame);
      assert.equal(plain.includes('┌─────────┐'), open);
      assert.equal(plain.includes('draft'), !open);
      assert.deepEqual(next.regions.map(region => region.zIndex), open ? [0, 20] : [0]);
      assert.equal(targets(next).length, open ? 7 : 1);
      const accessible = find(next.frame.accessibility.root, 'language');
      assert.equal(accessible.expanded, open);
      if (open) {
        assert.equal(accessible.controls, 'language:popup');
        assert.equal(accessible.activeDescendant, 'language:popup:item:0');
        const option = targets(next).find(target => target.id.endsWith(':option:1'));
        assert.equal(option.message(pointer(option)).revision, revision);
        const outside = targets(next).find(target => target.id.includes(':outside:'));
        assert.equal(outside.message(pointer(outside, 'pointerDown')).revision, revision);
      }
      const copy = structuredClone(next.frame);
      if (previous) assert.deepEqual(previous.frame, previousCopy);
      previous = next;
      previousCopy = copy;
    }
  });
}

const image = rasterImage({ width: 1, height: 1, format: 'rgb8', data: new Uint8Array([240, 0, 60]) });
const painting = defineComponent({
  name: 'terminal-ui-tests/viewport-regions', identity: 'required', structure: 'leaf', semantics: 'semantic',
  accessibleRole: 'text', metadata: ['layer', 'styles'], reuse: { paint: model => [model] },
  createModel: options => options.model,
  measure: () => ({ minWidth: 0, minHeight: 0, preferredWidth: 18, preferredHeight: 8 }),
  render({ model, target }) {
    for (const line of model.lines) target.write(line.row, line.column, [{ text: line.text,
      source: { cellRole: 'content', itemId: model.name }, link: { href: `https://example.com/${model.name}` },
      style: { bold: model.bold },
    }]);
    if (model.graphic) target.placeGraphic({ id: 'image', image,
      bounds: { row: 0, column: 0, width: 9, height: 4 }, fit: 'fill' });
    if (model.clear) target.clear(model.clear);
    if (model.fail) throw new Error('rejected paint');
  },
  hitTargets: ({ bounds }) => [{ id: 'paint', bounds, accepts: ['click'], message: () => 'activate' }],
  accessibility: ({ id, model }) => ({ id, role: 'text', label: model.name }),
});
function paint(model, zIndex = 0, underlay = 'preserve') {
  return painting({ id: model.name, model, onAction: action => action, meta: { layer: { zIndex, underlay } } });
}

for (const depth of [1, 2]) for (const zIndex of [-5, 0, 5]) {
  test(`viewport preserves graphics and whole graphemes, depth ${depth}, z ${zIndex}`, () => {
    let previous;
    const history = [];
    for (let revision = 0; revision < 16; revision++) {
      const content = paint({ name: 'picture', bold: revision % 2 === 0, graphic: revision % 3 !== 0,
        lines: [{ row: revision % 5, column: revision % 6, text: ['界界', '👩🏽‍💻', 'e\u0301', '  '][revision % 4] }],
        ...(revision % 5 === 0 ? { clear: { row: 0, column: 2, width: 2, height: 3 } } : {}),
      }, zIndex, ['preserve', 'clear', 'inheritBackground'][revision % 3]);
      const element = absolute(wrapped(content, depth, {
        offset: { row: revision % 3, column: revision % 4 },
        ...(revision % 2 ? { scrollbar: { axis: 'both', visible: 'always' }, onScroll: () => revision } : {}),
      }), { row: 2, column: 3, width: 7 + revision % 3, height: 4 });
      const options = { widthProfile: { emoji: revision % 2 ? 'narrow' : 'wide', ambiguous: 'narrow' } };
      const next = renderElementInternal(element, size, { ...options, previous });
      assert.deepEqual(next.frame, renderElementInternal(element, size, options).frame);
      const leaf = find(next.layout, 'picture');
      for (const region of next.regions) for (const cell of region.cells) {
        if (cell.source?.itemId !== 'picture') continue;
        assert.ok(cell.column >= leaf.viewport.column);
        assert.ok(cell.column + cell.width <= leaf.viewport.column + leaf.viewport.width);
      }
      for (const graphic of next.frame.graphics) {
        assert.ok(graphic.clip.row >= leaf.viewport.row);
        assert.ok(graphic.clip.column >= leaf.viewport.column);
        assert.ok(graphic.clip.row + graphic.clip.height <= leaf.viewport.row + leaf.viewport.height);
        assert.ok(graphic.clip.column + graphic.clip.width <= leaf.viewport.column + leaf.viewport.width);
      }
      for (const old of history) assert.deepEqual(old.frame, old.copy);
      history.push({ frame: next.frame, copy: structuredClone(next.frame) });
      previous = next;
    }
    assert.equal(renderElementFrame(wrapped(paint({ name: 'graphic', lines: [], graphic: true }), depth), size).graphics.length, 1);
  });
}

for (const zIndex of [-5, 0, 5]) for (const text of ['X', ' ', '界']) {
  test(`viewport indicators respect occupied cells including explicit blanks at z ${zIndex}: ${text}`, () => {
    const element = viewport(paint({ name: 'occupied', lines: [{ row: 2, column: 2, text }] }, zIndex), { id: 'vp' });
    const frame = renderElementFrame(element, { columns: 5, rows: 3 });
    assert.equal(frame.cells.find(cell => cell.row === 3 && cell.column === 3)?.text, text);
  });
}

test('overlapping equal-z regions own targets once, including a nested return to the base layer', () => {
  const leaf = id => button({ id, label: id, onPress: () => id });
  const element = overlay([
    overlay([leaf('a'), overlay([leaf('nested')], { id: 'return', meta: { layer: { zIndex: -3 } } })],
      { id: 'first', meta: { layer: { zIndex: 3 } } }),
    overlay([leaf('b')], { id: 'second', meta: { layer: { zIndex: 3 } } }),
  ], { id: 'root' });
  const result = renderElementInternal(viewport(element, { id: 'vp' }), size);
  const all = targets(result);
  assert.equal(all.length, 3);
  assert.equal(new Set(all.map(target => target.ownerIdentity)).size, 3);
  for (const target of all) assert.equal(target.message(pointer(target)), target.id.replace(':control', ''));
});

test('rejected viewport paint leaves previous cells, graphics and callbacks unchanged', () => {
  const element = wrapped(popup(), 2);
  const previous = renderElementInternal(element, size);
  const before = structuredClone(previous.frame);
  assert.throws(() => renderElementInternal(viewport(paint({ name: 'failure', fail: true, lines: [], graphic: true }), { id: 'vp' }), size, { previous }), /rejected paint/u);
  assert.deepEqual(previous.frame, before);
  const next = renderElementInternal(wrapped(popup(true, 2), 2), size, { previous });
  assert.deepEqual(next.frame, renderElementFrame(wrapped(popup(true, 2), 2), size));
  const option = targets(next).find(target => target.id.endsWith(':option:1'));
  assert.equal(option.message(pointer(option)).revision, 2);
});

for (const outcome of ['not-written', 'indeterminate']) {
  test(`failed ${outcome} publication keeps the accepted viewport popup`, async () => {
    const app = defineTui({ id: `viewport-failure-${outcome}`, init: () => ({ state: 0 }),
      update: (_state, message) => ({ state: typeof message === 'number' ? message : message.revision }), view: revision => wrapped(popup(revision !== 1, revision), 2) });
    const host = createMemoryTerminalHost({ terminalSize: size });
    const write = host.write.bind(host);
    const runtime = createTuiRuntime({ app, host });
    try {
      await runtime.start();
      const accepted = runtime.frame();
      const before = structuredClone(accepted);
      host.write = async () => (outcome === 'indeterminate' ? indeterminateTerminalWrite : failedTerminalWrite)(host.id, new Error('injected'));
      await assert.rejects(runtime.dispatch(1));
      assert.strictEqual(runtime.frame(), accepted);
      assert.deepEqual(accepted, before);
      host.write = write;
      await runtime.dispatch(2);
      const fresh = renderElementFrame(wrapped(popup(true, 2), 2), size, {
        focusPath: runtime.frame().focusPath,
      });
      assert.deepEqual(runtime.frame(), { ...fresh, accessibility: { ...fresh.accessibility, source: 'tui' } });
      const option = runtime.frame().hitTargets.find(target => target.id.endsWith(':option:1'));
      await runtime.handleInputChunk({ data: `\u001B[<0;${option.bounds.column};${option.bounds.row}M` });
      assert.equal(runtime.state(), 2, 'recovered pointer routing uses the current callback');
    } finally { await runtime.dispose(); }
  });
}

test('content clips exclude scrollbar gutters from cells, graphics and owned hit targets', () => {
  const element = absolute(viewport(paint({ name: 'gutter-picture', graphic: true,
    lines: Array.from({ length: 8 }, (_, row) => ({ row, column: 0, text: 'abcdefghijklmnopqr' })),
  }, 5), { id: 'scroll', scrollbar: { axis: 'both', visible: 'always' }, onScroll: () => 'scroll' }),
  { row: 2, column: 3, width: 8, height: 5 });
  const result = renderElementInternal(element, size);
  const leaf = find(result.layout, 'gutter-picture');
  assert.deepEqual(leaf.viewport, { row: 2, column: 3, width: 7, height: 4 });
  const target = targets(result).find(target => target.id === 'paint');
  assert.deepEqual(target.bounds, leaf.viewport);
  assert.ok(targets(result).some(target => target.id.includes('scrollbar:vertical')));
  assert.ok(targets(result).some(target => target.id.includes('scrollbar:horizontal')));
  for (const cell of result.frame.cells.filter(cell => cell.source?.itemId === 'gutter-picture')) {
    assert.ok(cell.column < leaf.viewport.column + leaf.viewport.width);
    assert.ok(cell.row < leaf.viewport.row + leaf.viewport.height);
  }
});

test('scrolling and popup toggles allocate only the owned regions, with no flat viewport buffer', () => {
  let previous;
  for (let revision = 0; revision < 8; revision++) {
    const work = {};
    const element = wrapped(popup(revision % 2 === 0, revision), 2, { offset: { row: revision % 2 } });
    const result = renderElementInternal(element, size, { previous,
      instrumentation: { now: () => 0, record() {}, recordWork({ kind, count }) {
        work[kind] = (work[kind] ?? 0) + count;
      } },
    });
    assert.equal(work.region_allocations, revision % 2 === 0 ? 2 : 1);
    assert.ok(work.layout_nodes < 15);
    assert.deepEqual(result.frame, renderElementFrame(element, size));
    previous = result;
  }
});

test('a clipped viewport keeps logical offscreen focus but never publishes a gutter cursor', () => {
  const content = column([
    button({ id: 'above', label: 'An intentionally long first row', onPress: () => 'above' }),
    button({ id: 'visible', label: 'An intentionally long second row', onPress: () => 'visible' }),
    button({ id: 'below', label: 'An intentionally long third row', onPress: () => 'below' }),
  ], { id: 'buttons' });
  const element = viewport(content, { id: 'scroll', offset: { row: 1, column: 1 },
    scrollbar: { axis: 'both', visible: 'always' }, onScroll: () => 'scroll' });
  const result = renderElementInternal(element, { columns: 8, rows: 3 }, { focusPath: ['scroll', 'buttons', 'visible'] });
  const first = find(result.layout, 'above');
  const logical = collectLayoutFocusTargets(result.layout).find(target => target.elementId === 'above');
  assert.equal(logical.logicalBounds.height, 1);
  assert.equal(first.focusable, false);
  assert.equal(first.focusTargets[0].bounds.height, 0);
  assert.ok(result.frame.cursor.row >= 1 && result.frame.cursor.row <= 2);
  assert.ok(result.frame.cursor.column >= 1 && result.frame.cursor.column <= 7);
  for (const target of result.frame.hitTargets.filter(target => target.id.endsWith(':control'))) {
    assert.ok(target.bounds.column >= 1 && target.bounds.column + target.bounds.width <= 8);
    assert.ok(target.bounds.row >= 1 && target.bounds.row + target.bounds.height <= 3);
  }
});

for (const zIndex of [0, 5]) {
  test(`unrelated sibling cells do not suppress a viewport's own indicators at z ${zIndex}`, () => {
    const lower = paint({ name: 'lower', lines: [{ row: 1, column: 2, text: 'X' }] });
    const upper = viewport(paint({ name: 'blank', lines: [] }), {
      id: 'upper', meta: { layer: { zIndex, underlay: 'clear' } },
    });
    const size = { columns: 5, rows: 2 };
    const alone = renderElementFrame(upper, size);
    const combined = renderElementFrame(overlay([lower, upper], { id: 'scene' }), size);
    const cell = frame => frame.cells.find(cell => cell.row === 2 && cell.column === 3);
    assert.equal(cell(combined).text, cell(alone).text);
    assert.notEqual(cell(combined).text, 'X');
  });
}

test('sparse layered viewports take only one snapshot per admitted region, not per indicator query', () => {
  const prototype = Object.getPrototypeOf(createFrameBuffer(1, 1));
  const original = prototype.snapshot;
  let snapshots = 0;
  prototype.snapshot = function (...args) { snapshots++; return original.apply(this, args); };
  try {
    for (const count of [10, 20, 40, 80]) {
      snapshots = 0;
      const element = overlay(Array.from({ length: count }, (_, index) => absolute(viewport(
        paint({ name: `sparse-${index}`, lines: [{ row: 0, column: 0, text: 'X' }] }, 1),
        { id: `viewport-${index}` },
      ), { row: index * 2 + 1, column: 1, width: 5, height: 2 })), { id: 'root' });
      renderElementFrame(element, { columns: 5, rows: count * 2 });
      assert.ok(snapshots <= count + 3, `${count} viewports used ${snapshots} snapshots`);
    }
  } finally { prototype.snapshot = original; }
});
