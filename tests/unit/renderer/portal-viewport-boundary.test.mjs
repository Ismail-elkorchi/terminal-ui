import assert from 'node:assert/strict';
import test from 'node:test';
import { createListboxCollection, createListboxView } from '../../../dist/behavior/index.js';
import { button, combobox, text } from '../../../dist/components/index.js';
import { absolute, column, overlay, portal, viewport } from '../../../dist/layout/index.js';
import { renderElementFrame, renderFramePlain } from '../../../dist/renderer/index.js';
import { renderElementInternal, rerenderElementInternal } from '../../../dist/renderer/internal/render-element.js';

const size = { columns: 40, rows: 12 };
const collection = createListboxCollection(['English', 'French', 'Spanish'], (label, index) => ({ id: String(index), label }));
const optionsView = createListboxView(collection);
function choice(revision = 0, extra = {}) {
  return combobox({ id: 'language', label: 'Language', labelVisibility: 'hidden', collection, optionsView,
    state: { kind: 'select', open: true, interaction: { activeId: '0', selection: { mode: 'single', selectedId: '0' } } },
    onTransition: transition => ({ revision, transition }), onCommit: event => ({ revision, event }), ...extra });
}
function find(node, id) {
  if (node.id === id) return node;
  return node.children.map(child => find(child, id)).find(Boolean);
}
function targets(result) { return result.regions.flatMap(region => region.hitTargets); }
function clipped(revision, nested, extra = {}) {
  let content = absolute(viewport(absolute(choice(revision, extra), { row: 1, column: 1, width: 20, height: 1 }),
    { id: 'control-crop' }), { row: 3, column: 4, width: 10, height: 1 });
  if (nested) content = absolute(viewport(content, { id: 'outer-crop' }), { row: 2, column: 2, width: 24, height: 5 });
  return content;
}

for (const nested of [false, true]) {
  test(`partially clipped control keeps its full anchor and root-bound popup (nested: ${nested})`, () => {
    let previous;
    for (const [revision, rows] of [12, 8, 6, 12].entries()) {
      const element = clipped(revision, nested);
      const terminal = { ...size, rows };
      const result = renderElementInternal(element, terminal, { previous });
      assert.deepEqual(result.frame, renderElementFrame(element, terminal));
      const control = find(result.layout, 'language');
      const popup = find(result.layout, 'language:popup');
      assert.equal(control.bounds.width, 20);
      assert.equal(control.viewport.width, 10);
      assert.equal(control.viewport.height, 1);
      assert.deepEqual(popup.viewport, { row: 1, column: 1, width: 40, height: rows });
      assert.match(renderFramePlain(result.frame), /French/u);
      assert.ok(popup.bounds.height > control.viewport.height);
      if (rows === 12) {
        assert.equal(popup.bounds.row, control.bounds.row + 1);
        assert.equal(popup.bounds.column, control.bounds.column);
      }
      const option = targets(result).find(target => target.id.endsWith(':option:1'));
      assert.equal(option.message({ kind: 'pointerDown', button: 'left', row: option.bounds.row, column: option.bounds.column }).revision, revision);
      const outside = targets(result).find(target => target.id.includes(':outside:top'));
      assert.equal(outside.bounds.row, 1);
      assert.equal(outside.message({ kind: 'pointerDown', button: 'left', row: 1, column: 1 }).revision, revision);
      previous = result;
    }
  });
}

test('same-layer portals own root-bounded storage and each callback exactly once', () => {
  const popup = portal(button({ id: 'option', label: 'French', onPress: () => 'select' }), {
    id: 'portal', anchor: { kind: 'allocation' }, placement: 'below', margin: 0, onOutsidePress: () => 'dismiss',
  });
  const element = absolute(viewport(popup, { id: 'crop', meta: { layer: { zIndex: 5, underlay: 'clear' } } }),
    { row: 3, column: 4, width: 10, height: 1 });
  const result = renderElementInternal(element, size);
  assert.match(renderFramePlain(result.frame), /French/u);
  assert.deepEqual(result.regions.map(region => region.zIndex), [0, 5, 5]);
  assert.equal(targets(result).filter(target => target.id === 'option:control').length, 1);
  const target = targets(result).find(target => target.id === 'option:control');
  assert.equal(target.bounds.row, 4);
  assert.equal(target.message({ kind: 'click', button: 'left' }), 'select');
  const focused = rerenderElementInternal(result, { focusPath: result.regions.flatMap(region => region.focusTargets)[0].path });
  assert.deepEqual(focused.frame, renderElementInternal(element, size, { focusPath: focused.frame.focusPath }).frame);
});

