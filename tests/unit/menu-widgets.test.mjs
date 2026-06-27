import assert from 'node:assert/strict';
import test from 'node:test';

import { validateAccessibleSnapshot } from '../../dist/accessibility/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { createTuiRuntime, defineTui, renderFrame, renderWidgetFrame } from '../../dist/tui/index.js';
import { contextMenu, dropdown, menu, menuBar, stack } from '../../dist/widgets/index.js';

const enter = { kind: 'key', key: 'enter', ctrl: false, alt: false, shift: false, meta: false };
const mousePress = (row, column) => ({
  kind: 'mouse',
  sequence: '',
  encoding: 'sgr',
  action: 'press',
  button: 'left',
  row,
  column,
  rawCode: 0,
  modifiers: { shift: false, alt: false, ctrl: false }
});

const items = [
  { id: 'new', label: 'New', message: { kind: 'new' }, shortcut: 'N' },
  {
    id: 'open',
    label: 'Open',
    expanded: true,
    children: [
      { id: 'recent', label: 'Recent', message: { kind: 'recent' } },
      { id: 'disabled-recent', label: 'Disabled Recent', disabled: true, message: { kind: 'disabled' } }
    ]
  },
  { id: 'autosave', label: 'Autosave', checked: true, message: { kind: 'autosave' } },
  { id: 'disabled', label: 'Disabled', disabled: true, message: { kind: 'disabled' } }
];

test('menu renders nested checked disabled items with menu accessibility', () => {
  const frame = renderWidgetFrame(menu({
    id: 'file-menu',
    items,
    selected: 'recent'
  }), { columns: 40, rows: 8 });
  const output = renderFrame(frame);

  assert.match(output, /New  N/u);
  assert.match(output, /▾ Open/u);
  assert.match(output, /›\s+Recent/u);
  assert.match(output, /\[x\]/u);
  assert.match(output, /Disabled/u);
  assert.equal(frame.accessibility.root.role, 'menu');
  assert.equal(frame.accessibility.root.children?.find((node) => node.label === 'Recent')?.selected, true);
  assert.equal(frame.accessibility.root.children?.find((node) => node.label === 'Disabled Recent')?.disabled, true);
  assert.equal(frame.accessibility.root.children?.find((node) => node.label === 'Autosave')?.checked, true);
  assert.equal(validateAccessibleSnapshot(frame.accessibility).ok, true);
});

test('menuBar contextMenu and dropdown render reusable menu surfaces', () => {
  const widget = stack([
    menuBar({
      id: 'main-menu',
      items: [
        { id: 'file', label: 'File', message: { kind: 'file' } },
        { id: 'edit', label: 'Edit', message: { kind: 'edit' }, disabled: true }
      ],
      selected: 'file'
    }),
    contextMenu({
      id: 'context',
      title: 'Actions',
      items,
      selected: 'autosave'
    }),
    dropdown({
      id: 'theme-dropdown',
      label: 'Theme',
      selected: 'dark',
      open: true,
      items: [
        { id: 'light', label: 'Light', message: { kind: 'theme', value: 'light' } },
        { id: 'dark', label: 'Dark', message: { kind: 'theme', value: 'dark' } }
      ]
    })
  ]);

  const frame = renderWidgetFrame(widget, { columns: 44, rows: 13 });
  const output = renderFrame(frame);

  assert.match(output, /File  Edit/u);
  assert.match(output, /Actions/u);
  assert.match(output, /Theme: Dark ▾/u);
  assert.match(output, /Light/u);
  assert.equal(frame.accessibility.root.children?.[0]?.role, 'menu');
  assert.equal(frame.accessibility.root.children?.[1]?.role, 'menu');
  assert.equal(frame.accessibility.root.children?.[2]?.expanded, true);
});

test('menus route keyboard and mouse interaction through generic focus and hit targets', async () => {
  const app = defineTui({
    id: 'menu-flow',
    init: () => ({ action: 'idle' }),
    update: (_state, message) => ({ state: { action: message.kind } }),
    view: (state) => stack([
      menu({
        id: 'actions',
        items,
        selected: state.action === 'recent' ? 'autosave' : 'recent'
      }),
      menuBar({
        id: 'bar',
        items: [
          { id: 'help', label: 'Help', message: { kind: 'help' } }
        ]
      })
    ])
  });
  const runtime = createTuiRuntime({ app, host: createMemoryTerminalHost({ viewport: { columns: 40, rows: 8 } }) });

  await runtime.start();
  const keyed = await runtime.handleInput(enter);
  const mouse = await runtime.handleInput(mousePress(5, 1));

  assert.equal(keyed.state.action, 'recent');
  assert.equal(mouse.state.action, 'help');
});
