import assert from 'node:assert/strict';
import test from 'node:test';
import { calendarFixture } from '../helpers/calendar.mjs';
import { preparePaletteIndex, prepareScrollbackHistory } from '../../dist/behavior/index.js';

import {
  renderFramePlain,
  renderElementFrame
} from '../../dist/renderer/index.js';
import {
  statusIndicator,
  barChart,
  button,
  chart,
  checkbox,
  checkboxGroup,
  colorSwatchPicker,
  commandInput,
  calendar,
  dialog,
  dropdownMenu,
  helpBar,
  heatmap,
  list,
  menu,
  menuBar,
  notificationStack,
  palette,
  paginator,
  progressBar,
  scrollback,
  slider,
  spinner,
  statusBar,
  structuredBlock,
  table,
  tabs,
  text,
  textArea,
  textInput,
  toggleSwitch,
  tree
} from '../../dist/components/index.js';
import { prepareTextDocument, textCaretAt } from '../../dist/text/index.js';
import {
  row,
  column,
  surface
} from '../../dist/layout/index.js';

function styleFor(frame, textValue) {
  return frame.cells.find((cell) => cell.text === textValue)?.style;
}

function styleForCell(frame, predicate) {
  return frame.cells.find(predicate)?.style;
}

function stylesFor(frame, textValue) {
  return frame.cells.filter((cell) => cell.text === textValue).map((cell) => cell.style);
}

function styleForSource(frame, predicate) {
  return frame.cells.find((cell) => cell.source !== undefined && predicate(cell.source, cell))?.style;
}

function tokenStyle(token, extra = {}) {
  return { fg: { kind: 'theme', token }, ...extra };
}

test('button and text input use user style slots', () => {
  const buttonFrame = renderElementFrame(button({
    id: 'styled-button',
    label: 'Save',
    meta: {
        styles: {
            parts: { label: tokenStyle('status.success') },
            states: { focused: tokenStyle('status.success') }
        }
    }
}), { columns: 12, rows: 1 });
  const inputFrame = renderElementFrame(textInput({
    id: 'styled-input',
    presentation: { value: 'abc', cursor: 0 },
    meta: {
        styles: {
            parts: { value: tokenStyle('status.warning') },
            states: { focused: tokenStyle('status.warning') }
        }
    }
}), { columns: 12, rows: 1 });

  assert.equal(styleFor(buttonFrame, 'S')?.fg?.token, 'status.success');
  assert.equal(styleFor(inputFrame, 'a')?.fg?.token, 'status.warning');
});

test('button states use shared styles and structural markers', () => {
  const focusedFrame = renderElementFrame(button({
    id: 'focus',
    label: 'Focus'
  }), { columns: 16, rows: 1 }, { focusPath: ['focus'] });
  const pendingFrame = renderElementFrame(button({
    id: 'pending',
    label: 'Sync',
    state: 'pending'
  }), { columns: 16, rows: 1 });
  const destructiveFrame = renderElementFrame(button({
    id: 'destructive',
    label: 'Delete',
    tone: 'destructive'
  }), { columns: 18, rows: 1 });
  const pressedFrame = renderElementFrame(button({
    id: 'pressed',
    label: 'Pinned',
    pointer: { state: { pressedTargetId: 'pressed:control' } }
  }), { columns: 18, rows: 1 });
  const disabledFrame = renderElementFrame(button({
    id: 'disabled',
    label: 'Disabled',
    disabled: true
  }), { columns: 20, rows: 1 }, { focusPath: ['none'] });

  assert.equal(renderFramePlain(focusedFrame).trimEnd(), '[›Focus ]');
  assert.equal(renderFramePlain(pendingFrame).trimEnd(), '[ i Sync ]');
  assert.equal(renderFramePlain(destructiveFrame).trimEnd(), '[›× Delete ]');
  assert.equal(renderFramePlain(pressedFrame).trimEnd(), '[›● Pinned ]');
  assert.equal(renderFramePlain(disabledFrame).trimEnd(), '[ - Disabled ]');
  assert.equal(styleFor(pendingFrame, 'S')?.fg?.token, 'status.pending');
  assert.equal(styleFor(destructiveFrame, 'D')?.fg?.token, 'status.error');
  assert.equal(styleFor(pressedFrame, 'P')?.bg?.token, 'selection.background');
  assert.equal(styleFor(disabledFrame, 'D')?.fg?.token, 'text.disabled');
  assert.equal(focusedFrame.cells.find((cell) => cell.text === '›')?.source?.label, 'chrome.focus');
  assert.equal(focusedFrame.cells.find((cell) => cell.text === '[')?.source?.label, 'chrome.open');
  assert.equal(pendingFrame.cells.find((cell) => cell.text === 'i')?.source?.label, 'state.marker');
  assert.equal(destructiveFrame.cells.find((cell) => cell.text === '×')?.source?.label, 'state.marker');
  assert.equal(pressedFrame.cells.find((cell) => cell.text === '●')?.source?.label, 'state.marker');
  assert.equal(disabledFrame.cells.find((cell) => cell.text === '-')?.source?.label, 'state.marker');
  assert.equal(disabledFrame.cells.find((cell) => cell.text === 'D')?.source?.label, 'label.text');
});

