import assert from 'node:assert/strict';
import test from 'node:test';
import { calendarFixture } from '../helpers/calendar.mjs';
import {
  createScrollState,
  measuredWindow,
  prepareCommandSuggestions,
  prepareMeasuredCollection,
  prepareSearchPickerIndex,
  prepareLogHistory,
  prepareTreeSource,
  prepareTreeView,
} from '../../dist/behavior/index.js';
import { prepareTextDocument, textCaretAt } from '../../dist/text/index.js';
import { rasterImage } from '../../dist/graphics/index.js';

import {
  decodeAccessibleSnapshot } from '../../dist/accessibility/index.js';
import { resolveTerminalCapabilities } from '../../dist/host/index.js';
import { createVisualSnapshot } from '../../dist/testing/index.js';
import { defineTheme,
  highContrastTheme } from '../../dist/theme/index.js';
import { renderFramePlain,
  renderElementFrame
} from '../../dist/renderer/index.js';
import {
  absolute,
  anchored,
  flow,
  grid,
  measuredColumn,
  overlay,
  row,
  splitPane,
  column,
  surface,
  viewport
} from '../../dist/layout/index.js';
import {
  activityIndicator,
  barChart,
  button,
  canvas,
  chart,
  checkbox,
  checkboxGroup,
  commandInput,
  contextMenu,
  colorSwatchPicker,
  calendar,
  dialog,
  disclosure,
  divider,
  menuTrigger,
  field,
  form,
  meter,
  helpBar,
  heatmap,
  image,
  inspectElement,
  textInput,
  tabs,
  label,
  listbox,
  menu,
  menuBar,
  notificationRegion,
  notificationHistory,
  numberInput,
  pagination,
  passwordInput,
  searchPicker,
  progressBar,
  radioGroup,
  rangeSlider,
  richText,
  logViewer,
  combobox,
  sparkline,
  statusBar,
  slider,
  dataGrid,
  text,
  textArea,
  tooltip,
  tree,
  switchControl
} from '../../dist/components/index.js';
import {
  contextMenuPresentation,
  menuTriggerPresentation,
  menuBarPresentation,
  menuPresentation
} from '../../dist/behavior/index.js';

const unsafe = 'Unsafe \u001B[31mred\u001B[0m text';
const previewImage = rasterImage({
  width: 2,
  height: 1,
  format: 'rgb8',
  data: new Uint8Array([255, 0, 0, 0, 0, 255]),
});
const terminalSizeNormal = { columns: 48, rows: 10 };
const terminalSizeWide = { columns: 64, rows: 14 };
const terminalSizeTiny = { columns: 1, rows: 1 };
const themed = defineTheme({
  name: 'snapshot-theme',
  tokens: {
    colors: {
      'accent.primary': { kind: 'ansi', value: 10 },
      'text.default': { kind: 'ansi', value: 15 },
      'surface.border': { kind: 'ansi', value: 12 }
    },
    symbols: {
      pointer: '>',
      selected: '*',
      progressFilled: '#',
      progressEmpty: '-'
    }
  }
});

const menuItems = [
  { kind: 'action', id: 'open', label: unsafe, shortcut: { kind: 'key', key: 'o' } },
  { kind: 'check', id: 'save', label: 'Save', checked: true },
  { kind: 'action', id: 'disabled', label: 'Disabled', disabled: true }
];

const optionItems = [
  { id: 'alpha', label: unsafe, value: 'alpha' },
  { id: 'beta', label: 'Beta', value: 'beta', disabled: true }
];

const treeNodes = [
  {
    id: 'root',
    label: unsafe,
    kind: 'branch',
    children: [
      { id: 'child', label: 'Child', kind: 'leaf' },
      { id: 'disabled', label: 'Disabled', kind: 'leaf', disabled: true }
    ]
  }
];

