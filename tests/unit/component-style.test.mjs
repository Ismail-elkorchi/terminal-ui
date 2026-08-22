import assert from 'node:assert/strict';
import test from 'node:test';
import { calendarFixture } from '../helpers/calendar.mjs';
import {
  prepareCommandSuggestions,
  prepareLogHistory,
  prepareSearchPickerIndex,
  prepareTreeSource,
  prepareTreeView,
} from '../../dist/behavior/index.js';
import { ignoreMessage } from '../../dist/component/index.js';

import {
  renderFramePlain,
  renderElementFrame
} from '../../dist/renderer/index.js';
import {
  activityIndicator,
  barChart,
  button as createButton,
  chart,
  checkboxGroup as createCheckboxGroup,
  colorSwatchPicker as createColorSwatchPicker,
  commandInput as createCommandInput,
  calendar as createCalendar,
  dialog,
  menuTrigger as createDropdownMenu,
  helpBar,
  heatmap,
  listbox as createListbox,
  menu as createMenu,
  menuBar as createMenuBar,
  notificationRegion,
  searchPicker as createSearchPicker,
  progressBar,
  logViewer,
  slider as createSlider,
  statusBar,
  dataGrid as createDataGrid,
  tabs as createTabs,
  text,
  textArea,
  textInput as createTextInput,
  switchControl as createToggleSwitch,
  tree as createTree
} from '../../dist/components/index.js';
import { prepareTextDocument, terminalTextWidth, textCaretAt } from '../../dist/text/index.js';
import { defaultTheme, noColorTheme } from '../../dist/theme/index.js';
import {
  row,
  column,
  surface
} from '../../dist/layout/index.js';

const noMessage = () => undefined;

function button(options) {
  return createButton(
    options.disabled === true
      ? options
      : {
          onAction: noMessage,
          ...options
        }
  );
}

function textInput(options) {
  return createTextInput(
    options.disabled === true ? options : { onAction: noMessage, ...options }
  );
}

function switchControl(options) {
  return createToggleSwitch(
    options.disabled === true ? options : { onAction: noMessage, ...options }
  );
}

function slider(options) {
  return createSlider(
    options.disabled === true ? options : { onAction: noMessage, ...options }
  );
}

function checkboxGroup(options) {
  return createCheckboxGroup(
    options.disabled === true ? options : { onAction: noMessage, ...options }
  );
}

function colorSwatchPicker(options) {
  return createColorSwatchPicker(
    options.disabled === true ? options : { onAction: noMessage, ...options }
  );
}

function calendar(options) {
  return createCalendar(
    options.disabled === true ? options : { onAction: noMessage, ...options }
  );
}

function menu(options) {
  return createMenu({ meta: { accessibleName: "Menu" }, onTransition: noMessage, ...options });
}

function menuBar(options) {
  return createMenuBar({ meta: { accessibleName: "Menu bar" }, onTransition: noMessage, ...options });
}

function menuTrigger(options) {
  return createDropdownMenu({ meta: { accessibleName: "Menu" }, onTransition: noMessage, ...options });
}

function tabs(options) {
  return createTabs({ meta: { accessibleName: "Tabs" },
    onTransition: noMessage,
    ...options
  });
}

function searchPicker(options) {
  return createSearchPicker({ meta: { accessibleName: "Search" },
    presentation: { input: { text: '', cursor: 0 }, query: { mode: 'fuzzy' } },
    onTransition: noMessage,
    ...options
  });
}

function commandInput(options) {
  return createCommandInput({ meta: { accessibleName: "Command input" },
    onTransition: noMessage,
    ...options
  });
}

function listbox(options) {
  return createListbox({ meta: { accessibleName: "List" },
    presentation: { selection: { mode: 'none' } },
    onTransition: noMessage,
    ...options
  });
}

function dataGrid(options) {
  return createDataGrid({ meta: { accessibleName: "Data grid" },
    presentation: { interaction: { kind: 'row', selection: { mode: 'single' } } },
    onTransition: noMessage,
    ...options
  });
}