test('controlled pointer interaction resolves styles and source state across component families', () => {
  const checkboxFrame = renderElementFrame(checkbox({
    id: 'check',
    label: 'Enabled',
    checked: false,
    meta: { focus: { disabled: true } },
    pointer: { state: { hoveredTargetId: 'check:control' } }
  }), { columns: 20, rows: 1 });
  const listFrame = renderElementFrame(list({
    id: 'items',
    items: ['Alpha', 'Beta'],
    projectItem: (item) => ({ id: item, label: item }),
    pointer: { state: { hoveredTargetId: 'items:option:Beta' } }
  }), { columns: 20, rows: 2 });
  const tabFrame = renderElementFrame(tabs({
    id: 'views',
    selected: 'one',
    tabs: [
      { id: 'one', label: 'One', panel: text('One') },
      { id: 'two', label: 'Two', panel: text('Two') }
    ],
    pointer: { state: { pressedTargetId: 'views:tab:two' } }
  }), { columns: 24, rows: 2 });
  const menuFrame = renderElementFrame(menu({
    id: 'actions',
    presentation: {
      activePath: ['open'],
      items: [
        { kind: 'action', id: 'open', label: 'Open' },
        { kind: 'action', id: 'save', label: 'Save' }
      ]
    },
    pointer: { state: { hoveredTargetId: 'actions:save' } }
  }), { columns: 20, rows: 2 });
  const commandFrame = renderElementFrame(commandInput({
    id: 'command',
    presentation: { value: '/o', cursor: 0, suggestions: [{ value: '/open', label: 'Open' }, { value: '/save', label: 'Save' }], selectedSuggestion: 0 },
    display: 'expanded',
    pointer: { state: { hoveredTargetId: 'command:suggestion:1' } }
  }), { columns: 24, rows: 3 });
  const paginatorFrame = renderElementFrame(paginator({
    id: 'pages',
    page: 2,
    pageCount: 4,
    onAction: () => undefined,
    pointer: { state: { pressedTargetId: 'pages:next' } }
  }), { columns: 40, rows: 1 });
  const notificationFrame = renderElementFrame(notificationStack({
    id: 'notices',
    presentation: { kind: 'live', items: [{ id: 'ready', title: 'Ready', tone: 'info' }] },
    pointer: { state: { hoveredTargetId: 'notices:notification:ready' } }
  }), { columns: 30, rows: 6 });

  assert.equal(styleFor(checkboxFrame, 'E')?.bg?.token, 'focus.background');
  assert.equal(checkboxFrame.cells.find((cell) => cell.text === 'E')?.source?.state, 'hovered');
  assert.equal(styleFor(listFrame, 'B')?.bg?.token, 'focus.background');
  assert.equal(listFrame.cells.find((cell) => cell.text === 'B')?.source?.state, 'hovered');
  assert.equal(styleFor(tabFrame, 'T')?.bg?.token, 'selection.background');
  assert.equal(tabFrame.cells.find((cell) => cell.text === 'T')?.source?.state, 'pressed');
  assert.equal(styleFor(menuFrame, 'S')?.bg?.token, 'focus.background');
  assert.equal(menuFrame.cells.find((cell) => cell.text === 'S')?.source?.state, 'hovered');
  assert.equal(styleFor(commandFrame, 'S')?.bg?.token, 'focus.background');
  assert.equal(commandFrame.cells.find((cell) => cell.text === 'S')?.source?.state, 'hovered');
  assert.equal(paginatorFrame.cells.find((cell) => cell.source?.part === 'control.next')?.source?.state, 'pressed');
  assert.equal(notificationFrame.cells.find((cell) =>
    cell.source?.itemId === 'ready' && cell.source.part === 'title'
  )?.source?.state, 'hovered');
});

