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
import { createTerminalHarness } from '../../dist/testing/index.js';
import { button, text } from '../../dist/components/index.js';
import { custom } from '../../dist/renderer/index.js';
import { customComposite } from '../../dist/renderer/index.js';
import {
  splitPane,
  column,
  row
} from '../../dist/layout/index.js';

test('custom renderers render through required renderer contract', () => {
  let observedFocus;
  const renderer = {
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
  assert.deepEqual(frame.cursor, { row: 1, column: 2 });
  assert.equal(frame.accessibility.root.role, 'button');
  assert.equal(frame.accessibility.root.label, 'XO');
  assert.equal(frame.accessibility.root.focused, true);
  assert.equal(observedFocus, 'self');
});

test('custom renderer output preserves metadata and sanitizes terminal controls', () => {
  const renderer = {
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
    elementId: 'custom-source',
    elementKind: 'custom-renderer',
    rendererFamily: 'custom',
    cellRole: 'custom',
    description: 'unsafe-source'
  });
  assert.equal(frame.accessibility.root.label, 'Unsafe custom');
  assert.equal(frame.accessibility.root.description, 'custom renderer');
  assertNoTerminalControls(frame);
});

test('custom renderer hit targets route mouse messages', async () => {
  const renderer = {
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
  const composite = customComposite({
    id: 'measured-composite',
    children: [text('··', { id: 'ambiguous-child' })],
    renderer: {
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

test('malformed custom renderers fail as programmer errors', () => {
  assert.throws(
    () => custom({ id: 'bad-renderer', renderer: undefined }),
    /Custom renderers must provide a renderer with a render function/u
  );
  assert.throws(
    () => custom({ id: 'array-renderer', renderer: [] }),
    /Custom renderers must provide a renderer with a render function/u
  );
  assert.throws(
    () => customComposite({ id: 'array-composite-renderer', renderer: [], children: [] }),
    /Custom composite renderers require layout and accessibility functions/u
  );
  assert.throws(
    () => custom({
      id: 'bad-accessibility-hook',
      renderer: {
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
    /focus target without a non-empty id/u
  );
});

test('custom renderer hit targets resolve explicitly declared focus targets', () => {
  const renderer = {
    render({ bounds, target }) {
      target.write(bounds.row, bounds.column, [{ text: 'focusable' }]);
    },
    accessibility({ id, focused }) {
      return { id, role: 'button', label: 'focusable', ...(focused ? { focused: true } : {}) };
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

test('custom renderer hit targets reject unavailable focus targets', () => {
  const renderer = {
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

test('decorative custom renderers cannot expose interaction targets', () => {
  const interactiveRenderer = {
    render({ bounds, target }) {
      target.write(bounds.row, bounds.column, [{ text: 'button' }]);
    },
    hitTargets({ bounds }) {
      return [{ id: 'press', bounds, message: () => ({ pressed: true }) }];
    }
  };

  assert.throws(
    () => custom({
      id: 'decorative-button',
      renderer: interactiveRenderer,
      meta: { accessibility: { decorative: true } }
    }),
    /Decorative custom renderers cannot expose focus or hit targets/u
  );
});

test('custom composites arrange opaque children while preserving interaction and accessibility', async () => {
  const app = defineTui({
    id: 'custom-composite-tui',
    init: () => ({ selected: 'none' }),
    update: (_state, message) => ({ state: { selected: message.kind } }),
    view: (state) => customComposite({
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
        render({ bounds, target }) {
          target.write(bounds.row + 1, bounds.column, [{ text: `selected:${state.selected}` }]);
        },
        accessibility({ id }) {
          return { id, role: 'group', label: 'Actions' };
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