function tree(options) {
  const { nodes, presentation = { expandedIds: [], selection: { mode: 'none' } }, ...rest } = options;
  const source = prepareTreeSource(nodes);
  return createTree({ meta: { accessibleName: "Tree" },
    presentation,
    view: prepareTreeView(source, presentation),
    onTransition: noMessage,
    ...rest
  });
}

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
    styles: {
            parts: { label: tokenStyle('status.success') },
            states: { focused: { root: tokenStyle('status.success') } }
        }
}), { columns: 12, rows: 1 });
  const inputFrame = renderElementFrame(textInput({ meta: { accessibleName: "Text input" },
    id: 'styled-input',
    presentation: { value: 'abc', cursor: 0 },
    styles: {
            parts: { value: tokenStyle('status.warning') },
            states: { focused: { root: tokenStyle('status.warning') } }
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
    busy: true,
    onAction: () => ignoreMessage()
  }), { columns: 16, rows: 1 });
  const destructiveFrame = renderElementFrame(button({
    id: 'destructive',
    label: 'Delete',
    tone: 'destructive'
  }), { columns: 18, rows: 1 });
  const disabledFrame = renderElementFrame(button({
    id: 'disabled',
    label: 'Disabled',
    disabled: true
  }), { columns: 20, rows: 1 }, { focusPath: ['none'] });

  assert.equal(renderFramePlain(focusedFrame).trimEnd(), '› Focus');
  assert.equal(renderFramePlain(pendingFrame).trimEnd(), 'i Sync');
  assert.equal(renderFramePlain(destructiveFrame).trimEnd(), '× Delete');
  assert.equal(renderFramePlain(disabledFrame).trimEnd(), '  Disabled');
  assert.equal(styleFor(pendingFrame, 'S')?.fg?.token, 'status.pending');
  assert.equal(styleFor(destructiveFrame, 'D')?.fg?.token, 'status.error');
  assert.equal(styleFor(disabledFrame, 'D')?.fg?.token, 'text.disabled');
  assert.equal(focusedFrame.cells.find((cell) => cell.text === '›')?.source?.description, 'padding.leading');
  assert.equal(focusedFrame.cells.some((cell) => cell.source?.description === 'frame.open'), false);
  assert.equal(pendingFrame.cells.find((cell) => cell.text === 'i')?.source?.description, 'padding.leading');
  assert.equal(destructiveFrame.cells.find((cell) => cell.text === '×')?.source?.description, 'padding.leading');
  assert.equal(disabledFrame.cells.find((cell) => cell.source?.description === 'padding.leading')?.text, ' ');
  assert.equal(disabledFrame.cells.find((cell) => cell.text === 'D')?.source?.description, 'label.text');
  assert.equal(focusedFrame.cells.find((cell) => cell.row === 1 && cell.column === 16)?.style?.bg?.token, 'control.background');
  assert.equal(focusedFrame.cells.find((cell) => cell.row === 1 && cell.column === 16)?.source?.elementId, 'focus');
});

test('ghost buttons inherit their surface until focus makes them visible', () => {
  const idle = renderElementFrame(surface(button({
    id: 'ghost-idle',
    label: 'History',
    tone: 'ghost',
    meta: { focus: { disabled: true } }
  }), {
    id: 'ghost-idle-surface',
    appearance: 'bar'
  }), { columns: 14, rows: 1 }, { focusPath: ['none'] });
  const focused = renderElementFrame(surface(button({
    id: 'ghost-focused',
    label: 'History',
    tone: 'ghost'
  }), {
    id: 'ghost-focused-surface',
    appearance: 'bar'
  }), { columns: 14, rows: 1 }, { focusPath: ['ghost-focused-surface', 'ghost-focused'] });

  assert.equal(idle.cells.find((cell) => cell.text === 'H')?.style?.bg?.token, 'surface.bar.background');
  assert.equal(focused.cells.find((cell) => cell.text === 'H')?.style?.bg?.token, 'focus.background');
});

test('text entry frames use shared border, focus, and error styles', () => {
  const inputFrame = renderElementFrame(textInput({ meta: { accessibleName: "Text input" },
    id: 'query',
    presentation: { value: 'abc', cursor: 0 },
    styles: {
            parts: { border: tokenStyle('status.info') },
            states: { focused: { root: tokenStyle('status.success') } }
        }
}), { columns: 16, rows: 1 }, { focusPath: ['query'] });
  const areaFrame = renderElementFrame(textArea({ meta: { accessibleName: "Text area" },
    id: 'body',
    presentation: { document: prepareTextDocument('details'), caret: textCaretAt(0 )},
    onAction: noMessage,
    error: 'Required',
    styles: {
            parts: { error: tokenStyle('status.error') }
        }
}), { columns: 16, rows: 2 });

  assert.equal(renderFramePlain(inputFrame).trimEnd(), '› abc');
  assert.equal(styleFor(inputFrame, '›')?.fg?.token, 'status.success');
  assert.equal(renderFramePlain(areaFrame).split('\n')[0], '× details');
  assert.equal(styleFor(areaFrame, '×')?.fg?.token, 'status.error');
});

