import assert from 'node:assert/strict';
import test from 'node:test';
import { createTuiRuntime, defineTui, runTui } from '../../dist/tui/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { decodeAccessibleSnapshot } from '../../dist/accessibility/index.js';
import { createTerminalHarness } from '../../dist/testing/index.js';
import {
  componentElement,
  leafComponentDefinition,
  testKeyInput
} from '../helpers/component-definition.mjs';
import { renderFramePlain } from '../../dist/renderer/index.js';
import { button, contextMenu, dialog, menuTrigger, listbox, notificationRegion, richText, dataGrid, textInput } from '../../dist/components/index.js';
import { column, overlay, surface, viewport } from '../../dist/layout/index.js';
import { waitUntil } from '../helpers/async.ts';
import { ignoreMessage } from '../../dist/component/index.js';

const tabKey = {
  kind: 'key',
  key: 'tab',
  modifiers: { ctrl: false, alt: false, shift: false, meta: false },
  eventType: 'press',
  location: 'standard'
};

function focusInput(options) {
  if (options.keys !== undefined) return testKeyInput(options);
  return textInput({ onAction: () => ignoreMessage(), ...options });
}

test('TUI focus traversal reveals logical targets in a controlled viewport', async () => {
  const app = defineTui({
    id: 'focus-reveal-tui',
    init: () => ({ scroll: { offsetRow: 0, offsetColumn: 0, followTail: false } }),
    update: (state, message) => message.kind === 'scroll'
      ? { state: { scroll: message.event.nextState } }
      : { state },
    view: (state) => viewport(column(
      Array.from({ length: 8 }, (_value, index) => button({
        id: `action-${String(index + 1)}`,
        label: `Action ${String(index + 1)}`,
        onAction: () => ignoreMessage()
      })),
      { id: 'actions' }
    ), {
      id: 'actions-viewport',
      offset: { row: state.scroll.offsetRow, column: state.scroll.offsetColumn },
      onScroll: (event) => ({ kind: 'scroll', event })
    })
  });
  const host = createMemoryTerminalHost({ terminalSize: { columns: 24, rows: 3 } });
  const runtime = createTuiRuntime({ app, host });

  await runtime.start();
  await runtime.handleInput(tabKey);
  await runtime.handleInput(tabKey);
  await runtime.handleInput(tabKey);

  assert.deepEqual(runtime.frame().focusPath, ['actions-viewport', 'actions', 'action-4']);
  assert.equal(runtime.state().scroll.offsetRow, 1);
  assert.equal(runtime.frame().accessibility.focusPath.at(-1), 'action-4');
});

