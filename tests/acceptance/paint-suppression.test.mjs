import assert from 'node:assert/strict';
import test from 'node:test';

import { checkbox, image, text, textInput } from '../../dist/components/index.js';
import { defineComponent, ignoreMessage, span } from '../../dist/component/index.js';
import { textInputReducer } from '../../dist/behavior/index.js';
import { rasterImage } from '../../dist/graphics/index.js';
import { failedTerminalWrite, indeterminateTerminalWrite } from '../../dist/host/index.js';
import { absolute, column, overlay, portal, surface } from '../../dist/layout/index.js';
import { layoutElement, measureElement, renderElementFrame, renderFramePlain } from '../../dist/renderer/index.js';
import { createTerminalHarness, keyInput, pasteInput, pointerInput } from '../../dist/testing/index.js';
import { defineTui } from '../../dist/tui/index.js';

const terminalSize = { columns: 24, rows: 6 };
const suppressed = { paint: 'suppressed' };
const backdrop = text({ id: 'background', content: Array.from({ length: terminalSize.rows }, () => '.'.repeat(terminalSize.columns)).join('\n') });
const backingFrame = renderElementFrame(backdrop, terminalSize);

function accessibleNode(frame, id) {
  const visit = node => node.id === id ? node : node.children?.map(visit).find(Boolean);
  const found = visit(frame.accessibility.root);
  assert.ok(found, `Missing accessible node ${id}`);
  return found;
}

async function click(harness, bounds) {
  for (const action of ['press', 'release']) {
    await harness.input(pointerInput({ action, row: bounds.row, column: bounds.column }));
  }
}

test('suppressed native text input and checkbox retain focus, keyboard, paste, pointer and accessibility', async () => {
  const makeInput = (state, paint = suppressed) => textInput({
    id: 'editor', meta: { accessibleName: 'Editor', ...paint }, state,
    onTransition: transition => ({ kind: 'edit', transition }),
    styles: { root: { bg: { kind: 'ansi', value: 1 } }, states: { focused: { root: { inverse: true } } } },
  });
  const initialEditor = { text: 'A', cursor: 1 };
  const visible = makeInput(initialEditor, {});
  const hidden = makeInput(initialEditor);
  assert.deepEqual(measureElement(hidden, terminalSize), measureElement(visible, terminalSize));
  const visibleLayout = layoutElement(visible, terminalSize);
  const hiddenLayout = layoutElement(hidden, terminalSize);
  assert.deepEqual(hiddenLayout.bounds, visibleLayout.bounds);
  assert.deepEqual(hiddenLayout.focusTargets, visibleLayout.focusTargets);
  const app = defineTui({
    init: () => ({ state: { editor: initialEditor, checked: false, suppressed: true } }),
    update: (state, message) => ({ state: message.kind === 'paint' ? { ...state, suppressed: message.suppressed } : message.kind === 'edit'
      ? { ...state, editor: textInputReducer(state.editor, message.transition) }
      : { ...state, checked: message.transition.checked } }),
    view: state => overlay([backdrop, column([
      makeInput(state.editor, state.suppressed ? suppressed : {}),
      checkbox({ id: 'check', label: 'Remember me', checked: state.checked, meta: state.suppressed ? suppressed : {},
        onTransition: transition => ({ kind: 'check', transition }) }),
    ], { id: 'controls' })]),
  });
  const harness = createTerminalHarness({ terminalSize });
  await harness.runApp(app, async runtime => {
    const focusPath = runtime.frame().focusPath;
    assert.equal(accessibleNode(runtime.frame(), 'editor').focused, true);
    assert.equal(runtime.frame().cursor, undefined, 'a suppressed focused input cannot emit a terminal cursor');
    assert.deepEqual(runtime.frame().cells, backingFrame.cells, 'control backgrounds and focus styles must not overwrite the backing cells');
    await harness.input(keyInput('x'));
    await harness.input(pasteInput('yz'));
    await harness.input(keyInput('arrowLeft'));
    await harness.input(keyInput('backspace'));
    assert.equal(runtime.state().editor.text, 'Axz');
    assert.deepEqual(runtime.frame().focusPath, focusPath);
    assert.equal(accessibleNode(runtime.frame(), 'editor').value, 'Axz');
    await harness.input(keyInput('tab'));
    assert.equal(accessibleNode(runtime.frame(), 'check').focused, true);
    await harness.input(keyInput('space'));
    assert.equal(runtime.state().checked, true);
    assert.equal(accessibleNode(runtime.frame(), 'check').checked, true);
    const target = runtime.frame().hitTargets.find(target => target.id.includes('check'));
    assert.ok(target);
    await click(harness, target.bounds);
    assert.equal(runtime.state().checked, false);
    assert.deepEqual(runtime.frame().cells, backingFrame.cells);
    assert.equal(runtime.frame().cursor, undefined);
    const checkboxFocus = runtime.frame().focusPath;
    await runtime.dispatch({ kind: 'paint', suppressed: false });
    assert.match(renderFramePlain(runtime.frame()), /Axz/u);
    assert.match(renderFramePlain(runtime.frame()), /Remember me/u);
    assert.deepEqual(runtime.frame().focusPath, checkboxFocus);
    assert.equal(accessibleNode(runtime.frame(), 'check').checked, false);
    await runtime.dispatch({ kind: 'paint', suppressed: true });
    assert.deepEqual(runtime.frame().cells, backingFrame.cells);
    assert.deepEqual(runtime.frame().focusPath, checkboxFocus);
    await runtime.dispatch({ kind: 'paint', suppressed: false });
    assert.match(renderFramePlain(runtime.frame()), /Axz/u);
    assert.deepEqual(runtime.frame().focusPath, checkboxFocus);
  });
});