test('menu searchPicker dataGrid and tree use selected placeholder and title slots', () => {
  const menuFrame = renderElementFrame(menuBar({ meta: { accessibleName: "Menu bar" },
    id: 'styled-menu',
    presentation: { kind: 'closed', active: 'file' },
    items: [
        { kind: 'action', id: 'file', label: 'File' },
        { kind: 'action', id: 'edit', label: 'Edit' }
    ],
    styles: {
            states: { selected: { root: tokenStyle('status.success') } }
        }
}), { columns: 20, rows: 1 });
  const searchPickerFrame = renderElementFrame(searchPicker({ meta: { accessibleName: "Search" },
    id: 'styled-searchPicker',
    title: 'Commands',
    searchPickerIndex: prepareSearchPickerIndex([]),
    styles: {
            parts: {
              title: tokenStyle('status.error'),
              empty: tokenStyle('status.warning')
            }
        }
}), { columns: 24, rows: 3 });
  const tableFrame = renderElementFrame(dataGrid({ meta: { accessibleName: "Data grid" },
    getRowId: (_row, index) => String(index),
    id: 'empty-dataGrid',
    rows: [],
    columns: [{
      id: 'name-0', value: (row) => Array.isArray(row) ? row[0] : row, header: 'Name' }],
    emptyText: 'No data',
    styles: {
            parts: { empty: tokenStyle('status.warning') }
        }
}), { columns: 20, rows: 2 });
  const treeFrame = renderElementFrame(tree({
    id: 'selected-tree',
    presentation: {
      expandedIds: [],
      activeId: 'api',
      selection: { mode: 'single', selectedId: 'api' }
    },
    nodes: [{ id: 'api', label: 'API', kind: 'leaf' }],
    styles: {
            states: { selected: { root: tokenStyle('status.success') } }
        },
    meta: { accessibleName: "Tree", focus: { disabled: true } }
}), { columns: 16, rows: 1 });

  assert.equal(styleFor(menuFrame, 'F')?.fg?.token, 'status.success');
  assert.equal(styleFor(searchPickerFrame, 'C')?.fg?.token, 'status.error');
  assert.equal(styleFor(searchPickerFrame, 'N')?.fg?.token, 'status.warning');
  assert.equal(styleForCell(tableFrame, (cell) => cell.row > 1 && cell.text === 'N')?.fg?.token, 'status.warning');
  assert.equal(styleFor(treeFrame, 'A')?.fg?.token, 'status.success');
});

test('listbox dataGrid and tree share data navigation selection and match styles', () => {
  const listFrame = renderElementFrame(listbox({ meta: { accessibleName: "List" },
    projectItem: (item) => ({ id: String(item), label: String(item) }),
    id: 'styled-listbox',
    items: ['Atlas', 'Pulse'],
    presentation: {
      activeId: 'Atlas',
      selection: { mode: 'single', selectedId: 'Atlas' }
    },
    query: { text: 'at', mode: 'contains' }
  }), { columns: 18, rows: 2 });
  const tableFrame = renderElementFrame(dataGrid({ meta: { accessibleName: "Data grid" },
    getRowId: (_row, index) => String(index),
    id: 'styled-dataGrid',
    presentation: {
      interaction: {
        kind: 'row', activeRowId: '0', selection: { mode: 'single', selectedRowId: '0' },
      }
    },
    columns: [{
      id: 'name-0', value: (row) => Array.isArray(row) ? row[0] : row, header: 'Name', width: 8 }],
    rows: [['Atlas'], ['Pulse']]
  }), { columns: 18, rows: 3 });
  const activeTableFrame = renderElementFrame(dataGrid({ meta: { accessibleName: "Data grid" },
    getRowId: (_row, index) => String(index),
    id: 'active-dataGrid',
    presentation: {
      interaction: {
        kind: 'cell',
        activeCell: { rowId: '0', columnId: 'name-0' },
        selection: {
          mode: 'single', selectedCell: { rowId: '0', columnId: 'name-0' },
        },
      }
    },
    columns: [{
      id: 'name-0', value: (row) => Array.isArray(row) ? row[0] : row, header: 'Name', width: 8 }],
    rows: [['Atlas'], ['Pulse']]
  }), { columns: 18, rows: 3 });
  const treeFrame = renderElementFrame(tree({ meta: { accessibleName: "Tree" },
    id: 'filtered-tree',
    presentation: {
      expandedIds: ['root'],
      query: { text: 'api', mode: 'contains' },
      selection: { mode: 'none' }
    },
    nodes: [{
      id: 'root',
      label: 'Workspace',
      kind: 'branch',
      children: [{ id: 'api', label: 'API Layer', kind: 'leaf' }]
    }]
  }), { columns: 24, rows: 3 });

  assert.equal(styleForCell(listFrame, (cell) => cell.text === 'A')?.bg?.token, 'selection.background');
  assert.equal(styleForCell(listFrame, (cell) => cell.text === 'A')?.fg?.token, 'menu.match');
  assert.equal(styleForCell(tableFrame, (cell) => cell.text === 'A')?.bg?.token, 'selection.background');
  assert.equal(styleForCell(activeTableFrame, (cell) => cell.text === 'A')?.fg?.token, 'selection.foreground');
  assert.equal(styleForCell(activeTableFrame, (cell) => cell.text === 'A')?.bg?.token, 'selection.background');
  assert.equal(styleForCell(treeFrame, (cell) => cell.text === '▼')?.fg?.token, 'tree.branch');
  assert.equal(styleForCell(treeFrame, (cell) => cell.text === 'A')?.fg?.token, 'menu.match');
  assert.equal(listFrame.cells.find((cell) => cell.text === 'A')?.source?.description, 'item.Atlas.match');
  assert.equal(tableFrame.cells.find((cell) => cell.text === 'A')?.source?.description, 'row.0.cell.0');
  assert.equal(activeTableFrame.cells.find((cell) => cell.text === 'A')?.source?.description, 'row.0.cell.0');
  assert.equal(treeFrame.cells.find((cell) => cell.text === 'A')?.source?.description, 'node.api.match');
});

