import assert from 'node:assert/strict';
import test from 'node:test';

import { button, text } from '../../dist/components/index.js';
import { column } from '../../dist/layout/index.js';
import { layoutElement, renderElementFrame } from '../../dist/renderer/index.js';
import { renderElementSnapshot } from '../../dist/testing/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { createTuiRuntime, defineTui } from '../../dist/tui/index.js';
import { runButtonConformance } from '../helpers/component-conformance.mjs';
import {
  externalButton,
  externalChart,
  externalDialog,
  externalSelect,
  externalText,
  externalTextInput,
  externalTooltip,
  externalVirtualList
} from '../fixtures/external-component-catalog.mjs';

runButtonConformance('built-in', button);
runButtonConformance('external', externalButton);

test('external painted controls share keyboard, text, pointer, cursor, and action routing', async () => {
  const messages = [];
  const app = defineTui({
    id: 'external-control-parity',
    init: () => ({ value: '' }),
    update: (state, message) => {
      messages.push(message);
      return message.kind === 'input' && message.action.kind === 'insert'
        ? { state: { value: state.value + message.action.text } }
        : { state };
    },
    view: (state) => column([
      externalButton({
        id: 'external-action',
        label: 'Run',
        onAction: (action) => ({ kind: 'button', action })
      }),
      externalTextInput({
        id: 'external-input',
        label: 'Query',
        value: state.value,
        onAction: (action) => ({ kind: 'input', action })
      })
    ])
  });
  const host = createMemoryTerminalHost({ terminalSize: { columns: 20, rows: 2 } });
  const runtime = createTuiRuntime({ app, host });
  try {
    await runtime.start();
    await runtime.handleInput({
      kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false },
      eventType: 'press', location: 'standard'
    });
    await runtime.handleInput({
      kind: 'key', key: 'tab', modifiers: { ctrl: false, alt: false, shift: false, meta: false },
      eventType: 'press', location: 'standard'
    });
    await runtime.handleInput({ kind: 'text', text: '界', paste: false });

    assert.equal(messages.some((message) => message.kind === 'button' && message.action.kind === 'activate'), true);
    assert.equal(messages.some((message) => message.kind === 'input' && message.action.kind === 'insert'), true);
    assert.equal(runtime.state().value, '界');
    assert.equal(runtime.frame()?.cursor?.column, 3);
  } finally {
    await runtime.dispose();
  }
});

test('external virtual collection bounds rendering work and exposes a complete accessible window', () => {
  const items = Object.freeze(Array.from({ length: 100_000 }, (_unused, index) => `row-${String(index)}`));
  const element = externalVirtualList({
    id: 'external-list',
    items,
    offset: 50_000,
    scrollbar: { visible: 'always' },
    onAction: (action) => action
  });
  const snapshot = renderElementSnapshot({ element, terminalSize: { columns: 18, rows: 4 } });
  const sourceIndexes = snapshot.frame.cells
    .map((cell) => cell.source?.itemIndex)
    .filter((value) => value !== undefined);

  assert.match(snapshot.plainTextFrame, /row-50000/u);
  assert.equal(snapshot.plainTextFrame.includes('row-50004'), false);
  assert.equal(Math.min(...sourceIndexes), 50_000);
  assert.equal(Math.max(...sourceIndexes), 50_003);
  assert.equal(snapshot.frame.hitTargets?.some((target) => target.id.includes('scroll')), true);
  assert.deepEqual(snapshot.frame.accessibility.root.window, {
    startIndex: 50_000,
    endIndexExclusive: 50_004,
    totalCount: 100_000,
    omittedBefore: 50_000,
    omittedAfter: 49_996
  });
});

test('external composed select uses public portals, layers, placement, and ordinary children', () => {
  const element = externalSelect({
    id: 'external-select',
    label: 'Choice',
    items: ['one', 'two', 'three'],
    selectedIndex: 1,
    open: true,
    onAction: (action) => action
  });
  const frame = renderElementFrame(element, { columns: 24, rows: 8 });
  const layout = layoutElement(element, { columns: 24, rows: 8 });

  assert.equal(frame.accessibility.root.role, 'combobox');
  assert.equal(frame.accessibility.root.expanded, true);
  assert.equal(frame.hitTargets?.some((target) => target.id.includes('outside')), true);
  const nodes = flattenLayout(layout);
  assert.equal(nodes.some((node) => node.factoryName === 'portal'), true);
  assert.equal(nodes.some((node) => node.layer.zIndex === 20), true);
});

test('external dialog and tooltip use public modal focus, named slots, portals, and implementation children', () => {
  const trigger = externalButton({
    id: 'tooltip-trigger',
    label: 'Info',
    onAction: (action) => action
  });
  const tooltip = externalTooltip({
    id: 'external-tooltip',
    content: 'More information',
    open: true,
    slots: { trigger }
  });
  const dialog = externalDialog({
    id: 'external-dialog',
    title: 'Settings',
    modal: true,
    slots: { content: tooltip },
    onAction: (action) => action
  });
  const snapshot = renderElementSnapshot({
    element: dialog,
    terminalSize: { columns: 30, rows: 10 }
  });
  const layout = layoutElement(dialog, { columns: 30, rows: 10 });

  assert.equal(snapshot.frame.accessibility.root.role, 'dialog');
  assert.deepEqual(snapshot.frame.accessibility.root.scope, {
    kind: 'modal',
    trapsFocus: true,
    obscuresBackground: true
  });
  assert.equal(snapshot.accessibilityJson.includes('More information'), true);
  const nodes = flattenLayout(layout);
  assert.equal(nodes.filter((node) => node.factoryName === 'portal').length >= 2, true);
  assert.equal(nodes.some((node) => node.layer.zIndex >= 40), true);
});

test('external chart painting is bounded, deterministic, styled, sourced, and exact', () => {
  const element = externalChart({
    id: 'external-chart',
    label: 'Load',
    values: [1, 3, 2, 4],
    meta: { styles: { parts: { bar: { underline: true } } } }
  });
  const first = renderElementSnapshot({ element, terminalSize: { columns: 3, rows: 2 } });
  const second = renderElementSnapshot({ element, terminalSize: { columns: 3, rows: 2 } });

  assert.equal(first.frameJson, second.frameJson);
  assert.equal(first.frame.cells.every((cell) => cell.row <= 2 && cell.column <= 3), true);
  assert.equal(first.frame.cells.some((cell) => cell.style?.underline === true), true);
  assert.equal(first.frame.cells.some((cell) => cell.source?.partType === 'bar'), true);
  assert.throws(() => externalChart({ id: 'invalid-chart', label: 'Bad', values: [Number.NaN] }), /finite/u);
  assert.throws(() => externalChart({ id: 'unknown-chart', label: 'Bad', values: [], typo: true }), /unknown field/u);
});

test('external text and built-in text share object-only construction and Unicode measurement', () => {
  const external = renderElementSnapshot({
    element: externalText({ content: 'A界' }),
    terminalSize: { columns: 3, rows: 1 }
  });
  const builtIn = renderElementSnapshot({
    element: text({ content: 'A界' }),
    terminalSize: { columns: 3, rows: 1 }
  });

  assert.equal(external.plainTextFrame, builtIn.plainTextFrame);
  assert.throws(() => externalText('A界'), /must be an object/u);
  assert.throws(() => text('A界'), /must be an object/u);
});

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