const cases = [
  {
    name: 'text',
    element: () => text({ content: unsafe, id: 'text' }),
    expectText: /Unsafe red text/u
  },
  {
    name: 'richText',
    element: () => richText({
      id: 'rich',
      segments: [
        { kind: 'text', text: unsafe, style: { fg: { kind: 'theme', token: 'accent.primary' }, bold: true } }
      ]
    }),
    expectText: /Unsafe red text/u,
    expectStyledCells: true
  },
  {
    name: 'column',
    element: () => column([
      text({ content: unsafe, id: 'column-one' }),
      text({ content: 'Second', id: 'column-two' })
    ], { id: 'column' }),
    expectText: /Second/u
  },
  {
    name: 'row',
    element: () => row([
      text({ content: unsafe, id: 'row-one' }),
      text({ content: 'Second', id: 'row-two' })
    ], { id: 'row' }),
    expectText: /Unsafe red text/u
  },
  {
    name: 'flow',
    element: () => flow([
      text({ content: unsafe, id: 'flow-one' }),
      text({ content: 'Second', id: 'flow-two' })
    ], { id: 'flow', direction: 'horizontal', gap: 1 }),
    expectText: /Second/u
  },
  {
    name: 'measuredColumn',
    element: () => measuredColumn(
      measuredWindow(prepareMeasuredCollection([
          { id: 'first', value: unsafe, rows: 1 },
          { id: 'second', value: 'Second', rows: 1 }
        ]), {
        viewportRows: 2
      }),
      (entry) => text({ content: entry.item.value, id: `measured-${entry.item.id}` }),
      { id: 'measured-column' }
    ),
    expectText: /Second/u
  },
  {
    name: 'listbox',
    element: () => listbox({ meta: { accessibleName: "List" },
    projectItem: (item) => ({ id: String(item), label: String(item) }),
      id: 'listbox',
      items: [unsafe, 'Second', 'Third'],
      presentation: {
        activeId: 'Second',
        selection: { mode: 'single', selectedId: 'Second' }
      },
      onTransition: (action) => action
    }),
    expectText: /Second/u,
    expectFocus: true
  },
  {
    name: 'dataGrid',
    element: () => dataGrid({ meta: { accessibleName: "Data grid" },
    getRowId: (_row, index) => String(index),
    id: 'dataGrid',
      rows: [{ name: unsafe, status: 'ok' }, { name: 'Second', status: 'idle' }],
      presentation: {
        interaction: {
          kind: 'row', activeRowId: '1', selection: { mode: 'single', selectedRowId: '1' },
        }
      },
      columns: [{
        id: 'name-0', value: (row) => Array.isArray(row) ? row[0] : row, header: 'Name' }, {
        id: 'status-1', value: (row) => Array.isArray(row) ? row[1] : undefined, header: 'Status' }],
      onTransition: (action) => action
    }),
    expectText: /Name/u
  },
  {
    name: 'tree',
    element: () => {
      const presentation = {
        expandedIds: ['root'],
        activeId: 'child',
        selection: { mode: 'single', selectedId: 'child' }
      };
      const source = prepareTreeSource(treeNodes);
      return tree({ meta: { accessibleName: "Tree" },
        id: 'tree',
        view: prepareTreeView(source, presentation),
        presentation,
        onTransition: (action) => ({ kind: 'tree', action })
      });
    },
    expectText: /Child/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'pagination',
    element: () => pagination({ meta: { accessibleName: "Pagination" },
      id: 'pages',
      label: unsafe,
      pageNumber: 2,
      pageCount: 3,
      onAction: (action) => action
    }),
    expectText: /Page 2 of 3/u
  },
  {
    name: 'textArea',
    element: () => textArea({ meta: { accessibleName: "Text area" },
      id: 'text-area',
      presentation: { document: prepareTextDocument(`${unsafe}\nSecond`), caret: textCaretAt(3 )},
      onAction: (action) => action
    }),
    expectText: /Second/u,
    expectFocus: true
  },
  {
    name: 'disclosure',
    element: () => disclosure({
        id: 'disclosure',
        label: unsafe,
        expanded: true,
        onAction: (action) => action,
        slots: { content: text({ content: 'Details', id: 'disclosure-panel' }) }
      }),
    expectText: /Details/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'form',
    element: () => form({ meta: { accessibleName: "Form" }, slots: { content: [
      field({ control: textInput({ meta: { accessibleName: "Text input" },
        id: 'form-input',
        presentation: { value: unsafe, cursor: 0 },
        onAction: (action) => action
      }), id: 'form-field', label: 'Name' }),
      button({ id: 'form-submit', label: 'Submit', onAction: () => ({ kind: 'submit' }) })
    ] }, id: 'form', title: unsafe }),
    expectText: /Submit/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'field',
    element: () => field({ control: textInput({ meta: { accessibleName: "Text input" },
      id: 'field-input',
      presentation: { value: unsafe, cursor: 0 },
      onAction: (action) => action
    }),
      id: 'field',
      label: unsafe,
      description: 'Description'
    }),
    expectText: /Description/u,
    expectFocus: true
  },
  {
    name: 'label',
    element: () => form({ meta: { accessibleName: "Form" }, slots: { content: [
      label({ id: 'label', forId: 'label-target', text: unsafe }),
      textInput({ meta: { accessibleName: "Text input" },
        id: 'label-target',
        presentation: { value: '', cursor: 0 },
        onAction: (action) => action
      })
    ] }, id: 'label-form' }),
    expectText: /Unsafe red text/u,
    expectFocus: true
  },
  {
    name: 'button',
    element: () => button({ id: 'button', label: unsafe, onAction: () => ({ kind: 'button' }) }),
    expectText: /Unsafe red text/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'checkbox',
    element: () => checkbox({ id: 'checkbox', label: unsafe, checked: true, onAction: () => ({ kind: 'check' }) }),
    expectText: /Unsafe red text/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'switchControl',
    element: () => switchControl({ id: 'toggle', label: unsafe, checked: true, onAction: () => ({ kind: 'toggle' }) }),
    expectText: /Unsafe red text/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'slider',
    element: () => slider({ meta: { accessibleName: "Slider" },
      id: 'slider',
      label: unsafe,
      value: 5,
      max: 10,
      onAction: (action) => ({ kind: 'slider', action })
    }),
    expectText: /Unsafe red text/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'rangeSlider',
    element: () => rangeSlider({ meta: { accessibleName: "Range" },
      id: 'range-slider',
      label: unsafe,
      state: { value: { start: 2, end: 8 }, activeHandle: 'end' },
      range: { min: 0, max: 10 },
      onAction: (action) => ({ kind: 'range', action })
    }),
    expectText: /Unsafe red text/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'checkboxGroup',
    element: () => checkboxGroup({ meta: { accessibleName: "Choices" },
      id: 'checkbox-listbox',
      label: unsafe,
      options: optionItems,
      presentation: {
        activeId: 'alpha',
        selection: { mode: 'multiple', selectedIds: ['alpha'] }
      },
      onAction: (action) => ({ kind: 'checkboxGroup', action })
    }),
    expectText: /Beta/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'radioGroup',
    element: () => radioGroup({ meta: { accessibleName: "Choices" },
      id: 'radio',
      label: 'Mode',
      options: optionItems,
      presentation: {
        activeId: 'alpha',
        selection: { mode: 'single', selectedId: 'alpha' }
      },
      onAction: (action) => ({ kind: 'radio', action })
    }),
    expectText: /Mode/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'combobox',
    element: () => combobox({
      id: 'combobox',
      label: 'Choice',
      options: optionItems,
      presentation: {
        kind: 'select',
        open: false,
        interaction: { selection: { mode: 'single', selectedId: 'alpha' } }
      },
      onTransition: (action) => ({ kind: 'combobox', action })
    }),
    expectText: /Choice/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'colorSwatchPicker',
    element: () => colorSwatchPicker({ meta: { accessibleName: "Colors" },
      id: 'color-picker',
      label: unsafe,
      options: [
        { id: 'alpha', label: unsafe, value: 'alpha', swatch: '■' },
        { id: 'beta', label: 'Beta', value: 'beta', swatch: '◆' }
      ],
      presentation: {
        activeId: 'alpha',
        selection: { mode: 'single', selectedId: 'alpha' }
      },
      onAction: (action) => ({ kind: 'color', action })
    }),
    expectText: /Beta/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'calendar',
    element: () => calendar({ meta: { accessibleName: "Calendar" },
      id: 'calendar',
      label: unsafe,
      presentation: calendarFixture({
        selectedDate: { year: 2026, month: 6, day: 3 },
        today: { year: 2026, month: 6, day: 2 }
      }),
      onAction: (action) => ({ kind: 'date', action })
    }),
    expectText: /Unsafe red text/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'textInput',
    element: () => textInput({ meta: { accessibleName: "Text input" },
      id: 'text-input',
      presentation: { value: unsafe, cursor: 2 },
      onAction: (action) => action
    }),
    expectText: /Unsafe red text/u,
    expectFocus: true
  },
  {
    name: 'passwordInput',
    element: () => passwordInput({ meta: { accessibleName: "Password input" },
      id: 'password-input',
      presentation: { value: 'secret', cursor: 6 },
      onAction: (action) => action
    }),
    expectText: /••••••/u,
    expectFocus: true
  },
  {
    name: 'numberInput',
    element: () => numberInput({ meta: { accessibleName: "Number input" },
      id: 'number-input',
      presentation: { value: '42', cursor: 2, validity: 'valid', parsedValue: 42, min: 1, max: 99 },
      onAction: (action) => action
    }),
    expectText: /42/u,
    expectFocus: true
  },
  {
    name: 'menu',
    element: () => menu({ meta: { accessibleName: "Menu" }, id: 'menu', presentation: menuPresentation(menuItems, { activePath: ['open'] }), onTransition: (action) => ({ kind: 'menu', action }) }),
    expectText: /Unsafe red text/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'menuBar',
    element: () => menuBar({ meta: { accessibleName: "Menu bar" }, id: 'menu-bar', items: menuItems, presentation: menuBarPresentation(menuItems, { kind: 'closed', active: 'open' }), onTransition: (action) => ({ kind: 'menu', action }) }),
    expectText: /Save/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'contextMenu',
    element: () => contextMenu({ meta: { accessibleName: "Context menu" }, id: 'context-menu', title: unsafe, presentation: contextMenuPresentation(menuItems, { kind: 'open', anchor: { kind: 'cursor', row: 1, column: 1 }, menu: { activePath: ['save'] } }), onTransition: (action) => ({ kind: 'menu', action }) }),
    expectText: /Save/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'menuTrigger',
    element: () => menuTrigger({ meta: { accessibleName: "Menu" },
      id: 'menuTrigger',
      label: unsafe,
      items: menuItems,
      presentation: menuTriggerPresentation(menuItems, { kind: 'open', active: 'save', menu: { activePath: ['save'] } }),
      onTransition: (action) => ({ kind: 'menuTrigger', action })
    }),
    expectText: /Save/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'divider',
    element: () => divider({ id: 'divider', label: unsafe, line: 'dashed' }),
    expectText: /Unsafe red text/u,
    expectStyledCells: true
  },
  {
    name: 'tooltip',
    element: () => tooltip({
      id: 'tooltip',
      title: 'Hint',
      content: unsafe,
      tone: 'warning',
      trigger: button({ id: 'tooltip-trigger', label: 'Trigger', onAction: () => ({ kind: 'trigger' }) }),
      open: true,
      onTransition: (action) => action
    }),
    expectText: /Unsafe red text/u,
    expectStyledCells: true
  },
  {
    name: 'canvas',
    element: () => canvas({
      id: 'canvas',
      label: unsafe,
      measurement: { minWidth: 0, minHeight: 0, preferredWidth: 16, preferredHeight: 1 },
      painter({ canvas }) {
        canvas.text(0, 0, [renderSpan(unsafe, { style: { fg: { kind: 'theme', token: 'accent.primary' } } })]);
      }
    }),
    expectText: /Unsafe red text/u,
    expectStyledCells: true
  },
  {
    name: 'image',
    element: () => image({
      id: 'image',
      image: previewImage,
      label: unsafe,
      measurement: { minWidth: 1, minHeight: 1, preferredWidth: 16, preferredHeight: 2 },
    }),
    expectText: /Unsafe red text/u,
  },
  {
    name: 'surface',
    element: () => surface(text({ content: unsafe, id: 'surface-child' }), {
      id: 'surface',
      label: unsafe,
      title: unsafe,
      border: { kind: 'single' }
    }),
    expectText: /Unsafe red text/u
  },
  {
    name: 'absolute',
    element: () => absolute(text({ content: unsafe, id: 'absolute-child' }), {
      id: 'absolute',
      row: 2,
      column: 3,
      width: 18,
      height: 1
    }),
    expectText: /Unsafe red text/u
  },
  {
    name: 'overlay',
    element: () => overlay([
      text({ content: unsafe, id: 'overlay-base' }),
      absolute(text({ content: 'Top', id: 'overlay-top' }), { id: 'overlay-abs', row: 1, column: 8, width: 3, height: 1 })
    ], { id: 'overlay' }),
    expectText: /Unsafe/u
  },
  {
    name: 'statusBar',
    element: () => statusBar({ id: 'status', leading: [{ id: 'state', kind: 'text', text: unsafe }] }),
    expectText: /Unsafe red text/u
  },
  {
    name: 'helpBar',
    element: () => helpBar({ id: 'help', groups: [{ id: 'primary', bindings: [{ binding: { kind: 'key', key: 'enter' }, label: unsafe }] }] }),
    expectText: /Unsafe red text/u
  },
  {
    name: 'activityIndicator',
    element: () => activityIndicator({ id: 'activity-indicator', label: unsafe, status: 'running' }),
    expectText: /Unsafe red text/u
  },
  {
    name: 'progressBar',
    element: () => progressBar({ id: 'progress', label: unsafe, mode: { kind: 'determinate', value: 3, max: 5 } }),
    expectText: /Unsafe red text/u
  },
  {
    name: 'notificationRegion',
    element: () => notificationRegion({
      id: 'notifications',
      items: [
        { id: 'warning', title: unsafe, message: 'Check route', tone: 'warning' }
      ],
      maxWidth: 32
    }),
    expectText: /Unsafe red text/u,
    expectStyledCells: true
  },
  {
    name: 'notificationHistory',
    element: () => notificationHistory({ meta: { accessibleName: "Notification history" },
      id: 'notification-history',
      scroll: createScrollState(),
      items: [{
        id: 'completed',
        title: unsafe
      }],
      selectedId: 'completed',
      onAction: (action) => action
    }),
    expectText: /Unsafe red text/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'sparkline',
    element: () => sparkline({ id: 'sparkline', label: 'Trend', values: [0, 1, 2, 3] }),
    expectText: /[▁#]/u
  },
  {
    name: 'barChart',
    element: () => barChart({
      id: 'bar-chart',
      label: 'Bars',
      items: [{ id: 'unsafe', label: unsafe, value: 2 }, { id: 'second', label: 'Second', value: 4 }],
      presentation: { activeId: 'second', selection: { mode: 'single', selectedId: 'second' } },
      onTransition: (action) => action
    }),
    expectText: /Second/u
  },
  {
    name: 'chart',
    element: () => chart({
      id: 'chart',
      label: 'Chart',
      series: [{
        id: 'series',
        label: unsafe,
        points: [0, 2, 1, 3].map((value, index) => ({
          id: `point-${String(index)}`,
          label: `Point ${String(index + 1)}`,
          value
        }))
      }]
    }),
    expectText: /\*/u
  },
  {
    name: 'meter',
    element: () => meter({ id: 'meter', label: unsafe, value: 7, max: 10 }),
    expectText: /Unsafe red text/u
  },
  {
    name: 'heatmap',
    element: () => heatmap({
      id: 'heatmap',
      label: 'Heatmap',
      rows: [
        [{ id: 'a', label: unsafe, value: 1 }, { id: 'b', label: 'Beta', value: 3 }],
        [{ id: 'c', label: 'Gamma', value: 5 }]
      ],
      presentation: { activeId: 'b', selection: { mode: 'single', selectedId: 'b' } },
      onTransition: (action) => ({ kind: 'heatmap', action })
    }),
    expectText: /[░▒▓█◆]/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'viewport',
    element: () => viewport(text({ content: `${unsafe}\nSecond`, id: 'viewport-child' }), {
      id: 'viewport',
      offset: { row: 1 }
    }),
    expectText: /Second/u
  },
  {
    name: 'logViewer',
    element: () => logViewer({
      id: 'logViewer',
      history: prepareLogHistory([
        { id: 'one', text: unsafe },
        { id: 'two', text: 'Second' }
      ]),
      query: { text: 'Second', mode: 'contains' }
    }),
    expectText: /Second/u
  },
  {
    name: 'commandInput',
    element: () => commandInput({ meta: { accessibleName: "Command input" },
      id: 'command-input',
      presentation: { value: unsafe, cursor: 0, open: true, suggestions: prepareCommandSuggestions([{ id: 'open', completion: { range: { startOffset: 0, endOffsetExclusive: unsafe.length }, text: 'open' }, label: unsafe, description: 'Open action' }]), activeSuggestionId: 'open' },
      prompt: '>',
      onTransition: (action) => action
    }),
    expectText: /Unsafe red text/u,
    expectFocus: true
  },
  {
    name: 'searchPicker',
    element: () => searchPicker({ meta: { accessibleName: "Search" },
      id: 'searchPicker',
      title: unsafe,
      searchPickerIndex: prepareSearchPickerIndex([
        { id: 'alpha', label: unsafe, value: 'alpha', preview: 'Preview' },
        { id: 'beta', label: 'Beta', value: 'beta', disabled: true }
      ]),
      presentation: { query: { text: '', mode: 'fuzzy' }, activeId: 'alpha' },
      onTransition: (action) => action
    }),
    expectText: /Preview/u,
    expectFocus: true
  },
  {
    name: 'grid',
    element: () => grid([
      text({ content: unsafe, id: 'grid-one' }),
      text({ content: 'Second', id: 'grid-two' })
    ], {
      id: 'grid',
      rows: [{ kind: 'fr', value: 1 }],
      columns: [{ kind: 'fr', value: 1 }, { kind: 'fr', value: 1 }]
    }),
    expectText: /Unsafe red text/u
  },
  {
    name: 'anchored',
    element: () => anchored(
      text({ content: unsafe, id: 'anchored-child' }),
      {
        id: 'anchored',
        anchor: { kind: 'cursor', row: 1, column: 1 }
      }
    ),
    expectText: /Unsafe red text/u
  },
  {
    name: 'splitPane',
    element: () => splitPane([
      text({ content: unsafe, id: 'split-one' }),
      text({ content: 'Second', id: 'split-two' })
    ], {
      id: 'split',
      direction: 'horizontal',
      sizes: [{ kind: 'fr', value: 1 }, { kind: 'fr', value: 1 }]
    }),
    expectText: /Second/u
  },
  {
    name: 'tabs',
    element: () => tabs({ meta: { accessibleName: "Tabs" },
      id: 'tabs',
      presentation: { activeId: 'first', selectedId: 'first' },
      tabs: [
        { id: 'first', label: unsafe, panel: text({ content: 'Panel one', id: 'panel-one' }) },
        { id: 'second', label: 'Second', panel: text({ content: 'Panel two', id: 'panel-two' }), disabled: true }
      ],
      onTransition: (action) => action
    }),
    expectText: /Panel one/u
  },
  {
    name: 'dialog',
    element: () => dialog({
      slots: { content: button({ id: 'dialog-button', label: 'Confirm', onAction: () => ({ kind: 'confirm' }) }) },
      id: 'dialog',
      title: unsafe,
      modal: true,
      focusPolicy: { returnFocus: 'restore' },
      width: 24,
      height: 5
    }),
    expectText: /Confirm/u,
    expectFocus: true,
    expectHitTargets: true
  }
];

test('semantic element snapshots use unique built-in factory names', () => {
  const names = cases.map((item) => item.name).sort();
  assert.equal(new Set(names).size, names.length);
});

for (const current of cases) {
  test(`${current.name} semantic snapshots expose frame ANSI accessibility sizing sanitization and theme behavior`, () => {
    const element = current.element();
    const frame = renderElementFrame(element, terminalSizeNormal);
    const plain = renderFramePlain(frame);
    const snapshot = createVisualSnapshot({ frame });
    const accessibilityJson = JSON.stringify(frame.accessibility);
    assert.equal(
      inspectionCanFocus(inspectElement(element)),
      frame.focusPath !== undefined,
      `${current.name} inspection focus capability`
    );

    assert.equal(frame.width, terminalSizeNormal.columns);
    assert.equal(frame.height, terminalSizeNormal.rows);
    assert.equal(decodeAccessibleSnapshot(frame.accessibility).status, 'success');
    assert.match(plain, current.expectText);
    assert.doesNotMatch(plain, /\u001B/u);
    assert.doesNotMatch(accessibilityJson, /\u001B/u);
    assertCellsAreInsideFrame(frame);
    assertElementVisualSnapshot(snapshot, current, terminalSizeNormal, `${current.name} default`);

    if (current.expectStyledCells === true) {
      assert.equal(frame.cells.some((cell) => cell.style !== undefined), true);
    }
    if (current.expectFocus === true) {
      assert.ok(frame.focusPath, `${current.name} should expose a focus path`);
      assert.equal(frame.accessibility.focusPath.length > 0, true);
    }
    if (current.expectHitTargets === true) {
      assert.ok(frame.hitTargets?.length, `${current.name} should expose hit targets`);
    }

    const resized = renderElementFrame(current.element(), terminalSizeWide);
    assert.equal(resized.width, terminalSizeWide.columns);
    assert.equal(decodeAccessibleSnapshot(resized.accessibility).status, 'success');
    assertCellsAreInsideFrame(resized);

    const tiny = renderElementFrame(current.element(), terminalSizeTiny);
    assert.equal(tiny.width, terminalSizeTiny.columns);
    assert.equal(tiny.height, terminalSizeTiny.rows);
    assert.equal(decodeAccessibleSnapshot(tiny.accessibility).status, 'success');
    assertCellsAreInsideFrame(tiny);
    assert.doesNotMatch(renderFramePlain(tiny), /\u001B/u);

    const themedFrame = renderElementFrame(current.element(), terminalSizeNormal, { theme: themed });
    assert.equal(decodeAccessibleSnapshot(themedFrame.accessibility).status, 'success');
    assertCellsAreInsideFrame(themedFrame);

    const highContrastFrame = renderElementFrame(current.element(), terminalSizeNormal, { theme: highContrastTheme });
    assert.equal(decodeAccessibleSnapshot(highContrastFrame.accessibility).status, 'success');
    assertCellsAreInsideFrame(highContrastFrame);
    assertElementVisualSnapshot(
      createVisualSnapshot({ frame: highContrastFrame, ansi: { capabilities: colorCapabilities(), theme: highContrastTheme } }),
      current,
      terminalSizeNormal,
      `${current.name} high contrast`
    );

    const noColorSnapshot = createVisualSnapshot({ frame, ansi: { capabilities: noColorCapabilities() } });
    assertElementVisualSnapshot(noColorSnapshot, current, terminalSizeNormal, `${current.name} no color`);
    assert.doesNotMatch(noColorSnapshot.ansiFrame, /\\x1b\[[0-9;]*m/u, `${current.name} no-color snapshot should not emit SGR`);
  });
}

function assertElementVisualSnapshot(snapshot, current, terminalSize, label) {
  const frameJson = JSON.parse(snapshot.frameJson);
  const hitTargets = JSON.parse(snapshot.hitTargetJson);
  const focusTargets = JSON.parse(snapshot.focusTargetJson);

  assert.match(snapshot.plainTextFrame, current.expectText, `${label}: plain frame`);
  assert.match(snapshot.ansiFrame, /\\x1b\[/u, `${label}: ANSI frame`);
  assert.doesNotMatch(snapshot.ansiFrame, /\u001B/u, `${label}: raw ANSI leaked into normalized ANSI artifact`);
  assert.doesNotMatch(snapshot.frameJson, /\u001B/u, `${label}: raw ANSI leaked into frame JSON`);
  assert.doesNotMatch(snapshot.accessibilityJson, /\u001B/u, `${label}: raw ANSI leaked into accessibility JSON`);
  assert.equal(frameJson.width, terminalSize.columns, `${label}: frame width`);
  assert.equal(frameJson.height, terminalSize.rows, `${label}: frame height`);
  assert.equal(Array.isArray(frameJson.cells), true, `${label}: frame cells`);
  assert.equal(Array.isArray(hitTargets), true, `${label}: hit target artifact`);
  assert.equal(Array.isArray(focusTargets.focusPath), true, `${label}: focus target artifact`);
  assert.equal(Array.isArray(focusTargets.accessibilityFocusPath), true, `${label}: accessibility focus artifact`);
  if (current.expectFocus === true) {
    assert.equal(focusTargets.focusPath.length > 0, true, `${label}: focus path`);
    assert.equal(focusTargets.accessibilityFocusPath.length > 0, true, `${label}: accessibility focus path`);
  }
  if (current.expectHitTargets === true) {
    assert.equal(hitTargets.length > 0, true, `${label}: hit targets`);
  }
}

function colorCapabilities() {
  return resolveTerminalCapabilities({
    host: {
      runtime: 'memory',
      inputIsTty: true,
      outputIsTty: true,
      supportsRawInput: true
    }
  });
}

function noColorCapabilities() {
  return {
    ...colorCapabilities(),
    color: {
      depth: 0,
      hasBasicColors: false,
      has256Colors: false,
      hasTrueColor: false
    }
  };
}

function assertCellsAreInsideFrame(frame) {
  for (const cell of frame.cells) {
    assert.equal(cell.row >= 1 && cell.row <= frame.height, true);
    assert.equal(cell.column >= 1 && cell.column <= frame.width, true);
    assert.equal(cell.column + Math.max(1, cell.width) - 1 <= frame.width, true);
    assert.equal(Number.isInteger(cell.width), true);
    assert.equal(cell.width >= 0, true);
  }
}

function inspectionCanFocus(inspection) {
  return inspection.inputs.focus !== 'none' || inspection.children.some(inspectionCanFocus);
}

function renderSpan(text, options = {}) {
  return {
    text,
    ...options
  };
}
