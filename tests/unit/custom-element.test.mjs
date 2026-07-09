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
import { text } from '../../dist/components/index.js';
import { custom } from '../../dist/renderer/index.js';
import {
  splitPane,
  stack
} from '../../dist/layout/index.js';

test('custom renderers render through required renderer contract', () => {
  const renderer = {
    render({ renderNode, layoutNode, buffer }) {
      buffer.write(layoutNode.bounds.row, layoutNode.bounds.column, [{
        text: stateLabel(renderNode.custom?.state),
        style: { bold: true }
      }]);
    },
    accessibility({ renderNode, id, focused }) {
      return {
        id,
        role: 'button',
        label: stateLabel(renderNode.custom?.state),
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
  assert.match(addressed, /\u001B\[1;1H/u);
  assert.deepEqual(frame.cursor, { row: 1, column: 2 });
  assert.equal(frame.accessibility.root.role, 'button');
  assert.equal(frame.accessibility.root.label, 'XO');
  assert.equal(frame.accessibility.root.focused, true);
});

test('custom renderer output preserves metadata and sanitizes terminal controls', () => {
  const renderer = {
    render({ layoutNode, buffer }) {
      buffer.write(layoutNode.bounds.row, layoutNode.bounds.column, [{
        text: '\u001B[31mUnsafe\u001B[0m red \u0007text',
        link: { href: 'https://example.test/\u001B[31mred', id: '\u001B[31mlink' },
        source: {
          ownerId: '\u001B[31mcustom-source',
          ownerKind: '\u001B[31mcustom-renderer',
          family: 'custom',
          role: 'custom',
          label: '\u001B[31munsafe-source'
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
    ownerId: 'custom-source',
    ownerKind: 'custom-renderer',
    family: 'custom',
    role: 'custom',
    label: 'unsafe-source'
  });
  assert.equal(frame.accessibility.root.label, 'Unsafe custom');
  assert.equal(frame.accessibility.root.description, 'custom renderer');
  assertNoTerminalControls(frame);
});

test('custom renderer hit targets route mouse messages', async () => {
  const renderer = {
    render({ layoutNode, buffer }) {
      buffer.write(layoutNode.bounds.row, layoutNode.bounds.column, [{ text: 'hit' }]);
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
  const press = await runtime.handleInputChunk({ data: '\u001B[<0;1;1M' });
  const release = await runtime.handleInputChunk({ data: '\u001B[<0;1;1m' });

  assert.equal(press[0]?.handled, false);
  assert.equal(release[0]?.handled, true);
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
      render({ layoutNode, buffer }) {
        buffer.write(layoutNode.bounds.row, layoutNode.bounds.column, [{ text: 'custom' }]);
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

test('malformed custom renderers fail as programmer errors', () => {
  assert.throws(
    () => custom({ id: 'bad-renderer', renderer: undefined }),
    /Custom renderers must provide a renderer with a render function/u
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

test('custom renderer focus targets require stable ids', () => {
  const renderer = {
    render({ layoutNode, buffer }) {
      buffer.write(layoutNode.bounds.row, layoutNode.bounds.column, [{ text: 'focus' }]);
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

test('custom renderers must provide accessibility unless explicitly decorative', () => {
  const visualRenderer = {
    render({ layoutNode, buffer }) {
      buffer.write(layoutNode.bounds.row, layoutNode.bounds.column, [{ text: 'decor' }]);
    }
  };
  const accessibleFrame = renderElementFrame(stack([
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
    render({ layoutNode, buffer }) {
      buffer.write(layoutNode.bounds.row, layoutNode.bounds.column, [{ text: 'button' }]);
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

function stateLabel(state) {
  if (state === null || typeof state !== 'object' || !('label' in state)) return '';
  return typeof state.label === 'string' ? state.label : '';
}

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
