import assert from 'node:assert/strict';
import test from 'node:test';

import { ignoreMessage } from '../../dist/component/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { renderElementSnapshot } from '../../dist/testing/index.js';
import { createTuiRuntime, defineTui } from '../../dist/tui/index.js';
import { layoutElement } from '../../dist/renderer/index.js';

export function runButtonConformance(name, createButton) {
  test(`${name}: option decoding, sanitization, Unicode, styles, source, focus, and determinism`, () => {
    const element = createButton({
      id: `${name}-button`,
      label: `Go\u001b[31m界`,
      onAction: () => ({ kind: 'activate' }),
      meta: { styles: { parts: { label: { underline: true } } } }
    });
    const input = {
      element,
      terminalSize: { columns: 12, rows: 2 },
      focusPath: [`${name}-button`]
    };
    const first = renderElementSnapshot(input);
    const second = renderElementSnapshot(input);

    assert.equal(first.plainTextFrame.includes(String.fromCharCode(27)), false);
    assert.match(first.plainTextFrame, /Go界/u);
    assert.equal(first.frameJson, second.frameJson);
    assert.deepEqual(first.frame.focusPath, [`${name}-button`]);
    assert.equal(first.frame.accessibility.focusPath.includes(`${name}-button`), true);
    assert.equal((first.frame.hitTargets?.length ?? 0) > 0, true);
    assert.equal(first.frame.cells.some((cell) => cell.style?.underline === true), true);
    assert.equal(first.frame.cells.some((cell) => cell.source?.rendererFamily === 'component'), true);

    const tiny = renderElementSnapshot({ element, terminalSize: { columns: 1, rows: 1 } });
    assert.equal(tiny.frame.width, 1);
    assert.equal(tiny.frame.height, 1);
  });

  test(`${name}: disabled state suppresses interaction and remains accessible`, () => {
    const snapshot = renderElementSnapshot({
      element: createButton({ id: `${name}-disabled`, label: 'Disabled', disabled: true }),
      terminalSize: { columns: 12, rows: 1 }
    });

    assert.equal(snapshot.frame.hitTargets?.length ?? 0, 0);
    assert.equal(snapshot.frame.focusPath, undefined);
    assert.equal(snapshot.frame.accessibility.root.disabled, true);
  });
}

export function runMessageRoutingConformance(name, createButton) {
  test(`${name}: message routing distinguishes values, ignored actions, and invalid absence`, async () => {
    const ordinary = await runButtonAction(name, createButton, () => ({ kind: 'ordinary' }));
    assert.deepEqual(ordinary.messages, [{ kind: 'ordinary' }]);

    const ignored = await runButtonAction(name, createButton, () => ignoreMessage());
    assert.deepEqual(ignored.messages, []);

    for (const absent of [undefined, null]) {
      await assert.rejects(
        runButtonAction(name, createButton, () => absent),
        /onAction returned null or undefined.*ignoreMessage/u
      );
    }
  });
}

export function runEditableControlConformance(name, adapter) {
  test(`${name}: editable control shares value, focus, input, disabled, and tiny-bounds contracts`, async () => {
    const app = defineTui({
      id: `${name}-editable-conformance`,
      init: () => ({ value: 'A' }),
      update: (state, message) => ({ state: { value: state.value + message.text } }),
      view: (state) => adapter.active({
        id: `${name}-editable`,
        value: state.value,
        onInsert: (text) => ({ text })
      })
    });
    const runtime = createTuiRuntime({
      app,
      host: createMemoryTerminalHost({ terminalSize: { columns: 8, rows: 1 } })
    });
    try {
      await runtime.start();
      await runtime.handleInput({ kind: 'text', text: '界', paste: false });
      assert.equal(runtime.state().value, 'A界');
      assert.equal(runtime.frame().accessibility.root.role, 'textbox');
      assert.deepEqual(runtime.frame().focusPath, [`${name}-editable`]);
    } finally {
      await runtime.dispose();
    }

    const disabled = renderElementSnapshot({
      element: adapter.disabled({ id: `${name}-editable-disabled`, value: 'A' }),
      terminalSize: { columns: 1, rows: 1 }
    });
    assert.equal(disabled.frame.width, 1);
    assert.equal(disabled.frame.height, 1);
    assert.equal(disabled.frame.hitTargets?.length ?? 0, 0);
    assert.equal(disabled.frame.accessibility.root.disabled, true);
  });
}

export function runVirtualCollectionConformance(name, adapter) {
  test(`${name}: virtual collection bounds work, identity, accessibility window, disabled state, and tiny bounds`, () => {
    const items = Object.freeze(Array.from({ length: 1_000 }, (_unused, index) => `row-${String(index)}`));
    const active = renderElementSnapshot({
      element: adapter.active({ id: `${name}-collection`, items, activeIndex: 500 }),
      terminalSize: { columns: 16, rows: 4 }
    });
    assert.equal(active.frame.cells.length <= active.frame.width * active.frame.height, true);
    assert.equal((active.frame.accessibility.root.children?.length ?? 0) <= 4, true);
    assert.equal(active.frame.accessibility.root.window?.totalCount, items.length);
    assert.match(active.plainTextFrame, /row-500/u);

    const disabled = renderElementSnapshot({
      element: adapter.disabled({ id: `${name}-collection-disabled`, items, activeIndex: 500 }),
      terminalSize: { columns: 1, rows: 1 }
    });
    assert.equal(disabled.frame.hitTargets?.length ?? 0, 0);
    assert.equal(disabled.frame.accessibility.root.disabled, true);
  });
}

