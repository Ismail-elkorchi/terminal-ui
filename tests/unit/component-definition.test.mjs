import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createTuiRuntime,
  defineTui
} from '../../dist/tui/index.js';
import {
  layoutElement,
  renderFrameDebug,
  renderFramePlain,
  renderElementFrame
} from '../../dist/renderer/index.js';
import { renderElementRegions } from '../../dist/renderer/internal/render.js';
import { createTerminalHarness } from '../../dist/testing/index.js';
import {
  button,
  dataGrid,
  text,
  textArea
} from '../../dist/components/index.js';
import { ComponentExecutionError, defineComponent, ignoreMessage } from '../../dist/component/index.js';
import {
  componentElement as component,
  compositeComponentDefinition,
  leafComponentDefinition
} from '../helpers/component-definition.mjs';
import {
  splitPane,
  column,
  overlay,
  row,
  viewport
} from '../../dist/layout/index.js';

function componentCause(pattern) {
  return (error) => error instanceof ComponentExecutionError
    && error.cause instanceof Error
    && pattern.test(error.cause.message);
}

test('clipped component composites preserve descendant layers and interaction', () => {
  const clipped = component({
    id: 'clipped-composite',
    children: [button({
      id: 'elevated-action',
      label: 'TOP',
      onAction: () => ({ kind: 'activate' }),
      meta: { layer: { zIndex: 20 } }
    })],
    definition: {
      ...compositeComponentDefinition,
      clipChildren: true,
      layout: ({ bounds }) => [bounds],
      accessibility: ({ id, children }) => ({
        id,
        role: 'group',
        label: 'Clipped composite',
        children
      })
    }
  });
  const element = overlay([
    clipped,
    text({ content: 'LOWER', id: 'lower-layer', meta: { layer: { zIndex: 10 } } })
  ]);

  const regions = renderElementRegions(element, { columns: 8, rows: 1 });
  const frame = renderElementFrame(element, { columns: 8, rows: 1 });
  const elevated = regions.find((region) => region.zIndex === 20);

  assert.deepEqual(regions.map((region) => region.zIndex), [0, 10, 20]);
  assert.equal(frame.cells.some((cell) => cell.source?.elementId === 'elevated-action'), true);
  assert.equal(elevated?.focusTargets.some((target) => target.elementId === 'elevated-action'), true);
  assert.equal(elevated?.hitTargets.some((target) => target.id === 'elevated-action:control'), true);
});

test('named slots enforce cardinality, ownership, and child-message policy', () => {
  const captureSlots = {
    content: { cardinality: 'one', owner: 'caller', messages: 'capture' }
  };
  const capturing = defineComponent({
    name: 'terminal-ui-tests/components/capturing-slot',
    identity: 'required',
    structure: 'composite',
    semantics: 'semantic',
    accessibleRole: 'group',
    slots: captureSlots,
    capture: ({ message }) => ({ kind: 'captured', message }),
    measure: ({ slots }) => slots.measure('content'),
    layout: ({ bounds }) => ({ content: bounds }),
    accessibility: ({ id, children }) => ({ id, role: 'group', label: id, children })
  });
  const action = button({
    id: 'captured-action',
    label: 'Run',
    onAction: () => ({ kind: 'child' })
  });
  const element = capturing({
    id: 'capture-owner',
    slots: { content: action },
    onAction: (captured) => ({ kind: 'outer', captured })
  });
  const target = renderElementRegions(element, { columns: 8, rows: 1 })
    .flatMap((region) => region.hitTargets)
    .find((candidate) => candidate.id === 'captured-action:control');

  assert.deepEqual(target?.message({ kind: 'click' }), {
    kind: 'outer',
    captured: { kind: 'captured', message: { kind: 'child' } }
  });
  assert.throws(
    () => capturing({
      id: 'wrong-cardinality',
      slots: { content: [text({ content: 'one' }), text({ content: 'two' })] },
      onAction: (captured) => captured
    }),
    /slot "content" accepts one element/u
  );

  const implementationOwned = defineComponent({
    name: 'terminal-ui-tests/components/implementation-slot',
    identity: 'required',
    structure: 'composite',
    semantics: 'semantic',
    accessibleRole: 'group',
    slots: {
      ornament: { cardinality: 'one', owner: 'implementation', messages: 'bubble' }
    },
    implementationSlots: () => ({ ornament: text({ content: 'internal' }) }),
    measure: ({ slots }) => slots.measure('ornament'),
    layout: ({ bounds }) => ({ ornament: bounds }),
    accessibility: ({ id, children }) => ({ id, role: 'group', label: id, children })
  });
  assert.throws(
    () => implementationOwned({
      id: 'implementation-owner',
      slots: { ornament: text({ content: 'caller override' }) }
    }),
    /unknown or implementation-owned slot "ornament"/u
  );
});

test('component names do not select private focus traversal policies', () => {
  const stack = (name) => component({
    id: 'named-stack',
    children: [
      button({ id: 'first-action', label: 'First', onAction: () => ignoreMessage() }),
      button({ id: 'second-action', label: 'Second', onAction: () => ignoreMessage() })
    ],
    definition: {
      ...compositeComponentDefinition,
      name,
      layout: ({ bounds }) => [
        { ...bounds, height: Math.min(1, bounds.height) },
        {
          ...bounds,
          row: bounds.row + Math.min(1, bounds.height),
          height: Math.max(0, bounds.height - 1)
        }
      ],
      accessibility: ({ id, children }) => ({
        id,
        role: 'group',
        label: 'Named stack',
        children
      })
    }
  });

  assert.deepEqual(
    renderElementFrame(stack('terminal-ui-tests/components/stack'), { columns: 12, rows: 2 }).focusPath,
    ['named-stack', 'first-action']
  );
  assert.deepEqual(
    renderElementFrame(stack('terminal-ui-tests/components/overlay'), { columns: 12, rows: 2 }).focusPath,
    ['named-stack', 'first-action']
  );
});

