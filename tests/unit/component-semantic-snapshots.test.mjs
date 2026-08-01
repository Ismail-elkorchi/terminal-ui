import assert from 'node:assert/strict';
import test from 'node:test';
import { calendarFixture } from '../helpers/calendar.mjs';
import {
  measuredWindow,
  prepareSearchPickerIndex,
  prepareLogHistory
} from '../../dist/behavior/index.js';
import { prepareTextDocument, textCaretAt } from '../../dist/text/index.js';

import {
  validateAccessibleSnapshot } from '../../dist/accessibility/index.js';
import { builtinRenderNodeRenderers } from '../../dist/renderer/internal/renderers/index.js';
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
  dropdownMenu,
  field,
  form,
  meter,
  helpBar,
  heatmap,
  inspectElement,
  textInput,
  tabs,
  label,
  list,
  menu,
  menuBar,
  notificationRegion,
  notificationHistory,
  numberInput,
  paginator,
  passwordInput,
  searchPicker,
  progressBar,
  radioGroup,
  rangeSlider,
  richText,
  logViewer,
  select,
  sparkline,
  statusBar,
  slider,
  table,
  text,
  textArea,
  tooltip,
  tree,
  toggleSwitch
} from '../../dist/components/index.js';
import {
  contextMenuPresentation,
  dropdownMenuPresentation,
  menuBarPresentation,
  menuPresentation
} from '../../dist/behavior/index.js';

const unsafe = 'Unsafe \u001B[31mred\u001B[0m text';
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
  { kind: 'action', id: 'open', label: unsafe, shortcut: 'O' },
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
    expanded: true,
    children: [
      { id: 'child', label: 'Child', kind: 'leaf' },
      { id: 'disabled', label: 'Disabled', kind: 'leaf', disabled: true }
    ]
  }
];