test('text entry chrome uses shared border focus and error styles', () => {
  const inputFrame = renderElementFrame(textInput({
    id: 'query',
    presentation: { value: 'abc', cursor: 0 },
    meta: {
        styles: {
            parts: { border: tokenStyle('status.info') },
            states: { focused: tokenStyle('status.success') }
        }
    }
}), { columns: 16, rows: 1 }, { focusPath: ['query'] });
  const areaFrame = renderElementFrame(textArea({
    id: 'body',
    presentation: { document: prepareTextDocument('details'), caret: textCaretAt(0 )},
    error: 'Required',
    meta: {
        styles: {
            parts: { error: tokenStyle('status.error') }
        }
    }
}), { columns: 16, rows: 2 });

  assert.equal(renderFramePlain(inputFrame).trimEnd(), '›[ abc ]');
  assert.equal(styleFor(inputFrame, '›')?.fg?.token, 'status.success');
  assert.equal(renderFramePlain(areaFrame).split('\n')[0], '× details');
  assert.equal(styleFor(areaFrame, '×')?.fg?.token, 'status.error');
});

test('menu palette table and tree use selected placeholder and title slots', () => {
  const menuFrame = renderElementFrame(menuBar({
    id: 'styled-menu',
    presentation: { kind: 'closed', active: 'file' },
    items: [
        { kind: 'action', id: 'file', label: 'File' },
        { kind: 'action', id: 'edit', label: 'Edit' }
    ],
    meta: {
        styles: {
            states: { selected: tokenStyle('status.success') }
        }
    }
}), { columns: 20, rows: 1 });
  const paletteFrame = renderElementFrame(palette({
    id: 'styled-palette',
    title: 'Commands',
    index: preparePaletteIndex([]),
    meta: {
        styles: {
            parts: {
              title: tokenStyle('status.error'),
              empty: tokenStyle('status.warning')
            }
        }
    }
}), { columns: 24, rows: 3 });
  const tableFrame = renderElementFrame(table({
    getRowId: (_row, index) => String(index),
    id: 'empty-table',
    rows: [],
    columns: [{
      id: 'name-0', value: (row) => Array.isArray(row) ? row[0] : row, header: 'Name' }],
    emptyText: 'No data',
    meta: {
        styles: {
            parts: { empty: tokenStyle('status.warning') }
        }
    }
}), { columns: 20, rows: 2 });
  const treeFrame = renderElementFrame(tree({
    id: 'selected-tree',
    selected: 'api',
    nodes: [{ id: 'api', label: 'API', kind: 'leaf' }],
    meta: {
        styles: {
            states: { selected: tokenStyle('status.success') }
        }
    }
}), { columns: 16, rows: 1 });

  assert.equal(styleFor(menuFrame, 'F')?.fg?.token, 'status.success');
  assert.equal(styleFor(paletteFrame, 'C')?.fg?.token, 'status.error');
  assert.equal(styleFor(paletteFrame, 'N')?.fg?.token, 'status.warning');
  assert.equal(styleForCell(tableFrame, (cell) => cell.row > 1 && cell.text === 'N')?.fg?.token, 'status.warning');
  assert.equal(styleFor(treeFrame, 'A')?.fg?.token, 'status.success');
});

test('list table and tree share data navigation selection and match styles', () => {
  const listFrame = renderElementFrame(list({
    projectItem: (item) => ({ id: String(item), label: String(item) }),
    id: 'styled-list',
    items: ['Atlas', 'Pulse'],
    selectedId: 'Atlas',
    filterQuery: 'at'
  }), { columns: 18, rows: 2 });
  const tableFrame = renderElementFrame(table({
    getRowId: (_row, index) => String(index),
    id: 'styled-table',
    presentation: { selectedRowId: '0' },
    columns: [{
      id: 'name-0', value: (row) => Array.isArray(row) ? row[0] : row, header: 'Name', width: 8 }],
    rows: [['Atlas'], ['Pulse']]
  }), { columns: 18, rows: 3 });
  const activeTableFrame = renderElementFrame(table({
    getRowId: (_row, index) => String(index),
    id: 'active-table',
    presentation: { selectedCell: { rowId: '0', column: 0 } },
    columns: [{
      id: 'name-0', value: (row) => Array.isArray(row) ? row[0] : row, header: 'Name', width: 8 }],
    rows: [['Atlas'], ['Pulse']]
  }), { columns: 18, rows: 3 });
  const treeFrame = renderElementFrame(tree({
    id: 'filtered-tree',
    filterQuery: 'api',
    nodes: [{
      id: 'root',
      label: 'Workspace',
      kind: 'branch',
      expanded: true,
      children: [{ id: 'api', label: 'API Layer', kind: 'leaf' }]
    }]
  }), { columns: 24, rows: 3 });

  assert.equal(styleForCell(listFrame, (cell) => cell.text === 'A')?.bg?.token, 'selection.background');
  assert.equal(styleForCell(listFrame, (cell) => cell.text === 'A')?.fg?.token, 'menu.match');
  assert.equal(styleForCell(tableFrame, (cell) => cell.text === 'A')?.bg?.token, 'selection.background');
  assert.equal(styleForCell(activeTableFrame, (cell) => cell.text === 'A')?.fg?.token, 'selection.foreground');
  assert.equal(styleForCell(activeTableFrame, (cell) => cell.text === 'A')?.bg?.token, 'selection.background');
  assert.equal(styleForCell(treeFrame, (cell) => cell.text === '▾')?.fg?.token, 'tree.branch');
  assert.equal(styleForCell(treeFrame, (cell) => cell.text === 'A')?.fg?.token, 'menu.match');
  assert.equal(listFrame.cells.find((cell) => cell.text === 'A')?.source?.label, 'item.Atlas.match');
  assert.equal(tableFrame.cells.find((cell) => cell.text === 'A')?.source?.label, 'row.0.cell.0');
  assert.equal(activeTableFrame.cells.find((cell) => cell.text === 'A')?.source?.label, 'row.0.cell.0');
  assert.equal(treeFrame.cells.find((cell) => cell.text === 'A')?.source?.label, 'node.api.match');
});