test('default interactive component anatomy uses theme tokens instead of terminal defaults', () => {
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
    meta: { accessibleName: "Text input",
        focus: { disabled: true }
    }
}), { columns: 18, rows: 1 });
  const commandFrame = renderElementFrame(commandInput({ meta: { accessibleName: "Command input" },
    id: 'command',
    presentation: { input: { text: '/open README.md', cursor: 0 }, open: true, suggestions: prepareCommandSuggestions([
      { id: 'open', completion: { range: { startOffset: 0, endOffsetExclusive: 15 }, text: '/open' }, label: 'Open file' },
      { id: 'save', completion: { range: { startOffset: 0, endOffsetExclusive: 15 }, text: '/save' }, label: 'Save file' }
    ]), activeSuggestionId: 'open' },
    display: 'expanded',
  }), { columns: 36, rows: 3 });
  const menuFrame = renderElementFrame(menu({ meta: { accessibleName: "Menu" },
    id: 'menu',
    presentation: {
      activePath: ['open'],
      items: [
        { kind: 'action', id: 'open', label: 'Open' },
        { kind: 'action', id: 'save', label: 'Save' }
      ]
    }
  }), { columns: 20, rows: 2 });
  const menuTriggerFrame = renderElementFrame(menuTrigger({
    id: 'region',
    label: 'Region',
    meta: { accessibleName: "Menu", focus: { disabled: true } },
    presentation: { kind: 'closed', active: 'us' },
    items: [
      { kind: 'action', id: 'us', label: 'United States' }
    ]
  }), { columns: 32, rows: 1 });
  const searchPickerFrame = renderElementFrame(searchPicker({ meta: { accessibleName: "Search" },
    id: 'searchPicker',
    presentation: {
      input: { text: 'o', cursor: 1 },
      query: { mode: 'fuzzy' },
      activeId: 'toggle'
    },
    searchPickerIndex: prepareSearchPickerIndex([
      { id: 'open', label: 'Open file' },
      { id: 'toggle', label: 'Toggle theme' }
    ])
  }), { columns: 36, rows: 5 });
  const tabsFrame = renderElementFrame(tabs({ meta: { accessibleName: "Tabs" },
    id: 'tabs',
    presentation: { activeId: 'one', selectedId: 'one' },
    tabs: [
      { id: 'one', label: 'One', panel: text({ content: 'One' }) },
      { id: 'two', label: 'Two', panel: text({ content: 'Two' }) }
    ]
  }), { columns: 28, rows: 2 });
  const tableFrame = renderElementFrame(dataGrid({ meta: { accessibleName: "Data grid" },
    getRowId: (_row, index) => String(index),
    id: 'dataGrid',
    columns: [{
      id: 'name-0', value: (row) => Array.isArray(row) ? row[0] : row, header: 'Name' }],
    rows: [['Atlas'], ['Pulse']]
  }), { columns: 18, rows: 3 });
  const treeFrame = renderElementFrame(tree({
    id: 'tree',
    presentation: {
      expandedIds: ['root'],
      activeId: 'api',
      selection: { mode: 'single', selectedId: 'api' }
    },
    nodes: [{
      id: 'root',
      label: 'Workspace',
      kind: 'branch',
      children: [{ id: 'api', label: 'API', kind: 'leaf' }]
    }],
    meta: { accessibleName: "Tree", focus: { disabled: true } }
  }), { columns: 24, rows: 2 });
  const noticeFrame = renderElementFrame(notificationRegion({
    id: 'notices',
    items: [{ id: 'saved', title: 'Saved', message: 'State stored', tone: 'success' }],
    maxWidth: 24
  }), { columns: 32, rows: 6 });

  assert.equal(styleForSource(buttonFrame, (source) => source.description === 'label.text')?.fg?.token, 'control.primary.foreground');
  assert.equal(styleForSource(inputFrame, (source) => source.partName === 'value')?.fg?.token, 'control.foreground');
  assert.equal(styleForSource(commandFrame, (source) => source.partName === 'prompt')?.fg?.token, 'command.prompt');
  assert.equal(styleForSource(commandFrame, (source) => source.partName === 'suggestion.0.label')?.bg?.token, 'selection.background');
  assert.equal(styleForSource(menuFrame, (source) => source.partType === 'label' && source.itemId === 'open')?.bg?.token, 'selection.background');
  assert.equal(styleForSource(menuTriggerFrame, (source) => source.partName === 'value')?.fg?.token, 'text.strong');
  assert.equal(styleForSource(searchPickerFrame, (source) => source.partName === 'entry.open.label')?.fg?.token, 'text.default');
  assert.equal(searchPickerFrame.cells.find((cell) => cell.row === 4 && cell.column === 36)?.source?.interactionState, 'active');
  assert.equal(styleForSource(tabsFrame, (source) => source.partName === 'label' && source.itemId === 'one')?.fg?.token, 'tab.active.foreground');
  assert.equal(styleForSource(tabsFrame, (source) => source.partName === 'label' && source.itemId === 'two')?.fg?.token, 'tab.inactive.foreground');
  assert.equal(styleForSource(tableFrame, (source) => source.partName === 'row.1.cell.0')?.fg?.token, 'text.default');
  assert.equal(styleForSource(treeFrame, (source) => source.partName === 'node.root.label')?.fg?.token, 'text.default');
  assert.equal(styleForSource(treeFrame, (source) => source.partName === 'node.root.disclosure')?.fg?.token, 'tree.branch');
  assert.equal(treeFrame.cells.find((cell) => cell.row === 2 && cell.column === 24)?.style?.bg?.token, 'selection.background');
  assert.equal(treeFrame.cells.find((cell) => cell.row === 2 && cell.column === 4)?.style?.bg?.token, 'selection.background');
  assert.equal(styleForSource(noticeFrame, (source) => source.partName === 'title')?.fg?.token, 'status.success');
  assert.equal(styleForSource(noticeFrame, (source) => source.partName === 'message')?.fg?.token, 'text.default');
});