test('fully clipped allocation anchors cannot spawn a root popup and can reappear after scrolling', () => {
  let previous;
  for (const offset of [0, 1, 0]) {
    const element = absolute(viewport(column([choice(), text({ id: 'tail', content: 'tail\nmore\nlast' })]), {
      id: 'crop', offset: { row: offset },
    }), { row: 3, column: 4, width: 20, height: 1 });
    const result = renderElementInternal(element, size, { previous });
    assert.deepEqual(result.frame, renderElementFrame(element, size));
    assert.equal(find(result.layout, 'language:popup').visible, offset === 0);
    assert.equal(renderFramePlain(result.frame).includes('French'), offset === 0);
    assert.equal(targets(result).some(target => target.id.includes(':option:')), offset === 0);
    previous = result;
  }
});

test('inert and hidden control ownership is retained across the root portal boundary', () => {
  for (const extra of [{ inert: true }, { meta: { layer: { visible: false } } }]) {
    const frame = renderElementFrame(clipped(0, true, extra), size);
    assert.equal(frame.hitTargets?.length ?? 0, 0);
    assert.equal(frame.focusPath, undefined);
  }
});

test('zero-intrinsic portal allocation remains a visible insertion-point anchor', () => {
  const element = column([
    text({ id: 'base', content: 'base' }),
    portal(text({ id: 'inserted', content: 'popup' }), {
      id: 'insertion', anchor: { kind: 'allocation' }, placement: 'below', margin: 0,
    }),
  ]);
  const result = renderElementInternal(element, size);
  assert.equal(find(result.layout, 'insertion').visible, true);
  assert.equal(renderFramePlain(result.frame), 'base\npopup');
});

test('a hidden portal creates neither an empty region nor a terminal backdrop', () => {
  const invisible = portal(text({ content: 'hidden' }), {
    id: 'hidden-portal', anchor: { kind: 'target', bounds: { row: 50, column: 50, width: 1, height: 1 } },
    meta: { layer: { zIndex: 20, underlay: 'clear', backdrop: 'viewport' } },
  });
  const base = text({ id: 'base', content: 'keep me' });
  const result = renderElementInternal(overlay([base, invisible]), size);
  assert.equal(result.regions.length, 1);
  assert.equal(renderFramePlain(result.frame), 'keep me');
  const hiddenRoot = renderElementInternal(invisible, size);
  assert.equal(hiddenRoot.regions.length, 0);
  assert.equal(hiddenRoot.frame.cells.length, 0);
});

for (const anchor of [
  { kind: 'target', bounds: { row: 1, column: 1, width: 1, height: 1 } },
  { kind: 'cursor', row: 1, column: 1 },
]) {
  test(`visible ${anchor.kind} anchors cannot revive a fully clipped owning allocation`, () => {
    let previous;
    for (const offset of [0, 4, 0]) {
      const popup = portal(button({ id: 'action', label: 'Popup action', onPress: () => 'action' }), {
        id: 'owned-portal', anchor, placement: 'below', margin: 0, meta: { layer: { zIndex: 20 } },
      });
      const content = overlay([
        absolute(column([popup], { id: 'owning-column' }), { row: 5, column: 1, width: 12, height: 1 }),
        text({ id: 'extent', content: 'extent\nmore\nmore\nmore\nmore\nend' }),
      ]);
      const element = absolute(viewport(content, {
        id: 'owner-crop', offset: { row: offset },
      }), { row: 1, column: 1, width: 12, height: 1 });
      const result = renderElementInternal(element, size, { previous });
      assert.deepEqual(result.frame, renderElementFrame(element, size));
      const shown = offset === 4;
      assert.equal(find(result.layout, 'owned-portal')?.visible ?? false, shown);
      assert.equal(renderFramePlain(result.frame).includes('Popup action'), shown);
      assert.equal(targets(result).some(target => target.id === 'action:control'), shown);
      assert.equal(JSON.stringify(result.frame.accessibility).includes('Popup action'), shown);
      previous = result;
    }
  });
}