test('default interactive widget anatomy uses theme tokens instead of terminal defaults', () => {
  const buttonFrame = renderElementFrame(button({
    id: 'primary',
    label: 'Save',
    tone: 'primary',
    meta: {
        focus: { disabled: true }
    }
}), { columns: 16, rows: 1 }, { focusPath: ['none'] });
  const inputFrame = renderElementFrame(textInput({
    id: 'query',
    presentation: { value: 'find', cursor: 0 },
    meta: {
        focus: { disabled: true }
    }
}), { columns: 18, rows: 1 });
  const commandFrame = renderElementFrame(commandInput({
    id: 'command',
    presentation: { value: '/open README.md', cursor: 0, suggestions: [
      { value: '/open', label: 'Open file' },
      { value: '/save', label: 'Save file' }
    ], selectedSuggestion: 0 },
    display: 'expanded',
  }), { columns: 36, rows: 3 });
  const menuFrame = renderElementFrame(menu({
    id: 'menu',
    presentation: {
      activePath: ['open'],
      items: [
        { kind: 'action', id: 'open', label: 'Open' },
        { kind: 'action', id: 'save', label: 'Save' }
      ]
    }
  }), { columns: 20, rows: 2 });
  const dropdownMenuFrame = renderElementFrame(dropdownMenu({
    id: 'region',
    label: 'Region',
    meta: { focus: { disabled: true } },
    presentation: { kind: 'closed', active: 'us' },
    items: [
      { kind: 'action', id: 'us', label: 'United States' }
    ]
  }), { columns: 32, rows: 1 });
  const paletteFrame = renderElementFrame(palette({
    id: 'palette',
    query: 'o',
    selected: 1,
    index: preparePaletteIndex([
      { id: 'open', label: 'Open file' },
      { id: 'toggle', label: 'Toggle theme' }
    ])
  }), { columns: 36, rows: 5 });
  const tabsFrame = renderElementFrame(tabs({
    id: 'tabs',
    selected: 'one',
    tabs: [
      { id: 'one', label: 'One', panel: text('One') },
      { id: 'two', label: 'Two', panel: text('Two') }
    ]
  }), { columns: 28, rows: 2 });
  const tableFrame = renderElementFrame(table({
    getRowId: (_row, index) => String(index),
    id: 'table',
    columns: [{
      id: 'name-0', value: (row) => Array.isArray(row) ? row[0] : row, header: 'Name' }],
    rows: [['Atlas'], ['Pulse']]
  }), { columns: 18, rows: 3 });
  const treeFrame = renderElementFrame(tree({
    id: 'tree',
    nodes: [{
      id: 'root',
      label: 'Workspace',
      kind: 'branch',
      expanded: true,
      children: [{ id: 'api', label: 'API', kind: 'leaf' }]
    }]
  }), { columns: 24, rows: 2 });
  const noticeFrame = renderElementFrame(notificationStack({
    id: 'notices',
    presentation: { kind: 'live', items: [{ id: 'saved', title: 'Saved', message: 'State stored', tone: 'success' }] },
    maxWidth: 24
  }), { columns: 32, rows: 6 });

  assert.equal(styleForSource(buttonFrame, (source) => source.label === 'label.text')?.fg?.token, 'control.primary.foreground');
  assert.equal(styleForSource(inputFrame, (source) => source.part === 'value')?.fg?.token, 'text.default');
  assert.equal(styleForSource(commandFrame, (source) => source.part === 'prompt')?.fg?.token, 'command.prompt');
  assert.equal(styleForSource(commandFrame, (source) => source.part === 'suggestion.0.label')?.bg?.token, 'selection.background');
  assert.equal(styleForSource(menuFrame, (source) => source.part === 'label' && source.itemId === 'open')?.bg?.token, 'selection.background');
  assert.equal(styleForSource(dropdownMenuFrame, (source) => source.part === 'dropdownMenu-value')?.fg?.token, 'text.default');
  assert.equal(styleForSource(paletteFrame, (source) => source.part === 'entry.open.label')?.fg?.token, 'text.default');
  assert.equal(styleForSource(tabsFrame, (source) => source.part === 'label' && source.itemId === 'one')?.fg?.token, 'tab.active.foreground');
  assert.equal(styleForSource(tabsFrame, (source) => source.part === 'label' && source.itemId === 'two')?.fg?.token, 'tab.inactive.foreground');
  assert.equal(styleForSource(tableFrame, (source) => source.part === 'row.1.cell.0')?.fg?.token, 'text.default');
  assert.equal(styleForSource(treeFrame, (source) => source.part === 'node.root.label')?.fg?.token, 'text.default');
  assert.equal(styleForSource(treeFrame, (source) => source.part === 'node.root.disclosure')?.fg?.token, 'tree.branch');
  assert.equal(styleForSource(noticeFrame, (source) => source.part === 'title')?.fg?.token, 'status.success');
  assert.equal(styleForSource(noticeFrame, (source) => source.part === 'message')?.fg?.token, 'text.default');
});