test('tree rows expose styled disclosure icon and label anatomy', () => {
  const frame = renderElementFrame(tree({ meta: { accessibleName: "Tree" },
    id: 'anatomy-tree',
    nodes: [{
            id: 'root',
            label: 'Root',
            icon: '◆',
            kind: 'branch',
            children: [{ id: 'child', label: 'Child', kind: 'leaf' }]
        }],
    presentation: {
      expandedIds: ['root'],
      selection: { mode: 'none' }
    },
    styles: {
            parts: {
              disclosure: tokenStyle('status.warning'),
              indent: tokenStyle('status.warning'),
              icon: tokenStyle('status.info'),
              label: tokenStyle('status.success')
            }
        }
}), { columns: 24, rows: 2 });
  const disclosure = frame.cells.find((cell) => cell.text === '▼');
  const icon = frame.cells.find((cell) => cell.text === '◆');
  const label = frame.cells.find((cell) => cell.text === 'R');
  const indent = frame.cells.find((cell) => cell.source?.partType === 'indent');

  assert.equal(disclosure?.style?.fg?.token, 'status.warning');
  assert.equal(disclosure?.source?.partType, 'disclosure');
  assert.equal(disclosure?.source?.interactionState, undefined);
  assert.equal(terminalTextWidth(disclosure?.text ?? ''), 1);
  assert.equal(icon?.style?.fg?.token, 'status.info');
  assert.equal(icon?.source?.partType, 'icon');
  assert.equal(label?.style?.fg?.token, 'status.success');
  assert.equal(label?.source?.partType, 'label');
  assert.equal(indent?.style?.fg?.token, 'status.warning');
});

