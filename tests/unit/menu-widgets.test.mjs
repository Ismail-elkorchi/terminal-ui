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

const enter = { kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' };
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
  { kind: 'action', id: 'new', label: 'New', description: 'Create item', shortcut: 'N' },
  {
    kind: 'submenu',
    id: 'open',
    label: 'Open',
    children: [
      { kind: 'action', id: 'recent', label: 'Recent' },
      { kind: 'action', id: 'disabled-recent', label: 'Disabled Recent', disabled: true }
    ]
  },
  { kind: 'check', id: 'autosave', label: 'Autosave', checked: true },
  { kind: 'action', id: 'delete', label: 'Delete', tone: 'destructive' },
  { kind: 'action', id: 'disabled', label: 'Disabled', disabled: true }
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
  assert.equal(frame.accessibility.root.children?.find((node) => node.label === 'Recent')?.role, 'menuitem');
  assert.equal(frame.accessibility.root.children?.find((node) => node.label === 'Recent')?.selected, undefined);
  assert.equal(frame.accessibility.root.children?.find((node) => node.label === 'Disabled Recent')?.disabled, true);
  assert.equal(frame.accessibility.root.children?.find((node) => node.label === 'Autosave')?.role, 'menuitemcheckbox');
  assert.equal(frame.accessibility.root.children?.find((node) => node.label === 'Autosave')?.checked, true);
  assert.equal(validateAccessibleSnapshot(frame.accessibility).ok, true);
});

test('menu models reject duplicate identities across nested branches', () => {
  assert.throws(() => menuPresentation([
    {
      kind: 'submenu',
      id: 'file',
      label: 'File',
      children: [{ kind: 'action', id: 'duplicate', label: 'Open' }]
    },
    { kind: 'action', id: 'duplicate', label: 'Close' }
  ], { activePath: [] }), /menu item ids must be unique; duplicate id: duplicate/u);
});

test('menu models reject malformed structural item variants at the authoring boundary', () => {
  assert.throws(() => menuPresentation([
    { kind: 'submenu', id: 'empty', label: 'Empty', children: [] }
  ], { activePath: [] }), /requires at least one child/u);
  assert.throws(() => menuPresentation([
    { kind: 'check', id: 'check', label: 'Check' }
  ], { activePath: [] }), /requires boolean checked state/u);
});

test('menuBar contextMenu and dropdownMenu render reusable menu surfaces', () => {
  const menuBarFrame = renderElementFrame(
    menuBar({
      id: 'main-menu',
      items: [
        { kind: 'action', id: 'file', label: 'File' },
        { kind: 'action', id: 'edit', label: 'Edit', disabled: true }
      ],
      presentation: menuBarPresentation([
        { kind: 'action', id: 'file', label: 'File' },
        { kind: 'action', id: 'edit', label: 'Edit', disabled: true }
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
        { kind: 'action', id: 'light', label: 'Light' },
        { kind: 'action', id: 'dark', label: 'Dark' }
      ],
      presentation: dropdownMenuPresentation([
        { kind: 'action', id: 'light', label: 'Light' },
        { kind: 'action', id: 'dark', label: 'Dark' }
      ], { kind: 'open', active: 'dark', menu: { activePath: ['dark'] } })
    }),
    { columns: 44, rows: 8 }
  );
  const output = [menuBarFrame, contextFrame, dropdownFrame].map(renderFramePlain).join('\n');

  assert.match(output, /› File  - Edit/u);
  assert.match(output, /Actions/u);
  assert.match(output, /Theme: \[Dark ▾\]/u);
  assert.match(output, /Light/u);
  assert.equal(menuBarFrame.cells.find((cell) => cell.text === 'F')?.source?.elementKind, 'menuBar');
  assert.equal(contextFrame.accessibility.root.role, 'menu');
  assert.equal(dropdownFrame.cells.find((cell) => cell.text === 'D')?.source?.elementKind, 'dropdownMenu');
  assert.equal(dropdownFrame.cells.find((cell) => cell.text === 'D')?.source?.description, 'dropdownMenu-value');
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
          { kind: 'action', id: 'help', label: 'Help' }
        ],
        presentation: { kind: 'closed', active: 'help' },
        onAction: (action) => action
      })
    ])
  });
  const runtime = createTuiRuntime({ app, host: createMemoryTerminalHost({ terminalSize: { columns: 40, rows: 8 } }) });

  await runtime.start();
  const keyed = await runtime.handleInput(enter);
  const mousePressResult = await runtime.handleInput(mousePress(5, 2));
  const mouseReleaseResult = await runtime.handleInput(mouseRelease(5, 2));

  assert.equal(keyed.state.action, 'recent');
  assert.equal(mousePressResult.handled, true);
  assert.ok(mousePressResult.frame.focusPath?.includes('bar'));
  assert.equal(mouseReleaseResult.state.action, 'help');
});
