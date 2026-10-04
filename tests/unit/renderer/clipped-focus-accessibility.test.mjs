import assert from 'node:assert/strict';
import test from 'node:test';
import { defineComponent } from '../../../dist/component/index.js';
import { combobox, text, textInput } from '../../../dist/components/index.js';
import { createListboxCollection, createListboxView, textInputReducer } from '../../../dist/behavior/index.js';
import { createMemoryTerminalHost, failedTerminalWrite } from '../../../dist/host/index.js';
import { column, viewport } from '../../../dist/layout/index.js';
import { renderElementFrame, renderFramePlain } from '../../../dist/renderer/index.js';
import { renderElementInternal } from '../../../dist/renderer/internal/render-element.js';
import { createTuiRuntime, defineTui } from '../../../dist/tui/index.js';

const canvas = defineComponent({
  name: 'terminal-ui-tests/retained-logical-canvas', identity: 'required', structure: 'composite',
  semantics: 'semantic', accessibleRole: 'group', states: ['inert'],
  slots: { fields: { cardinality: 'many', owner: 'caller', messages: 'bubble' } },
  createModel: options => ({ width: options.width }),
  measure: ({ model }) => ({ minWidth: 0, minHeight: 0, preferredWidth: model.width, preferredHeight: 3 }),
  layout: ({ model }) => ({ fields: [
    { row: 0, column: Math.min(95, model.width - 20), width: 20, height: 2 },
    { row: 0, column: 0, width: 10, height: 1 },
    { row: 2, column: Math.min(95, model.width - 20), width: 20, height: 1 },
    { row: 2, column: 0, width: 10, height: 1 },
  ] }),
  accessibility: ({ id, slots }) => ({ id, role: 'group', children: slots.fields }),
});
const initial = { text: 'retained', cursor: 8 };
function scene(editor = initial, width = 120, extra = {}) {
  const control = extra.control ?? textInput({ id: 'editor', state: editor,
    meta: { accessibleName: 'Editor' }, onTransition: transition => ({ kind: 'edit', transition }) });
  return viewport(canvas({ id: 'canvas', width, ...(extra.inert ? { inert: true } : {}), slots: { fields: [
    column([control, text({ id: 'clipped-sibling', content: 'Clipped sibling' })], {
      id: 'editing-group', ...(extra.hidden ? { meta: { layer: { visible: false } } } : {}),
    }),
    textInput({ id: 'visible-input', state: { text: String(editor.text.length), cursor: 0 },
      meta: { accessibleName: 'Visible input' }, onTransition: transition => transition }),
    text({ id: 'unrelated-offscreen', content: 'Unrelated offscreen' }),
    column([text({ id: 'decorative-content', content: 'Decoration' })], {
      id: 'decorative', meta: { accessibility: { decorative: true } },
    }),
  ] } }), { id: 'clip' });
}
function find(node, id) {
  if (node.id === id) return node;
  return (node.children ?? []).map(child => find(child, id)).find(Boolean);
}
function assertClippedEditor(frame, value) {
  const focused = find(frame.accessibility.root, 'editor');
  assert.equal(focused.focused, true);
  assert.equal(focused.value, value);
  assert.ok(find(frame.accessibility.root, 'editing-group'));
  assert.equal(find(frame.accessibility.root, 'clipped-sibling'), undefined);
  assert.equal(find(frame.accessibility.root, 'unrelated-offscreen'), undefined);
  assert.equal(find(frame.accessibility.root, 'decorative'), undefined);
  assert.ok(find(frame.accessibility.root, 'visible-input'));
  assert.equal(frame.cells.some(cell => cell.source?.elementId === 'editor'), false);
  assert.equal(frame.hitTargets.some(target => target.id.startsWith('editor:')), false);
  assert.equal(frame.cursor, undefined);
}

test('resolved clipped focus retains only its semantic branch across fresh and retained shrink/reveal', () => {
  let previous = renderElementInternal(scene(), { columns: 120, rows: 3 });
  const focusPath = previous.frame.focusPath;
  assert.equal(focusPath.at(-1), 'editor');
  const history = [{ frame: previous.frame, copy: structuredClone(previous.frame) }];
  for (const columns of [80, 60, 40, 120, 60]) {
    const element = scene();
    const next = renderElementInternal(element, { columns, rows: 3 }, { previous, focusPath });
    const fresh = renderElementFrame(element, { columns, rows: 3 }, { focusPath });
    assert.deepEqual(next.frame, fresh);
    assert.deepEqual(next.frame.focusPath, focusPath);
    if (columns < 95) assertClippedEditor(next.frame, 'retained');
    else assert.match(renderFramePlain(next.frame), /retained/u);
    for (const old of history) assert.deepEqual(old.frame, old.copy);
    history.push({ frame: next.frame, copy: structuredClone(next.frame) });
    previous = next;
  }
});