test('data selections rely on graphical backgrounds and retain a monochrome marker', () => {
  const elements = [
    listbox({
      id: 'selection-listbox',
      items: ['Atlas'],
      projectItem: (item) => ({ id: item, label: item }),
      presentation: {
        activeId: 'Atlas',
        selection: { mode: 'single', selectedId: 'Atlas' }
      },
      meta: { accessibleName: "List", focus: { disabled: true } }
    }),
    dataGrid({
      id: 'selection-dataGrid',
      rows: [['Atlas']],
      columns: [{ id: 'name', header: 'Name', value: (row) => row[0] }],
      getRowId: () => 'atlas',
      presentation: {
        interaction: {
          kind: 'row', activeRowId: 'atlas', selection: { mode: 'single', selectedRowId: 'atlas' },
        }
      },
      meta: { accessibleName: "Data grid", focus: { disabled: true } }
    }),
    tree({
      id: 'selection-tree',
      presentation: {
        expandedIds: [],
        activeId: 'atlas',
        selection: { mode: 'single', selectedId: 'atlas' }
      },
      nodes: [{ id: 'atlas', label: 'Atlas', kind: 'leaf' }],
      meta: { accessibleName: "Tree", focus: { disabled: true } }
    })
  ];
  const markerDescriptions = ['item.Atlas.marker', 'row.atlas.marker', 'node.atlas.marker'];

  for (const [index, element] of elements.entries()) {
    const markerDescription = markerDescriptions[index];
    const graphical = renderElementFrame(element, { columns: 18, rows: 2 }, { theme: defaultTheme });
    const monochrome = renderElementFrame(element, { columns: 18, rows: 2 }, { theme: noColorTheme });
    const graphicalMarker = graphical.cells.find((cell) => cell.source?.description === markerDescription);
    const monochromeMarker = monochrome.cells.find((cell) => cell.source?.description === markerDescription);

    assert.equal(graphicalMarker?.text, ' ');
    assert.equal(graphicalMarker?.style?.bg?.token, 'selection.background');
    assert.equal(monochromeMarker?.text, '*');
    assert.equal(monochromeMarker?.style?.bg?.token, 'selection.background');
  }
});

test('tabs use shared selected disabled and value styles', () => {
  const frame = renderElementFrame(tabs({ meta: { accessibleName: "Tabs" },
    id: 'tabs',
    presentation: { activeId: 'data', selectedId: 'data' },
    tabs: [
      { id: 'dash', label: 'Dash', panel: text({ content: 'Dashboard' }) },
      { id: 'data', label: 'Data', panel: text({ content: 'Data view' }) },
      { id: 'audit', label: 'Audit', disabled: true, panel: text({ content: 'Audit view' }) }
    ],
    styles: {
        parts: { label: tokenStyle('text.muted') },
        states: {
          selected: { root: tokenStyle('status.success') },
          focused: { root: tokenStyle('accent.primary', { underline: true }) },
          disabled: { root: tokenStyle('status.warning') }
        }
      }
  }), { columns: 32, rows: 3 }, { focusPath: ['tabs'] });
  const dStyles = stylesFor(frame, 'D');
  const selectedLabel = frame.cells.find((cell) => cell.source?.itemId === 'data' && cell.source?.description === 'label');

  assert.equal(dStyles[0]?.fg?.token, 'text.muted');
  assert.equal(selectedLabel?.style?.fg?.token, 'accent.primary');
  assert.equal(styleFor(frame, 'A')?.fg?.token, 'status.warning');
});

test('log viewer omissions and dialog borders use their direct style slots', () => {
  const logViewerFrame = renderElementFrame(logViewer({
    id: 'styled-log-viewer',
    history: prepareLogHistory(Array.from({ length: 5 }, (_value, index) => ({ id: `row-${String(index)}`, text: `Row ${String(index)}` }))),
    styles: {
            parts: { marker: tokenStyle('status.warning') }
        }
}), { columns: 36, rows: 2 });
  const modalFrame = renderElementFrame(dialog({
    slots: {
      content: text({ content: 'Body' }),
      actions: row([button({ id: 'dialog-ok', label: 'OK', onAction: () => ({ kind: 'ok' }) })])
    },
    id: 'styled-dialog',
    title: 'Panel',
    modal: true,
    focusPolicy: { returnFocus: 'restore' },
    width: 14,
    height: 6,
    styles: {
            parts: { border: tokenStyle('status.error') }
        }
}), { columns: 16, rows: 5 });

  assert.equal(styleFor(logViewerFrame, '.')?.fg?.token, 'status.warning');
  assert.equal(styleFor(modalFrame, '┌')?.fg?.token, 'status.error');
  assert.equal(styleForCell(modalFrame, (cell) => cell.source?.elementId === 'styled-dialog:action-separator' && cell.source.partName === 'line')?.fg?.token, 'status.error');
});

test('structural text roles use shared visual grammar', () => {
  const textFrame = renderElementFrame(column([
    text({ content: '42', textRole: 'metric' }),
    text({ content: 'quiet', textRole: 'caption' }),
    text({ content: 'badge', textRole: 'badge' })
  ]), { columns: 16, rows: 4 });

  assert.equal(styleFor(textFrame, '4')?.fg?.token, 'accent.primary');
  assert.equal(styleFor(textFrame, 'q')?.fg?.token, 'text.muted');
  assert.equal(styleFor(textFrame, 'b')?.fg?.token, 'badge.foreground');
});