test('renderer-owned suppression skips custom composite paint hooks while retaining layout and actions', async () => {
  const calls = { before: 0, after: 0, leaf: 0, layout: [] };
  const leaf = defineComponent({
    name: 'paint-suppression/custom-leaf', identity: 'required', structure: 'leaf',
    semantics: 'semantic', accessibleRole: 'button',
    // No metadata capability is needed for renderer-owned paint suppression.
    measure: () => ({ minWidth: 1, minHeight: 1, preferredWidth: 8, preferredHeight: 1 }),
    render({ target }) { calls.leaf++; target.clear(); target.write(0, 0, [span('PAINT')]); },
    focusTargets: ({ bounds }) => [{ id: 'self', bounds, cursor: { row: 0, column: 0 } }],
    hitTargets: ({ id, bounds }) => [{ id, bounds, message: () => ({ kind: 'press' }) }],
    keys: () => ({ enter: () => ({ kind: 'press' }) }),
    onInput: ({ text }) => ({ kind: 'input', text }),
    onPaste: ({ text }) => ({ kind: 'paste', text }),
    onLayout(input) { calls.layout.push(input.allocatedBounds); return ignoreMessage(); },
    accessibility: ({ id, focused }) => ({ id, role: 'button', label: 'Custom', focused }),
  });
  const composite = defineComponent({
    name: 'paint-suppression/custom-composite', identity: 'required', structure: 'composite',
    semantics: 'semantic', accessibleRole: 'group',
    slots: { content: { cardinality: 'one', owner: 'caller', messages: 'bubble' } },
    measure: ({ slots }) => slots.measure('content'),
    layout: ({ bounds }) => ({ content: { row: 0, column: 0, width: bounds.width, height: bounds.height } }),
    renderBeforeChildren({ target }) { calls.before++; target.clear(); },
    renderAfterChildren({ target }) { calls.after++; target.write(0, 0, [span('AFTER')]); },
    accessibility: ({ id }) => ({ id, role: 'group' }),
  });
  const harness = createTerminalHarness({ terminalSize });
  const app = defineTui({
    init: () => ({ state: [] }), update: (state, message) => ({ state: [...state, message] }),
    view: () => overlay([backdrop, composite({ id: 'custom-parent', meta: suppressed,
      slots: { content: leaf({ id: 'custom-leaf', meta: {}, onAction: action => action }) } })]),
  });
  await harness.runApp(app, async runtime => {
    assert.ok(calls.layout.length > 0, 'post-commit layout notifications remain enabled');
    assert.equal(accessibleNode(runtime.frame(), 'custom-leaf').focused, true);
    await harness.input(keyInput('enter'));
    await harness.input(keyInput('x'));
    await harness.input(pasteInput('paste'));
    const target = runtime.frame().hitTargets.find(target => target.id === 'custom-leaf');
    assert.ok(target);
    await click(harness, target.bounds);
    assert.deepEqual(runtime.state(), [{ kind: 'press' }, { kind: 'input', text: 'x' }, { kind: 'paste', text: 'paste' }, { kind: 'press' }]);
    assert.deepEqual({ before: calls.before, after: calls.after, leaf: calls.leaf }, { before: 0, after: 0, leaf: 0 });
    assert.deepEqual(runtime.frame().cells, backingFrame.cells);
    assert.equal(runtime.frame().cursor, undefined);
  });
  const direct = leaf({ id: 'direct-leaf', meta: suppressed, onAction: action => action });
  assert.equal(renderFramePlain(renderElementFrame(direct, terminalSize)).trim(), '');
  assert.equal(calls.leaf, 0);
});