export function runPopupChoiceConformance(name, createOpenChoice) {
  test(`${name}: popup choice shares expanded semantics, portal layering, outside dismissal, and tiny bounds`, () => {
    const element = createOpenChoice(`${name}-popup-choice`);
    const snapshot = renderElementSnapshot({ element, terminalSize: { columns: 20, rows: 6 } });
    const layout = flattenLayout(layoutElement(element, { columns: 20, rows: 6 }));
    assert.equal(snapshot.frame.accessibility.root.role, 'combobox');
    assert.equal(snapshot.frame.accessibility.root.expanded, true);
    assert.equal(layout.some((node) => node.factoryName === 'portal'), true);
    assert.equal(layout.some((node) => node.layer.zIndex >= 20), true);
    assert.equal(snapshot.frame.hitTargets?.some((target) => target.id.includes('outside')), true);
    const tiny = renderElementSnapshot({ element, terminalSize: { columns: 1, rows: 1 } });
    assert.equal(tiny.frame.cells.length <= 1, true);
  });
}

export function runDialogConformance(name, createDialog) {
  test(`${name}: dialog shares naming, modal focus, child accessibility, layering, and tiny bounds`, () => {
    const element = createDialog(`${name}-dialog`);
    const snapshot = renderElementSnapshot({ element, terminalSize: { columns: 24, rows: 8 } });
    const layout = flattenLayout(layoutElement(element, { columns: 24, rows: 8 }));
    assert.equal(snapshot.frame.accessibility.root.role, 'dialog');
    assert.equal(snapshot.frame.accessibility.root.label, 'Settings');
    assert.deepEqual(snapshot.frame.accessibility.root.scope, {
      kind: 'modal', trapsFocus: true, obscuresBackground: true
    });
    assert.equal(snapshot.accessibilityJson.includes('Dialog content'), true);
    assert.equal(layout.some((node) => node.layer.zIndex >= 20), true);
    const tiny = renderElementSnapshot({ element, terminalSize: { columns: 1, rows: 1 } });
    assert.equal(tiny.frame.cells.length <= 1, true);
  });
}

export function runTooltipConformance(name, createTooltip) {
  test(`${name}: tooltip shares trigger composition, popup layering, accessible content, and tiny bounds`, () => {
    const element = createTooltip(`${name}-tooltip`);
    const snapshot = renderElementSnapshot({ element, terminalSize: { columns: 24, rows: 5 } });
    const layout = flattenLayout(layoutElement(element, { columns: 24, rows: 5 }));
    assert.equal(snapshot.accessibilityJson.includes('More information'), true);
    assert.equal(snapshot.accessibilityJson.includes('Info'), true);
    assert.equal(layout.some((node) => node.factoryName === 'portal'), true);
    const tiny = renderElementSnapshot({ element, terminalSize: { columns: 1, rows: 1 } });
    assert.equal(tiny.frame.cells.length <= 1, true);
  });
}

export function runChartConformance(name, createChart) {
  test(`${name}: chart shares bounded deterministic painting, semantics, source metadata, and tiny bounds`, () => {
    const element = createChart(`${name}-chart`);
    const first = renderElementSnapshot({ element, terminalSize: { columns: 4, rows: 2 } });
    const second = renderElementSnapshot({ element, terminalSize: { columns: 4, rows: 2 } });
    assert.equal(first.frameJson, second.frameJson);
    assert.equal(first.frame.cells.length <= 8, true);
    assert.equal(first.frame.accessibility.root.label, 'Load');
    assert.equal(first.frame.accessibility.root.role === 'text', false);
    assert.equal(first.frame.cells.some((cell) => cell.source?.rendererFamily === 'component'), true);
    const tiny = renderElementSnapshot({ element, terminalSize: { columns: 1, rows: 1 } });
    assert.equal(tiny.frame.cells.length <= 1, true);
  });
}

function flattenLayout(root) {
  const nodes = [];
  const pending = [root];
  while (pending.length > 0) {
    const node = pending.pop();
    if (node === undefined) continue;
    nodes.push(node);
    for (const child of node.children) pending.push(child);
  }
  return nodes;
}

async function runButtonAction(name, createButton, onAction) {
  const app = defineTui({
    id: `${name}-message-routing`,
    init: () => ({ messages: [] }),
    update: (state, message) => ({ state: { messages: [...state.messages, message] } }),
    view: () => createButton({
      id: `${name}-message-button`,
      label: 'Action',
      onAction
    })
  });
  const runtime = createTuiRuntime({
    app,
    host: createMemoryTerminalHost({ terminalSize: { columns: 12, rows: 1 } })
  });
  try {
    await runtime.start();
    await runtime.handleInput({
      kind: 'key',
      key: 'enter',
      modifiers: { ctrl: false, alt: false, shift: false, meta: false },
      eventType: 'press',
      location: 'standard'
    });
    return runtime.state();
  } finally {
    await runtime.dispose();
  }
}
