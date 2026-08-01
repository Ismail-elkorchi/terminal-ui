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
import { button, text } from '../../dist/components/index.js';
import { custom } from '../../dist/component/index.js';
import {
  compositeRendererDefinition,
  leafRendererDefinition
} from '../helpers/custom-renderer.mjs';
import {
  splitPane,
  column,
  overlay,
  row,
  viewport
} from '../../dist/layout/index.js';

test('clipped custom composites preserve descendant layers and interaction', () => {
  const clipped = custom({
    id: 'clipped-composite',
    children: [button({
      id: 'elevated-action',
      label: 'TOP',
      onPress: () => ({ kind: 'activate' }),
      meta: { layer: { zIndex: 20 } }
    })],
    renderer: {
      ...compositeRendererDefinition,
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
    text('LOWER', { id: 'lower-layer', meta: { layer: { zIndex: 10 } } })
  ]);

  const regions = renderElementRegions(element, { columns: 8, rows: 1 });
  const frame = renderElementFrame(element, { columns: 8, rows: 1 });
  const elevated = regions.find((region) => region.zIndex === 20);

  assert.deepEqual(regions.map((region) => region.zIndex), [0, 10, 20]);
  assert.equal(frame.cells.some((cell) => cell.source?.elementId === 'elevated-action'), true);
  assert.equal(elevated?.focusTargets.some((target) => target.elementId === 'elevated-action'), true);
  assert.equal(elevated?.hitTargets.some((target) => target.id === 'elevated-action:control'), true);
});

test('custom renderers render through required renderer contract', () => {
  let observedFocus;
  const renderer = {
    ...leafRendererDefinition,
    render({ state, bounds, target, focus }) {
      observedFocus = focus;
      target.write(bounds.row, bounds.column, [{
        text: state.label,
        style: { bold: true }
      }]);
    },
    accessibility({ state, id, focused }) {
      return {
        id,
        role: 'button',
        label: state.label,
        ...(focused ? { focused } : {})
      };
    },
    focusTargets({ bounds }) {
      return [{ id: 'self', bounds, cursor: { row: bounds.row, column: bounds.column + 1 } }];
    }
  };
  const element = custom({
    id: 'custom-board',
    renderer,
    state: { label: 'XO' }
  });

  const frame = renderElementFrame(element, { columns: 8, rows: 2 }, { focusPath: ['custom-board'] });
  const addressed = renderFrameDebug(frame);

  assert.equal(renderFramePlain(frame), 'XO');
  assert.match(addressed, /\u001B\[H/u);
  assert.deepEqual(frame.cursor, {
    row: 1,
    column: 2,
    source: {
      elementId: 'custom-board',
      elementKind: 'testLeaf',
      rendererFamily: 'extension',
      cellRole: 'custom'
    }
  });
  assert.equal(frame.accessibility.root.role, 'button');
  assert.equal(frame.accessibility.root.label, 'XO');
  assert.equal(frame.accessibility.root.focused, true);
  assert.equal(observedFocus, 'self');
});

test('custom accessibility focus must agree with resolved frame focus', () => {
  const focusedWithoutAccessibleFocus = custom({
    id: 'focus-without-accessible-focus',
    renderer: {
      ...leafRendererDefinition,
      render() {},
      accessibility: ({ id }) => ({ id, role: 'button', label: id }),
      focusTargets: ({ bounds }) => [{ id: 'self', bounds }]
    }
  });
  assert.throws(
    () => renderElementFrame(focusedWithoutAccessibleFocus, { columns: 20, rows: 1 }),
    /accessibility focus must agree with the resolved frame focus/u
  );

  const passiveWithAccessibleFocus = custom({
    id: 'passive-with-accessible-focus',
    renderer: {
      ...leafRendererDefinition,
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

test('target-shaped custom accessibility must identify the resolved focus target', () => {
  const focusTargets = ({ bounds }) => [
    { id: 'left', bounds },
    { id: 'right', bounds }
  ];
  const wrongTarget = custom({
    id: 'wrong-target-focus',
    renderer: {
      ...leafRendererDefinition,
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

  const matchingTarget = custom({
    id: 'matching-target-focus',
    renderer: {
      ...leafRendererDefinition,
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

  const flattened = custom({
    id: 'flattened-target-focus',
    renderer: {
      ...leafRendererDefinition,
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

test('custom renderer output preserves metadata and sanitizes terminal controls', () => {
  const renderer = {
    ...leafRendererDefinition,
    render({ bounds, target }) {
      target.write(bounds.row, bounds.column, [{
        text: '\u001B[31mUnsafe\u001B[0m red \u0007text',
        link: { href: 'https://example.test/\u001B[31mred', id: '\u001B[31mlink' },
        source: {
          elementId: '\u001B[31mcustom-source',
          elementKind: '\u001B[31mcustom-renderer',
          rendererFamily: 'custom',
          cellRole: 'custom',
          description: '\u001B[31munsafe-source'
        }
      }]);
    },
    accessibility({ id }) {
      return {
        id,
        role: 'application',
        label: '\u001B[31mUnsafe custom',
        description: 'custom \u0007renderer'
      };
    }
  };

  const frame = renderElementFrame(custom({ id: 'sanitized-custom', renderer }), { columns: 32, rows: 2 });
  const first = frame.cells[0];

  assert.equal(renderFramePlain(frame), 'Unsafe red text');
  assert.deepEqual(first?.link, { href: 'https://example.test/red', id: 'link' });
  assert.deepEqual(first?.source, {
    elementId: 'sanitized-custom',
    elementKind: 'testLeaf',
    rendererFamily: 'extension',
    cellRole: 'custom',
    description: 'unsafe-source'
  });
  assert.equal(frame.accessibility.root.label, 'Unsafe custom');
  assert.equal(frame.accessibility.root.description, 'custom renderer');
  assertNoTerminalControls(frame);
});

test('custom render targets are frozen write-only capabilities clipped to element bounds', () => {
  const observedTargets = [];
  const extension = (kind) => {
    const draw = ({ bounds, target }) => {
      observedTargets.push(target);
      const { clear, write, writeCell } = target;
      clear({ row: bounds.row, column: 1, width: 4, height: 1 });
      write(bounds.row, 1, [{ text: 'OVERWRITE' }]);
      writeCell({ row: bounds.row, column: bounds.column, text: 'X', width: 1 });
      write(bounds.row, bounds.column, [{ text: 'RIGHT' }]);
    };
    const renderer = kind === 'composite' ? {
      ...compositeRendererDefinition,
      layout: () => [],
      renderBeforeChildren: draw,
      accessibility: ({ id }) => ({ id, role: 'text', label: kind })
    } : {
      ...leafRendererDefinition,
      render({ bounds, target }) {
        draw({ bounds, target });
      },
      accessibility: ({ id }) => ({ id, role: 'text', label: kind })
    };
    return kind === 'composite'
      ? custom({ id: kind, children: [], renderer })
      : custom({ id: kind, renderer });
  };

  for (const kind of ['custom', 'composite']) {
    const frame = renderElementFrame(row([
      text('LEFT', { id: `${kind}-left` }),
      extension(kind)
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
      'width',
      'widthProfile',
      'write',
      'writeBlock',
      'writeCell',
      'writeLine'
    ]);
  }
});

test('custom extension accessibility and interaction outputs are validated before publication', () => {
  assert.throws(
    () => renderElementFrame(custom({
      id: 'invalid-accessibility',
      renderer: {
        ...leafRendererDefinition,
        render() {},
        accessibility: () => ({ id: '', role: 'invalid' })
      }
    }), { columns: 8, rows: 1 }),
    /Renderer produced invalid accessibility/u
  );

  assert.throws(
    () => renderElementFrame(custom({
      id: 'invalid-hit-bounds',
      renderer: {
      ...leafRendererDefinition,
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
    () => renderElementFrame(custom({
      id: 'duplicate-focus',
      renderer: {
      ...leafRendererDefinition,
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
});

test('custom extension styles reject values outside the public frame contract', () => {
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
    const id = `invalid-extension-style-${String(index)}`;
    assert.throws(
      () => renderElementFrame(custom({
        id: `${id}-drawing`,
        renderer: {
      ...leafRendererDefinition,
          render({ bounds, target }) {
            target.write(bounds.row, bounds.column, [{ text: 'X', style }]);
          },
          accessibility: ({ id: elementId }) => ({ id: elementId, role: 'text', label: elementId })
        }
      }), { columns: 4, rows: 1 }),
      /Custom renderer ".*" render span style/u
    );

    assert.throws(
      () => renderElementFrame(custom({
        id: `${id}-cursor`,
        renderer: {
      ...leafRendererDefinition,
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
      /Custom renderer ".*" focus target "self" cursor style/u
    );
  }
});

test('custom extension styles are admitted as canonical copies', () => {
  const drawingStyle = {
    fg: { kind: 'rgb', r: 1, g: 2, b: 3 },
    bold: true
  };
  const cursorStyle = {
    fg: { kind: 'ansi', value: 4 },
    inverse: true
  };
  const element = custom({
    id: 'canonical-extension-styles',
    renderer: {
      ...leafRendererDefinition,
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
    { focusPath: ['canonical-extension-styles'] }
  );
  const drawingCell = frame.cells.find((cell) => cell.column === 1);
  assert.deepEqual(drawingCell?.style?.fg, { kind: 'rgb', r: 1, g: 2, b: 3 });
  assert.equal(drawingCell?.style?.bold, true);
  assert.deepEqual(frame.cursor?.style, {
    fg: { kind: 'ansi', value: 4 },
    inverse: true
  });
});

test('custom focus and hit targets cannot claim sibling bounds', () => {
  const extension = custom({
    id: 'bounded-interaction',
    renderer: {
      ...leafRendererDefinition,
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
    text('LEFT', { id: 'interaction-sibling' }),
    extension
  ], {
    sizes: [{ kind: 'fixed', cells: 5 }, { kind: 'fill' }]
  }), { columns: 12, rows: 1 });

  assert.equal(frame.focusPath, undefined);
  assert.equal(frame.hitTargets, undefined);
});

test('custom renderer hit targets route mouse messages', async () => {
  const renderer = {
    ...leafRendererDefinition,
    render({ bounds, target }) {
      target.write(bounds.row, bounds.column, [{ text: 'hit' }]);
    },
    accessibility({ id }) {
      return { id, role: 'button', label: 'hit' };
    },
    hitTargets({ bounds }) {
      return [{ id: 'custom-hit:press', bounds, message: () => ({ clicked: true }), cursor: 'pointer' }];
    }
  };
  const app = defineTui({
    id: 'custom-hit-tui',
    init: () => ({ clicked: false }),
    update: (_state, message) => ({ state: { clicked: message.clicked } }),
    view: (state) => custom({
      id: 'custom-hit',
      renderer,
      state
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 12, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const press = await runtime.handleInputChunk({ data: '\u001B[<0;1;1M' });
  const release = await runtime.handleInputChunk({ data: '\u001B[<0;1;1m' });

  assert.equal(press.results[0]?.handled, false);
  assert.equal(release.results[0]?.handled, true);
  assert.deepEqual(runtime.state(), { clicked: true });
  assert.match(renderFramePlain(runtime.frame()), /hit/);
  assert.deepEqual(runtime.frame().hitTargets?.[0], {
    id: 'custom-hit:press',
    bounds: { row: 1, column: 1, width: 12, height: 3 },
    cursor: 'pointer',
    zIndex: 0
  });
});

test('custom renderer measurement participates in content track layout', () => {
  const measured = custom({
    id: 'measured-custom',
    renderer: {
      ...leafRendererDefinition,
      measure() {
        return {
          minWidth: 3,
          minHeight: 1,
          preferredWidth: 9,
          preferredHeight: 2
        };
      },
      render({ bounds, target }) {
        target.write(bounds.row, bounds.column, [{ text: 'custom' }]);
      },
      accessibility({ id }) {
        return { id, role: 'text', label: 'custom' };
      }
    }
  });
  const element = splitPane([
    measured,
    text('remaining', { id: 'remaining' })
  ], {
    id: 'custom-measured-pane',
    direction: 'horizontal',
    sizes: [{ kind: 'content' }, { kind: 'fill' }]
  });

  const layout = layoutElement(element, { columns: 24, rows: 4 });
  const frame = renderElementFrame(element, { columns: 24, rows: 4 });

  assert.deepEqual(layout.children[0]?.bounds, { row: 1, column: 1, width: 9, height: 4 });
  assert.deepEqual(layout.children[1]?.bounds, { row: 1, column: 10, width: 15, height: 4 });
  assert.match(renderFramePlain(frame), /custom/u);
});

test('layout measures children only for content-sized tracks', () => {
  let measurementCalls = 0;
  const measured = custom({
    id: 'demand-measured-custom',
    renderer: {
      ...leafRendererDefinition,
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
        target.write(bounds.row, bounds.column, [{ text: 'custom' }]);
      },
      accessibility({ id }) {
        return { id, role: 'text', label: 'custom' };
      }
    }
  });

  const fixedAndFill = row([
    measured,
    text('remaining', { id: 'demand-remaining' })
  ], {
    sizes: [{ kind: 'fixed', cells: 7 }, { kind: 'fill' }]
  });
  layoutElement(fixedAndFill, { columns: 24, rows: 2 });
  assert.equal(measurementCalls, 0);

  const contentAndFill = row([
    measured,
    text('remaining', { id: 'demand-content-remaining' })
  ], {
    sizes: [{ kind: 'content' }, { kind: 'fill' }]
  });
  const layout = layoutElement(contentAndFill, { columns: 24, rows: 2 });

  assert.equal(measurementCalls, 1);
  assert.equal(layout.children[0]?.bounds.width, 7);
});

test('custom measurements are cached by complete bounds rather than dimensions alone', () => {
  const measuredColumns = [];
  const positioned = custom({
    id: 'position-measured-custom',
    renderer: {
      ...leafRendererDefinition,
      measure({ bounds }) {
        measuredColumns.push(bounds.column);
        return {
          minWidth: 1,
          minHeight: 1,
          preferredWidth: bounds.column === 1 ? 2 : 4,
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
  const branch = row([positioned, text('fill')], {
    sizes: [{ kind: 'content' }, { kind: 'fill' }]
  });
  const element = row([branch, branch], {
    sizes: [{ kind: 'fixed', cells: 10 }, { kind: 'fixed', cells: 10 }]
  });

  const layout = layoutElement(element, { columns: 20, rows: 2 });

  assert.deepEqual(measuredColumns, [1, 11]);
  assert.equal(layout.children[0]?.children[0]?.bounds.width, 2);
  assert.equal(layout.children[1]?.children[0]?.bounds.width, 4);
});

test('custom composites derive intrinsic size from opaque children under the active width profile', () => {
  let measuredProfile;
  let measuredChildren = 0;
  const composite = custom({
    id: 'measured-composite',
    children: [text('··', { id: 'ambiguous-child' })],
    renderer: {
      ...compositeRendererDefinition,
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
  const element = row([composite, text('fill')], {
    sizes: [{ kind: 'content' }, { kind: 'fill' }]
  });
  const widthProfile = { emoji: 'wide', ambiguous: 'wide' };

  const layout = layoutElement(element, { columns: 12, rows: 1 }, undefined, widthProfile);

  assert.deepEqual(measuredProfile, widthProfile);
  assert.equal(measuredChildren, 1);
  assert.equal(layout.children[0]?.bounds.width, 4);
});

test('custom extension hooks have the same receiver-independent invocation contract', () => {
  const receivers = [];
  const plain = custom({
    id: 'receiver-free-custom',
    renderer: {
      ...leafRendererDefinition,
      render() {
        receivers.push(this);
      },
      accessibility({ id }) {
        receivers.push(this);
        return { id, role: 'text', label: id };
      }
    }
  });
  const composite = custom({
    id: 'receiver-free-composite',
    children: [text('child')],
    renderer: {
      ...compositeRendererDefinition,
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

test('invalid custom measurements are rejected instead of silently normalized', () => {
  const element = custom({
    id: 'invalid-measurement',
    renderer: {
      ...leafRendererDefinition,
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

test('custom composites accept clipped child coordinates inside a scrolled parent', () => {
  const composite = custom({
    id: 'scrolled-composite',
    children: [
      text('offscreen', { id: 'offscreen-child' }),
      text('visible', { id: 'visible-child' })
    ],
    renderer: {
      ...compositeRendererDefinition,
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

test('custom composites still reject invalid sizes and relative overflow', () => {
  const composite = (layout) => custom({
    id: 'invalid-composite',
    children: [text('child')],
    renderer: {
      ...compositeRendererDefinition,
      layout,
      accessibility({ id }) {
        return { id, role: 'group', label: 'Invalid composite' };
      }
    }
  });

  assert.throws(
    () => renderElementFrame(composite(({ bounds }) => [{ ...bounds, width: -1 }]), { columns: 8, rows: 2 }),
    /returned bounds outside its parent/u
  );
  assert.throws(
    () => renderElementFrame(composite(({ bounds }) => [{ ...bounds, row: bounds.row - 1 }]), { columns: 8, rows: 2 }),
    /returned bounds outside its parent/u
  );
  assert.throws(
    () => renderElementFrame(composite(({ bounds }) => [{ ...bounds, column: bounds.column + 0.5 }]), { columns: 8, rows: 2 }),
    /returned bounds outside its parent/u
  );
  assert.throws(
    () => renderElementFrame(composite(() => undefined), { columns: 8, rows: 2 }),
    /layout must return an array of child bounds/u
  );
});

test('malformed custom renderers fail as programmer errors', () => {
  assert.throws(
    () => custom({
      id: 'unsupported-placement',
      renderer: {
        ...leafRendererDefinition,
        place: ({ bounds }) => bounds,
        render() {},
        accessibility: ({ id }) => ({ id, role: 'text', label: id })
      }
    }),
    /must omit the unsupported place field/u
  );
  assert.throws(
    () => custom({ id: 'bad-renderer', renderer: undefined }),
    /Custom renderer kind must be "leaf" or "composite"/u
  );
  assert.throws(
    () => custom({ id: 'array-renderer', renderer: [] }),
    /Custom renderer kind must be "leaf" or "composite"/u
  );
  assert.throws(
    () => custom({ id: 'array-composite-renderer', renderer: [], children: [] }),
    /Custom renderer kind must be "leaf" or "composite"/u
  );
  assert.throws(
    () => custom({
      id: 'obsolete-composite-render',
      children: [text('child')],
      renderer: {
        ...compositeRendererDefinition,
        layout: ({ bounds }) => [bounds],
        render() {},
        accessibility: ({ id, children }) => ({ id, role: 'group', label: id, children })
      }
    }),
    /must omit the leaf-only render field/u
  );
  assert.throws(
    () => custom({
      id: 'composite-hook-on-leaf',
      renderer: {
        ...leafRendererDefinition,
        render() {},
        renderAfterChildren() {},
        accessibility: ({ id }) => ({ id, role: 'group', label: id })
      }
    }),
    /must omit the composite-only renderAfterChildren field/u
  );
  assert.throws(
    () => custom({
      id: 'unsafe-name',
      renderer: {
        ...leafRendererDefinition,
        name: 'unsafe\u001B[31m',
        render() {},
        accessibility({ id }) {
          return { id, role: 'group', label: 'Unsafe' };
        }
      }
    }),
    /name must start with an ASCII letter/u
  );
  assert.throws(
    () => custom({
      id: 'bad-accessibility-hook',
      renderer: {
        ...leafRendererDefinition,
        render() {},
        accessibility: 'not-a-function'
      }
    }),
    /renderer field "accessibility" must be a function/u
  );
});

test('custom renderer hook results are not replaced with renderer fallbacks', () => {
  const element = custom({
    id: 'missing-accessibility-result',
    renderer: {
      ...leafRendererDefinition,
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

test('custom renderer focus targets require stable ids', () => {
  const renderer = {
    ...leafRendererDefinition,
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
    () => renderElementFrame(custom({ id: 'bad-focus-target', renderer }), { columns: 10, rows: 2 }),
    /focus target id must be a non-empty string/u
  );
});

test('custom renderer hit targets resolve explicitly declared focus targets', () => {
  const renderer = {
    ...leafRendererDefinition,
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
  const frame = renderElementFrame(custom({ id: 'focusable', renderer }), { columns: 12, rows: 1 });

  assert.deepEqual(frame.hitTargets?.[0]?.focus, { kind: 'focus', path: ['focusable', 'control'] });
});

test('viewport bounds custom rendering, focus, pointer, and accessibility to one visible window', () => {
  const observedViewports = [];
  const renderer = {
    ...leafRendererDefinition,
    measure({ state }) {
      return {
        minWidth: 1,
        minHeight: 1,
        preferredWidth: Math.max(...state.rows.map((line) => line.length)),
        preferredHeight: state.rows.length
      };
    },
    render({ state, bounds, viewport: visible, target }) {
      observedViewports.push(visible);
      for (let index = 0; index < state.rows.length; index += 1) {
        target.write(bounds.row + index, bounds.column, [{ text: state.rows[index] }]);
      }
    },
    accessibility({ state, bounds, viewport: visible, id, focusedTargetId }) {
      observedViewports.push(visible);
      const start = Math.max(0, visible.row - bounds.row);
      return {
        id,
        role: 'listbox',
        label: 'Rows',
        children: state.rows.slice(start, start + visible.height).map((label, index) => {
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
    focusTargets({ state, bounds, viewport: visible }) {
      observedViewports.push(visible);
      return state.rows.map((_label, index) => ({
        id: `row-${String(index)}`,
        bounds: { row: bounds.row + index, column: bounds.column, width: bounds.width, height: 1 }
      }));
    },
    hitTargets({ state, bounds, viewport: visible }) {
      observedViewports.push(visible);
      return state.rows.map((_label, index) => ({
        id: `row-${String(index)}:hit`,
        bounds: { row: bounds.row + index, column: bounds.column, width: bounds.width, height: 1 },
        message: () => index
      }));
    }
  };
  const frame = renderElementFrame(viewport(custom({
    id: 'rows',
    state: { rows: ['zero', 'one', 'two', 'three', 'four'] },
    renderer
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
    observedViewports.map(() => ({ row: 1, column: 1, width: 8, height: 2 }))
  );
});

test('custom renderer hit targets reject unavailable focus targets', () => {
  const renderer = {
    ...leafRendererDefinition,
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
    () => renderElementFrame(custom({ id: 'invalid', renderer }), { columns: 12, rows: 1 }),
    /refers to unavailable focus target/u
  );
});

test('custom renderers must provide accessibility unless explicitly decorative', () => {
  const visualRenderer = {
    ...leafRendererDefinition,
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
    custom({
      id: 'decorative-custom',
      renderer: visualRenderer,
      meta: { accessibility: { decorative: true } }
    }),
    text('label', { id: 'label' })
  ]), { columns: 20, rows: 3 });

  assert.equal(renderFramePlain(accessibleFrame), 'decor\nlabel');
  assert.deepEqual(accessibleFrame.accessibility.root.children?.map((node) => node.id), ['label']);
  assert.throws(
    () => custom({ id: 'missing-a11y', renderer: visualRenderer }),
    /must provide accessibility/u
  );
});

test('decorative custom extensions reject unreachable accessibility hooks', () => {
  let accessibilityCalls = 0;
  assert.throws(
    () => custom({
      id: 'decorative-custom-dead-accessibility',
      renderer: {
      ...leafRendererDefinition,
        render() {},
        accessibility: ({ id }) => {
          accessibilityCalls += 1;
          return { id, role: 'text', label: id };
        }
      },
      meta: { accessibility: { decorative: true } }
    }),
    /marked decorative must omit the accessibility hook/u
  );
  assert.throws(
    () => custom({
      id: 'decorative-composite-dead-accessibility',
      children: [text('ornament')],
      renderer: {
      ...compositeRendererDefinition,
        layout: ({ bounds }) => [bounds],
        accessibility: ({ id }) => {
          accessibilityCalls += 1;
          return { id, role: 'group', label: id };
        }
      },
      meta: { accessibility: { decorative: true } }
    }),
    /marked decorative must omit the accessibility hook/u
  );
  assert.equal(accessibilityCalls, 0);
});

test('decorative custom renderers cannot expose interaction targets', () => {
  const interactiveRenderer = {
    ...leafRendererDefinition,
    render({ bounds, target }) {
      target.write(bounds.row, bounds.column, [{ text: 'button' }]);
    },
    hitTargets({ bounds }) {
      return [{ id: 'press', bounds, message: () => ({ pressed: true }) }];
    }
  };

  assert.throws(
    () => renderElementFrame(custom({
        id: 'decorative-button',
        renderer: interactiveRenderer,
        meta: { accessibility: { decorative: true } }
      }), { columns: 12, rows: 1 }),
    /cannot expose pointer interaction/u
  );
});

test('decorative elements reject interaction throughout their subtree', () => {
  assert.throws(
    () => renderElementFrame(column([
      button({ id: 'decorative-child-button', label: 'Press', onPress: () => ({ kind: 'press' }) })
    ], {
      id: 'decorative-parent',
      meta: { accessibility: { decorative: true } }
    }), { columns: 12, rows: 1 }),
    /Decorative renderNode "decorative-child-button" cannot define keyboard interaction/u
  );

  assert.throws(
    () => renderElementFrame(custom({
      id: 'decorative-pointer',
      renderer: { ...leafRendererDefinition, render() {} },
      pointer: { onAction: () => ({ kind: 'pointer' }) },
      meta: { accessibility: { decorative: true } }
    }), { columns: 12, rows: 1 }),
    /cannot define pointer interaction/u
  );
});

test('decorative custom composites do not require an unreachable accessibility hook', () => {
  const frame = renderElementFrame(custom({
    id: 'decorative-composite',
    children: [text('ornament', { id: 'ornament' })],
    renderer: {
      ...compositeRendererDefinition,
      layout: ({ bounds }) => [bounds]
    },
    meta: { accessibility: { decorative: true } }
  }), { columns: 12, rows: 1 });

  assert.equal(renderFramePlain(frame), 'ornament');
  assert.equal(frame.accessibility.root.id, 'decorative-composite');
  assert.equal(frame.accessibility.root.children, undefined);
});

test('custom composites arrange opaque children while preserving interaction and accessibility', async () => {
  let accessibleChildIds = [];
  const app = defineTui({
    id: 'custom-composite-tui',
    init: () => ({ selected: 'none' }),
    update: (_state, message) => ({ state: { selected: message.kind } }),
    view: (state) => custom({
      id: 'custom-actions',
      state,
      children: [
        button({
          id: 'save',
          label: 'Save',
          onPress: () => ({ kind: 'save' })
        }),
        button({
          id: 'cancel',
          label: 'Cancel',
          onPress: () => ({ kind: 'cancel' })
        })
      ],
      renderer: {
        ...compositeRendererDefinition,
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
        renderAfterChildren({ bounds, target }) {
          target.write(bounds.row + 1, bounds.column, [{ text: `selected:${state.selected}` }]);
        },
        accessibility({ id, children }) {
          accessibleChildIds = children.map((child) => child.id);
          return { id, role: 'group', label: 'Actions', children };
        }
      }
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 24, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host, initialFocus: { kind: 'path', path: ['custom-actions', 'save'] } });

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