test('suppression follows portals and promoted layers without clearing or dimming backing cells or removing hit targets', async () => {
  const app = defineTui({
    init: () => ({ state: { checked: false, outside: 0 } }),
    update: (state, message) => ({ state: message.kind === 'outside'
      ? { ...state, outside: state.outside + 1 } : { ...state, checked: message.checked } }),
    view: state => overlay([backdrop, surface(column([
      text({ content: 'HIDDEN PARENT' }),
      portal(surface(checkbox({ id: 'portal-check', label: 'Portal checkbox', checked: state.checked,
        meta: { layer: { visible: true, zIndex: 40, underlay: 'clear' } }, onTransition: transition => transition }), {
        border: 'single', shadow: true,
        styles: { root: { bg: { kind: 'ansi', value: 4 } } },
      }), {
        id: 'popup', anchor: { kind: 'allocation' }, placement: 'center',
        meta: { layer: { visible: true, zIndex: 30, underlay: 'clear', backdrop: 'viewport' } },
        onOutsidePress: () => ({ kind: 'outside' }),
      }),
    ]), { id: 'suppressed-owner', meta: suppressed, border: 'single', shadow: true })]),
  });
  const harness = createTerminalHarness({ terminalSize });
  await harness.runApp(app, async runtime => {
    assert.deepEqual(runtime.frame().cells, backingFrame.cells);
    assert.equal(accessibleNode(runtime.frame(), 'portal-check').focused, true);
    await harness.input(keyInput('space'));
    assert.equal(runtime.state().checked, true);
    const target = runtime.frame().hitTargets.find(target => target.id.includes('portal-check'));
    assert.ok(target);
    await click(harness, target.bounds);
    assert.equal(runtime.state().checked, false);
    const outside = runtime.frame().hitTargets.find(target => target.id.includes('outside'));
    assert.ok(outside, 'suppression keeps portal outside-press routing');
    await click(harness, { row: 1, column: 1 });
    assert.equal(runtime.state().outside, 1);
    assert.deepEqual(runtime.frame().cells, backingFrame.cells, 'separate regions cannot reenable inherited paint');
  });
});

function retainedGraphicView() {
  const resource = rasterImage({ width: 1, height: 1, format: 'rgb8', data: new Uint8Array([255, 0, 0]) });
  const child = image({ id: 'retained-image', image: resource, label: 'Retained graphic', fallback: 'GRAPHIC',
    measurement: { minWidth: 1, minHeight: 1, preferredWidth: 10, preferredHeight: 2 } });
  return state => overlay([backdrop, absolute(surface(child, { border: 'single', title: 'Preview',
    meta: state.suppressed ? suppressed : {},
  }), { row: 1, column: 2, width: 16, height: 4 })]);
}

test('retained show-hide-show removes and restores cells and graphics without remounting the child', async () => {
  const harness = createTerminalHarness({ terminalSize });
  const app = defineTui({ init: () => ({ state: { suppressed: false } }),
    update: (_state, message) => ({ state: message }), view: retainedGraphicView() });
  await harness.runApp(app, async runtime => {
    const shown = runtime.frame();
    assert.match(renderFramePlain(shown), /GRAPHIC/u);
    assert.equal(shown.graphics.length, 1);
    await runtime.dispatch({ suppressed: true });
    assert.deepEqual(runtime.frame().cells, backingFrame.cells);
    assert.deepEqual(runtime.frame().graphics, []);
    assert.equal(accessibleNode(runtime.frame(), 'retained-image').label, 'Retained graphic');
    assert.ok(harness.diffs().at(-1).graphicOperations.some(operation => operation.kind === 'remove'));
    await runtime.dispatch({ suppressed: false });
    assert.deepEqual(runtime.frame().cells, shown.cells);
    assert.deepEqual(runtime.frame().graphics, shown.graphics);
    assert.ok(harness.diffs().at(-1).graphicOperations.some(operation => operation.kind === 'place'));
    await runtime.dispatch({ suppressed: true });
    assert.deepEqual(runtime.frame().cells, backingFrame.cells);
    assert.deepEqual(runtime.frame().graphics, []);
  });
});