test('moving focus away omits the clipped branch again without promoting hidden, inert or decorative nodes', () => {
  const first = renderElementInternal(scene(), { columns: 120, rows: 3 });
  const focused = renderElementInternal(scene(), { columns: 60, rows: 3 }, { previous: first, focusPath: first.frame.focusPath });
  const visiblePath = ['clip', 'canvas', 'visible-input'];
  const next = renderElementInternal(scene(), { columns: 60, rows: 3 }, { previous: focused, focusPath: visiblePath });
  assert.equal(find(next.frame.accessibility.root, 'editor'), undefined);
  assert.equal(find(next.frame.accessibility.root, 'editing-group'), undefined);
  assert.equal(find(next.frame.accessibility.root, 'visible-input').focused, true);
  for (const extra of [{ hidden: true }, { inert: true }]) {
    const result = renderElementInternal(scene(initial, 120, extra), { columns: 60, rows: 3 }, {
      previous: focused, focusPath: first.frame.focusPath,
    });
    assert.equal(find(result.frame.accessibility.root, 'editor'), undefined);
    assert.equal(find(result.frame.accessibility.root, 'decorative'), undefined);
    assert.notDeepEqual(result.frame.focusPath, first.frame.focusPath);
  }
  const automatic = renderElementFrame(scene(), { columns: 60, rows: 3 });
  assert.equal(find(automatic.accessibility.root, 'editor'), undefined);
  assert.deepEqual(automatic.focusPath, visiblePath);
});

test('a focused offscreen open select retains semantics without resurrecting its portal, pixels or targets', () => {
  const collection = createListboxCollection(['English', 'French'], (label, index) => ({ id: String(index), label }));
  const control = combobox({ id: 'editor', label: 'Language', collection, optionsView: createListboxView(collection),
    state: { kind: 'select', open: true, interaction: { activeId: '0', selection: { mode: 'single', selectedId: '0' } } },
    onTransition: transition => transition, onCommit: event => event });
  const element = scene(initial, 120, { control });
  const first = renderElementInternal(element, { columns: 120, rows: 10 });
  const clipped = renderElementInternal(element, { columns: 60, rows: 10 }, { previous: first, focusPath: first.frame.focusPath });
  const semantic = find(clipped.frame.accessibility.root, 'editor');
  assert.equal(semantic.focused, true);
  assert.equal(semantic.expanded, true);
  assert.equal(semantic.controls, 'editor:popup');
  assert.equal(semantic.activeDescendant, 'editor:popup:item:0');
  assert.equal(find(clipped.layout, 'editor:popup').visible, false);
  assert.equal(clipped.regions.some(region => region.zIndex === 20), false);
  assert.equal(clipped.frame.hitTargets.some(target => target.id.startsWith('editor:')), false);
  assert.equal(clipped.frame.cells.some(cell => cell.source?.elementId?.startsWith('editor')), false);
  assert.equal(clipped.frame.cursor, undefined);
  assert.doesNotMatch(renderFramePlain(clipped.frame), /French/u);
});

test('native input continues editing through retained-width resizes and a rejected clipped edit', async () => {
  const app = defineTui({ id: 'clipped-editor', init: () => ({ state: { editor: initial, width: 120 } }),
    update: (state, message) => ({ state: message.kind === 'reveal'
      ? { ...state, width: 60 } : { ...state, editor: textInputReducer(state.editor, message.transition) } }),
    view: state => scene(state.editor, state.width) });
  const host = createMemoryTerminalHost({ terminalSize: { columns: 120, rows: 3 } });
  const runtime = createTuiRuntime({ app, host });
  const write = host.write.bind(host);
  try {
    await runtime.start();
    const focus = runtime.frame().focusPath;
    await runtime.handleInputChunk({ data: 'X' });
    await runtime.resize({ columns: 80, rows: 3 });
    await runtime.resize({ columns: 60, rows: 3 });
    assert.deepEqual(runtime.frame().focusPath, focus);
    assertClippedEditor(runtime.frame(), 'retainedX');
    const accepted = runtime.frame();
    const copy = structuredClone(accepted);
    // The visible length field ensures this edit needs a physical write.
    host.write = async () => failedTerminalWrite(host.id, new Error('injected'));
    await assert.rejects(runtime.dispatch({ kind: 'edit', transition: { kind: 'edit', operation: { kind: 'insert', text: 'rejected' } } }));
    assert.strictEqual(runtime.frame(), accepted);
    assert.deepEqual(accepted, copy);
    assert.equal(runtime.state().editor.text, 'retainedX');
    host.write = write;
    await runtime.handleInputChunk({ data: 'Z' });
    assertClippedEditor(runtime.frame(), 'retainedXZ');
    await runtime.dispatch({ kind: 'reveal' });
    await runtime.handleInputChunk({ data: 'Y' });
    assert.equal(runtime.state().editor.text, 'retainedXZY');
    assert.deepEqual(runtime.frame().focusPath, focus);
    assert.match(renderFramePlain(runtime.frame()), /retainedXZY/u);
    assert.ok(runtime.frame().hitTargets.some(target => target.id.startsWith('editor:')));
  } finally { host.write = write; await runtime.dispose(); }
});