test('tree rows expose styled disclosure icon and label anatomy', () => {
  const frame = renderElementFrame(tree({
    id: 'anatomy-tree',
    nodes: [{
            id: 'root',
            label: 'Root',
            icon: '◆',
            kind: 'branch',
            expanded: true,
            children: [{ id: 'child', label: 'Child', kind: 'leaf' }]
        }],
    meta: {
        styles: {
            parts: {
              disclosure: tokenStyle('status.warning'),
              indent: tokenStyle('status.warning'),
              icon: tokenStyle('status.info'),
              label: tokenStyle('status.success')
            }
        }
    }
}), { columns: 24, rows: 2 });
  const disclosure = frame.cells.find((cell) => cell.text === '▾');
  const icon = frame.cells.find((cell) => cell.text === '◆');
  const label = frame.cells.find((cell) => cell.text === 'R');
  const indent = frame.cells.find((cell) => cell.source?.partKind === 'indent');

  assert.equal(disclosure?.style?.fg?.token, 'status.warning');
  assert.equal(disclosure?.source?.partKind, 'disclosure');
  assert.equal(disclosure?.source?.state, undefined);
  assert.equal(icon?.style?.fg?.token, 'status.info');
  assert.equal(icon?.source?.partKind, 'icon');
  assert.equal(label?.style?.fg?.token, 'status.success');
  assert.equal(label?.source?.partKind, 'label');
  assert.equal(indent?.style?.fg?.token, 'status.warning');
});

test('tabs use shared selected disabled and value styles', () => {
  const frame = renderElementFrame(tabs({
    id: 'tabs',
    selected: 'data',
    keys: { enter: () => ({ kind: 'activate-tabs' }) },
    tabs: [
      { id: 'dash', label: 'Dash', panel: text('Dashboard') },
      { id: 'data', label: 'Data', panel: text('Data view') },
      { id: 'audit', label: 'Audit', disabled: true, panel: text('Audit view') }
    ],
    meta: {
      styles: {
        parts: { label: tokenStyle('text.muted') },
        states: {
          selected: tokenStyle('status.success'),
          focused: tokenStyle('accent.primary', { underline: true }),
          disabled: tokenStyle('status.warning')
        }
      }
    }
  }), { columns: 32, rows: 3 }, { focusPath: ['tabs'] });
  const dStyles = stylesFor(frame, 'D');
  const selectedLabel = frame.cells.find((cell) => cell.source?.itemId === 'data' && cell.source?.label === 'label');

  assert.equal(dStyles[0]?.fg?.token, 'text.muted');
  assert.equal(selectedLabel?.style?.fg?.token, 'status.success');
  assert.equal(styleFor(frame, 'A')?.fg?.token, 'status.warning');
});

