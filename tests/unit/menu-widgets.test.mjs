import assert from 'node:assert/strict';
import test from 'node:test';

import { defineTui } from '../../dist/tui/index.js';
import {
  validateAccessibleSnapshot } from '../../dist/accessibility/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { createTuiRuntime } from '../../dist/tui/index.js';
import {
  renderFramePlain,
  renderElementFrame
} from '../../dist/renderer/index.js';
import {
  contextMenu,
  dropdownMenu,
  menu,
  menuBar
} from '../../dist/components/index.js';
import {
  contextMenuPresentation,
  dropdownMenuPresentation,
  menuBarPresentation,
  menuPresentation
} from '../../dist/behavior/index.js';
import { column } from '../../dist/layout/index.js';

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
const mouseRelease = (row, column) => ({
  kind: 'mouse',
  sequence: '',
  encoding: 'sgr',
  action: 'release',
  button: 'none',
  row,
  column,
  rawCode: 0,
  modifiers: { shift: false, alt: false, ctrl: false }
});

const items = [
  { id: 'new', label: 'New', description: 'Create item', shortcut: 'N' },
  {
    id: 'open',
    label: 'Open',
    children: [
      { id: 'recent', label: 'Recent' },
      { id: 'disabled-recent', label: 'Disabled Recent', disabled: true }
    ]
  },
  { id: 'autosave', label: 'Autosave', checked: true },
  { id: 'delete', label: 'Delete', tone: 'destructive' },
  { id: 'disabled', label: 'Disabled', disabled: true }
];

test('menu renders nested checked disabled items with menu accessibility', () => {
  const frame = renderElementFrame(menu({
    id: 'file-menu',
    presentation: menuPresentation(items, { activePath: ['open', 'recent'] })
  }), { columns: 40, rows: 8 });
  const output = renderFramePlain(frame);

  assert.match(output, /New\s+Create item\s+N/u);
  assert.match(output, /Create item/u);
  assert.match(output, /▾ Open/u);
  assert.match(output, /›\s+Recent/u);
  assert.match(output, /\[x\]/u);
  assert.match(output, /×\s+Delete/u);
  assert.equal(frame.cells.find((cell) => cell.text === 'D' && cell.source?.itemId === 'delete')?.style?.fg?.token, 'status.error');
  assert.match(output, /Disabled/u);
  assert.equal(frame.accessibility.root.role, 'menu');
  assert.equal(frame.accessibility.root.children?.find((node) => node.label === 'Recent')?.selected, true);
  assert.equal(frame.accessibility.root.children?.find((node) => node.label === 'Disabled Recent')?.disabled, true);
  assert.equal(frame.accessibility.root.children?.find((node) => node.label === 'Autosave')?.checked, true);
  assert.equal(validateAccessibleSnapshot(frame.accessibility).ok, true);
});

test('menuBar contextMenu and dropdownMenu render reusable menu surfaces', () => {
  const menuBarFrame = renderElementFrame(
    menuBar({
      id: 'main-menu',
      items: [
        { id: 'file', label: 'File' },
        { id: 'edit', label: 'Edit', disabled: true }
      ],
      presentation: menuBarPresentation([
        { id: 'file', label: 'File' },
        { id: 'edit', label: 'Edit', disabled: true }
      ], { kind: 'closed', active: 'file' })
    }),
    { columns: 44, rows: 3 }
  );
  const contextFrame = renderElementFrame(
    contextMenu({
      id: 'context',
      title: 'Actions',
      presentation: contextMenuPresentation(items, {
        kind: 'open',
        anchor: { kind: 'cursor', row: 3, column: 1 },
        menu: { activePath: ['autosave'] }
      })
    }),
    { columns: 44, rows: 13 }
  );
  const dropdownFrame = renderElementFrame(
    dropdownMenu({
      id: 'theme-dropdownMenu',
      label: 'Theme',
      items: [
        { id: 'light', label: 'Light' },
        { id: 'dark', label: 'Dark' }
      ],
      presentation: dropdownMenuPresentation([
        { id: 'light', label: 'Light' },
        { id: 'dark', label: 'Dark' }
      ], { kind: 'open', active: 'dark', menu: { activePath: ['dark'] } })
    }),
    { columns: 44, rows: 8 }
  );
  const output = [menuBarFrame, contextFrame, dropdownFrame].map(renderFramePlain).join('\n');

  assert.match(output, /› File  - Edit/u);
  assert.match(output, /Actions/u);
  assert.match(output, /Theme: \[Dark ▾\]/u);
  assert.match(output, /Light/u);
  assert.equal(menuBarFrame.cells.find((cell) => cell.text === 'F')?.source?.ownerKind, 'menuBar');
  assert.equal(contextFrame.accessibility.root.role, 'menu');
  assert.equal(dropdownFrame.cells.find((cell) => cell.text === 'D')?.source?.ownerKind, 'dropdownMenu');
  assert.equal(dropdownFrame.cells.find((cell) => cell.text === 'D')?.source?.label, 'dropdownMenu-value');
  assert.equal(menuBarFrame.accessibility.root.role, 'menubar');
  assert.equal(dropdownFrame.accessibility.root.expanded, true);
});

test('menus route keyboard and mouse interaction through generic focus and hit targets', async () => {
  const app = defineTui({
    id: 'menu-flow',
    init: () => ({ action: 'idle' }),
    update: (_state, message) => ({ state: { action: message.id ?? message.kind } }),
    view: (state) => column([
      menu({
        id: 'actions',
        presentation: menuPresentation(items, {
          activePath: state.action === 'recent' ? ['autosave'] : ['open', 'recent']
        }),
        onAction: (action) => action
      }),
      menuBar({
        id: 'bar',
        items: [
          { id: 'help', label: 'Help' }
        ],
        presentation: { kind: 'closed', active: 'help' },
        onAction: (action) => action
      })
    ])
  });
  const runtime = createTuiRuntime({ app, host: createMemoryTerminalHost({ viewport: { columns: 40, rows: 8 } }) });

  await runtime.start();
  const keyed = await runtime.handleInput(enter);
  const mousePressResult = await runtime.handleInput(mousePress(5, 2));
  const mouseReleaseResult = await runtime.handleInput(mouseRelease(5, 2));

  assert.equal(keyed.state.action, 'recent');
  assert.equal(mousePressResult.handled, false);
  assert.equal(mouseReleaseResult.state.action, 'help');
});