for (const receipt of [failedTerminalWrite, indeterminateTerminalWrite]) {
  test(`a ${receipt.name} suppression candidate cannot publish state, graphics, focus or layout notifications`, async () => {
  const layouts = [];
  const observer = defineComponent({
    name: 'paint-suppression/commit-observer', identity: 'required', structure: 'leaf', semantics: 'semantic', accessibleRole: 'status',
    createModel: ({ revision }) => ({ revision }),
    measure: () => ({ minWidth: 1, minHeight: 1, preferredWidth: 2, preferredHeight: 1 }),
    render: ({ target, model }) => { target.write(0, 0, [span(String(model.revision))]); },
    onLayout({ model }) { layouts.push(model.revision); return ignoreMessage(); },
    accessibility: ({ id }) => ({ id, role: 'status', label: 'Layout observer' }),
  });
  const graphicView = retainedGraphicView();
  const harness = createTerminalHarness({ terminalSize });
  const app = defineTui({ init: () => ({ state: { suppressed: false, revision: 0 } }),
    update: (_state, message) => ({ state: message }),
    view: state => overlay([graphicView(state), column([
      observer({ id: 'observer', revision: state.revision, meta: suppressed, onAction: () => ignoreMessage() }),
      textInput({ id: 'focused', meta: { accessibleName: 'Focused', ...(state.suppressed ? suppressed : {}) },
        state: { text: 'input', cursor: 2 }, onTransition: () => ignoreMessage() }),
    ])]),
  });
  await harness.runApp(app, async runtime => {
    const acceptedState = runtime.state();
    const acceptedFrame = runtime.frame();
    const acceptedLayouts = layouts.slice();
    const acceptedWrites = harness.frames().length;
    const write = harness.host.write.bind(harness.host);
    harness.host.write = async () => receipt('rejected-hide', new Error('candidate refused'));
    try {
      await assert.rejects(runtime.dispatch({ suppressed: true, revision: 1 }));
      assert.equal(runtime.state(), acceptedState);
      assert.equal(runtime.frame(), acceptedFrame);
      assert.equal(harness.frames().length, acceptedWrites);
      assert.deepEqual(layouts, acceptedLayouts);
    } finally { harness.host.write = write; }
    await runtime.dispatch({ suppressed: true, revision: 1 });
    assert.equal(runtime.state().suppressed, true);
    assert.deepEqual(runtime.frame().graphics, []);
    assert.deepEqual(runtime.frame().cells, backingFrame.cells);
    assert.deepEqual(runtime.frame().focusPath, acceptedFrame.focusPath);
    assert.equal(runtime.frame().cursor, undefined);
    assert.ok(layouts.includes(1));
    await runtime.dispatch({ suppressed: false, revision: 2 });
    assert.deepEqual(runtime.frame().cells, acceptedFrame.cells);
    assert.deepEqual(runtime.frame().graphics, acceptedFrame.graphics);
    assert.deepEqual(runtime.frame().focusPath, acceptedFrame.focusPath);
  });
});
}

test('public component and structural factories reject invalid paint policies', () => {
  for (const paint of [false, true, 'visible', 'hidden', null, {}]) {
    assert.throws(() => text({ content: 'Invalid', meta: { paint } }), /paint/u);
    assert.throws(() => column([text({ content: 'Invalid' })], { meta: { paint } }), /paint/u);
  }
});


test('retained text-only subtree identity survives repeated show-hide-show without stale fills', async () => {
  const child = text({ id: 'retained-label', content: 'RETAINED LABEL' });
  const harness = createTerminalHarness({ terminalSize });
  const app = defineTui({
    init: () => ({ state: false }), update: (_state, hidden) => ({ state: hidden }),
    view: hidden => overlay([backdrop, surface(child, { border: 'single', shadow: true,
      meta: hidden ? suppressed : {}, styles: { root: { bg: { kind: 'ansi', value: 4 } } } })]),
  });
  await harness.runApp(app, async runtime => {
    const shown = runtime.frame();
    assert.match(renderFramePlain(shown), /RETAINED LABEL/u);
    assert.deepEqual(shown.graphics, []);
    for (let cycle = 0; cycle < 2; cycle++) {
      await runtime.dispatch(true);
      assert.deepEqual(runtime.frame().cells, backingFrame.cells);
      assert.equal(accessibleNode(runtime.frame(), 'retained-label').value, 'RETAINED LABEL');
      await runtime.dispatch(false);
      assert.deepEqual(runtime.frame().cells, shown.cells);
    }
  });
});
