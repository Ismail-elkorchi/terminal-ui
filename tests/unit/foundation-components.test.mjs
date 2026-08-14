import assert from 'node:assert/strict';
import test from 'node:test';

import { ignoreMessage } from '../../dist/component/index.js';
import { button, link, textInput, toggleButton, toolbar } from '../../dist/components/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { row } from '../../dist/layout/index.js';
import { renderElementFrame, renderFramePlain } from '../../dist/renderer/index.js';
import { createTuiRuntime, defineTui } from '../../dist/tui/index.js';

const noModifiers = { ctrl: false, alt: false, shift: false, meta: false };

test('toolbar preserves caller-owned flexible layout', () => {
  const frame = renderElementFrame(toolbar(row([
    button({ id: 'back', label: 'Back', onAction: () => ignoreMessage() }),
    textInput({
      id: 'location',
      presentation: { value: 'example.test', cursor: 0 },
      onAction: () => ignoreMessage()
    }),
    button({ id: 'menu', label: 'Menu', onAction: () => ignoreMessage() })
  ], {
    id: 'toolbar-row',
    sizes: [{ kind: 'content' }, { kind: 'fill' }, { kind: 'content' }]
  }), {
    id: 'navigation',
    label: 'Browser navigation'
  }), { columns: 60, rows: 1 });

  assert.equal(frame.accessibility.root.role, 'toolbar');
  assert.deepEqual(
    frame.accessibility.root.children?.[0]?.children?.map((child) => child.id),
    ['back', 'location', 'menu']
  );
  const location = frame.hitTargets?.find((target) => target.id === 'location:text');
  assert.ok((location?.bounds.width ?? 0) > 20);
});

test('toggle button shares compact adornment presentation while retaining pressed semantics', () => {
  const frame = renderElementFrame(toggleButton({
    id: 'bookmark',
    accessibleName: 'Bookmark this page',
    leading: [{ kind: 'symbol', unicode: '★', ascii: '*', accessibleText: 'star' }],
    density: 'compact',
    pressed: true,
    onTransition: () => ignoreMessage()
  }), { columns: 8, rows: 1 });

  assert.match(renderFramePlain(frame), /★/u);
  assert.doesNotMatch(renderFramePlain(frame), /\[x\]/u);
  assert.equal(frame.accessibility.root.label, 'Bookmark this page');
  assert.equal(frame.accessibility.root.pressed, true);
});

test('link activation preserves keyboard and pointer intent', async () => {
  const app = defineTui({
    id: 'link-intent',
    init: () => ({ events: [] }),
    update: (state, event) => ({ state: { events: [...state.events, event] } }),
    view: () => link({
      id: 'documentation',
      label: 'Documentation',
      href: 'https://example.test/docs',
      onActivate: (event) => event
    })
  });
  const runtime = createTuiRuntime({
    app,
    host: createMemoryTerminalHost({ terminalSize: { columns: 24, rows: 1 } })
  });
  await runtime.start();
  await runtime.handleInput({
    kind: 'key',
    key: 'enter',
    modifiers: { ...noModifiers, ctrl: true },
    eventType: 'press',
    location: 'standard'
  });
  const pointerBase = {
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    button: 'middle',
    row: 1,
    column: 1,
    rawCode: 1,
    modifiers: { shift: false, alt: false, ctrl: true }
  };
  await runtime.handleInput({ ...pointerBase, action: 'press' });
  await runtime.handleInput({ ...pointerBase, action: 'release' });

  assert.deepEqual(runtime.state().events.map((event) => event.trigger), [
    { kind: 'keyboard', modifiers: { ...noModifiers, ctrl: true } },
    {
      kind: 'pointer',
      button: 'middle',
      modifiers: { shift: false, alt: false, ctrl: true }
    }
  ]);
});