test('scrollback and dialog chrome use placeholder and border slots', () => {
  const scrollbackFrame = renderElementFrame(scrollback({
    id: 'styled-scrollback',
    history: prepareScrollbackHistory(Array.from({ length: 5 }, (_value, index) => ({ id: `row-${String(index)}`, text: `Row ${String(index)}` }))),
    meta: {
        styles: {
            parts: { marker: tokenStyle('status.warning') }
        }
    }
}), { columns: 36, rows: 2 });
  const modalFrame = renderElementFrame(dialog(
    text('Body'),
    {
    id: 'styled-dialog',
    title: 'Panel',
    modal: true,
    focusPolicy: { returnFocus: 'restore' },
    width: 14,
    height: 6,
    actions: row([button({ id: 'dialog-ok', label: 'OK' })]),
    meta: {
        styles: {
            parts: { border: tokenStyle('status.error') }
        }
    }
}
  ), { columns: 16, rows: 5 });

  assert.equal(styleFor(scrollbackFrame, '.')?.fg?.token, 'status.warning');
  assert.equal(styleFor(modalFrame, '┌')?.fg?.token, 'status.error');
  assert.equal(styleForCell(modalFrame, (cell) => cell.source?.ownerKind === 'dialog' && cell.source.label === 'action-separator')?.fg?.token, 'status.error');
});

test('structural text roles use shared visual grammar', () => {
  const textFrame = renderElementFrame(column([
    text('42', { textRole: 'metric' }),
    text('quiet', { textRole: 'caption' }),
    text('badge', { textRole: 'badge' })
  ]), { columns: 16, rows: 4 });

  assert.equal(styleFor(textFrame, '4')?.fg?.token, 'accent.primary');
  assert.equal(styleFor(textFrame, 'q')?.fg?.token, 'text.muted');
  assert.equal(styleFor(textFrame, 'b')?.fg?.token, 'badge.foreground');
});

test('passive surfaces keep visual state separate from descendant focus', () => {
  const focusedFrame = renderElementFrame(surface(textInput({ id: 'pane-field', presentation: { value: 'Pane', cursor: 0 } }), {
    id: 'focus-surface',
    variant: 'chrome'
  }), { columns: 10, rows: 1 }, { focusPath: ['focus-surface', 'pane-field'] });
  const customFrame = renderElementFrame(surface(textInput({ id: 'custom-field', presentation: { value: 'Pane', cursor: 0 } }), {
    id: 'custom-focus-surface',
    variant: 'chrome',
    meta: {
        styles: {
            states: { focused: { bg: { kind: 'theme', token: 'status.warning' } } }
        }
    }
}), { columns: 10, rows: 1 }, { focusPath: ['custom-focus-surface', 'custom-field'] });
  const focusWithinFrame = renderElementFrame(surface(textInput({ id: 'within-field', presentation: { value: 'Pane', cursor: 0 } }), {
    id: 'focus-within-surface',
    variant: 'chrome',
    focusWithin: true
  }), { columns: 10, rows: 1 }, { focusPath: ['focus-within-surface', 'within-field'] });

  assert.equal(styleForCell(focusedFrame, (cell) => cell.source?.part === 'background')?.bg?.token, 'surface.chrome.background');
  assert.equal(styleForCell(customFrame, (cell) => cell.source?.part === 'background')?.bg?.token, 'surface.chrome.background');
  assert.equal(styleForCell(focusWithinFrame, (cell) => cell.source?.part === 'background')?.bg?.token, 'focus.background');
});

test('surface visualState exposes selected panes without stealing focus semantics', () => {
  const selectedFrame = renderElementFrame(surface(text('Pane', { id: 'selected-label' }), {
    id: 'selected-surface',
    variant: 'chrome',
    visualState: 'selected'
  }), { columns: 10, rows: 1 });
  const focusedFrame = renderElementFrame(surface(textInput({ id: 'focused-field', presentation: { value: 'Pane', cursor: 0 } }), {
    id: 'focused-surface',
    variant: 'chrome',
    visualState: 'selected'
  }), { columns: 10, rows: 1 }, { focusPath: ['focused-surface', 'focused-field'] });
  const disabledFrame = renderElementFrame(surface(text('Pane', { id: 'disabled-label' }), {
    id: 'disabled-surface',
    variant: 'chrome',
    visualState: 'selected',
    disabled: true
  }), { columns: 10, rows: 1 });

  assert.equal(styleForCell(selectedFrame, (cell) => cell.source?.part === 'background')?.bg?.token, 'selection.background');
  assert.equal(styleForCell(focusedFrame, (cell) => cell.source?.part === 'background')?.bg?.token, 'selection.background');
  assert.equal(styleForCell(disabledFrame, (cell) => cell.source?.part === 'background')?.bg?.token, 'surface.chrome.background');
  assert.equal(styleForCell(disabledFrame, (cell) => cell.source?.part === 'background')?.fg?.token, 'text.disabled');
});

