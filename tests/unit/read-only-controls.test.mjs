import assert from 'node:assert/strict';
import test from 'node:test';

import {
  commandInput,
  contextMenu,
  numberInput,
  passwordInput,
  text,
  textArea,
  textInput
} from '../../dist/components/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { row } from '../../dist/layout/index.js';
import { layoutElement, renderElementFrame } from '../../dist/renderer/index.js';
import { renderElementRegions } from '../../dist/renderer/internal/render.js';
import { isIgnoredMessage } from '../../dist/interaction/index.js';
import { prepareTextDocument, textCaretAt } from '../../dist/text/index.js';
import { createTuiRuntime, defineTui } from '../../dist/tui/index.js';

const noModifiers = Object.freeze({ ctrl: false, alt: false, shift: false, meta: false });

test('editable components share one read-only mutation policy', async () => {
  const cases = [
    {
      name: 'textInput',
      element: (onAction) => textInput({
        id: 'control',
        presentation: { value: 'abc', cursor: 1 },
        readOnly: true,
        onAction
      }),
      mutationKeys: ['backspace', 'delete']
    },
    {
      name: 'passwordInput',
      element: (onAction) => passwordInput({
        id: 'control',
        presentation: { value: 'abc', cursor: 1 },
        readOnly: true,
        onAction
      }),
      mutationKeys: ['backspace', 'delete']
    },
    {
      name: 'numberInput',
      element: (onAction) => numberInput({
        id: 'control',
        presentation: { value: '12', cursor: 1, validity: 'valid', parsedValue: 12 },
        readOnly: true,
        onAction
      }),
      mutationKeys: ['backspace', 'delete', 'arrowUp', 'arrowDown', 'enter']
    },
    {
      name: 'textArea',
      element: (onAction) => textArea({
        id: 'control',
        presentation: {
          document: prepareTextDocument('abc'),
          caret: textCaretAt(1)
        },
        readOnly: true,
        onAction
      }),
      mutationKeys: ['backspace', 'delete', 'enter']
    },
    {
      name: 'commandInput',
      element: (onAction) => commandInput({
        id: 'control',
        presentation: { value: 'abc', cursor: 1, suggestions: [] },
        readOnly: true,
        onTransition: onAction
      }),
      mutationKeys: ['backspace', 'delete', 'arrowUp', 'arrowDown', 'enter']
    }
  ];

  for (const candidate of cases) {
    await testReadOnlyControl(candidate);
  }
});

test('read-only command input cannot accept a completion', async () => {
  const runtime = runtimeFor((onAction) => commandInput({
    id: 'control',
    presentation: {
      value: 'a',
      cursor: 1,
      suggestions: [{ id: 'alpha', value: 'alpha', label: 'alpha' }]
    },
    readOnly: true,
    onTransition: onAction
  }));

  await runtime.start();
  const tab = await runtime.handleInput(keyEvent('tab'));
  assert.equal(tab.handled, true, 'Tab remains focus traversal when completion is unavailable');
  assert.deepEqual(runtime.state().actions, []);
});

test('read-only number input preserves selection and omits stepper geometry', () => {
  const control = numberInput({
    id: 'read-only-number',
    presentation: {
      value: '12',
      cursor: 1,
      selection: { startOffset: 0, endOffsetExclusive: 1 },
      validity: 'valid',
      parsedValue: 12,
      committedValue: 12
    },
    readOnly: true,
    onAction: () => ({ kind: 'unused' })
  });
  const frame = renderElementFrame(control, { columns: 12, rows: 1 }, {
    focusPath: ['read-only-number']
  });
  const layout = layoutElement(row([
    control,
    text({ content: 'remaining' })
  ], {
    sizes: [{ kind: 'content' }, { kind: 'fill' }]
  }), { columns: 20, rows: 1 });

  assert.equal(frame.cells.some((cell) => cell.source?.partName === 'selection'), true);
  assert.match(frame.accessibility.root.description ?? '', /Committed value: 12/u);
  assert.equal(layout.children[0]?.bounds.width, 4);
});

test('read-only composed menus keep navigation and dismissal but suppress command activation', () => {
  const element = contextMenu({
    id: 'read-only-menu',
    presentation: {
      kind: 'open',
      anchor: { kind: 'cursor', row: 0, column: 0 },
      menu: {
        activePath: ['run'],
        items: [{ id: 'run', kind: 'action', label: 'Run' }]
      }
    },
    readOnly: true,
    onTransition: (transition) => transition,
    onActivate: (event) => event
  });
  const frame = renderElementFrame(element, { columns: 20, rows: 5 });
  const item = renderElementRegions(element, { columns: 20, rows: 5 })
    .flatMap((region) => region.hitTargets)
    .find((target) => target.id === 'read-only-menu:popup:menu:item:run');

  assert.equal(frame.accessibility.root.readOnly, true);
  assert.equal(isIgnoredMessage(item?.message({ kind: 'click' })), true);
  assert.equal(frame.hitTargets?.some((target) => target.id.includes(':outside:')), true);
});

async function testReadOnlyControl(candidate) {
  const runtime = runtimeFor(candidate.element);
  await runtime.start();
  assert.equal(runtime.frame().accessibility.root.readOnly, true, candidate.name);

  const text = await runtime.handleInput({ kind: 'text', text: 'x', paste: false });
  const paste = await runtime.handleInput({ kind: 'paste', text: 'x', bracketed: true });
  assert.equal(text.handled, false, `${candidate.name} text`);
  assert.equal(paste.handled, false, `${candidate.name} paste`);
  for (const key of candidate.mutationKeys) {
    const result = await runtime.handleInput(keyEvent(key));
    assert.equal(result.handled, false, `${candidate.name} ${key}`);
  }
  assert.deepEqual(runtime.state().actions, [], candidate.name);

  const movement = await runtime.handleInput(keyEvent('arrowRight'));
  const selection = await runtime.handleInput(keyEvent('arrowRight', { shift: true }));
  const wordMovement = await runtime.handleInput(keyEvent('arrowRight', { ctrl: true }));
  assert.equal(movement.handled, true, `${candidate.name} movement`);
  assert.equal(selection.handled, true, `${candidate.name} selection`);
  assert.equal(wordMovement.handled, true, `${candidate.name} word movement`);
  assert.deepEqual(runtime.state().actions, [
    { kind: 'edit', operation: { kind: 'moveRight' } },
    { kind: 'edit', operation: { kind: 'moveRight', select: true } },
    { kind: 'edit', operation: { kind: 'moveWordRight' } }
  ], candidate.name);
}

function runtimeFor(element) {
  const app = defineTui({
    id: 'read-only-control',
    init: () => ({ actions: [] }),
    update: (state, action) => ({ state: { actions: [...state.actions, action] } }),
    view: () => element((action) => action)
  });
  return createTuiRuntime({
    app,
    host: createMemoryTerminalHost({ terminalSize: { columns: 24, rows: 5 } })
  });
}

function keyEvent(key, modifiers = {}) {
  return {
    kind: 'key',
    key,
    modifiers: { ...noModifiers, ...modifiers },
    eventType: 'press',
    location: 'standard'
  };
}