test('layout surfaces do not inherit component focus state', () => {
  const focusedFrame = renderElementFrame(surface(textInput({ meta: { accessibleName: "Text input" }, id: 'pane-field', presentation: { value: 'Pane', cursor: 0 } }), {
    id: 'focus-surface',
    appearance: 'bar'
  }), { columns: 10, rows: 1 }, { focusPath: ['focus-surface', 'pane-field'], theme: defaultTheme });
  assert.equal(styleFor(focusedFrame, 'P')?.bg?.token, 'control.background');
});

test('overflow priority preserves important row content before decorative content', () => {
  const frame = renderElementFrame(row([
    text({ content: 'REQUIRED', meta: {
        layer: {
            overflowPriority: 'required'
        }
    } }),
    text({ content: 'secondary', meta: {
        layer: {
            overflowPriority: 'secondary'
        }
    } }),
    text({ content: 'decorative', meta: {
        layer: {
            overflowPriority: 'decorative'
        }
    } })
  ], { gap: 0 }), { columns: 11, rows: 1 });

  assert.equal(renderFramePlain(frame).trimEnd(), 'REQUIREDsed');
});

test('feedback components use shared status styles and source metadata', () => {
  const statusFrame = renderElementFrame(statusBar({
    id: 'status',
    leading: [{ id: 'ready', kind: 'text', text: 'Ready' }],
    styles: {
            parts: { value: tokenStyle('status.success') }
        }
}), { columns: 16, rows: 1 });
  const helpFrame = renderElementFrame(helpBar({
    id: 'help',
    groups: [{
      id: 'primary',
      bindings: [
        { binding: { kind: 'key', key: 'enter' }, label: 'open' },
        { binding: { kind: 'key', key: 'escape' }, label: 'close' }
      ]
    }],
    styles: {
            parts: { label: tokenStyle('accent.primary') }
        }
}), { columns: 32, rows: 1 });
  const activityFrame = renderElementFrame(activityIndicator({
    id: 'activity',
    label: 'Indexing',
    status: 'warning'
  }), { columns: 32, rows: 1 });
  const settledActivityFrame = renderElementFrame(activityIndicator({
    id: 'settled-activity',
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
  assert.equal(styleFor(statusFrame, 'R')?.bg?.token, 'surface.bar.background');
  assert.equal(statusFrame.cells.find((cell) => cell.text === 'R')?.source?.elementKind, 'terminal-ui/components/status-bar');
  assert.equal(styleFor(helpFrame, 'E')?.fg?.token, 'accent.primary');
  assert.equal(styleFor(helpFrame, 'o')?.bg?.token, 'surface.bar.background');
  assert.equal(helpFrame.cells.find((cell) => cell.text === 'E')?.source?.description, 'group.primary.binding.0.key');
  assert.equal(styleFor(activityFrame, '!')?.fg?.token, 'status.warning');
  assert.equal(activityFrame.cells.find((cell) => cell.text === '!')?.source?.description, 'status.marker');
  assert.equal(activityFrame.cells.find((cell) => cell.text === 'I')?.style?.fg?.token, 'text.default');
  assert.equal(styleFor(settledActivityFrame, '✓')?.fg?.token, 'status.success');
  assert.equal(settledActivityFrame.cells.find((cell) => cell.text === '✓')?.source?.description, 'status.marker');
  assert.equal(settledActivityFrame.cells.find((cell) => cell.text === 'L')?.style?.fg?.token, 'text.default');
  assert.equal(styleFor(progressFrame, '█')?.fg?.token, 'status.error');
  assert.equal(progressFrame.cells.find((cell) => cell.text === '█')?.source?.description, 'filled');
});

test('notification tones retain component-specific styling', () => {
  const notificationFrame = renderElementFrame(notificationRegion({
    id: 'notices',
    items: [{
      id: 'sync',
      title: 'Sync',
      tone: 'progress',
      progress: 50
    }]
  }), { columns: 42, rows: 6 });

  assert.equal(styleFor(notificationFrame, '█')?.fg?.token, 'status.running');
});

test('chart components apply their styles and source metadata', () => {
  const barFrame = renderElementFrame(barChart({
    id: 'bars',
    label: 'Builds',
    items: [{ id: 'atlas', label: 'Atlas', value: 5 }],
    presentation: { activeId: 'atlas', selection: { mode: 'single', selectedId: 'atlas' } },
    onTransition: noMessage,
    styles: {
            parts: { label: tokenStyle('accent.primary') },
            states: { selected: { root: tokenStyle('status.success') } }
        }
}), { columns: 24, rows: 1 });
  const chartFrame = renderElementFrame(chart({
    id: 'chart',
    label: 'Requests',
    series: [],
    dataState: 'error',
    errorText: 'Unavailable'
  }), { columns: 24, rows: 1 });
  const heatmapFrame = renderElementFrame(heatmap({
    id: 'heatmap',
    label: 'Load',
    rows: [[{ id: 'a', label: 'Atlas', value: 3 }]],
    min: 0,
    max: 3,
    styles: {
            parts: { series: tokenStyle('status.warning') }
        }
}), { columns: 8, rows: 1 });

  assert.equal(styleFor(barFrame, 'A')?.fg?.token, 'status.success');
  assert.equal(
    barFrame.cells.find((cell) => cell.text === 'A')?.source?.elementKind,
    'terminal-ui/components/bar-chart'
  );
  assert.equal(styleFor(chartFrame, 'U')?.fg?.token, 'status.error');
  assert.equal(chartFrame.cells.find((cell) => cell.text === 'U')?.source?.description, 'state.error.message');
  assert.equal(styleFor(heatmapFrame, '█')?.fg?.token, 'status.warning');
  assert.equal(heatmapFrame.cells.find((cell) => cell.text === '█')?.source?.description, 'cell.a.value');
});

test('choice and picker controls use shared form visual styles and source metadata', () => {
  const toggleFrame = renderElementFrame(switchControl({
    id: 'toggle',
    label: 'Live',
    checked: true
  }), { columns: 24, rows: 1 });
  const sliderFrame = renderElementFrame(slider({ meta: { accessibleName: "Slider" },
    id: 'slider',
    label: 'Volume',
    value: 50,
    min: 0,
    max: 100,
    width: 5
  }), { columns: 24, rows: 1 });
  const checkboxFrame = renderElementFrame(checkboxGroup({ meta: { accessibleName: "Choices" },
    id: 'checks',
    label: 'Checks',
    presentation: {
      activeId: 'a',
      selection: { mode: 'multiple', selectedIds: ['a'] }
    },
    options: [
      { id: 'a', label: 'Alpha', value: 'a' },
      { id: 'b', label: 'Beta', value: 'b' }
    ]
  }), { columns: 24, rows: 3 });
  const colorFrame = renderElementFrame(colorSwatchPicker({ meta: { accessibleName: "Colors" },
    id: 'colors',
    label: 'Colors',
    presentation: {
      activeId: 'green',
      selection: { mode: 'single', selectedId: 'green' }
    },
    options: [{ id: 'green', label: 'Green', value: 'green', swatch: '■' }]
  }), { columns: 24, rows: 3 });
  const dateFrame = renderElementFrame(calendar({ meta: { accessibleName: "Calendar" },
    id: 'dates',
    label: 'Dates',
    presentation: calendarFixture({ selectedDate: { year: 2026, month: 6, day: 2 } })
  }), { columns: 30, rows: 8 });

  assert.equal(styleForCell(toggleFrame, (cell) => cell.source?.description === 'value.on')?.bg?.token, 'control.toggle.on.background');
  assert.equal(styleForCell(toggleFrame, (cell) => cell.source?.description === 'switch.track')?.bg?.token, 'control.toggle.on.background');
  assert.equal(toggleFrame.cells.some((cell) => cell.source?.description === 'value.off'), false);
  assert.equal(styleForCell(sliderFrame, (cell) => cell.source?.description === 'track.handle')?.bg?.token, 'control.track.filled');
  assert.equal(styleForCell(sliderFrame, (cell) => cell.source?.description === 'track.filled')?.fg?.token, 'control.track.filled');
  assert.equal(checkboxFrame.cells.find((cell) => cell.text === '☑')?.source?.description, 'option.a.marker.checked');
  const selectedCheckboxCell = checkboxFrame.cells.find((cell) =>
    cell.source?.description === 'option.a.marker.checked'
  );
  assert.equal(selectedCheckboxCell?.style?.bold, true);
  assert.equal(selectedCheckboxCell?.source?.interactionState, 'active');
  assert.equal(styleForCell(colorFrame, (cell) => cell.source?.description === 'summary.swatch')?.bg?.token, 'control.primary.background');
  assert.equal(colorFrame.cells.find((cell) => cell.source?.description === 'option.green.swatch')?.text, '■');
  assert.equal(dateFrame.cells.find((cell) => cell.source?.description === 'weekday.0')?.style?.fg?.token, 'text.disabled');
  assert.equal(dateFrame.cells.find((cell) => cell.text === '[')?.source?.description, 'day.2026-06-02.open');
});