test('overflow priority preserves important row content before decorative content', () => {
  const frame = renderElementFrame(row([
    text('REQUIRED', {
    meta: {
        layer: {
            overflowPriority: 'required'
        }
    }
}),
    text('secondary', {
    meta: {
        layer: {
            overflowPriority: 'secondary'
        }
    }
}),
    text('decorative', {
    meta: {
        layer: {
            overflowPriority: 'decorative'
        }
    }
})
  ], { gap: 0 }), { columns: 11, rows: 1 });

  assert.equal(renderFramePlain(frame).trimEnd(), 'REQUIREDsed');
});

test('feedback widgets use shared status styles and source metadata', () => {
  const statusFrame = renderElementFrame(statusBar({
    id: 'status',
    leading: [{ id: 'ready', kind: 'text', text: 'Ready' }],
    meta: {
        styles: {
            parts: { value: tokenStyle('status.success') }
        }
    }
}), { columns: 16, rows: 1 });
  const helpFrame = renderElementFrame(helpBar({
    id: 'help',
    groups: [{
      id: 'primary',
      bindings: [
        { key: 'Enter', label: 'open' },
        { key: 'Esc', label: 'close' }
      ]
    }],
    meta: {
        styles: {
            parts: { label: tokenStyle('accent.primary') }
        }
    }
}), { columns: 32, rows: 1 });
  const activityFrame = renderElementFrame(statusIndicator({
    id: 'activity',
    label: 'Indexing',
    status: 'warning'
  }), { columns: 32, rows: 1 });
  const spinnerFrame = renderElementFrame(spinner({
    id: 'spinner',
    label: 'Loaded',
    status: 'success'
  }), { columns: 32, rows: 1 });
  const progressFrame = renderElementFrame(progressBar({
    id: 'progress',
    label: 'Upload',
    mode: { kind: 'determinate', value: 2, max: 4 },
    barWidth: 4,
    display: 'bar+value+percent',
    status: 'error'
  }), { columns: 32, rows: 1 });

  assert.equal(styleFor(statusFrame, 'R')?.fg?.token, 'status.success');
  assert.equal(styleFor(statusFrame, 'R')?.bg?.token, 'surface.chrome.background');
  assert.equal(statusFrame.cells.find((cell) => cell.text === 'R')?.source?.ownerKind, 'statusBar');
  assert.equal(styleFor(helpFrame, 'E')?.fg?.token, 'accent.primary');
  assert.equal(styleFor(helpFrame, 'o')?.bg?.token, 'surface.chrome.background');
  assert.equal(helpFrame.cells.find((cell) => cell.text === 'E')?.source?.label, 'group.primary.binding.0.key');
  assert.equal(styleFor(activityFrame, '!')?.fg?.token, 'status.warning');
  assert.equal(activityFrame.cells.find((cell) => cell.text === '!')?.source?.label, 'status.marker');
  assert.equal(activityFrame.cells.find((cell) => cell.text === 'I')?.style?.fg?.token, 'text.default');
  assert.equal(styleFor(spinnerFrame, '✓')?.fg?.token, 'status.success');
  assert.equal(spinnerFrame.cells.find((cell) => cell.text === '✓')?.source?.label, 'status.marker');
  assert.equal(spinnerFrame.cells.find((cell) => cell.text === 'L')?.style?.fg?.token, 'text.default');
  assert.equal(styleFor(progressFrame, '█')?.fg?.token, 'status.error');
  assert.equal(progressFrame.cells.find((cell) => cell.text === '█')?.source?.label, 'filled');
});

test('record results and notification tones retain their component-specific styling', () => {
  const failedBlockFrame = renderElementFrame(structuredBlock({
    id: 'failed-block',
    title: 'Import',
    result: 'failed',
    meta: { styles: { parts: { result: tokenStyle('status.error') } } }
  }), { columns: 32, rows: 2 });
  const skippedBlockFrame = renderElementFrame(structuredBlock({
    id: 'skipped-block',
    title: 'Import',
    result: 'skipped',
    meta: { styles: { parts: { level: tokenStyle('status.success') } } },
    level: 'warning'
  }), { columns: 32, rows: 2 });
  const notificationFrame = renderElementFrame(notificationStack({
    id: 'notices',
    presentation: { kind: 'live', items: [{
      id: 'sync',
      title: 'Sync',
      tone: 'progress',
      progress: 50
    }] }
  }), { columns: 42, rows: 6 });

  assert.equal(styleFor(failedBlockFrame, 'f')?.fg?.token, 'status.error');
  assert.equal(styleFor(skippedBlockFrame, 's')?.fg?.token, 'status.warning');
  assert.equal(styleFor(skippedBlockFrame, 'w')?.fg?.token, 'status.success');
  assert.equal(styleFor(notificationFrame, '█')?.fg?.token, 'status.running');
});

