import assert from 'node:assert/strict';
import test from 'node:test';

import { createTuiRuntime, defineTui, renderFrame, renderWidgetFrame } from '../../dist/tui/index.js';
import { createTerminalHarness } from '../../dist/testing/index.js';
import { custom, stack, text } from '../../dist/widgets/index.js';

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
      return [{ bounds, cursor: { row: bounds.row, column: bounds.column + 1 } }];
    }
  };
  const widget = freezeWidget(custom({
    id: 'custom-board',
    renderer,
    state: { label: 'XO' }
  }));

  const frame = renderWidgetFrame(widget, { columns: 8, rows: 2 }, { focusPath: ['custom-board'] });
  const addressed = renderFrame(frame, { includeControlSequences: true });

  assert.equal(renderFrame(frame), 'XO');
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
      return [{ id: 'custom-hit:press', bounds, message: { clicked: true }, cursor: 'pointer' }];
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
  assert.match(renderFrame(runtime.frame()), /hit/);
  assert.deepEqual(runtime.frame().hitTargets?.[0], {
    id: 'custom-hit:press',
    bounds: { row: 1, column: 1, width: 12, height: 3 },
    cursor: 'pointer'
  });
});

test('malformed custom widgets fail as programmer errors', () => {
  assert.throws(
    () => renderWidgetFrame({ id: 'bad-custom', kind: 'custom', props: {} }, { columns: 8, rows: 2 }),
    /Custom widgets must provide a renderer/u
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

  assert.equal(renderFrame(accessibleFrame), 'decor\nlabel');
  assert.deepEqual(accessibleFrame.accessibility.root.children?.map((node) => node.id), ['label']);
  assert.throws(
    () => renderWidgetFrame(custom({ id: 'missing-a11y', renderer: visualRenderer }), { columns: 8, rows: 2 }),
    /must provide accessibility/u
  );
});

test('decorative custom widgets cannot expose interaction targets', () => {
  const interactiveRenderer = {
    render({ node, buffer }) {
      buffer.write(node.bounds.row, node.bounds.column, [{ text: 'button' }]);
    },
    hitTargets({ bounds }) {
      return [{ id: 'press', bounds, message: { pressed: true } }];
    }
  };

  assert.throws(
    () => renderWidgetFrame(custom({
      id: 'decorative-button',
      renderer: interactiveRenderer,
      accessibility: { decorative: true }
    }), { columns: 10, rows: 2 }),
    /Decorative widget/u
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