const cases = [
  {
    name: 'text',
    element: () => text(unsafe, { id: 'text' }),
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
      text(unsafe, { id: 'column-one' }),
      text('Second', { id: 'column-two' })
    ], { id: 'column' }),
    expectText: /Second/u
  },
  {
    name: 'row',
    element: () => row([
      text(unsafe, { id: 'row-one' }),
      text('Second', { id: 'row-two' })
    ], { id: 'row' }),
    expectText: /Unsafe red text/u
  },
  {
    name: 'flow',
    element: () => flow([
      text(unsafe, { id: 'flow-one' }),
      text('Second', { id: 'flow-two' })
    ], { id: 'flow', direction: 'horizontal', gap: 1 }),
    expectText: /Second/u
  },
  {
    name: 'measuredColumn',
    element: () => measuredColumn(
      measuredWindow({
        items: [
          { id: 'first', value: unsafe, rows: 1 },
          { id: 'second', value: 'Second', rows: 1 }
        ],
        viewportRows: 2
      }),
      (entry) => text(entry.item.value, { id: `measured-${entry.item.id}` }),
      { id: 'measured-column' }
    ),
    expectText: /Second/u
  },
  {
    name: 'list',
    element: () => list({
    projectItem: (item) => ({ id: String(item), label: String(item) }),
    id: 'list',
      items: [unsafe, 'Second', 'Third'],
      selectedId: 'Second',
      onAction: (action) => action
    }),
    expectText: /Second/u,
    expectFocus: true
  },
  {
    name: 'table',
    element: () => table({
    getRowId: (_row, index) => String(index),
    id: 'table',
      rows: [{ name: unsafe, status: 'ok' }, { name: 'Second', status: 'idle' }],
      presentation: { selectedRowId: '1' },
      columns: [{
        id: 'name-0', value: (row) => Array.isArray(row) ? row[0] : row, header: 'Name' }, {
        id: 'status-1', value: (row) => Array.isArray(row) ? row[1] : undefined, header: 'Status' }],
      onAction: (action) => action
    }),
    expectText: /Name/u
  },
  {
    name: 'tree',
    element: () => tree({
      id: 'tree',
      nodes: treeNodes,
      selected: 'child',
      onAction: (action) => ({ kind: 'tree', action })
    }),
    expectText: /Child/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'paginator',
    element: () => paginator({
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
    element: () => textArea({
      id: 'text-area',
      presentation: { document: prepareTextDocument(`${unsafe}\nSecond`), caret: textCaretAt(3 )},
      onAction: (action) => action
    }),
    expectText: /Second/u,
    expectFocus: true
  },
  {
    name: 'disclosure',
    element: () => disclosure(
      text('Details', { id: 'disclosure-panel' }),
      {
        id: 'disclosure',
        label: unsafe,
        expanded: true,
        onAction: (action) => action
      }
    ),
    expectText: /Details/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'form',
    element: () => form([
      field(textInput({
        id: 'form-input',
        presentation: { value: unsafe, cursor: 0 },
        onAction: (action) => action
      }), { id: 'form-field', label: 'Name' }),
      button({ id: 'form-submit', label: 'Submit', onPress: () => ({ kind: 'submit' }) })
    ], { id: 'form', title: unsafe }),
    expectText: /Submit/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'field',
    element: () => field(textInput({
      id: 'field-input',
      presentation: { value: unsafe, cursor: 0 },
      onAction: (action) => action
    }), {
      id: 'field',
      label: unsafe,
      description: 'Description',
      error: 'Required'
    }),
    expectText: /Required/u,
    expectFocus: true
  },
  {
    name: 'label',
    element: () => form([
      label({ id: 'label', forId: 'label-target', text: unsafe, required: true }),
      textInput({
        id: 'label-target',
        presentation: { value: '', cursor: 0 },
        onAction: (action) => action
      })
    ], { id: 'label-form' }),
    expectText: /Unsafe red text/u,
    expectFocus: true
  },
  {
    name: 'button',
    element: () => button({ id: 'button', label: unsafe, onPress: () => ({ kind: 'button' }) }),
    expectText: /Unsafe red text/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'checkbox',
    element: () => checkbox({ id: 'checkbox', label: unsafe, checked: true, onChange: () => ({ kind: 'check' }) }),
    expectText: /Unsafe red text/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'toggleSwitch',
    element: () => toggleSwitch({ id: 'toggle', label: unsafe, checked: true, onChange: () => ({ kind: 'toggle' }) }),
    expectText: /Unsafe red text/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'slider',
    element: () => slider({
      id: 'slider',
      label: unsafe,
      value: 5,
      max: 10,
      onChange: (value) => ({ kind: 'slider', value })
    }),
    expectText: /Unsafe red text/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'rangeSlider',
    element: () => rangeSlider({
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
    element: () => checkboxGroup({
      id: 'checkbox-list',
      label: unsafe,
      options: optionItems,
      selected: ['alpha'],
      onAction: (action) => ({ kind: 'checkboxGroup', action })
    }),
    expectText: /Beta/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'radioGroup',
    element: () => radioGroup({
      id: 'radio',
      label: 'Mode',
      options: optionItems,
      selected: 'alpha',
      onAction: (action) => ({ kind: 'radio', action })
    }),
    expectText: /Mode/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'select',
    element: () => select({
      id: 'select',
      label: 'Choice',
      options: optionItems,
      presentation: { kind: 'closed', selected: 'alpha' },
      onAction: (action) => ({ kind: 'select', action })
    }),
    expectText: /Choice/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'colorSwatchPicker',
    element: () => colorSwatchPicker({
      id: 'color-picker',
      label: unsafe,
      options: [
        { id: 'alpha', label: unsafe, value: 'alpha', swatch: '■' },
        { id: 'beta', label: 'Beta', value: 'beta', swatch: '◆' }
      ],
      selected: 'alpha',
      onAction: (action) => ({ kind: 'color', action })
    }),
    expectText: /Beta/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'calendar',
    element: () => calendar({
      id: 'calendar',
      label: unsafe,
      ...calendarFixture({
        selected: { year: 2026, month: 6, day: 3 },
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
    element: () => textInput({
      id: 'text-input',
      presentation: { value: unsafe, cursor: 2 },
      onAction: (action) => action
    }),
    expectText: /Unsafe red text/u,
    expectFocus: true
  },
  {
    name: 'passwordInput',
    element: () => passwordInput({
      id: 'password-input',
      presentation: { value: 'secret', cursor: 6 },
      onAction: (action) => action
    }),
    expectText: /••••••/u,
    expectFocus: true
  },
  {
    name: 'numberInput',
    element: () => numberInput({
      id: 'number-input',
      presentation: { value: '42', cursor: 2, validity: 'valid', parsedValue: 42, min: 1, max: 99 },
      onAction: (action) => action
    }),
    expectText: /42/u,
    expectFocus: true
  },
  {
    name: 'menu',
    element: () => menu({ id: 'menu', presentation: menuPresentation(menuItems, { activePath: ['open'] }), onAction: (action) => ({ kind: 'menu', action }) }),
    expectText: /Unsafe red text/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'menuBar',
    element: () => menuBar({ id: 'menu-bar', items: menuItems, presentation: menuBarPresentation(menuItems, { kind: 'closed', active: 'open' }), onAction: (action) => ({ kind: 'menu', action }) }),
    expectText: /Save/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'contextMenu',
    element: () => contextMenu({ id: 'context-menu', title: unsafe, presentation: contextMenuPresentation(menuItems, { kind: 'open', anchor: { kind: 'cursor', row: 1, column: 1 }, menu: { activePath: ['save'] } }), onAction: (action) => ({ kind: 'menu', action }) }),
    expectText: /Save/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'dropdownMenu',
    element: () => dropdownMenu({
      id: 'dropdownMenu',
      label: unsafe,
      items: menuItems,
      presentation: dropdownMenuPresentation(menuItems, { kind: 'open', active: 'save', menu: { activePath: ['save'] } }),
      onAction: (action) => ({ kind: 'dropdownMenu', action })
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
    element: () => tooltip({ id: 'tooltip', title: 'Hint', content: unsafe, tone: 'warning', presentation: { kind: 'visible', anchor: { kind: 'cursor', row: 1, column: 1 } } }),
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
    name: 'surface',
    element: () => surface(text(unsafe, { id: 'surface-child' }), {
      id: 'surface',
      label: unsafe,
      title: unsafe,
      border: { kind: 'single' }
    }),
    expectText: /Unsafe red text/u
  },
  {
    name: 'absolute',
    element: () => absolute(text(unsafe, { id: 'absolute-child' }), {
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
      text(unsafe, { id: 'overlay-base' }),
      absolute(text('Top', { id: 'overlay-top' }), { id: 'overlay-abs', row: 1, column: 8, width: 3, height: 1 })
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
    element: () => helpBar({ id: 'help', groups: [{ id: 'primary', bindings: [{ key: 'Enter', label: unsafe }] }] }),
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
    element: () => notificationHistory({
      id: 'notification-history',
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
      selectedId: 'second',
      items: [{ id: 'unsafe', label: unsafe, value: 2 }, { id: 'second', label: 'Second', value: 4 }]
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
      selected: { id: 'b' },
      keys: { enter: () => ({ kind: 'heatmap-enter' }) },
      onAction: (action) => ({ kind: 'heatmap', action })
    }),
    expectText: /[░▒▓█◆]/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'viewport',
    element: () => viewport(text(`${unsafe}\nSecond`, { id: 'viewport-child' }), {
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
      searchQuery: 'Second'
    }),
    expectText: /Second/u
  },
  {
    name: 'commandInput',
    element: () => commandInput({
      id: 'command-input',
      presentation: { value: unsafe, cursor: 0, suggestions: [{ value: 'open', label: unsafe, description: 'Open action' }], selectedSuggestionIndex: 0 },
      prompt: '>',
      onAction: (action) => action,
      onSubmit: (value) => value
    }),
    expectText: /Unsafe red text/u,
    expectFocus: true
  },
  {
    name: 'searchPicker',
    element: () => searchPicker({
      id: 'searchPicker',
      title: unsafe,
      searchPickerIndex: prepareSearchPickerIndex([
        { id: 'alpha', label: unsafe, value: 'alpha', preview: 'Preview' },
        { id: 'beta', label: 'Beta', value: 'beta', disabled: true }
      ]),
      selectedId: 'alpha',
      onAction: (action) => action
    }),
    expectText: /Preview/u,
    expectFocus: true
  },
  {
    name: 'grid',
    element: () => grid([
      text(unsafe, { id: 'grid-one' }),
      text('Second', { id: 'grid-two' })
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
      text(unsafe, { id: 'anchored-child' }),
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
      text(unsafe, { id: 'split-one' }),
      text('Second', { id: 'split-two' })
    ], {
      id: 'split',
      direction: 'horizontal',
      sizes: [{ kind: 'fr', value: 1 }, { kind: 'fr', value: 1 }]
    }),
    expectText: /Second/u
  },
  {
    name: 'tabs',
    element: () => tabs({
      id: 'tabs',
      selected: 'first',
      tabs: [
        { id: 'first', label: unsafe, panel: text('Panel one', { id: 'panel-one' }) },
        { id: 'second', label: 'Second', panel: text('Panel two', { id: 'panel-two' }), disabled: true }
      ],
      onAction: (action) => action
    }),
    expectText: /Panel one/u
  },
  {
    name: 'dialog',
    element: () => dialog(button({ id: 'dialog-button', label: 'Confirm', onPress: () => ({ kind: 'confirm' }) }), {
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

test('semantic element snapshots cover every built-in public element factory', () => {
  const names = cases.map((item) => item.name).sort();
  assert.deepEqual(names, Object.keys(builtinRenderNodeRenderers).sort());
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

    assert.equal(frame.schemaVersion, 'terminal-ui.tui-frame.v2');
    assert.equal(frame.width, terminalSizeNormal.columns);
    assert.equal(frame.height, terminalSizeNormal.rows);
    assert.equal(validateAccessibleSnapshot(frame.accessibility).ok, true);
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
    assert.equal(validateAccessibleSnapshot(resized.accessibility).ok, true);
    assertCellsAreInsideFrame(resized);

    const tiny = renderElementFrame(current.element(), terminalSizeTiny);
    assert.equal(tiny.width, terminalSizeTiny.columns);
    assert.equal(tiny.height, terminalSizeTiny.rows);
    assert.equal(validateAccessibleSnapshot(tiny.accessibility).ok, true);
    assertCellsAreInsideFrame(tiny);
    assert.doesNotMatch(renderFramePlain(tiny), /\u001B/u);

    const themedFrame = renderElementFrame(current.element(), terminalSizeNormal, { theme: themed });
    assert.equal(validateAccessibleSnapshot(themedFrame.accessibility).ok, true);
    assertCellsAreInsideFrame(themedFrame);

    const highContrastFrame = renderElementFrame(current.element(), terminalSizeNormal, { theme: highContrastTheme });
    assert.equal(validateAccessibleSnapshot(highContrastFrame.accessibility).ok, true);
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
  assert.equal(frameJson.schemaVersion, 'terminal-ui.tui-frame.v2', `${label}: frame schema`);
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
      rawInput: true
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