test('chart widgets use shared visual state styles and source metadata', () => {
  const barFrame = renderElementFrame(barChart({
    id: 'bars',
    selectedId: 'atlas',
    items: [{ id: 'atlas', label: 'Atlas', value: 5 }],
    meta: {
        styles: {
            parts: { label: tokenStyle('accent.primary') },
            states: { selected: tokenStyle('status.success') }
        }
    }
}), { columns: 24, rows: 1 });
  const chartFrame = renderElementFrame(chart({
    id: 'chart',
    status: 'error',
    errorText: 'Unavailable'
  }), { columns: 24, rows: 1 });
  const heatmapFrame = renderElementFrame(heatmap({
    id: 'heatmap',
    rows: [[{ id: 'a', value: 3 }]],
    min: 0,
    max: 3,
    meta: {
        styles: {
            parts: { series: tokenStyle('status.warning') }
        }
    }
}), { columns: 8, rows: 1 });

  assert.equal(styleFor(barFrame, 'A')?.fg?.token, 'status.success');
  assert.equal(barFrame.cells.find((cell) => cell.text === 'A')?.source?.ownerKind, 'barChart');
  assert.equal(styleFor(chartFrame, 'U')?.fg?.token, 'status.error');
  assert.equal(chartFrame.cells.find((cell) => cell.text === 'U')?.source?.label, 'state.error.message');
  assert.equal(styleFor(heatmapFrame, '█')?.fg?.token, 'status.warning');
  assert.equal(heatmapFrame.cells.find((cell) => cell.text === '█')?.source?.label, 'cell.0.0.value');
});

test('choice and picker controls use shared form visual styles and source metadata', () => {
  const toggleFrame = renderElementFrame(toggleSwitch({
    id: 'toggle',
    label: 'Live',
    checked: true
  }), { columns: 24, rows: 1 });
  const sliderFrame = renderElementFrame(slider({
    id: 'slider',
    label: 'Volume',
    value: 50,
    min: 0,
    max: 100,
    width: 5
  }), { columns: 24, rows: 1 });
  const checkboxFrame = renderElementFrame(checkboxGroup({
    id: 'checks',
    selected: ['a'],
    options: [{ id: 'a', label: 'Alpha', value: 'a' }]
  }), { columns: 24, rows: 1 });
  const colorFrame = renderElementFrame(colorSwatchPicker({
    id: 'colors',
    selected: 'green',
    options: [{ id: 'green', label: 'Green', value: 'green', swatch: '■' }]
  }), { columns: 24, rows: 2 });
  const dateFrame = renderElementFrame(calendar({
    id: 'dates',
    ...calendarFixture({ selected: { year: 2026, month: 6, day: 2 } })
  }), { columns: 30, rows: 8 });

  assert.equal(styleForCell(toggleFrame, (cell) => cell.source?.label === 'value.on')?.bg?.token, 'control.toggle.on.background');
  assert.equal(toggleFrame.cells.find((cell) => cell.source?.label === 'value.off')?.style?.fg?.token, 'input.placeholder');
  assert.equal(styleForCell(sliderFrame, (cell) => cell.source?.label === 'track.handle')?.bg?.token, 'control.track.filled');
  assert.equal(styleForCell(sliderFrame, (cell) => cell.source?.label === 'track.filled')?.fg?.token, 'control.track.filled');
  assert.equal(checkboxFrame.cells.find((cell) => cell.text === 'x')?.source?.label, 'option.a.marker.checked');
  assert.equal(styleForCell(colorFrame, (cell) => cell.source?.label === 'summary.swatch')?.bg?.token, 'control.primary.background');
  assert.equal(colorFrame.cells.find((cell) => cell.source?.label === 'option.green.swatch')?.text, '■');
  assert.equal(dateFrame.cells.find((cell) => cell.source?.label === 'weekday.0')?.style?.fg?.token, 'text.disabled');
  assert.equal(dateFrame.cells.find((cell) => cell.text === '[')?.source?.label, 'day.2026-06-02.open');
});