test('component definitions render through required definition contract', () => {
  let observedFocus;
  const definition = {
    ...leafComponentDefinition,
    accessibleRole: 'button',
    render({ model, bounds, target, focus }) {
      observedFocus = focus;
      target.write(bounds.row, bounds.column, [{
        text: model.label,
        style: { bold: true }
      }]);
    },
    accessibility({ model, id, focused }) {
      return {
        id,
        role: 'button',
        label: model.label,
        ...(focused ? { focused } : {})
      };
    },
    focusTargets({ bounds }) {
      return [{ id: 'self', bounds, cursor: { row: bounds.row, column: bounds.column + 1 } }];
    }
  };
  const element = component({
    id: 'component-board',
    definition,
    label: 'XO'
  });

  const frame = renderElementFrame(element, { columns: 8, rows: 2 }, { focusPath: ['component-board'] });
  const addressed = renderFrameDebug(frame);

  assert.equal(renderFramePlain(frame), 'XO');
  assert.match(addressed, /\u001B\[H/u);
  assert.deepEqual(frame.cursor, {
    row: 1,
    column: 2,
      source: {
        elementId: 'component-board',
        elementKind: 'terminal-ui-tests/components/testLeaf',
        rendererFamily: 'component',
        cellRole: 'cursor',
        partName: 'cursor',
        partType: 'cursor',
        description: 'cursor'
      }
  });
  assert.equal(frame.accessibility.root.role, 'button');
  assert.equal(frame.accessibility.root.label, 'XO');
  assert.equal(frame.accessibility.root.focused, true);
  assert.equal(observedFocus, 'self');
});

test('component accessibility focus must agree with resolved frame focus', () => {
  const focusedWithoutAccessibleFocus = component({
    id: 'focus-without-accessible-focus',
    definition: {
      ...leafComponentDefinition,
      accessibleRole: 'button',
      render() {},
      accessibility: ({ id }) => ({ id, role: 'button', label: id }),
      focusTargets: ({ bounds }) => [{ id: 'self', bounds }]
    }
  });
  assert.throws(
    () => renderElementFrame(focusedWithoutAccessibleFocus, { columns: 20, rows: 1 }),
    /accessibility focus must agree with the resolved frame focus/u
  );

  const passiveWithAccessibleFocus = component({
    id: 'passive-with-accessible-focus',
    definition: {
      ...leafComponentDefinition,
      accessibleRole: 'button',
      render() {},
      accessibility: ({ id }) => ({
        id,
        role: 'button',
        label: id,
        focused: true
      })
    }
  });
  assert.throws(
    () => renderElementFrame(passiveWithAccessibleFocus, { columns: 20, rows: 1 }),
    /accessibility focus must agree with the resolved frame focus/u
  );
});

test('target-shaped component accessibility must identify the resolved focus target', () => {
  const focusTargets = ({ bounds }) => [
    { id: 'left', bounds },
    { id: 'right', bounds }
  ];
  const wrongTarget = component({
    id: 'wrong-target-focus',
    definition: {
      ...leafComponentDefinition,
      accessibleRole: 'group',
      render() {},
      focusTargets,
      accessibility: ({ id }) => ({
        id,
        role: 'group',
        label: id,
        children: [
          { id: 'left', role: 'button', label: 'Left', focused: true },
          { id: 'right', role: 'button', label: 'Right' }
        ]
      })
    }
  });
  assert.throws(
    () => renderElementFrame(
      wrongTarget,
      { columns: 20, rows: 1 },
      { focusPath: ['wrong-target-focus', 'right'] }
    ),
    /must mark resolved focus target "right" as focused/u
  );

  const matchingTarget = component({
    id: 'matching-target-focus',
    definition: {
      ...leafComponentDefinition,
      accessibleRole: 'group',
      render() {},
      focusTargets,
      accessibility: ({ id, focusedTargetId }) => ({
        id,
        role: 'group',
        label: id,
        children: ['left', 'right'].map((targetId) => ({
          id: targetId,
          role: 'button',
          label: targetId,
          ...(focusedTargetId === targetId ? { focused: true } : {})
        }))
      })
    }
  });
  const matchingFrame = renderElementFrame(
    matchingTarget,
    { columns: 20, rows: 1 },
    { focusPath: ['matching-target-focus', 'right'] }
  );
  assert.deepEqual(
    matchingFrame.accessibility.focusPath,
    ['matching-target-focus', 'right']
  );

  const flattened = component({
    id: 'flattened-target-focus',
    definition: {
      ...leafComponentDefinition,
      accessibleRole: 'application',
      render() {},
      focusTargets,
      accessibility: ({ id, focusedTargetId }) => ({
        id,
        role: 'application',
        label: id,
        ...(focusedTargetId === undefined ? {} : { focused: true })
      })
    }
  });
  const flattenedFrame = renderElementFrame(
    flattened,
    { columns: 20, rows: 1 },
    { focusPath: ['flattened-target-focus', 'right'] }
  );
  assert.deepEqual(
    flattenedFrame.accessibility.focusPath,
    ['flattened-target-focus']
  );
});

test('component accessibility validates owned focus once and final focus across children', () => {
  const composite = defineComponent({
    ...compositeComponentDefinition,
    semantics: 'semantic',
    accessibleRole: 'group',
    layout: ({ bounds }) => ({ content: [bounds] }),
    accessibility: ({ id }) => ({
      id,
      role: 'group',
      label: 'Actions',
      children: []
    })
  });
  const element = composite({
    id: 'actions',
    slots: {
      content: [button({
        id: 'child-action',
        label: 'Run',
        onAction: () => ignoreMessage()
      })]
    }
  });

  assert.throws(
    () => renderElementFrame(element, { columns: 12, rows: 1 }),
    /accessibility focus must agree with the resolved frame focus/iu
  );
});

test('component definition output preserves metadata and sanitizes terminal controls', () => {
  const definition = {
    ...leafComponentDefinition,
    accessibleRole: 'application',
    render({ bounds, target }) {
      target.write(bounds.row, bounds.column, [{
        text: '\u001B[31mUnsafe\u001B[0m red \u0007text',
        link: { href: 'https://example.test/\u001B[31mred', id: '\u001B[31mlink' },
        source: {
          elementId: '\u001B[31mcustom-source',
          elementKind: '\u001B[31mcustom-definition',
          rendererFamily: 'component',
          cellRole: 'content',
          description: '\u001B[31munsafe-source'
        }
      }]);
    },
    accessibility({ id }) {
      return {
        id,
        role: 'application',
        label: '\u001B[31mUnsafe component',
        description: 'component \u0007renderer'
      };
    }
  };

  const frame = renderElementFrame(component({ id: 'sanitized-component', definition }), { columns: 32, rows: 2 });
  const first = frame.cells[0];

  assert.equal(renderFramePlain(frame), 'Unsafe red text');
  assert.deepEqual(first?.link, { href: 'https://example.test/red', id: 'link' });
  assert.deepEqual(first?.source, {
    elementId: 'sanitized-component',
    elementKind: 'terminal-ui-tests/components/testLeaf',
    rendererFamily: 'component',
    cellRole: 'content',
    description: 'unsafe-source'
  });
  assert.equal(frame.accessibility.root.label, 'Unsafe component');
  assert.equal(frame.accessibility.root.description, 'component renderer');
  assertNoTerminalControls(frame);
});

test('component render targets are frozen write-only capabilities clipped to element bounds', () => {
  const observedTargets = [];
  const defined = (kind) => {
    const draw = ({ bounds, target }) => {
      observedTargets.push(target);
      const { clear, write, writeCell } = target;
      clear({ row: bounds.row, column: 1, width: 4, height: 1 });
      write(bounds.row, 1, [{ text: 'OVERWRITE' }]);
      writeCell({ row: bounds.row, column: bounds.column, text: 'X', width: 1 });
      clear();
      write(bounds.row, bounds.column, [{ text: 'RIGHT' }]);
    };
    const definition = kind === 'composite' ? {
      ...compositeComponentDefinition,
      accessibleRole: 'text',
      layout: () => [],
      renderBeforeChildren: draw,
      accessibility: ({ id }) => ({ id, role: 'text', label: kind })
    } : {
      ...leafComponentDefinition,
      render({ bounds, target }) {
        draw({ bounds, target });
      },
      accessibility: ({ id }) => ({ id, role: 'text', label: kind })
    };
    return kind === 'composite'
      ? component({ id: kind, children: [], definition })
      : component({ id: kind, definition });
  };

  for (const kind of ['component', 'composite']) {
    const frame = renderElementFrame(row([
      text({ content: 'LEFT', id: `${kind}-left` }),
      defined(kind)
    ], {
      sizes: [{ kind: 'fixed', cells: 5 }, { kind: 'fill' }]
    }), { columns: 12, rows: 1 });

    assert.equal(renderFramePlain(frame), 'LEFT RIGHT');
  }

  for (const target of observedTargets) {
    assert.equal(Object.isFrozen(target), true);
    assert.equal('readCell' in target, false);
    assert.equal('snapshot' in target, false);
    assert.deepEqual(Object.keys(target).sort(), [
      'clear',
      'height',
      'placeGraphic',
      'width',
      'widthProfile',
      'write',
      'writeBlock',
      'writeCell',
      'writeLine'
    ]);
  }
});

test('component accessibility and interaction outputs are validated before publication', () => {
  assert.throws(
    () => renderElementFrame(component({
      id: 'mismatched-accessibility-role',
      definition: {
        ...leafComponentDefinition,
        accessibleRole: 'button',
        render() {},
        accessibility: ({ id }) => ({ id, role: 'text', label: id })
      }
    }), { columns: 8, rows: 1 }),
    /declared accessibility role "button" but produced "text"/u
  );

  assert.throws(
    () => renderElementFrame(component({
      id: 'invalid-accessibility',
      definition: {
        ...leafComponentDefinition,
        accessibleRole: 'button',
        render() {},
        accessibility: () => ({ id: '', role: 'invalid' })
      }
    }), { columns: 8, rows: 1 }),
    /Renderer returned invalid accessibility/u
  );

  assert.throws(
    () => renderElementFrame(component({
      id: 'invalid-hit-bounds',
      definition: {
      ...leafComponentDefinition,
        accessibleRole: 'button',
        render() {},
        accessibility: ({ id }) => ({ id, role: 'button', label: id }),
        hitTargets: () => [{
          id: 'bad-hit',
          bounds: { row: Number.NaN, column: 1, width: 1, height: 1 },
          message: () => undefined
        }]
      }
    }), { columns: 8, rows: 1 }),
    /bounds must use safe-integer coordinates/u
  );

  assert.throws(
    () => renderElementFrame(component({
      id: 'duplicate-focus',
      definition: {
      ...leafComponentDefinition,
        accessibleRole: 'group',
        render() {},
        accessibility: ({ id }) => ({ id, role: 'group', label: id }),
        focusTargets: ({ bounds }) => [
          { id: 'same', bounds },
          { id: 'same', bounds }
        ]
      }
    }), { columns: 8, rows: 1 }),
    /focus target id must be unique/u
  );

  assert.throws(
    () => renderElementFrame(component({
      id: 'invalid-cursor-source',
      definition: {
        ...leafComponentDefinition,
        accessibleRole: 'button',
        render() {},
        accessibility: ({ id, focused }) => ({ id, role: 'button', label: id, focused }),
        focusTargets: ({ bounds }) => [{
          id: 'self',
          bounds,
          cursor: { row: bounds.row, column: bounds.column, source: 'not-an-object' }
        }]
      }
    }), { columns: 8, rows: 1 }),
    /Frame cell source must be an object/u
  );
});

test('component styles reject values outside the public frame contract', () => {
  const invalidStyles = [
    { fg: { kind: 'invalid-color-kind' } },
    { fg: { kind: 'rgb', r: Number.NaN, g: 0, b: 0 } },
    { fg: { kind: 'rgb', r: 0, g: Number.POSITIVE_INFINITY, b: 0 } },
    { fg: { kind: 'ansi', value: -1 } },
    { fg: { kind: 'ansi', value: 256 } },
    { fg: { kind: 'ansi', value: 1.5 } },
    { bold: 'yes' },
    { blink: true },
    { fg: { kind: 'rgb', r: 0, g: 0, b: 0, alpha: 1 } }
  ];

  for (const [index, style] of invalidStyles.entries()) {
    const id = `invalid-defined-style-${String(index)}`;
    assert.throws(
      () => renderElementFrame(component({
        id: `${id}-drawing`,
        definition: {
      ...leafComponentDefinition,
          render({ bounds, target }) {
            target.write(bounds.row, bounds.column, [{ text: 'X', style }]);
          },
          accessibility: ({ id: elementId }) => ({ id: elementId, role: 'text', label: elementId })
        }
      }), { columns: 4, rows: 1 }),
      componentCause(/Component ".*" render span style/u)
    );

    assert.throws(
      () => renderElementFrame(component({
        id: `${id}-cursor`,
        definition: {
      ...leafComponentDefinition,
          accessibleRole: 'button',
          render() {},
          accessibility: ({ id: elementId, focused }) => ({
            id: elementId,
            role: 'button',
            label: elementId,
            ...(focused ? { focused: true } : {})
          }),
          focusTargets: ({ bounds }) => [{
            id: 'self',
            bounds,
            cursor: { row: bounds.row, column: bounds.column, style }
          }]
        }
      }), { columns: 4, rows: 1 }, { focusPath: [`${id}-cursor`] }),
      /Component ".*" focus target "self" cursor style/u
    );
  }
});

test('component styles are admitted as canonical copies', () => {
  const drawingStyle = {
    fg: { kind: 'rgb', r: 1, g: 2, b: 3 },
    bold: true
  };
  const cursorStyle = {
    fg: { kind: 'ansi', value: 4 },
    inverse: true
  };
  const element = component({
    id: 'canonical-defined-styles',
    definition: {
      ...leafComponentDefinition,
      accessibleRole: 'button',
      render({ bounds, target }) {
        target.write(bounds.row, bounds.column, [{ text: 'XY', style: drawingStyle }]);
        drawingStyle.fg.r = Number.NaN;
        drawingStyle.bold = 'invalid';
        cursorStyle.fg.value = 999;
        cursorStyle.inverse = 'invalid';
      },
      accessibility: ({ id, focused }) => ({
        id,
        role: 'button',
        label: id,
        ...(focused ? { focused: true } : {})
      }),
      focusTargets: ({ bounds }) => [{
        id: 'self',
        bounds,
        cursor: {
          row: bounds.row,
          column: bounds.column + 1,
          style: cursorStyle
        }
      }]
    }
  });

  const frame = renderElementFrame(
    element,
    { columns: 4, rows: 1 },
    { focusPath: ['canonical-defined-styles'] }
  );
  const drawingCell = frame.cells.find((cell) => cell.column === 1);
  assert.deepEqual(drawingCell?.style?.fg, { kind: 'rgb', r: 1, g: 2, b: 3 });
  assert.equal(drawingCell?.style?.bold, true);
  assert.deepEqual(frame.cursor?.style, {
    fg: { kind: 'ansi', value: 4 },
    inverse: true
  });
});

test('component focus and hit targets cannot claim sibling bounds', () => {
  const defined = component({
    id: 'bounded-interaction',
    definition: {
      ...leafComponentDefinition,
      accessibleRole: 'button',
      render() {},
      accessibility: ({ id }) => ({ id, role: 'button', label: id }),
      focusTargets: () => [{
        id: 'outside-focus',
        bounds: { row: 1, column: 1, width: 4, height: 1 }
      }],
      hitTargets: () => [{
        id: 'outside-hit',
        bounds: { row: 1, column: 1, width: 4, height: 1 },
        message: () => undefined
      }]
    }
  });
  const frame = renderElementFrame(row([
    text({ content: 'LEFT', id: 'interaction-sibling' }),
    defined
  ], {
    sizes: [{ kind: 'fixed', cells: 5 }, { kind: 'fill' }]
  }), { columns: 12, rows: 1 });

  assert.equal(frame.focusPath, undefined);
  assert.equal(frame.hitTargets, undefined);
});

test('component definition hit targets route mouse messages', async () => {
  const definition = {
    ...leafComponentDefinition,
    accessibleRole: 'button',
    render({ bounds, target }) {
      target.write(bounds.row, bounds.column, [{ text: 'hit' }]);
    },
    accessibility({ id }) {
      return { id, role: 'button', label: 'hit' };
    },
    hitTargets({ bounds }) {
      return [{ id: 'component-hit:press', bounds, message: () => ({ clicked: true }), cursor: 'pointer' }];
    }
  };
  const app = defineTui({
    id: 'component-hit-tui',
    init: () => ({ clicked: false }),
    update: (_state, message) => ({ state: { clicked: message.clicked } }),
    view: () => component({
      id: 'component-hit',
      definition
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 12, rows: 3 } });
  const runtime = createTuiRuntime({
    app,
    host: harness.host,
    input: { mouseReporting: 'drag' }
  });

  await runtime.start();
  const press = await runtime.handleInputChunk({ data: '\u001B[<0;1;1M' });
  const release = await runtime.handleInputChunk({ data: '\u001B[<0;1;1m' });

  assert.equal(press.results[0]?.handled, false);
  assert.equal(release.results[0]?.handled, true);
  assert.deepEqual(runtime.state(), { clicked: true });
  assert.match(renderFramePlain(runtime.frame()), /hit/);
  assert.deepEqual(runtime.frame().hitTargets?.[0], {
    id: 'component-hit:press',
    bounds: { row: 1, column: 1, width: 12, height: 3 },
    cursor: 'pointer',
    zIndex: 0
  });
});

test('component hit targets are adopted before pointer routing', async () => {
  let returned;
  const app = defineTui({
    id: 'owned-hit-tui',
    init: () => ({ clicked: false }),
    update: (_state, message) => ({ state: { clicked: message.clicked } }),
    view: () => component({
      id: 'owned-hit-component',
      definition: {
        ...leafComponentDefinition,
        accessibleRole: 'button',
        render() {},
        accessibility: ({ id }) => ({ id, role: 'button', label: 'Owned hit target' }),
        hitTargets: () => {
          const bounds = { row: 0, column: 0, width: 12, height: 3 };
          const accepts = ['click'];
          const focus = { kind: 'preserve' };
          const target = {
            id: 'owned-hit',
            bounds,
            accepts,
            focus,
            message: () => ({ clicked: true })
          };
          returned = { target, bounds, accepts, focus };
          return [target];
        }
      }
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 12, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host, input: { mouseReporting: 'drag' } });

  await runtime.start();
  await runtime.handleInputChunk({ data: '\u001B[<0;1;1M' });
  const adopted = returned;
  adopted.bounds.row = 2;
  adopted.bounds.width = 1;
  adopted.accepts.length = 0;
  adopted.focus.kind = 'invalid';
  adopted.target.message = () => ({ clicked: false });
  await runtime.handleInputChunk({ data: '\u001B[<0;1;1m' });

  assert.deepEqual(runtime.state(), { clicked: true });
  assert.equal(Object.isFrozen(adopted.bounds), false);
  assert.equal(Object.isFrozen(adopted.accepts), false);
  assert.equal(Object.isFrozen(adopted.focus), false);
});

test('component definitions map keyboard text and paste through one action boundary', async () => {
  const control = defineComponent({
    name: 'terminal-ui-tests/components/action-input',
    identity: 'required',
    structure: 'leaf',
    semantics: 'semantic',
    accessibleRole: 'textbox',
    measure: () => ({ minWidth: 1, minHeight: 1, preferredWidth: 4, preferredHeight: 1 }),
    render({ bounds, target }) {
      target.write(bounds.row, bounds.column, [{ text: 'edit' }]);
    },
    accessibility: ({ id, focused }) => ({
      id,
      role: 'textbox',
      label: 'Editor',
      ...(focused ? { focused } : {})
    }),
    keys: () => ({ enter: () => ({ kind: 'submit' }) }),
    onInput: ({ text }) => ({ kind: 'insert', text }),
    onPaste: ({ text }) => ({ kind: 'paste', text })
  });
  const app = defineTui({
    id: 'defined-action-input',
    init: () => [],
    update: (state, message) => ({ state: [...state, message.action] }),
    view: () => control({
      id: 'action-input',
      onAction: (action) => ({ kind: 'componentAction', action })
    })
  });
  const runtime = createTuiRuntime({
    app,
    host: createTerminalHarness({ terminalSize: { columns: 8, rows: 1 } }).host
  });

  await runtime.start();
  await runtime.handleInput({
    kind: 'key',
    key: 'enter',
    modifiers: { ctrl: false, alt: false, shift: false, meta: false },
    eventType: 'press',
    location: 'standard'
  });
  await runtime.handleInput({ kind: 'text', text: 'x', paste: false });
  await runtime.handleInput({ kind: 'paste', text: 'yz', bracketed: true });

  assert.deepEqual(runtime.state(), [
    { kind: 'submit' },
    { kind: 'insert', text: 'x' },
    { kind: 'paste', text: 'yz' }
  ]);
});

test('component state governs interaction and accessibility without hook duplication', () => {
  const control = defineComponent({
    name: 'terminal-ui-tests/components/stateful-control',
    identity: 'required',
    states: ['disabled', 'busy', 'readOnly'],
    structure: 'leaf',
    semantics: 'semantic',
    accessibleRole: 'textbox',
    measure: () => ({ minWidth: 1, minHeight: 1, preferredWidth: 4, preferredHeight: 1 }),
    render() {},
    accessibility: ({ id, focused }) => ({
      id,
      role: 'textbox',
      label: 'Stateful',
      ...(focused ? { focused } : {})
    }),
    focusTargets: ({ bounds }) => [{ id: 'self', bounds }]
  });

  const disabled = renderElementFrame(control({
    id: 'disabled-defined-control',
    disabled: true
  }), { columns: 8, rows: 1 });
  assert.equal(disabled.focusPath, undefined);
  assert.equal(disabled.accessibility.root.disabled, true);

  const busyReadOnly = renderElementFrame(control({
    id: 'busy-read-only-defined-control',
    busy: true,
    readOnly: true
  }), { columns: 8, rows: 1 });
  assert.deepEqual(busyReadOnly.focusPath, ['busy-read-only-defined-control']);
  assert.equal(busyReadOnly.accessibility.root.busy, true);
  assert.equal(busyReadOnly.accessibility.root.readOnly, true);

  const action = defineComponent({
    name: 'terminal-ui-tests/components/read-only-action',
    identity: 'required',
    states: ['readOnly'],
    structure: 'leaf',
    semantics: 'semantic',
    accessibleRole: 'button',
    measure: () => ({ minWidth: 1, minHeight: 1, preferredWidth: 4, preferredHeight: 1 }),
    render() {},
    accessibility: ({ id }) => ({ id, role: 'button', label: 'Action' })
  });
  assert.throws(
    () => renderElementFrame(action({
      id: 'read-only-action',
      readOnly: true
    }), { columns: 8, rows: 1 }),
    /Accessible readOnly state is not valid on button nodes/u
  );
});

test('inert component subtrees are absent from interaction and accessibility output', () => {
  let childAccessibilityCalls = 0;
  const child = defineComponent({
    name: 'terminal-ui-tests/components/inert-child',
    identity: 'required',
    structure: 'leaf',
    semantics: 'semantic',
    accessibleRole: 'button',
    measure: () => ({ minWidth: 1, minHeight: 1, preferredWidth: 4, preferredHeight: 1 }),
    render() {},
    focusTargets: ({ bounds }) => [{ id: 'self', bounds }],
    accessibility: ({ id, focused }) => {
      childAccessibilityCalls += 1;
      return { id, role: 'button', label: 'Hidden action', ...(focused ? { focused } : {}) };
    }
  });
  const container = defineComponent({
    name: 'terminal-ui-tests/components/inert-container',
    identity: 'required',
    states: ['inert'],
    structure: 'composite',
    semantics: 'semantic',
    accessibleRole: 'group',
    slots: {
      content: { cardinality: 'one', owner: 'caller', messages: 'bubble' }
    },
    measure: ({ slots }) => slots.measure('content'),
    layout: ({ bounds }) => ({ content: bounds }),
    accessibility: ({ id, children }) => ({ id, role: 'group', children })
  });

  const frame = renderElementFrame(container({
    id: 'inert-container',
    inert: true,
    slots: { content: child({ id: 'inert-child' }) }
  }), { columns: 8, rows: 1 });

  assert.equal(frame.focusPath, undefined);
  assert.equal(frame.hitTargets, undefined);
  assert.deepEqual(frame.accessibility.root, {
    id: 'terminal-ui:inert-root',
    role: 'group'
  });
  assert.equal(childAccessibilityCalls, 0);
});

test('inert actionful components ignore unreachable action mappers', () => {
  const actionful = defineComponent({
    name: 'terminal-ui-tests/components/inert-actionful',
    identity: 'required',
    states: ['inert'],
    structure: 'leaf',
    semantics: 'semantic',
    accessibleRole: 'button',
    measure: () => ({ minWidth: 1, minHeight: 1, preferredWidth: 1, preferredHeight: 1 }),
    render() {},
    keys: () => ({ enter: () => ({ kind: 'activate' }) }),
    accessibility: ({ id }) => ({ id, role: 'button', label: 'Action' })
  });

  assert.doesNotThrow(() => actionful({ id: 'inert-actionful', inert: true }));
  assert.doesNotThrow(
    () => actionful({
      id: 'invalid-inert-actionful',
      inert: true,
      onAction: () => ({ kind: 'mapped' })
    })
  );
});

test('component definition key triggers are fully validated at construction', () => {
  const control = defineComponent({
    name: 'terminal-ui-tests/components/invalid-trigger',
    identity: 'required',
    structure: 'leaf',
    semantics: 'semantic',
    accessibleRole: 'button',
    measure: () => ({ minWidth: 1, minHeight: 1, preferredWidth: 1, preferredHeight: 1 }),
    render() {},
    accessibility: ({ id }) => ({ id, role: 'button', label: id }),
    keys: () => ({
      triggers: [{
        trigger: { kind: 'key', key: 'not-a-key' },
        onKey: () => ({ kind: 'activate' })
      }]
    })
  });

  assert.throws(
    () => control({ id: 'invalid-trigger', onAction: (action) => action }),
    /bindable key name/u
  );

  const sequenceControl = defineComponent({
    name: 'terminal-ui-tests/components/invalid-text-sequence',
    identity: 'required',
    structure: 'leaf',
    semantics: 'semantic',
    accessibleRole: 'button',
    measure: () => ({ minWidth: 1, minHeight: 1, preferredWidth: 1, preferredHeight: 1 }),
    render() {},
    accessibility: ({ id }) => ({ id, role: 'button', label: id }),
    keys: () => ({ text: { quit: () => ({ kind: 'activate' }) } })
  });

  assert.throws(
    () => sequenceControl({ id: 'invalid-text-sequence', onAction: (action) => action }),
    /exactly one grapheme/u
  );
});

test('component definitions retain normalized trigger snapshots', async () => {
  const trigger = { kind: 'codePoint', codePoint: 97 };
  const control = defineComponent({
    name: 'terminal-ui-tests/components/owned-trigger',
    identity: 'required',
    structure: 'leaf',
    semantics: 'semantic',
    accessibleRole: 'button',
    measure: () => ({ minWidth: 1, minHeight: 1, preferredWidth: 1, preferredHeight: 1 }),
    render() {},
    accessibility: ({ id, focused }) => ({
      id,
      role: 'button',
      label: id,
      ...(focused ? { focused: true } : {})
    }),
    keys: () => ({
      triggers: [{
        trigger,
        onKey: () => ({ kind: 'activate' })
      }]
    })
  });
  const element = control({
    id: 'owned-trigger',
    onAction: (action) => action
  });
  trigger.codePoint = 98;
  const app = defineTui({
    id: 'owned-component-trigger',
    init: () => ({ activations: 0 }),
    update: (state) => ({ state: { activations: state.activations + 1 } }),
    view: () => element
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 8, rows: 1 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.handleInput({
    kind: 'key',
    key: 'a',
    keyCodePoint: 97,
    modifiers: { ctrl: false, alt: false, shift: false, meta: false },
    eventType: 'press',
    location: 'standard'
  });

  assert.equal(runtime.state().activations, 1);
});

test('component definition measurement participates in content track layout', () => {
  const measured = component({
    id: 'measured-component',
    definition: {
      ...leafComponentDefinition,
      measure() {
        return {
          minWidth: 3,
          minHeight: 1,
          preferredWidth: 9,
          preferredHeight: 2
        };
      },
      render({ bounds, target }) {
        target.write(bounds.row, bounds.column, [{ text: 'component' }]);
      },
      accessibility({ id }) {
        return { id, role: 'text', label: 'component' };
      }
    }
  });
  const element = splitPane([
    measured,
    text({ content: 'remaining', id: 'remaining' })
  ], {
    id: 'component-measured-pane',
    direction: 'horizontal',
    sizes: [{ kind: 'content' }, { kind: 'fill' }]
  });

  const layout = layoutElement(element, { columns: 24, rows: 4 });
  const frame = renderElementFrame(element, { columns: 24, rows: 4 });

  assert.deepEqual(layout.children[0]?.bounds, { row: 1, column: 1, width: 9, height: 4 });
  assert.deepEqual(layout.children[1]?.bounds, { row: 1, column: 10, width: 15, height: 4 });
  assert.match(renderFramePlain(frame), /component/u);
});

test('layout measures children only for content-sized tracks', () => {
  let measurementCalls = 0;
  const measured = component({
    id: 'demand-measured-component',
    definition: {
      ...leafComponentDefinition,
      measure() {
        measurementCalls += 1;
        return {
          minWidth: 2,
          minHeight: 1,
          preferredWidth: 7,
          preferredHeight: 1
        };
      },
      render({ bounds, target }) {
        target.write(bounds.row, bounds.column, [{ text: 'component' }]);
      },
      accessibility({ id }) {
        return { id, role: 'text', label: 'component' };
      }
    }
  });

  const fixedAndFill = row([
    measured,
    text({ content: 'remaining', id: 'demand-remaining' })
  ], {
    sizes: [{ kind: 'fixed', cells: 7 }, { kind: 'fill' }]
  });
  layoutElement(fixedAndFill, { columns: 24, rows: 2 });
  assert.equal(measurementCalls, 0);

  const contentAndFill = row([
    measured,
    text({ content: 'remaining', id: 'demand-content-remaining' })
  ], {
    sizes: [{ kind: 'content' }, { kind: 'fill' }]
  });
  const layout = layoutElement(contentAndFill, { columns: 24, rows: 2 });

  assert.equal(measurementCalls, 1);
  assert.equal(layout.children[0]?.bounds.width, 7);
});

test('component measurements are intrinsic and cached by constraints', () => {
  const measuredConstraints = [];
  const positioned = component({
    id: 'position-measured-component',
    definition: {
      ...leafComponentDefinition,
      measure({ constraints }) {
        measuredConstraints.push(constraints);
        return {
          minWidth: 1,
          minHeight: 1,
          preferredWidth: 2,
          preferredHeight: 1
        };
      },
      render({ bounds, target }) {
        target.write(bounds.row, bounds.column, [{ text: 'x' }]);
      },
      accessibility({ id }) {
        return { id, role: 'text', label: id };
      }
    }
  });
  const branch = row([positioned, text({ content: 'fill' })], {
    sizes: [{ kind: 'content' }, { kind: 'fill' }]
  });
  const element = row([branch, branch], {
    sizes: [{ kind: 'fixed', cells: 10 }, { kind: 'fixed', cells: 10 }]
  });

  const layout = layoutElement(element, { columns: 20, rows: 2 });

  assert.deepEqual(measuredConstraints, [{ width: 10, height: 2 }]);
  assert.equal(layout.children[0]?.children[0]?.bounds.width, 2);
  assert.equal(layout.children[1]?.children[0]?.bounds.width, 2);
});

test('component composites derive intrinsic size from opaque children under the active width profile', () => {
  let measuredProfile;
  let measuredChildren = 0;
  const composite = component({
    id: 'measured-composite',
    children: [text({ content: '··', id: 'ambiguous-child' })],
    definition: {
      ...compositeComponentDefinition,
      measure({ childCount, measureChild, widthProfile }) {
        measuredProfile = widthProfile;
        measuredChildren = childCount;
        return measureChild(0);
      },
      layout({ bounds }) {
        return [bounds];
      },
      accessibility({ id }) {
        return { id, role: 'group', label: 'Measured composite' };
      }
    }
  });
  const element = row([composite, text({ content: 'fill' })], {
    sizes: [{ kind: 'content' }, { kind: 'fill' }]
  });
  const widthProfile = { emoji: 'wide', ambiguous: 'wide' };

  const layout = layoutElement(element, { columns: 12, rows: 1 }, undefined, widthProfile);

  assert.deepEqual(measuredProfile, widthProfile);
  assert.equal(measuredChildren, 1);
  assert.equal(layout.children[0]?.bounds.width, 4);
});

test('component hooks have the same receiver-independent invocation contract', () => {
  const receivers = [];
  const plain = component({
    id: 'receiver-free-component',
    definition: {
      ...leafComponentDefinition,
      render() {
        receivers.push(this);
      },
      accessibility({ id }) {
        receivers.push(this);
        return { id, role: 'text', label: id };
      }
    }
  });
  const composite = component({
    id: 'receiver-free-composite',
    children: [text({ content: 'child' })],
    definition: {
      ...compositeComponentDefinition,
      layout({ bounds }) {
        receivers.push(this);
        return [bounds];
      },
      renderBeforeChildren() {
        receivers.push(this);
      },
      accessibility({ id }) {
        receivers.push(this);
        return { id, role: 'group', label: id };
      }
    }
  });

  renderElementFrame(column([plain, composite], {
    sizes: [{ kind: 'fixed', cells: 1 }, { kind: 'fixed', cells: 1 }]
  }), { columns: 8, rows: 2 });
  assert.equal(receivers.length, 5);
  assert.equal(receivers.every((receiver) => receiver === undefined), true);
});

test('invalid component measurements are rejected instead of silently normalized', () => {
  const element = component({
    id: 'invalid-measurement',
    definition: {
      ...leafComponentDefinition,
      measure: () => ({
        minWidth: 4,
        minHeight: 1,
        preferredWidth: 2,
        preferredHeight: 1
      }),
      render() {},
      accessibility: ({ id }) => ({ id, role: 'text', label: id })
    }
  });

  assert.throws(
    () => layoutElement(row([element], { sizes: [{ kind: 'content' }] }), { columns: 8, rows: 1 }),
    /preferredWidth must not be less than minWidth/u
  );
});

test('valid component measurements are adopted in one pass', () => {
  const reads = new Map();
  const measurement = {};
  for (const [field, value] of [
    ['minWidth', 1],
    ['minHeight', 1],
    ['preferredWidth', 3],
    ['preferredHeight', 1],
    ['maxWidth', undefined],
    ['maxHeight', undefined]
  ]) {
    Object.defineProperty(measurement, field, {
      enumerable: true,
      get() {
        reads.set(field, (reads.get(field) ?? 0) + 1);
        return value;
      }
    });
  }
  const element = component({
    id: 'owned-measurement',
    definition: {
      ...leafComponentDefinition,
      measure: () => measurement,
      render() {},
      accessibility: ({ id }) => ({ id, role: 'text', label: id })
    }
  });

  layoutElement(row([element], { sizes: [{ kind: 'content' }] }), { columns: 8, rows: 1 });

  assert.deepEqual(Object.fromEntries(reads), {
    minWidth: 1,
    minHeight: 1,
    preferredWidth: 1,
    preferredHeight: 1,
    maxWidth: 1,
    maxHeight: 1
  });
});

test('component composites accept clipped child coordinates inside a scrolled parent', () => {
  const composite = component({
    id: 'scrolled-composite',
    children: [
      text({ content: 'offscreen', id: 'offscreen-child' }),
      text({ content: 'visible', id: 'visible-child' })
    ],
    definition: {
      ...compositeComponentDefinition,
      measure() {
        return {
          minWidth: 1,
          minHeight: 1,
          preferredWidth: 12,
          preferredHeight: 9
        };
      },
      layout({ bounds }) {
        return [
          { ...bounds, height: 1 },
          { ...bounds, row: bounds.row + 8, height: 1 }
        ];
      },
      accessibility({ id, children }) {
        return { id, role: 'group', label: 'Scrolled composite', children };
      }
    }
  });
  const frame = renderElementFrame(viewport(composite, {
    id: 'scrolled-composite-viewport',
    offset: { row: 8 }
  }), { columns: 12, rows: 3 });

  assert.match(renderFramePlain(frame), /visible/u);
  assert.doesNotMatch(renderFramePlain(frame), /offscreen/u);
});

test('component composites still reject invalid sizes and relative overflow', () => {
  const composite = (layout) => component({
    id: 'invalid-composite',
    children: [text({ content: 'child' })],
    definition: {
      ...compositeComponentDefinition,
      layout,
      accessibility({ id }) {
        return { id, role: 'group', label: 'Invalid composite' };
      }
    }
  });

  assert.throws(
    () => renderElementFrame(composite(({ bounds }) => [{ ...bounds, width: -1 }]), { columns: 8, rows: 2 }),
    componentCause(/returned bounds outside its parent/u)
  );
  assert.throws(
    () => renderElementFrame(composite(({ bounds }) => [{ ...bounds, row: bounds.row - 1 }]), { columns: 8, rows: 2 }),
    componentCause(/returned bounds outside its parent/u)
  );
  assert.throws(
    () => renderElementFrame(composite(({ bounds }) => [{ ...bounds, column: bounds.column + 0.5 }]), { columns: 8, rows: 2 }),
    componentCause(/returned bounds outside its parent/u)
  );
  assert.throws(
    () => renderElementFrame(composite(() => undefined), { columns: 8, rows: 2 }),
    componentCause(/slot "content" returned invalid bounds/u)
  );
});

test('malformed component definitions fail as programmer errors', () => {
  assert.throws(
    () => defineComponent({
      name: 'terminal-ui-tests/components/missing-role',
      identity: 'required',
      structure: 'leaf',
      semantics: 'semantic',
      measure: () => ({ minWidth: 0, minHeight: 0, preferredWidth: 0, preferredHeight: 0 }),
      render() {},
      accessibility: ({ id }) => ({ id, role: 'text', label: id })
    }),
    /accessibleRole must be an accessibility role or resolver/u
  );
  assert.throws(
    () => defineComponent(undefined),
    /Component definition must be an object/u
  );
  assert.throws(
    () => defineComponent([]),
    /Component definition must be an object/u
  );
  assert.throws(
    () => component({
      id: 'unsafe-name',
      definition: {
        ...leafComponentDefinition,
        accessibleRole: 'group',
        name: 'unsafe\u001B[31m',
        render() {},
        accessibility({ id }) {
          return { id, role: 'group', label: 'Unsafe' };
        }
      }
    }),
    /name must be a safe package-qualified identifier/u
  );
  assert.throws(
    () => component({
      id: 'bad-accessibility-hook',
      definition: {
        ...leafComponentDefinition,
        render() {},
        accessibility: 'not-a-function'
      }
    }),
    /requires accessibility/u
  );
});

test('component instances ignore unknown component-specific options and reject malformed shared state', () => {
  const control = defineComponent({
    name: 'terminal-ui-tests/components/validated-control',
    identity: 'required',
    states: ['disabled'],
    structure: 'leaf',
    semantics: 'semantic',
    accessibleRole: 'button',
    measure: () => ({ minWidth: 1, minHeight: 1, preferredWidth: 1, preferredHeight: 1 }),
    render() {},
    accessibility: ({ id }) => ({ id, role: 'button', label: id })
  });
  const invalidOptions = [
    [{ disabled: 'yes' }, /disabled must be a boolean/u],
    [{ busy: true }, /does not declare the busy capability/u],
    [{ onInput: () => undefined }, /onInput behavior must be declared by the definition/u]
  ];

  assert.doesNotThrow(() => control({ id: 'extra-field', applicationData: 42 }));
  for (const [options, expected] of invalidOptions) {
    assert.throws(() => control({ id: 'invalid-instance', ...options }), expected);
  }
});

test('component instances adopt shared metadata once before retaining it', () => {
  let layerReads = 0;
  let rootStyleReads = 0;
  const element = button({
    id: 'adopted-metadata',
    label: 'Action',
    onAction: () => ignoreMessage(),
    meta: {
      layer: {
        get zIndex() {
          layerReads += 1;
          return layerReads === 1 ? 20 : 'invalid-after-validation';
        }
      },
      styles: {
        get root() {
          rootStyleReads += 1;
          return { bold: true };
        }
      }
    }
  });

  const regions = renderElementRegions(element, { columns: 10, rows: 1 });
  assert.equal(layerReads, 1);
  assert.equal(rootStyleReads, 1);
  assert.equal(regions.at(-1)?.zIndex, 20);

  const path = ['child'];
  const scoped = defineComponent({
    name: 'terminal-ui-tests/components/owned-focus-path',
    identity: 'optional',
    structure: 'leaf',
    semantics: 'semantic',
    accessibleRole: 'group',
    focusScope: () => ({
      kind: 'contain',
      initialFocus: { kind: 'path', path },
      restore: true
    }),
    measure: () => ({ minWidth: 0, minHeight: 0, preferredWidth: 0, preferredHeight: 0 }),
    render() {},
    accessibility: () => ({ id: 'owned-focus-path', role: 'group', label: 'Owned focus path' })
  });
  scoped({});
  assert.equal(Object.isFrozen(path), false);
});

test('component definition hook results are not replaced with definition fallbacks', () => {
  const element = component({
    id: 'missing-accessibility-result',
    definition: {
      ...leafComponentDefinition,
      render() {},
      accessibility() {
        return undefined;
      }
    }
  });
  assert.throws(
    () => renderElementFrame(element, { columns: 10, rows: 2 }),
    TypeError
  );
});

test('component definition focus targets require stable ids', () => {
  const definition = {
    ...leafComponentDefinition,
    accessibleRole: 'button',
    render({ bounds, target }) {
      target.write(bounds.row, bounds.column, [{ text: 'focus' }]);
    },
    accessibility({ id }) {
      return { id, role: 'button', label: 'focus' };
    },
    focusTargets({ bounds }) {
      return [{ id: '', bounds }];
    }
  };

  assert.throws(
    () => renderElementFrame(component({ id: 'bad-focus-target', definition }), { columns: 10, rows: 2 }),
    /focus target id must be a non-empty string/u
  );
});

test('composed keyboard handlers do not create an implicit container focus target', () => {
  const slots = {
    content: { cardinality: 'one', owner: 'caller', messages: 'bubble' }
  };
  const container = defineComponent({
    name: 'terminal-ui-tests/components/keyboard-container',
    identity: 'required',
    structure: 'composed',
    semantics: 'semantic',
    accessibleRole: 'group',
    slots,
    keys: () => ({ escape: () => ({ kind: 'dismiss' }) }),
    compose: ({ slots: content }) => content.content,
    accessibility: ({ id, children }) => ({
      id,
      role: 'group',
      label: 'Keyboard container',
      children
    })
  });
  const element = container({
    id: 'keyboard-container',
    slots: {
      content: button({
        id: 'keyboard-container-action',
        label: 'Action',
        onAction: () => ignoreMessage()
      })
    },
    onAction: () => ignoreMessage()
  });

  const layout = layoutElement(element, { columns: 20, rows: 1 });
  const frame = renderElementFrame(element, { columns: 20, rows: 1 });

  assert.deepEqual(layout.focusTargets, []);
  assert.deepEqual(frame.accessibility.focusPath, [
    'keyboard-container',
    'keyboard-container-action'
  ]);
});

test('component definition hit targets resolve explicitly declared focus targets', () => {
  const definition = {
    ...leafComponentDefinition,
    accessibleRole: 'group',
    render({ bounds, target }) {
      target.write(bounds.row, bounds.column, [{ text: 'focusable' }]);
    },
    accessibility({ id, focusedTargetId }) {
      return {
        id,
        role: 'group',
        label: 'focusable',
        children: [{
          id: 'control',
          role: 'button',
          label: 'focusable',
          ...(focusedTargetId === 'control' ? { focused: true } : {})
        }]
      };
    },
    focusTargets({ bounds }) {
      return [{ id: 'control', bounds }];
    },
    hitTargets({ bounds }) {
      return [{
        id: 'focusable:hit',
        bounds,
        accepts: ['pointerDown'],
        focus: { kind: 'target', targetId: 'control' },
        message: () => undefined
      }];
    }
  };
  const frame = renderElementFrame(component({ id: 'focusable', definition }), { columns: 12, rows: 1 });

  assert.deepEqual(frame.hitTargets?.[0]?.focus, { kind: 'focus', path: ['focusable', 'control'] });
});

test('viewport bounds component rendering, focus, pointer, and accessibility to one visible window', () => {
  const observedViewports = [];
  const definition = {
    ...leafComponentDefinition,
    accessibleRole: 'listbox',
    measure({ model }) {
      return {
        minWidth: 1,
        minHeight: 1,
        preferredWidth: Math.max(...model.rows.map((line) => line.length)),
        preferredHeight: model.rows.length
      };
    },
    render({ model, bounds, viewport: visible, target }) {
      observedViewports.push(visible);
      for (let index = 0; index < model.rows.length; index += 1) {
        target.write(bounds.row + index, bounds.column, [{ text: model.rows[index] }]);
      }
    },
    accessibility({ model, bounds, viewport: visible, id, focusedTargetId }) {
      observedViewports.push(visible);
      const start = Math.max(0, visible.row - bounds.row);
      return {
        id,
        role: 'listbox',
        label: 'Rows',
        children: model.rows.slice(start, start + visible.height).map((label, index) => {
          const rowId = `row-${String(start + index)}`;
          return {
            id: rowId,
            role: 'option',
            label,
            ...(focusedTargetId === rowId ? { focused: true } : {})
          };
        })
      };
    },
    focusTargets({ model, bounds, viewport: visible }) {
      observedViewports.push(visible);
      return model.rows.map((_label, index) => ({
        id: `row-${String(index)}`,
        bounds: { row: bounds.row + index, column: bounds.column, width: bounds.width, height: 1 }
      }));
    },
    hitTargets({ model, bounds, viewport: visible }) {
      observedViewports.push(visible);
      return model.rows.map((_label, index) => ({
        id: `row-${String(index)}:hit`,
        bounds: { row: bounds.row + index, column: bounds.column, width: bounds.width, height: 1 },
        message: () => index
      }));
    }
  };
  const frame = renderElementFrame(viewport(component({
    id: 'rows',
    rows: ['zero', 'one', 'two', 'three', 'four'],
    definition
  }), {
    id: 'rows-window',
    offset: { row: 2 }
  }), { columns: 8, rows: 2 });

  assert.match(renderFramePlain(frame), /^two↑\nthree$/u);
  assert.deepEqual(frame.accessibility.root.children?.[0]?.children?.map((node) => node.id), ['row-2', 'row-3']);
  assert.deepEqual(frame.hitTargets?.map((target) => [target.id, target.bounds]), [
    ['row-2:hit', { row: 1, column: 1, width: 8, height: 1 }],
    ['row-3:hit', { row: 2, column: 1, width: 8, height: 1 }]
  ]);
  assert.deepEqual(frame.focusPath, ['rows-window', 'rows', 'row-2']);
  assert.deepEqual(
    observedViewports,
    observedViewports.map(() => ({ row: 2, column: 0, width: 8, height: 2 }))
  );
});

test('component definition hit targets reject unavailable focus targets', () => {
  const definition = {
    ...leafComponentDefinition,
    accessibleRole: 'button',
    render({ bounds, target }) {
      target.write(bounds.row, bounds.column, [{ text: 'invalid' }]);
    },
    accessibility({ id }) {
      return { id, role: 'button', label: 'invalid' };
    },
    focusTargets({ bounds }) {
      return [{ id: 'control', bounds }];
    },
    hitTargets({ bounds }) {
      return [{
        id: 'invalid:hit',
        bounds,
        focus: { kind: 'target', targetId: 'missing' },
        message: () => undefined
      }];
    }
  };

  assert.throws(
    () => renderElementFrame(component({ id: 'invalid', definition }), { columns: 12, rows: 1 }),
    /refers to unavailable focus target/u
  );
});

test('component definitions must provide accessibility unless explicitly decorative', () => {
  const visualComponent = {
    ...leafComponentDefinition,
    measure() {
      return {
        minWidth: 1,
        minHeight: 1,
        preferredWidth: 5,
        preferredHeight: 1
      };
    },
    render({ bounds, target }) {
      target.write(bounds.row, bounds.column, [{ text: 'decor' }]);
    }
  };
  const accessibleFrame = renderElementFrame(column([
    component({
      id: 'decorative-component',
      definition: { ...visualComponent, semantics: 'decorative' }
    }),
    text({ content: 'label', id: 'label' })
  ]), { columns: 20, rows: 3 });

  assert.equal(renderFramePlain(accessibleFrame), 'decor\nlabel');
  assert.deepEqual(accessibleFrame.accessibility.root.children?.map((node) => node.id), ['label']);
  assert.throws(
    () => component({ id: 'missing-a11y', definition: visualComponent }),
    /requires accessibility/u
  );
});

test('decorative components reject unreachable accessibility hooks', () => {
  let accessibilityCalls = 0;
  assert.throws(
    () => component({
      id: 'decorative-component-dead-accessibility',
      definition: {
      ...leafComponentDefinition,
        semantics: 'decorative',
        render() {},
        accessibility: ({ id }) => {
          accessibilityCalls += 1;
          return { id, role: 'text', label: id };
        }
      }
    }),
    /cannot define accessibility/u
  );
  assert.equal(accessibilityCalls, 0);
});

test('decorative component definitions cannot expose interaction targets', () => {
  const interactiveComponent = {
    ...leafComponentDefinition,
    semantics: 'decorative',
    render({ bounds, target }) {
      target.write(bounds.row, bounds.column, [{ text: 'button' }]);
    },
    hitTargets({ bounds }) {
      return [{ id: 'press', bounds, message: () => ({ pressed: true }) }];
    }
  };

  assert.throws(
    () => renderElementFrame(component({
        id: 'decorative-button',
        definition: interactiveComponent
      }), { columns: 12, rows: 1 }),
    /cannot declare state or interaction/u
  );
});

test('decorative elements reject interaction throughout their subtree', () => {
  assert.throws(
    () => renderElementFrame(column([
      button({ id: 'decorative-child-button', label: 'Press', onAction: () => ({ kind: 'press' }) })
    ], {
      id: 'decorative-parent',
      meta: { accessibility: { decorative: true } }
    }), { columns: 12, rows: 1 }),
    /Decorative renderNode "decorative-child-button" cannot define keyboard interaction/u
  );

  assert.throws(
    () => renderElementFrame(component({
      id: 'decorative-pointer',
      definition: { ...leafComponentDefinition, semantics: 'decorative', render() {} },
      pointer: { onAction: () => ({ kind: 'pointer' }) }
    }), { columns: 12, rows: 1 }),
    /pointer behavior must be declared by the definition/u
  );
});

test('decorative component definitions cannot erase child semantics', () => {
  assert.throws(
    () => component({
      id: 'decorative-composite',
      children: [text({ content: 'ornament', id: 'ornament' })],
      definition: {
        ...compositeComponentDefinition,
        semantics: 'decorative',
        layout: ({ bounds }) => [bounds]
      }
    }),
    /Decorative component definitions must be leaf components/u
  );
});

test('component composites arrange opaque children while preserving interaction and accessibility', async () => {
  let accessibleChildIds = [];
  const app = defineTui({
    id: 'component-composite-tui',
    init: () => ({ selected: 'none' }),
    update: (_state, message) => ({ state: { selected: message.kind } }),
    view: (state) => component({
      id: 'component-actions',
      selected: state.selected,
      children: [
        button({
          id: 'save',
          label: 'Save',
          onAction: () => ({ kind: 'save' })
        }),
        button({
          id: 'cancel',
          label: 'Cancel',
          onAction: () => ({ kind: 'cancel' })
        })
      ],
      definition: {
        ...compositeComponentDefinition,
        layout({ bounds }) {
          return [
            { ...bounds, width: Math.floor(bounds.width / 2) },
            {
              ...bounds,
              column: bounds.column + Math.floor(bounds.width / 2),
              width: bounds.width - Math.floor(bounds.width / 2)
            }
          ];
        },
        renderAfterChildren({ model, bounds, target }) {
          target.write(bounds.row + 1, bounds.column, [{ text: `selected:${model.selected}` }]);
        },
        accessibility({ id, children }) {
          accessibleChildIds = children.map((child) => child.id);
          return { id, role: 'group', label: 'Actions', children };
        }
      }
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 24, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host, initialFocus: { kind: 'path', path: ['component-actions', 'save'] } });

  await runtime.start();
  await runtime.handleInput({
    kind: 'key',
    key: 'enter',
    modifiers: { ctrl: false, alt: false, shift: false, meta: false },
    eventType: 'press',
    location: 'standard'
  });

  assert.equal(runtime.state().selected, 'save');
  assert.deepEqual(accessibleChildIds, ['save', 'cancel']);
  assert.deepEqual(runtime.frame().accessibility.root.children?.map((child) => child.id), ['save', 'cancel']);
  assert.match(renderFramePlain(runtime.frame()), /Save.*Cancel/u);
  assert.match(renderFramePlain(runtime.frame()), /selected:save/u);
  await runtime.dispose();
});

test('component accessibility slots follow their render roots after inaccessible children are filtered', () => {
  const ornament = defineComponent({
    name: 'terminal-ui-tests/components/slot-ornament',
    identity: 'optional',
    structure: 'leaf',
    semantics: 'decorative',
    measure: () => ({ minWidth: 0, minHeight: 0, preferredWidth: 0, preferredHeight: 0 }),
    render() {}
  });
  let received;
  const slotted = defineComponent({
    name: 'terminal-ui-tests/components/accessibility-slots',
    identity: 'required',
    structure: 'composite',
    semantics: 'semantic',
    accessibleRole: 'group',
    slots: {
      ornament: { cardinality: 'optional', owner: 'caller', messages: 'none' },
      body: { cardinality: 'one', owner: 'caller', messages: 'bubble' }
    },
    measure: ({ slots }) => slots.measure('body'),
    layout: ({ bounds }) => ({ ornament: bounds, body: bounds }),
    accessibility: ({ id, slots }) => {
      received = slots;
      return { id, role: 'group', children: slots.body };
    }
  });

  renderElementFrame(slotted({
    id: 'slot-owner',
    slots: {
      ornament: ornament({}),
      body: text({ id: 'body', content: 'Body' })
    }
  }), { columns: 8, rows: 1 });

  assert.deepEqual(received.ornament, []);
  assert.deepEqual(received.body.map((node) => node.id), ['body']);
});

test('composed component accessibility uses declared slot names and optional slots need no empty object', () => {
  let received;
  const composed = defineComponent({
    name: 'terminal-ui-tests/components/composed-named-slots',
    identity: 'required',
    structure: 'composed',
    semantics: 'semantic',
    accessibleRole: 'group',
    slots: {
      body: { cardinality: 'one', owner: 'caller', messages: 'bubble' },
      note: { cardinality: 'optional', owner: 'caller', messages: 'bubble' }
    },
    compose: ({ slots }) => column([
      slots.body,
      ...(slots.note === undefined ? [] : [slots.note])
    ]),
    accessibility: ({ id, slots }) => {
      received = slots;
      return { id, role: 'group', children: [...slots.body, ...slots.note] };
    }
  });
  const optionalOnly = defineComponent({
    name: 'terminal-ui-tests/components/optional-only-slot',
    identity: 'required',
    structure: 'composed',
    semantics: 'semantic',
    accessibleRole: 'group',
    slots: {
      note: { cardinality: 'optional', owner: 'caller', messages: 'bubble' }
    },
    compose: ({ slots }) => slots.note ?? text({ content: '' }),
    accessibility: ({ id, slots }) => ({ id, role: 'group', children: slots.note })
  });

  renderElementFrame(composed({
    id: 'composed-owner',
    slots: { body: text({ id: 'composed-body', content: 'Body' }) }
  }), { columns: 8, rows: 1 });
  renderElementFrame(optionalOnly({ id: 'optional-owner' }), { columns: 8, rows: 1 });

  assert.deepEqual(Object.keys(received).sort(), ['body', 'note']);
  assert.deepEqual(received.body.map((node) => node.id), ['composed-body']);
  assert.deepEqual(received.note, []);
  assert.equal('content' in received, false);
});

test('component preparation treats retained models as opaque', () => {
  let ownKeyReads = 0;
  const retained = new Proxy({ entries: Object.freeze([Object.freeze({ id: 'one' })]) }, {
    ownKeys(target) {
      ownKeyReads += 1;
      return Reflect.ownKeys(target);
    }
  });
  Object.freeze(retained);
  ownKeyReads = 0;

  const retainedModel = defineComponent({
    name: 'terminal-ui-tests/components/retained-model',
    identity: 'required',
    structure: 'leaf',
    semantics: 'semantic',
    accessibleRole: 'group',
    prepare: (value) => value.model,
    measure: () => ({ minWidth: 0, minHeight: 0, preferredWidth: 0, preferredHeight: 0 }),
    render: () => undefined,
    accessibility: ({ id }) => ({ id, role: 'group', label: id })
  });

  retainedModel({ id: 'first', model: retained });
  retainedModel({ id: 'second', model: retained });

  assert.equal(ownKeyReads, 0);
});

test('component-owned prepared models may use domain objects', () => {
  const domainModel = defineComponent({
    name: 'terminal-ui-tests/components/domain-model',
    identity: 'required',
    structure: 'leaf',
    semantics: 'semantic',
    accessibleRole: 'group',
    prepare: (value) => value.model,
    measure: () => ({ minWidth: 0, minHeight: 0, preferredWidth: 0, preferredHeight: 0 }),
    render: () => undefined,
    accessibility: ({ id, model }) => ({ id, role: 'group', label: String(model.size) })
  });
  const supplied = new Map([['one', 1]]);
  assert.doesNotThrow(() => domainModel({ id: 'map', model: supplied }));
});

test('component preparation may retain custom domain instances', () => {
  class DomainRecord {
    constructor(label) {
      this.label = label;
    }
  }
  const retainedDomain = defineComponent({
    name: 'terminal-ui-tests/components/retained-domain-instance',
    identity: 'required',
    structure: 'leaf',
    semantics: 'semantic',
    accessibleRole: 'group',
    prepare: (value) => ({ domain: value.model }),
    measure: () => ({ minWidth: 0, minHeight: 0, preferredWidth: 0, preferredHeight: 0 }),
    render: () => undefined,
    accessibility: ({ id }) => ({ id, role: 'group', label: id })
  });
  const domain = new DomainRecord('Projected');

  assert.doesNotThrow(() => retainedDomain({ id: 'retained-domain', model: domain }));
});

test('built-in factories reject malformed nested options where they are consumed', () => {
  assert.throws(() => dataGrid({
    id: 'dataGrid',
    rows: [],
    getRowId: () => 'row',
    presentation: null,
    onTransition: (transition) => transition
  }), /dataGrid presentation/u);
  assert.throws(() => textArea({
    id: 'editor',
    presentation: null,
    onAction: (action) => action
  }), componentCause(/textArea presentation/u));
});

function assertNoTerminalControls(value) {
  if (typeof value === 'string') {
    assert.doesNotMatch(value, /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]|\u001B/u);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) assertNoTerminalControls(item);
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) assertNoTerminalControls(item);
  }
}
