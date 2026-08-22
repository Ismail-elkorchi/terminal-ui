import assert from 'node:assert/strict';
import test from 'node:test';

import { defineTui } from '../../dist/tui/index.js';
import {
  decodeAccessibleSnapshot,
  findAccessibleNode
} from '../../dist/accessibility/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { createTuiRuntime } from '../../dist/tui/index.js';
import {
  layoutElement,
  renderFramePlain,
  renderElementFrame
} from '../../dist/renderer/index.js';
import {
  contextMenu,
  menuTrigger,
  menu,
  menuBar
} from '../../dist/components/index.js';
import {
  contextMenuPresentation,
  menuTriggerPresentation,
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
  { kind: 'action', id: 'new', label: 'New', description: 'Create item', shortcut: { kind: 'key', key: 'n' } },
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

test('menu component renders nested checked disabled items with menu accessibility', () => {
  const frame = renderElementFrame(menu({ meta: { accessibleName: "Menu" },
    id: 'file-menu',
    presentation: menuPresentation(items, { activePath: ['open', 'recent'] }),
    onTransition: (action) => action
  }), { columns: 40, rows: 8 });
  const output = renderFramePlain(frame);

  assert.match(output, /New\s+Create item\s+N/u);
  assert.match(output, /Create item/u);
  assert.match(output, /▾ Open/u);
  assert.match(output, /›\s+Recent/u);
  assert.match(output, /☑/u);
  assert.match(output, /×\s+Delete/u);
  assert.equal(frame.cells.find((cell) => cell.text === 'D' && cell.source?.itemId === 'delete')?.style?.fg?.token, 'status.error');
  assert.match(output, /Disabled/u);
  assert.equal(frame.accessibility.root.role, 'menu');
  assert.equal(frame.accessibility.root.children?.find((node) => node.label === 'Recent')?.role, 'menuitem');
  assert.equal(frame.accessibility.root.children?.find((node) => node.label === 'Recent')?.selected, undefined);
  assert.equal(frame.accessibility.root.children?.find((node) => node.label === 'Disabled Recent')?.disabled, true);
  assert.equal(frame.accessibility.root.children?.find((node) => node.label === 'Autosave')?.role, 'menuitemcheckbox');
  assert.equal(frame.accessibility.root.children?.find((node) => node.label === 'Autosave')?.checked, true);
  assert.equal(decodeAccessibleSnapshot(frame.accessibility).status, 'success');
});

test('simple action menus omit unused checkbox and submenu columns', () => {
  const simpleItems = [
    { kind: 'action', id: 'alpha', label: 'Alpha' },
    { kind: 'action', id: 'beta', label: 'Beta' }
  ];
  const frame = renderElementFrame(menu({ meta: { accessibleName: "Menu" },
    id: 'compact-actions',
    presentation: menuPresentation(simpleItems, { activePath: ['alpha'] }),
    onTransition: (action) => action
  }), { columns: 20, rows: 2 });

  assert.equal(renderFramePlain(frame), '› Alpha\n  Beta');
  assert.equal(frame.cells.some((cell) => cell.source?.partName === 'checked'), false);
  assert.equal(frame.cells.some((cell) => cell.source?.partName === 'branch'), false);
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

test('menu radio groups permit at most one checked sibling', () => {
  assert.doesNotThrow(() => menuPresentation([
    { kind: 'radio', id: 'light', groupId: 'theme', label: 'Light', checked: false },
    { kind: 'radio', id: 'dark', groupId: 'theme', label: 'Dark', checked: true, disabled: true },
    {
      kind: 'submenu', id: 'nested', label: 'Nested', children: [
        { kind: 'radio', id: 'nested-light', groupId: 'theme', label: 'Nested light', checked: true }
      ]
    }
  ], { activePath: [] }));
  assert.throws(() => menuPresentation([
    { kind: 'radio', id: 'first', groupId: 'theme', label: 'First', checked: true },
    { kind: 'radio', id: 'second', groupId: 'theme', label: 'Second', checked: true }
  ], { activePath: [] }), /cannot contain more than one checked item/u);
});

test('menu models reject malformed structural item variants at the factory boundary', () => {
  assert.throws(() => menuPresentation([
    { kind: 'submenu', id: 'empty', label: 'Empty', children: [] }
  ], { activePath: [] }), /requires at least one child/u);
  assert.throws(() => menuPresentation([
    { kind: 'check', id: 'check', label: 'Check' }
  ], { activePath: [] }), /requires boolean checked state/u);
});

test('menu factories validate and own retained shortcut bindings', () => {
  const shortcut = { kind: 'key', key: 'n' };
  const element = menu({ meta: { accessibleName: "Menu" },
    id: 'shortcut-menu',
    presentation: menuPresentation([
      { kind: 'action', id: 'new', label: 'New', shortcut }
    ], { activePath: ['new'] }),
    onTransition: (action) => action
  });

  shortcut.key = 'x';
  assert.match(renderFramePlain(renderElementFrame(element, { columns: 20, rows: 1 })), /N$/u);
  assert.throws(() => menu({ meta: { accessibleName: "Menu" },
    id: 'invalid-shortcut-menu',
    presentation: menuPresentation([
      { kind: 'action', id: 'new', label: 'New', shortcut: { kind: 'text', text: 'n' } }
    ], { activePath: ['new'] }),
    onTransition: (action) => action
  }), /shortcut is invalid/u);
});

test('menuBar contextMenu and menuTrigger render reusable menu surfaces', () => {
  const menuBarFrame = renderElementFrame(
    menuBar({ meta: { accessibleName: "Menu bar" },
      id: 'main-menu',
      items: [
        { kind: 'action', id: 'file', label: 'File' },
        { kind: 'action', id: 'edit', label: 'Edit', disabled: true }
      ],
      presentation: menuBarPresentation([
        { kind: 'action', id: 'file', label: 'File' },
        { kind: 'action', id: 'edit', label: 'Edit', disabled: true }
      ], { kind: 'closed', active: 'file' }),
      onTransition: (action) => action
    }),
    { columns: 44, rows: 3 }
  );
  const contextFrame = renderElementFrame(
    contextMenu({ meta: { accessibleName: "Context menu" },
      id: 'context',
      title: 'Actions',
      presentation: contextMenuPresentation(items, {
        kind: 'open',
        anchor: { kind: 'cursor', row: 3, column: 1 },
        menu: { activePath: ['autosave'] }
      }),
      onTransition: (action) => action
    }),
    { columns: 44, rows: 13 }
  );
  const dropdownFrame = renderElementFrame(
    menuTrigger({ meta: { accessibleName: "Menu" },
      id: 'theme-menuTrigger',
      label: 'Theme',
      items: [
        { kind: 'action', id: 'light', label: 'Light' },
        { kind: 'action', id: 'dark', label: 'Dark' }
      ],
      presentation: menuTriggerPresentation([
        { kind: 'action', id: 'light', label: 'Light' },
        { kind: 'action', id: 'dark', label: 'Dark' }
      ], { kind: 'open', active: 'dark', menu: { activePath: ['dark'] } }),
      onTransition: (action) => action
    }),
    { columns: 44, rows: 8 }
  );
  const output = [menuBarFrame, contextFrame, dropdownFrame].map(renderFramePlain).join('\n');

  assert.match(output, /› File  - Edit/u);
  assert.match(output, /Actions/u);
  assert.match(output, /Theme: › Dark ▾/u);
  assert.match(output, /Light/u);
  assert.equal(menuBarFrame.cells.find((cell) => cell.text === 'F')?.source?.elementKind, 'terminal-ui/components/menu-bar');
  assert.equal(contextFrame.accessibility.root.role, 'menu');
  assert.equal(contextFrame.accessibility.root.children?.every((node) => node.role.startsWith('menuitem')), true);
  assert.equal(
    dropdownFrame.cells.find((cell) => cell.text === 'D')?.source?.elementKind,
    'terminal-ui/components/menu-trigger'
  );
  assert.equal(dropdownFrame.cells.find((cell) => cell.text === 'D')?.source?.description, 'value');
  assert.equal(menuBarFrame.accessibility.root.role, 'menubar');
  assert.equal(dropdownFrame.accessibility.root.children?.[0]?.expanded, true);
});

test('open menu bars name their popup from the active heading', () => {
  const frame = renderElementFrame(menuBar({
    id: 'main-menu',
    meta: { accessibleName: 'Application menu' },
    items,
    presentation: menuBarPresentation(items, {
      kind: 'open',
      active: 'open',
      menu: { activePath: ['recent'] }
    }),
    onTransition: (action) => action
  }), { columns: 44, rows: 8 });

  const popup = findAccessibleNode(frame.accessibility, 'main-menu:popup:menu');
  assert.equal(popup?.role, 'menu');
  assert.equal(popup?.label, 'Open');
  assert.equal(decodeAccessibleSnapshot(frame.accessibility).status, 'success');
});

test('open menu bars require an enabled submenu heading', () => {
  assert.throws(() => menuBar({
    id: 'invalid-menu',
    meta: { accessibleName: 'Application menu' },
    items,
    presentation: {
      kind: 'open',
      active: 'new',
      menu: menuPresentation(items, { activePath: ['new'] })
    },
    onTransition: (action) => action
  }), /active must identify an enabled submenu heading/u);
});

test('closed context menus do not publish focus or implementation accessibility scaffolding', () => {
  const frame = renderElementFrame(contextMenu({ meta: { accessibleName: "Context menu" },
    id: 'closed-context',
    presentation: contextMenuPresentation(items, { kind: 'closed' }),
    onTransition: (action) => action
  }), { columns: 24, rows: 4 });

  assert.equal(frame.focusPath, undefined);
  assert.equal(frame.accessibility.root.focused, undefined);
  assert.deepEqual(frame.accessibility.root.children, []);
});

test('internal popup nodes expose layout names without claiming public factory provenance', () => {
  const element = menuTrigger({ meta: { accessibleName: "Menu" },
    id: 'layout-dropdown',
    label: 'Layout',
    items: [
      { kind: 'action', id: 'one', label: 'One' },
      { kind: 'action', id: 'two', label: 'Two' }
    ],
    presentation: menuTriggerPresentation([
      { kind: 'action', id: 'one', label: 'One' },
      { kind: 'action', id: 'two', label: 'Two' }
    ], { kind: 'open', active: 'one', menu: { activePath: ['one'] } }),
    onTransition: (action) => action
  });
  const layout = layoutElement(element, { columns: 24, rows: 6 });
  const nodes = collectLayoutNodes(layout);

  assert.equal(nodes.find((node) => node.id === 'layout-dropdown:popup')?.factoryName, 'surface');
  assert.equal(
    nodes.find((node) => node.id === 'layout-dropdown:popup:menu')?.factoryName,
    'terminal-ui/components/menu'
  );
  assert.equal(nodes.some((node) => Object.hasOwn(node, 'factory')), false);
});

test('menus route keyboard and mouse interaction through generic focus and hit targets', async () => {
  const app = defineTui({
    id: 'menu-flow',
    init: () => ({ state: ({ action: 'idle' }) }),
    update: (_state, message) => ({ state: { action: message.id ?? message.kind } }),
    view: (state) => column([
      menu({ meta: { accessibleName: "Menu" },
        id: 'actions',
        presentation: menuPresentation(items, {
          activePath: state.action === 'recent' ? ['autosave'] : ['open', 'recent']
        }),
        onTransition: (action) => action,
        onActivate: (event) => event
      }),
      menuBar({ meta: { accessibleName: "Menu bar" },
        id: 'bar',
        items: [
          { kind: 'action', id: 'help', label: 'Help' }
        ],
        presentation: { kind: 'closed', active: 'help' },
        onTransition: (action) => action,
        onActivate: (event) => event
      })
    ], {
      sizes: [{ kind: 'fill' }, { kind: 'fill' }]
    })
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

function collectLayoutNodes(root) {
  return [root, ...root.children.flatMap(collectLayoutNodes)];
}
