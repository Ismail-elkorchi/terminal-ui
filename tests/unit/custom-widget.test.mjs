import assert from 'node:assert/strict';
import test from 'node:test';

import { createTuiRuntime, defineTui, layoutWidget, renderFrameDebug, renderFramePlain, renderWidgetFrame } from '../../dist/tui/index.js';
import { createTerminalHarness } from '../../dist/testing/index.js';
import { custom, splitPane, stack, text } from '../../dist/widgets/index.js';

test('custom widgets render through required renderer contract', () => {
  const renderer = {
    render({ widget, node, buffer }) {
      assert.equal(Object.isFrozen(widget), true);
      assert.equal(Object.isFrozen(widget.props), true);
      buffer.write(node.bounds.row, node.bounds.column, [{
        text: stateLabel(widget.custom?.state),
        style: { bold: true }
      }]);
    },
    accessibility({ widget, id, focused }) {
      return {
        id,
        role: 'button',
        label: stateLabel(widget.custom?.state),
        ...(focused ? { focused } : {})
      };
    },
    focusTargets({ bounds }) {
      return [{ id: 'self', bounds, cursor: { row: bounds.row, column: bounds.column + 1 } }];
    }
  };
  const widget = freezeWidget(custom({
    id: 'custom-board',
    renderer,
    state: { label: 'XO' }
  }));

  const frame = renderWidgetFrame(widget, { columns: 8, rows: 2 }, { focusPath: ['custom-board'] });
  const addressed = renderFrameDebug(frame);

  assert.equal(renderFramePlain(frame), 'XO');
  assert.match(addressed, /\u001B\[1;1H/u);
  assert.deepEqual(frame.cursor, { row: 1, column: 2 });
  assert.equal(frame.accessibility.root.role, 'button');
  assert.equal(frame.accessibility.root.label, 'XO');
  assert.equal(frame.accessibility.root.focused, true);
});

test('custom widget hit targets route mouse messages', async () => {
  const renderer = {
    render({ node, buffer }) {
      buffer.write(node.bounds.row, node.bounds.column, [{ text: 'hit' }]);
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
  const harness = createTerminalHarness({ viewport: { columns: 12, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const result = await runtime.handleInputChunk({ data: '\u001B[<0;1;1M' });

  assert.equal(result[0]?.handled, true);
  assert.deepEqual(runtime.getState(), { clicked: true });
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
      render({ node, buffer }) {
        buffer.write(node.bounds.row, node.bounds.column, [{ text: 'custom' }]);
      },
      accessibility({ id }) {
        return { id, role: 'text', label: 'custom' };
      }
    }
  });
  const widget = splitPane([
    measured,
    text('remaining', { id: 'remaining' })
  ], {
    id: 'custom-measured-pane',
    direction: 'horizontal',
    sizes: [{ kind: 'content' }, { kind: 'fill' }]
  });

  const layout = layoutWidget(widget, { columns: 24, rows: 4 });
  const frame = renderWidgetFrame(widget, { columns: 24, rows: 4 });

  assert.deepEqual(layout.children[0]?.bounds, { row: 1, column: 1, width: 9, height: 4 });
  assert.deepEqual(layout.children[1]?.bounds, { row: 1, column: 10, width: 15, height: 4 });
  assert.match(renderFramePlain(frame), /custom/u);
});

test('malformed custom widgets fail as programmer errors', () => {
  assert.throws(
    () => custom({ id: 'bad-renderer', renderer: undefined }),
    /Custom widgets must provide a renderer with a render function/u
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
  assert.throws(
    () => renderWidgetFrame({ id: 'bad-custom', kind: 'custom', props: {} }, { columns: 8, rows: 2 }),
    /Custom widgets must provide a renderer/u
  );
});

test('custom widget focus targets require stable ids', () => {
  const renderer = {
    render({ node, buffer }) {
      buffer.write(node.bounds.row, node.bounds.column, [{ text: 'focus' }]);
    },
    accessibility({ id }) {
      return { id, role: 'button', label: 'focus' };
    },
    focusTargets({ bounds }) {
      return [{ id: '', bounds }];
    }
  };

  assert.throws(
    () => renderWidgetFrame(custom({ id: 'bad-focus-target', renderer }), { columns: 10, rows: 2 }),
    /focus target without a non-empty id/u
  );
});

test('custom widgets must provide accessibility unless explicitly decorative', () => {
  const visualRenderer = {
    render({ node, buffer }) {
      buffer.write(node.bounds.row, node.bounds.column, [{ text: 'decor' }]);
    }
  };
  const accessibleFrame = renderWidgetFrame(stack([
    custom({
      id: 'decorative-custom',
      renderer: visualRenderer,
      accessibility: { decorative: true }
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

test('decorative custom widgets cannot expose interaction targets', () => {
  const interactiveRenderer = {
    render({ node, buffer }) {
      buffer.write(node.bounds.row, node.bounds.column, [{ text: 'button' }]);
    },
    hitTargets({ bounds }) {
      return [{ id: 'press', bounds, message: () => ({ pressed: true }) }];
    }
  };

  assert.throws(
    () => custom({
      id: 'decorative-button',
      renderer: interactiveRenderer,
      accessibility: { decorative: true }
    }),
    /Decorative custom widgets cannot expose focus or hit targets/u
  );
});

function freezeWidget(widget) {
  Object.freeze(widget.props);
  if (widget.custom !== undefined) Object.freeze(widget.custom);
  return Object.freeze(widget);
}

function stateLabel(state) {
  if (state === null || typeof state !== 'object' || !('label' in state)) return '';
  return typeof state.label === 'string' ? state.label : '';
}