test('TUI runtime keeps command focus when contained overlays close under passive notifications', async () => {
  const app = defineTui({
    id: 'overlay-focus-return-tui',
    init: () => ({ command: '', searchPickerOpen: false, notifications: [] }),
    update: (state, message) => {
      if (message.kind === 'text') {
        return { state: { ...state, command: `${state.command}${message.text}` } };
      }
      if (message.kind === 'open') {
        return { state: { ...state, searchPickerOpen: true } };
      }
      if (message.kind === 'accept') {
        return {
          state: {
            ...state,
            searchPickerOpen: false,
            notifications: [{ id: 'accepted', title: 'Accepted', tone: 'success' }]
          }
        };
      }
      return { state };
    },
    view: (state) => overlay([
      column([
        focusInput({
          id: 'command',
          presentation: { value: state.command, cursor: 0 },
          keys: { enter: () => ({ kind: 'open' }) },
          onAction: ({ operation }) => ({
            kind: 'text',
            text: operation.kind === 'insert' ? operation.text : ''
          })
        })
      ], { id: 'base' }),
      ...(state.searchPickerOpen
        ? [
            surface(button({
              id: 'accept',
              label: 'Accept',
              onAction: () => ({ kind: 'accept' })
            }), {
    id: 'searchPicker-surface',
    meta: {
        layer: {
            zIndex: 20
        },
        focus: { scope: { kind: 'contain' } }
    }
})
          ]
        : []),
      notificationRegion({
    id: 'notices',
    items: state.notifications,
    meta: {
        layer: {
            zIndex: 30
        }
    }
})
    ], { id: 'root' })
  });
  const host = createMemoryTerminalHost({ terminalSize: { columns: 48, rows: 8 } });
  const runtime = createTuiRuntime({
    app,
    host,
    initialFocus: { kind: 'path', path: ['root', 'base', 'command'] }
  });

  await runtime.start();
  await runtime.handleInput({ kind: 'text', text: 'a', paste: false });
  await runtime.handleInput({ kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  assert.deepEqual(runtime.frame().focusPath, ['root', 'searchPicker-surface', 'accept']);

  await runtime.handleInput({ kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  assert.equal(runtime.state()?.notifications.length, 1);
  assert.notDeepEqual(runtime.frame().focusPath, ['root', 'notices']);

  await runtime.handleInput({ kind: 'text', text: 'b', paste: false });

  assert.equal(runtime.state()?.command, 'ab');
});

test('TUI runtime unwinds nested contained overlay focus to the original field', async () => {
  const app = defineTui({
    id: 'nested-overlay-focus-return-tui',
    init: () => ({ command: '', modal: 'none' }),
    update: (state, message) => {
      if (message.kind === 'text') {
        return { state: { ...state, command: `${state.command}${message.text}` } };
      }
      if (message.kind === 'openA') return { state: { ...state, modal: 'a' } };
      if (message.kind === 'openB') return { state: { ...state, modal: 'b' } };
      if (message.kind === 'closeB') return { state: { ...state, modal: 'a' } };
      if (message.kind === 'closeA') return { state: { ...state, modal: 'none' } };
      return { state };
    },
    view: (state) => overlay([
      column([
        focusInput({
          id: 'command',
          presentation: { value: state.command, cursor: 0 },
          keys: { enter: () => ({ kind: 'openA' }) },
          onAction: ({ operation }) => ({
            kind: 'text',
            text: operation.kind === 'insert' ? operation.text : ''
          })
        })
      ], { id: 'base' }),
      ...(state.modal === 'a' || state.modal === 'b'
        ? [
            surface(column([
              button({ id: 'open-b', label: 'Open B', onAction: () => ({ kind: 'openB' }) }),
              button({ id: 'close-a', label: 'Close A', onAction: () => ({ kind: 'closeA' }) })
            ], { id: 'modal-a-actions' }), {
    id: 'modal-a',
    meta: {
        layer: {
            zIndex: 10
        },
        focus: { scope: { kind: 'contain' } }
    }
})
          ]
        : []),
      ...(state.modal === 'b'
        ? [
            surface(button({
              id: 'close-b',
              label: 'Close B',
              onAction: () => ({ kind: 'closeB' })
            }), {
    id: 'modal-b',
    meta: {
        layer: {
            zIndex: 20
        },
        focus: { scope: { kind: 'contain' } }
    }
})
          ]
        : [])
    ], { id: 'root' })
  });
  const host = createMemoryTerminalHost({ terminalSize: { columns: 48, rows: 10 } });
  const runtime = createTuiRuntime({
    app,
    host,
    initialFocus: { kind: 'path', path: ['root', 'base', 'command'] }
  });

  await runtime.start();
  await runtime.handleInput({ kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  assert.deepEqual(runtime.frame().focusPath, ['root', 'modal-a', 'modal-a-actions', 'open-b']);

  await runtime.handleInput({ kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  assert.deepEqual(runtime.frame().focusPath, ['root', 'modal-b', 'close-b']);

  await runtime.handleInput({ kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  assert.deepEqual(runtime.frame().focusPath, ['root', 'modal-a', 'modal-a-actions', 'open-b']);

  await runtime.handleInput({ kind: 'key', key: 'tab', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  assert.deepEqual(runtime.frame().focusPath, ['root', 'modal-a', 'modal-a-actions', 'close-a']);

  await runtime.handleInput({ kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  assert.deepEqual(runtime.frame().focusPath, ['root', 'base', 'command']);

  await runtime.handleInput({ kind: 'text', text: 'z', paste: false });
  assert.equal(runtime.state()?.command, 'z');
});


test('anonymous container focus identity survives terminal resize', async () => {
  const app = defineTui({
    id: 'structural-focus-resize',
    init: () => ({ value: '' }),
    update: (state) => ({ state }),
    view: (state) => column([
      focusInput({ id: 'first', presentation: { value: state.value, cursor: 0 } }),
      focusInput({ id: 'second', presentation: { value: state.value, cursor: 0 } })
    ])
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 40, rows: 6 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.handleInput({
    kind: 'key',
    key: 'tab',
    modifiers: { ctrl: false, alt: false, shift: false, meta: false },
    eventType: 'press',
    location: 'standard'
  });
  const focusBeforeResize = runtime.frame().focusPath;
  await runtime.resize({ columns: 18, rows: 4 });

  assert.deepEqual(focusBeforeResize, ['column:0', 'second']);
  assert.deepEqual(runtime.frame().focusPath, focusBeforeResize);
});


test('runTui accepts an initial focus path', async () => {
  const app = defineTui({
    id: 'run-focus-restore',
    init: () => ({ active: 'idle' }),
    update: (_state, message) => ({ state: { active: message.active }, exit: {} }),
    view: (state) => column([
      focusInput({ id: 'first', presentation: { value: state.active, cursor: 0 }, keys: { enter: () => ({ active: 'first' }) } }),
      focusInput({ id: 'second', presentation: { value: state.active, cursor: 0 }, keys: { enter: () => ({ active: 'second' }) } })
    ])
  });
  const host = createMemoryTerminalHost({ terminalSize: { columns: 20, rows: 4 } });
  host.input('\r');

  const exit = await runTui(app, host, { initialFocus: { kind: 'path', path: ['column:0', 'second'] } });

  assert.equal(exit.status, 'completed');
  assert.deepEqual(exit.state, { active: 'second' });
});

test('runTui accepts a state-derived theme', async () => {
  const app = defineTui({
    id: 'run-state-theme',
    init: () => ({ active: false }),
    inputBindings: [{ id: 'activate-theme', triggers: [{ kind: 'key', key: 'enter' }], message: { active: true } }],
    update: () => ({ state: { active: true }, exit: {} }),
    view: () => richText({
      id: 'theme-label',
      segments: [{ kind: 'text', text: 'theme', style: { fg: { kind: 'theme', token: 'accent.primary' } } }]
    })
  });
  const host = createMemoryTerminalHost({ terminalSize: { columns: 12, rows: 2 } });
  host.input('\r');

  const exit = await runTui(app, host, {
    theme: (state) => ({
      tokens: {
        colors: {
          'accent.primary': state.active
            ? { kind: 'ansi', value: 2 }
            : { kind: 'ansi', value: 1 }
        }
      }
    })
  });

  assert.equal(exit.status, 'completed');
  assert.match(host.output(), /\u001B\[31m/u);
  assert.match(host.output(), /\u001B\[32m/u);
});

test('state-derived themes repaint when their exact rendering content changes', async () => {
  const app = defineTui({
    id: 'run-collision-theme',
    init: () => ({ active: false }),
    inputBindings: [{ id: 'activate-theme', triggers: [{ kind: 'key', key: 'enter' }], message: { active: true } }],
    update: () => ({ state: { active: true }, exit: {} }),
    view: () => richText({
      id: 'collision-theme-label',
      segments: [{ kind: 'text', text: 'theme', style: { fg: { kind: 'theme', token: 'custom.x' } } }]
    })
  });
  const host = createMemoryTerminalHost({
    terminalSize: { columns: 12, rows: 2 },
    capabilities: { colorDepth: 24 }
  });
  host.input('\r');

  const exit = await runTui(app, host, {
    theme: (state) => ({
      tokens: {
        colors: {
          'custom.x': state.active
            ? { kind: 'rgb', r: 190, g: 250, b: 218 }
            : { kind: 'rgb', r: 45, g: 88, b: 140 }
        }
      }
    })
  });

  assert.equal(exit.status, 'completed');
  assert.match(host.output(), /\u001B\[38;2;45;88;140m/u);
  assert.match(host.output(), /\u001B\[38;2;190;250;218m/u);
});

test('TUI runtime restores a serialized focus path when it still exists', async () => {
  const app = defineTui({
    id: 'focus-restore',
    init: () => ({ active: 'idle' }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => column([
      focusInput({ id: 'first', presentation: { value: state.active, cursor: 0 }, keys: { enter: () => ({ active: 'first' }) } }),
      focusInput({ id: 'second', presentation: { value: state.active, cursor: 0 }, keys: { enter: () => ({ active: 'second' }) } })
    ])
  });
  const firstHarness = createTerminalHarness({ terminalSize: { columns: 20, rows: 4 } });
  const firstRuntime = createTuiRuntime({ app, host: firstHarness.host });
  await firstRuntime.start();
  await firstRuntime.handleInput({ kind: 'key', key: 'tab', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  const restoredPath = firstRuntime.frame().focusPath;

  const restoredHarness = createTerminalHarness({ terminalSize: { columns: 20, rows: 4 } });
  const restoredRuntime = createTuiRuntime({
    app,
    host: restoredHarness.host,
    initialFocus: { kind: 'path', path: restoredPath }
  });
  await restoredRuntime.start();
  const committed = await restoredRuntime.handleInput({
    kind: 'key',
    key: 'enter',
    modifiers: { ctrl: false, alt: false, shift: false, meta: false },
    eventType: 'press',
    location: 'standard'
  });

  assert.deepEqual(restoredPath, ['column:0', 'second']);
  assert.deepEqual(restoredRuntime.frame().focusPath, restoredPath);
  assert.equal(committed.handled, true);
  assert.deepEqual(restoredRuntime.state(), { active: 'second' });
});

test('TUI runtime falls back when restored focus path is stale', async () => {
  const app = defineTui({
    id: 'stale-focus-restore',
    init: () => ({ active: 'idle' }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => column([
      focusInput({ id: 'first', presentation: { value: state.active, cursor: 0 }, keys: { enter: () => ({ active: 'first' }) } }),
      focusInput({ id: 'second', presentation: { value: state.active, cursor: 0 }, keys: { enter: () => ({ active: 'second' }) } })
    ])
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 4 } });
  const runtime = createTuiRuntime({
    app,
    host: harness.host,
    initialFocus: { kind: 'path', path: ['column:0', 'missing'] }
  });

  await runtime.start();
  const committed = await runtime.handleInput({
    kind: 'key',
    key: 'enter',
    modifiers: { ctrl: false, alt: false, shift: false, meta: false },
    eventType: 'press',
    location: 'standard'
  });

  assert.deepEqual(runtime.frame().focusPath, ['column:0', 'first']);
  assert.equal(committed.handled, true);
  assert.deepEqual(runtime.state(), { active: 'first' });
});

test('ambiguous initial element focus is diagnosed instead of selecting an arbitrary match', async () => {
  const renderer = {
    ...leafComponentDefinition,
    accessibleRole: 'group',
    measure: () => ({
      minWidth: 1,
      minHeight: 1,
      preferredWidth: 1,
      preferredHeight: 1
    }),
    render() {},
    focusTargets: ({ bounds }) => [
      { id: 'first', bounds },
      { id: 'second', bounds }
    ],
    accessibility: ({ id, focusedTargetId }) => ({
      id,
      role: 'group',
      label: id,
      children: [
        { id: 'first', role: 'button', label: 'First', ...(focusedTargetId === 'first' ? { focused: true } : {}) },
        { id: 'second', role: 'button', label: 'Second', ...(focusedTargetId === 'second' ? { focused: true } : {}) }
      ]
    })
  };
  const app = defineTui({
    id: 'ambiguous-initial-focus',
    init: () => ({}),
    update: (state) => ({ state }),
    view: () => column([
      componentElement({ id: 'duplicate', definition: renderer })
    ])
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 4 } });
  const runtime = createTuiRuntime({
    app,
    host: harness.host,
    initialFocus: { kind: 'element', elementId: 'duplicate' }
  });

  await runtime.start();

  assert.equal(runtime.diagnostics().some((item) => item.diagnostic.code === 'TUI_FOCUS_SELECTION_INVALID'
    && item.diagnostic.data?.reason === 'ambiguous'
    && item.diagnostic.data.paths.length === 2), true);
  assert.deepEqual(runtime.frame().focusPath, ['column:0', 'duplicate', 'first']);
  await runtime.dispose();
});

test('TUI runtime traverses focus backward with shifted tab', async () => {
  const app = defineTui({
    id: 'reverse-focus',
    init: () => ({ active: 'idle' }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => column([
      focusInput({ id: 'first', presentation: { value: state.active, cursor: 0 }, keys: { enter: () => ({ active: 'first' }) } }),
      focusInput({ id: 'second', presentation: { value: state.active, cursor: 0 }, keys: { enter: () => ({ active: 'second' }) } })
    ])
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 4 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const forward = await runtime.handleInput({ kind: 'key', key: 'tab', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  const backward = await runtime.handleInput({ kind: 'key', key: 'tab', modifiers: { ctrl: false, alt: false, shift: true, meta: false }, eventType: 'press', location: 'standard' });
  const committed = await runtime.handleInput({ kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });

  assert.equal(forward.handled, true);
  assert.equal(backward.handled, true);
  assert.equal(committed.handled, true);
  assert.deepEqual(runtime.state(), { active: 'first' });
  assert.deepEqual(runtime.frame().focusPath, ['column:0', 'first']);
});

test('TUI runtime respects explicit focus order and disabled focus targets', async () => {
  const app = defineTui({
    id: 'ordered-focus',
    init: () => ({ active: 'idle' }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => column([
      focusInput({
    id: 'disabled',
    presentation: { value: state.active, cursor: 0 },
    keys: { enter: () => ({ active: 'disabled' }) },
    meta: {
        focus: { disabled: true, order: 0 }
    }
}),
      focusInput({
    id: 'later',
    presentation: { value: state.active, cursor: 0 },
    keys: { enter: () => ({ active: 'later' }) },
    meta: {
        focus: { order: 2 }
    }
}),
      focusInput({
    id: 'first',
    presentation: { value: state.active, cursor: 0 },
    keys: { enter: () => ({ active: 'first' }) },
    meta: {
        focus: { order: 1 }
    }
})
    ])
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 24, rows: 6 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const first = await runtime.handleInput({ kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  const tab = await runtime.handleInput({ kind: 'key', key: 'tab', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  const second = await runtime.handleInput({ kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });

  assert.equal(first.handled, true);
  assert.equal(tab.handled, true);
  assert.equal(second.handled, true);
  assert.deepEqual(runtime.frame().focusPath, ['column:0', 'later']);
  assert.deepEqual(runtime.state(), { active: 'later' });
});

test('TUI runtime traps focus inside modal and scoped popover elements', async () => {
  const modalApp = defineTui({
    id: 'modal-focus-scope',
    init: () => ({ active: 'idle' }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => column([
      focusInput({ id: 'background', presentation: { value: state.active, cursor: 0 }, keys: { enter: () => ({ active: 'background' }) } }),
      dialog({
        slots: { content: focusInput({ id: 'dialog-field', presentation: { value: state.active, cursor: 0 }, keys: { enter: () => ({ active: 'dialog' }) } }) },
        id: 'dialog',
        accessibleName: 'Modal editor',
        modal: true,
        focusPolicy: { returnFocus: 'restore' },
        width: 20,
        height: 4
      })
    ])
  });
  const modalHarness = createTerminalHarness({ terminalSize: { columns: 30, rows: 8 } });
  const modalRuntime = createTuiRuntime({ app: modalApp, host: modalHarness.host });

  await modalRuntime.start();
  const modalTab = await modalRuntime.handleInput({ kind: 'key', key: 'tab', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  const modalEnter = await modalRuntime.handleInput({ kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });

  assert.equal(modalTab.handled, true);
  assert.equal(modalEnter.handled, true);
  assert.deepEqual(modalRuntime.frame().focusPath, ['column:0', 'dialog', 'dialog-field']);
  assert.deepEqual(modalRuntime.frame().accessibility.root.children?.[1]?.scope, {
    kind: 'modal',
    trapsFocus: true,
    obscuresBackground: true
  });
  assert.deepEqual(modalRuntime.state(), { active: 'dialog' });

  const popoverApp = defineTui({
    id: 'popover-focus-scope',
    init: () => ({ active: 'idle' }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => column([
      focusInput({ id: 'page-field', presentation: { value: state.active, cursor: 0 }, keys: { enter: () => ({ active: 'page' }) } }),
      surface(focusInput({ id: 'popover-field', presentation: { value: state.active, cursor: 0 }, keys: { enter: () => ({ active: 'popover' }) } }), {
    id: 'popover',
    meta: {
        layer: {
            zIndex: 10
        },
        focus: { scope: { kind: 'contain' } }
    }
})
    ])
  });
  const popoverHarness = createTerminalHarness({ terminalSize: { columns: 30, rows: 8 } });
  const popoverRuntime = createTuiRuntime({ app: popoverApp, host: popoverHarness.host });

  await popoverRuntime.start();
  const popoverEnter = await popoverRuntime.handleInput({ kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });

  assert.equal(popoverEnter.handled, true);
  assert.deepEqual(popoverRuntime.frame().focusPath, ['column:0', 'popover', 'popover-field']);
  assert.deepEqual(popoverRuntime.frame().accessibility.root.children?.[1]?.scope, {
    kind: 'popover',
    trapsFocus: true
  });
  assert.deepEqual(popoverRuntime.state(), { active: 'popover' });
});

test('dialog owns escape dismissal, initial focus, and focus restoration', async () => {
  const app = defineTui({
    id: 'dialog-lifecycle',
    init: () => ({ open: false, dismissedBy: undefined }),
    update: (state, message) => {
      if (message.kind === 'open') return { state: { ...state, open: true } };
      if (message.kind === 'dismiss') {
        return { state: { open: false, dismissedBy: message.reason } };
      }
      return { state };
    },
    view: (state) => column([
      focusInput({
        id: 'dialog-launcher',
        presentation: { value: '', cursor: 0 },
        keys: { enter: () => ({ kind: 'open' }) }
      }),
      ...(state.open
        ? [dialog({
            slots: {
              content: column([
                surface(focusInput({ id: 'nested-dialog-field', presentation: { value: '', cursor: 0 } }), {
                  id: 'nested-dialog-surface'
                }),
                focusInput({ id: 'first-dialog-field', presentation: { value: '', cursor: 0 } }),
                focusInput({ id: 'preferred-dialog-field', presentation: { value: '', cursor: 0 } })
              ])
            },
            id: 'lifecycle-dialog',
            accessibleName: 'Lifecycle dialog',
            modal: true,
            focusPolicy: {
              initialFocus: { kind: 'element', elementId: 'preferred-dialog-field' },
              returnFocus: 'restore'
            },
            dismissal: {
              dismissOnEscape: true,
              dismissOnOutsidePress: true
            },
            onAction: (action) => action,
            width: 24,
            height: 6
          })]
        : [])
    ])
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 40, rows: 10 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  assert.deepEqual(runtime.frame().focusPath, ['column:0', 'dialog-launcher']);
  await runtime.handleInput({ kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  assert.deepEqual(runtime.frame().focusPath, [
    'column:0',
    'lifecycle-dialog',
    'column:0',
    'preferred-dialog-field'
  ]);
  await runtime.handleInput({ kind: 'key', key: 'escape', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });

  assert.deepEqual(runtime.state(), { open: false, dismissedBy: 'escape' });
  assert.deepEqual(runtime.frame().focusPath, ['column:0', 'dialog-launcher']);
});

test('TUI runtime focuses top-layer context menus and open menu triggers', async () => {
  const contextMenuApp = defineTui({
    id: 'context-menu-focus',
    init: () => ({ active: 'idle' }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => overlay([
      focusInput({ id: 'page-field', presentation: { value: state.active, cursor: 0 }, keys: { enter: () => ({ active: 'page' }) } }),
      contextMenu({
    id: 'actions-menu',
    title: 'Actions',
    presentation: {
      kind: 'open',
      anchor: { kind: 'cursor', row: 1, column: 1 },
      menu: {
        activePath: ['copy'],
        items: [
          { kind: 'action', id: 'copy', label: 'Copy' },
          { kind: 'action', id: 'paste', label: 'Paste' }
        ]
      }
    },
    onTransition: (action) => ({ active: action.kind }),
    onActivate: (event) => ({
      active: event.id === 'copy' ? 'context-menu' : event.kind
    }),
    meta: {
        layer: {
            zIndex: 10
        }
    }
})
    ], {
      id: 'context-menu-root'
    })
  });
  const contextMenuRuntime = createTuiRuntime({
    app: contextMenuApp,
    host: createTerminalHarness({ terminalSize: { columns: 24, rows: 5 } }).host
  });

  await contextMenuRuntime.start();
  const contextResult = await contextMenuRuntime.handleInput({ kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });

  assert.equal(contextResult.handled, true);
  assert.deepEqual(contextMenuRuntime.frame().focusPath, [
    'context-menu-root',
    'actions-menu',
    'actions-menu:popup:menu'
  ]);
  assert.deepEqual(contextMenuRuntime.state(), { active: 'context-menu' });

  const menuTriggerApp = defineTui({
    id: 'menuTrigger-focus',
    init: () => ({ active: 'idle' }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => overlay([
      focusInput({ id: 'page-field', presentation: { value: state.active, cursor: 0 }, keys: { enter: () => ({ active: 'page' }) } }),
      menuTrigger({
    id: 'theme-menuTrigger',
    label: 'Theme',
    presentation: {
      kind: 'open',
      active: 'dark',
      menu: {
        activePath: ['dark'],
        items: [
          { kind: 'action', id: 'light', label: 'Light' },
          { kind: 'action', id: 'dark', label: 'Dark' }
        ]
      }
    },
    items: [
        { kind: 'action', id: 'light', label: 'Light' },
        { kind: 'action', id: 'dark', label: 'Dark' }
    ],
    onTransition: (action) => ({ active: action.kind }),
    onActivate: (event) => ({
      active: event.id === 'dark' ? 'menuTrigger' : event.kind
    }),
    meta: {
        layer: {
            zIndex: 10
        }
    }
})
    ], {
      id: 'menuTrigger-root'
    })
  });
  const menuTriggerRuntime = createTuiRuntime({
    app: menuTriggerApp,
    host: createTerminalHarness({ terminalSize: { columns: 24, rows: 5 } }).host
  });

  await menuTriggerRuntime.start();
  const menuTriggerResult = await menuTriggerRuntime.handleInput({ kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });

  assert.equal(menuTriggerResult.handled, true);
  assert.deepEqual(menuTriggerRuntime.frame().focusPath, [
    'menuTrigger-root',
    'theme-menuTrigger',
    'theme-menuTrigger:popup:menu'
  ]);
  assert.deepEqual(menuTriggerRuntime.state(), { active: 'menuTrigger' });
});

test('TUI runtime traverses multiple defined focus targets within one element', async () => {
  const renderedTargets = [];
  const accessibleTargets = [];
  const renderer = {
    ...leafComponentDefinition,
    accessibleRole: 'application',
    render({ target, bounds, focusedTargetId }) {
      renderedTargets.push(focusedTargetId);
      target.write(bounds.row, bounds.column, [{ text: 'AB' }]);
    },
    accessibility({ id, focusedTargetId }) {
      accessibleTargets.push(focusedTargetId);
      return {
        id,
        role: 'application',
        label: 'Custom focus regions',
        children: ['left', 'right'].map((targetId) => ({
          id: targetId,
          role: 'button',
          label: targetId,
          ...(focusedTargetId === targetId ? { focused: true } : {})
        }))
      };
    },
    focusTargets({ bounds }) {
      return [
        {
          id: 'left',
          bounds: { row: bounds.row, column: bounds.column, width: 1, height: 1 },
          order: 2
        },
        {
          id: 'right',
          bounds: { row: bounds.row, column: bounds.column + 1, width: 1, height: 1 },
          order: 1
        }
      ];
    }
  };
  const app = defineTui({
    id: 'defined-focus-targets',
    init: () => ({}),
    update: (state) => ({ state }),
    view: () => componentElement({ id: 'component-board', definition: renderer })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 10, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  assert.deepEqual(runtime.frame().focusPath, ['component-board', 'right']);
  assert.equal(renderedTargets.at(-1), 'right');
  assert.equal(accessibleTargets.at(-1), 'right');

  await runtime.handleInput({ kind: 'key', key: 'tab', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  assert.deepEqual(runtime.frame().focusPath, ['component-board', 'left']);
  assert.equal(renderedTargets.at(-1), 'left');
  assert.equal(accessibleTargets.at(-1), 'left');
});

test('TUI updates can focus a specific component target after rendering new state', async () => {
  const renderer = {
    ...leafComponentDefinition,
    accessibleRole: 'group',
    render({ target, bounds }) {
      target.write(bounds.row, bounds.column, [{ text: 'AB' }]);
    },
    accessibility({ id, focusedTargetId }) {
      return {
        id,
        role: 'group',
        children: ['left', 'right'].map((targetId) => ({
          id: targetId,
          role: 'button',
          label: targetId,
          ...(focusedTargetId === targetId ? { focused: true } : {})
        }))
      };
    },
    focusTargets({ bounds }) {
      return [
        { id: 'left', bounds: { ...bounds, width: 1 } },
        { id: 'right', bounds: { ...bounds, column: bounds.column + 1, width: 1 } }
      ];
    }
  };
  const app = defineTui({
    id: 'programmatic-defined-focus',
    init: () => ({ active: 'left' }),
    update: (_state, message) => ({
      state: { active: message.targetId },
      focus: {
        kind: 'elementTarget',
        elementId: 'component-board',
        targetId: message.targetId
      }
    }),
    view: () => componentElement({ id: 'component-board', definition: renderer })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 10, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.dispatch({ targetId: 'right' });

  assert.deepEqual(runtime.frame().focusPath, ['component-board', 'right']);
  assert.equal(runtime.frame().accessibility.root.children?.[1]?.focused, true);
});

test('TUI frame accessibility uses element metadata and marks only the active focus target', async () => {
  const app = defineTui({
    id: 'a11y-frame',
    init: () => ({ active: 'idle' }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => column([
      componentElement({
        id: 'first-field',
        label: state.active,
        definition: {
          ...leafComponentDefinition,
          accessibleRole: 'textbox',
          render: ({ target, model }) => target.write(0, 0, [{ text: model.label }]),
          focusTargets: ({ bounds }) => [{ id: 'self', bounds }],
          accessibility: ({ id, model, focused }) => ({
            id,
            role: 'textbox',
            label: 'First field',
            description: 'Primary input',
            value: model.label,
            ...(focused ? { focused: true } : {})
          })
        }
      }),
      listbox({
        projectItem: (item) => ({ id: String(item), label: String(item) }),
        id: 'choices',
        items: ['Alpha', 'Beta'],
        presentation: {
          activeId: 'Beta',
          selection: { mode: 'single', selectedId: 'Beta' }
        },
        onTransition: () => ({ active: 'none' })
      }),
      dataGrid({
        id: 'grid',
        rows: [['A1', 'B1']],
        getRowId: (_row, index) => String(index),
        presentation: { interaction: { kind: 'row', selection: { mode: 'single' } } },
        onTransition: () => ({ active: 'none' })
      })
    ])
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 24, rows: 8 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.handleInput({ kind: 'key', key: 'tab', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  const snapshot = runtime.frame().accessibility;
  const first = snapshot.root.children[0];
  const choices = snapshot.root.children[1];
  const tableNode = snapshot.root.children[2];

  assert.equal(snapshot.source, 'tui');
  assert.deepEqual(runtime.frame().focusPath, ['column:0', 'choices']);
  assert.deepEqual(snapshot.focusPath, ['column-1-1', 'choices']);
  assert.equal(first?.label, 'First field');
  assert.equal(first?.description, 'Primary input');
  assert.equal(first?.focused, undefined);
  assert.equal(choices?.role, 'listbox');
  assert.equal(choices?.focused, true);
  assert.deepEqual(choices?.children?.map((node) => [node.role, node.label, node.selected]), [
    ['option', 'Alpha', false],
    ['option', 'Beta', true]
  ]);
  assert.equal(tableNode?.role, 'grid');
  assert.equal(tableNode?.children?.[0]?.children?.[1]?.value, 'B1');
});

test('TUI runtime uses app-level accessibility descriptions for frames and exits', async () => {
  const app = defineTui({
    id: 'custom-a11y',
    init: () => ({ label: 'ready' }),
    update: (state) => ({ state, exit: {} }),
    view: (state) => focusInput({ id: 'custom-field', presentation: { value: state.label, cursor: 0 }, onAction: (action) => action.kind === 'submit' ? { done: true } : ignoreMessage() }),
    accessibility: {
      describe: (state) => ({
        source: 'tui',
        title: 'Custom \u001B[31maccessibility\u001B[0m',
        root: {
          id: 'custom-root',
          role: 'application',
          label: `Accessible \u001B[31m${state.label}\u001B[0m`,
          children: [{ id: 'custom-status', role: 'status', label: state.label }]
        },
        focusPath: ['custom-root', 'custom-status'],
        diagnostics: []
      })
    }
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 3 } });
  const running = runTui(app, harness.host);

  await waitUntil(() => harness.frames().length === 1);
  assert.match(renderFramePlain(harness.frames()[0]), /ready/);
  assert.equal(harness.frames()[0].accessibility.title, 'Custom accessibility');
  assert.equal(harness.frames()[0].accessibility.root.id, 'custom-root');
  assert.equal(harness.frames()[0].accessibility.root.label, 'Accessible ready');
  assert.deepEqual(harness.frames()[0].accessibility.focusPath, ['custom-root', 'custom-status']);
  assert.equal(decodeAccessibleSnapshot(harness.frames()[0].accessibility).ok, true);

  harness.host.input('\r');
  const exit = await running;

  assert.equal(exit.status, 'completed');
  assert.equal(exit.snapshot.root.id, 'custom-root');
  assert.equal(exit.snapshot.root.label, 'Accessible ready');
});

test('TUI runtime falls back when app-level accessibility is structurally invalid', async () => {
  const app = defineTui({
    id: 'invalid-custom-a11y',
    init: () => ({ label: 'ready' }),
    update: (state) => ({ state }),
    view: (state) => focusInput({ id: 'safe-field', presentation: { value: state.label, cursor: 0 } }),
    accessibility: {
      describe: () => ({
        source: 'tui',
        root: { id: 'custom-root', role: 'application', label: 'Custom root' },
        focusPath: ['missing-root'],
        diagnostics: []
      })
    }
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const snapshot = runtime.frame().accessibility;

  assert.equal(snapshot.root.id, 'safe-field');
  assert.equal(snapshot.diagnostics[0]?.code, 'ACCESSIBLE_SNAPSHOT_INVALID');
  assert.equal(decodeAccessibleSnapshot(snapshot).ok, true);
});
