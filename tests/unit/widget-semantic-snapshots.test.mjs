import assert from 'node:assert/strict';
import test from 'node:test';

import { validateAccessibleSnapshot } from '../../dist/accessibility/index.js';
import { createCapabilities } from '../../dist/host/index.js';
import { createVisualSnapshot } from '../../dist/testing/index.js';
import { defineTheme, highContrastTheme } from '../../dist/theme/index.js';
import { renderFramePlain, renderWidgetFrame } from '../../dist/tui/index.js';
import {
  absolute,
  activityFeed,
  activityIndicator,
  accordion,
  areaGrid,
  barChart,
  box,
  breadcrumb,
  button,
  canvas,
  carousel,
  chart,
  checkbox,
  checkboxList,
  collapsibleSection,
  commandBar,
  commandPalette,
  contextMenu,
  colorPicker,
  datePicker,
  divider,
  dropdown,
  field,
  form,
  gauge,
  grid,
  helpBar,
  heatmap,
  inputField,
  label,
  list,
  menu,
  menuBar,
  modal,
  notificationStack,
  numberInput,
  overlay,
  paginator,
  palette,
  progressBar,
  radioGroup,
  rangeSlider,
  richText,
  row,
  scrollback,
  selectBox,
  shortcutBar,
  sparkline,
  spinner,
  splitPane,
  stack,
  statusBar,
  structuredBlock,
  surface,
  slider,
  table,
  tabs,
  tabOverflowMenu,
  text,
  textArea,
  textInput,
  tooltip,
  tree,
  toggleSwitch,
  viewport
} from '../../dist/widgets/index.js';

const unsafe = 'Unsafe \u001B[31mred\u001B[0m text';
const viewportNormal = { columns: 48, rows: 10 };
const viewportWide = { columns: 64, rows: 14 };
const viewportTiny = { columns: 1, rows: 1 };
const themed = defineTheme({
  name: 'snapshot-theme',
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
});

const menuItems = [
  { id: 'open', label: unsafe, message: { kind: 'open' }, shortcut: 'O' },
  { id: 'save', label: 'Save', message: { kind: 'save' }, checked: true },
  { id: 'disabled', label: 'Disabled', message: { kind: 'disabled' }, disabled: true }
];

const optionItems = [
  { id: 'alpha', label: unsafe, value: 'alpha' },
  { id: 'beta', label: 'Beta', value: 'beta', disabled: true }
];

const treeNodes = [
  {
    id: 'root',
    label: unsafe,
    expanded: true,
    children: [
      { id: 'child', label: 'Child' },
      { id: 'disabled', label: 'Disabled', disabled: true }
    ]
  }
];

const blocks = [
  {
    id: 'queued',
    title: unsafe,
    status: 'pending',
    summary: 'Waiting',
    fields: [{ label: 'owner', value: 'scheduler' }],
    body: 'Body'
  },
  {
    id: 'running',
    title: 'Running',
    status: 'running',
    summary: 'Working',
    fields: [{ label: 'worker', value: 'one' }],
    body: 'Details'
  }
];

const cases = [
  {
    name: 'text',
    widget: () => text(unsafe, { id: 'text' }),
    expectText: /Unsafe red text/u
  },
  {
    name: 'richText',
    widget: () => richText({
      id: 'rich',
      segments: [
        renderSpan(unsafe, { style: { fg: { kind: 'theme', token: 'accent.primary' }, bold: true } })
      ]
    }),
    expectText: /Unsafe red text/u,
    expectStyledCells: true
  },
  {
    name: 'box',
    widget: () => box(text(unsafe, { id: 'box-child' }), {
      id: 'box',
      border: { kind: 'single', title: unsafe }
    }),
    expectText: /Unsafe red text/u
  },
  {
    name: 'stack',
    widget: () => stack([
      text(unsafe, { id: 'stack-one' }),
      text('Second', { id: 'stack-two' })
    ], { id: 'stack' }),
    expectText: /Second/u
  },
  {
    name: 'row',
    widget: () => row([
      text(unsafe, { id: 'row-one' }),
      text('Second', { id: 'row-two' })
    ], { id: 'row' }),
    expectText: /Unsafe red text/u
  },
  {
    name: 'list',
    widget: () => list({
      id: 'list',
      items: [unsafe, 'Second', 'Third'],
      selected: 1
    }),
    expectText: /Second/u,
    expectFocus: true
  },
  {
    name: 'table',
    widget: () => table({
      id: 'table',
      rows: [{ name: unsafe, status: 'ok' }, { name: 'Second', status: 'idle' }],
      selected: 1,
      columns: [{ header: 'Name' }, { header: 'Status' }]
    }),
    expectText: /Name/u
  },
  {
    name: 'tree',
    widget: () => tree({
      id: 'tree',
      nodes: treeNodes,
      selected: 'child',
      toMessage: (node) => ({ kind: 'tree', id: node.id })
    }),
    expectText: /Child/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'paginator',
    widget: () => paginator({ id: 'pages', label: unsafe, page: 2, pageCount: 3 }),
    expectText: /Page 2 of 3/u
  },
  {
    name: 'inputField',
    widget: () => inputField({ id: 'input-field', value: unsafe }),
    expectText: /Unsafe red text/u,
    expectFocus: true
  },
  {
    name: 'textArea',
    widget: () => textArea({ id: 'text-area', value: `${unsafe}\nSecond`, cursor: 3 }),
    expectText: /Second/u,
    expectFocus: true
  },
  {
    name: 'form',
    widget: () => form([
      field(textInput({ id: 'form-input', value: unsafe }), { id: 'form-field', label: 'Name' }),
      button({ id: 'form-submit', label: 'Submit', message: { kind: 'submit' } })
    ], { id: 'form', title: unsafe }),
    expectText: /Submit/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'field',
    widget: () => field(textInput({ id: 'field-input', value: unsafe }), {
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
    widget: () => label({ id: 'label', text: unsafe, required: true }),
    expectText: /Unsafe red text/u
  },
  {
    name: 'button',
    widget: () => button({ id: 'button', label: unsafe, message: { kind: 'button' } }),
    expectText: /Unsafe red text/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'checkbox',
    widget: () => checkbox({ id: 'checkbox', label: unsafe, checked: true, message: { kind: 'check' } }),
    expectText: /Unsafe red text/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'toggleSwitch',
    widget: () => toggleSwitch({ id: 'toggle', label: unsafe, checked: true, message: { kind: 'toggle' } }),
    expectText: /Unsafe red text/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'slider',
    widget: () => slider({
      id: 'slider',
      label: unsafe,
      value: 5,
      max: 10,
      toMessage: (value) => ({ kind: 'slider', value })
    }),
    expectText: /Unsafe red text/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'rangeSlider',
    widget: () => rangeSlider({
      id: 'range-slider',
      label: unsafe,
      start: 2,
      end: 8,
      max: 10,
      toMessage: (value) => ({ kind: 'range', value })
    }),
    expectText: /Unsafe red text/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'checkboxList',
    widget: () => checkboxList({
      id: 'checkbox-list',
      label: unsafe,
      options: optionItems,
      selected: ['alpha'],
      toMessage: (option, checked) => ({ kind: 'checkboxList', value: option.value, checked })
    }),
    expectText: /Beta/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'radioGroup',
    widget: () => radioGroup({
      id: 'radio',
      label: 'Mode',
      options: optionItems,
      selected: 'alpha',
      toMessage: (option) => ({ kind: 'radio', value: option.value })
    }),
    expectText: /Mode/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'selectBox',
    widget: () => selectBox({
      id: 'select',
      label: 'Choice',
      options: optionItems,
      selected: 'alpha',
      toMessage: (option) => ({ kind: 'select', value: option.value })
    }),
    expectText: /Choice/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'colorPicker',
    widget: () => colorPicker({
      id: 'color-picker',
      label: unsafe,
      options: [
        { id: 'alpha', label: unsafe, value: 'alpha', swatch: '■' },
        { id: 'beta', label: 'Beta', value: 'beta', swatch: '◆' }
      ],
      selected: 'alpha',
      toMessage: (option) => ({ kind: 'color', value: option.value })
    }),
    expectText: /Beta/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'datePicker',
    widget: () => datePicker({
      id: 'date-picker',
      label: unsafe,
      selected: '2026-06-03',
      days: [
        { id: '2026-06-01', label: '1', value: '2026-06-01' },
        { id: '2026-06-02', label: '2', value: '2026-06-02', today: true },
        { id: '2026-06-03', label: '3', value: '2026-06-03' }
      ],
      toMessage: (day) => ({ kind: 'date', value: day.value })
    }),
    expectText: /Unsafe red text/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'textInput',
    widget: () => textInput({ id: 'text-input', value: unsafe, cursor: 2 }),
    expectText: /Unsafe red text/u,
    expectFocus: true
  },
  {
    name: 'numberInput',
    widget: () => numberInput({ id: 'number-input', value: 42, min: 1, max: 99 }),
    expectText: /42/u,
    expectFocus: true
  },
  {
    name: 'menu',
    widget: () => menu({ id: 'menu', items: menuItems, selected: 'open' }),
    expectText: /Unsafe red text/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'menuBar',
    widget: () => menuBar({ id: 'menu-bar', items: menuItems, selected: 'open' }),
    expectText: /Save/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'contextMenu',
    widget: () => contextMenu({ id: 'context-menu', title: unsafe, items: menuItems, selected: 'save' }),
    expectText: /Save/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'dropdown',
    widget: () => dropdown({ id: 'dropdown', label: unsafe, items: menuItems, selected: 'save', open: true }),
    expectText: /Save/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'divider',
    widget: () => divider({ id: 'divider', label: unsafe, line: 'dashed' }),
    expectText: /Unsafe red text/u,
    expectStyledCells: true
  },
  {
    name: 'tooltip',
    widget: () => tooltip({ id: 'tooltip', title: 'Hint', content: unsafe, tone: 'warning' }),
    expectText: /Unsafe red text/u,
    expectStyledCells: true
  },
  {
    name: 'canvas',
    widget: () => canvas({
      id: 'canvas',
      label: unsafe,
      keyMap: { enter: { kind: 'enter' } },
      painter({ buffer, bounds }) {
        buffer.write(bounds.row, bounds.column, [renderSpan(unsafe, { style: { fg: { kind: 'theme', token: 'accent.primary' } } })]);
      }
    }),
    expectText: /Unsafe red text/u,
    expectFocus: true,
    expectStyledCells: true
  },
  {
    name: 'surface',
    widget: () => surface(text(unsafe, { id: 'surface-child' }), { id: 'surface', label: unsafe }),
    expectText: /Unsafe red text/u
  },
  {
    name: 'absolute',
    widget: () => absolute(text(unsafe, { id: 'absolute-child' }), {
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
    widget: () => overlay([
      text(unsafe, { id: 'overlay-base' }),
      absolute(text('Top', { id: 'overlay-top' }), { id: 'overlay-abs', row: 1, column: 8, width: 3, height: 1 })
    ], { id: 'overlay' }),
    expectText: /Unsafe/u
  },
  {
    name: 'statusBar',
    widget: () => statusBar({ id: 'status', text: unsafe, message: { kind: 'status' } }),
    expectText: /Unsafe red text/u,
    expectFocus: true
  },
  {
    name: 'helpBar',
    widget: () => helpBar({ id: 'help', bindings: [{ key: 'Enter', label: unsafe }] }),
    expectText: /Unsafe red text/u
  },
  {
    name: 'activityIndicator',
    widget: () => activityIndicator({ id: 'activity-indicator', label: unsafe, status: 'running' }),
    expectText: /Unsafe red text/u
  },
  {
    name: 'progressBar',
    widget: () => progressBar({ id: 'progress', label: unsafe, value: 3, max: 5 }),
    expectText: /Unsafe red text/u
  },
  {
    name: 'notificationStack',
    widget: () => notificationStack({
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
    name: 'sparkline',
    widget: () => sparkline({ id: 'sparkline', values: [0, 1, 2, 3] }),
    expectText: /[▁#]/u
  },
  {
    name: 'barChart',
    widget: () => barChart({
      id: 'bar-chart',
      selected: 1,
      keyMap: { enter: { kind: 'bar' } },
      items: [{ label: unsafe, value: 2 }, { label: 'Second', value: 4 }]
    }),
    expectText: /Second/u,
    expectFocus: true
  },
  {
    name: 'chart',
    widget: () => chart({ id: 'chart', series: [{ id: 'series', label: unsafe, points: [0, 2, 1, 3] }] }),
    expectText: /\*/u
  },
  {
    name: 'gauge',
    widget: () => gauge({ id: 'gauge', label: unsafe, value: 7, max: 10 }),
    expectText: /Unsafe red text/u
  },
  {
    name: 'heatmap',
    widget: () => heatmap({
      id: 'heatmap',
      rows: [
        [{ id: 'a', label: unsafe, value: 1 }, { id: 'b', label: 'Beta', value: 3 }],
        [{ id: 'c', label: 'Gamma', value: 5 }]
      ],
      selected: { row: 0, column: 1 },
      keyMap: { enter: { kind: 'heatmap-enter' } },
      toMessage: (cell, row, column) => ({ kind: 'heatmap', id: cell.id, row, column })
    }),
    expectText: /[░▒▓█◆]/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'spinner',
    widget: () => spinner({ id: 'spinner', label: unsafe }),
    expectText: /Unsafe red text/u
  },
  {
    name: 'viewport',
    widget: () => viewport(text(`${unsafe}\nSecond`, { id: 'viewport-child' }), {
      id: 'viewport',
      scrollRow: 1,
      contentRows: 2
    }),
    expectText: /Second/u
  },
  {
    name: 'scrollback',
    widget: () => scrollback({
      id: 'scrollback',
      items: [
        { id: 'one', text: unsafe },
        { id: 'two', text: 'Second' }
      ],
      searchQuery: 'Second'
    }),
    expectText: /Second/u
  },
  {
    name: 'structuredBlock',
    widget: () => structuredBlock(blocks[0]),
    expectText: /scheduler/u
  },
  {
    name: 'activityFeed',
    widget: () => activityFeed({ id: 'activity-feed', blocks, selected: 1 }),
    expectText: /Running/u
  },
  {
    name: 'commandBar',
    widget: () => commandBar({
      id: 'command-bar',
      value: unsafe,
      prompt: '>',
      suggestions: [{ value: 'open', label: unsafe, description: 'Open action' }],
      selectedSuggestion: 0
    }),
    expectText: /Unsafe red text/u,
    expectFocus: true
  },
  {
    name: 'palette',
    widget: () => palette({
      id: 'palette',
      title: unsafe,
      entries: [
        { id: 'alpha', label: unsafe, value: 'alpha', preview: 'Preview' },
        { id: 'beta', label: 'Beta', value: 'beta', disabled: true }
      ],
      selectedId: 'alpha'
    }),
    expectText: /Preview/u,
    expectFocus: true
  },
  {
    name: 'commandPalette',
    widget: () => commandPalette({
      id: 'command-palette',
      title: unsafe,
      entries: [
        { id: 'open', label: unsafe, preview: 'Preview' },
        { id: 'close', label: 'Close', disabled: true }
      ],
      selectedId: 'open'
    }),
    expectText: /Preview/u,
    expectFocus: true
  },
  {
    name: 'breadcrumb',
    widget: () => breadcrumb({
      id: 'breadcrumb',
      items: [
        { id: 'home', label: unsafe, message: { kind: 'home' } },
        { id: 'routes', label: 'Routes', message: { kind: 'routes' } }
      ]
    }),
    expectText: /Routes/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'collapsibleSection',
    widget: () => collapsibleSection({
      id: 'collapsible',
      title: unsafe,
      expanded: true,
      message: { kind: 'toggle' },
      body: text('Section body')
    }),
    expectText: /Section body/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'accordion',
    widget: () => accordion({
      id: 'accordion',
      items: [
        { id: 'one', title: unsafe, expanded: true, body: text('First body'), message: { kind: 'one' } },
        { id: 'two', title: 'Second', body: text('Hidden body'), message: { kind: 'two' } }
      ]
    }),
    expectText: /First body/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'carousel',
    widget: () => carousel({
      id: 'carousel',
      selected: 'one',
      previousMessage: { kind: 'previous' },
      nextMessage: { kind: 'next' },
      items: [
        { id: 'one', label: unsafe, body: text('Carousel body'), message: { kind: 'one' } },
        { id: 'two', label: 'Second', body: text('Second body'), message: { kind: 'two' } }
      ]
    }),
    expectText: /Carousel body/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'tabOverflowMenu',
    widget: () => tabOverflowMenu({
      id: 'tab-overflow',
      selected: 'one',
      maxVisible: 1,
      tabs: [
        { id: 'one', label: unsafe, message: { kind: 'one' } },
        { id: 'two', label: 'Second', message: { kind: 'two' } }
      ]
    }),
    expectText: /Second/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'shortcutBar',
    widget: () => shortcutBar({
      id: 'shortcut-bar',
      shortcuts: [
        { id: 'palette', key: '/', label: unsafe, message: { kind: 'palette' } },
        { id: 'save', key: 'Ctrl+S', label: 'Save', message: { kind: 'save' } }
      ]
    }),
    expectText: /Save/u,
    expectFocus: true,
    expectHitTargets: true
  },
  {
    name: 'areaGrid',
    widget: () => areaGrid({
      id: 'area-grid',
      areas: `
        top top
        left main
      `,
      rows: [{ kind: 'fixed', cells: 1 }, { kind: 'fill' }],
      columns: [{ kind: 'fixed', cells: 10 }, { kind: 'fill' }],
      children: {
        top: text(unsafe, { id: 'area-top' }),
        left: text('Left', { id: 'area-left' }),
        main: text('Main', { id: 'area-main' })
      }
    }),
    expectText: /Main/u
  },
  {
    name: 'grid',
    widget: () => grid([
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
    name: 'splitPane',
    widget: () => splitPane([
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
    widget: () => tabs({
      id: 'tabs',
      selected: 'first',
      tabs: [
        { id: 'first', label: unsafe, panel: text('Panel one', { id: 'panel-one' }) },
        { id: 'second', label: 'Second', panel: text('Panel two', { id: 'panel-two' }), disabled: true }
      ]
    }),
    expectText: /Panel one/u
  },
  {
    name: 'modal',
    widget: () => modal(button({ id: 'modal-button', label: 'Confirm', message: { kind: 'confirm' } }), {
      id: 'modal',
      title: unsafe,
      width: 24,
      height: 5
    }),
    expectText: /Confirm/u,
    expectFocus: true,
    expectHitTargets: true
  }
];

test('semantic widget snapshots cover every built-in public widget factory', () => {
  const names = cases.map((item) => item.name).sort();
  assert.deepEqual(names, [
    'absolute',
    'accordion',
    'activityFeed',
    'activityIndicator',
    'areaGrid',
    'barChart',
    'box',
    'breadcrumb',
    'button',
    'canvas',
    'carousel',
    'chart',
    'checkbox',
    'checkboxList',
    'collapsibleSection',
    'colorPicker',
    'commandBar',
    'commandPalette',
    'contextMenu',
    'datePicker',
    'divider',
    'dropdown',
    'field',
    'form',
    'gauge',
    'grid',
    'heatmap',
    'helpBar',
    'inputField',
    'label',
    'list',
    'menu',
    'menuBar',
    'modal',
    'notificationStack',
    'numberInput',
    'overlay',
    'paginator',
    'palette',
    'progressBar',
    'radioGroup',
    'rangeSlider',
    'richText',
    'row',
    'scrollback',
    'selectBox',
    'shortcutBar',
    'slider',
    'sparkline',
    'spinner',
    'splitPane',
    'stack',
    'statusBar',
    'structuredBlock',
    'surface',
    'tabOverflowMenu',
    'table',
    'tabs',
    'text',
    'textArea',
    'textInput',
    'toggleSwitch',
    'tooltip',
    'tree',
    'viewport'
  ]);
});

for (const current of cases) {
  test(`${current.name} semantic snapshots expose frame ANSI accessibility sizing sanitization and theme behavior`, () => {
    const frame = renderWidgetFrame(current.widget(), viewportNormal);
    const plain = renderFramePlain(frame);
    const snapshot = createVisualSnapshot({ frame });
    const accessibilityJson = JSON.stringify(frame.accessibility);

    assert.equal(frame.schemaVersion, 'terminal-ui.tui-frame.v1');
    assert.equal(frame.width, viewportNormal.columns);
    assert.equal(frame.height, viewportNormal.rows);
    assert.equal(validateAccessibleSnapshot(frame.accessibility).ok, true);
    assert.match(plain, current.expectText);
    assert.doesNotMatch(plain, /\u001B/u);
    assert.doesNotMatch(accessibilityJson, /\u001B/u);
    assertCellsAreInsideFrame(frame);
    assertWidgetVisualSnapshot(snapshot, current, viewportNormal, `${current.name} default`);

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

    const resized = renderWidgetFrame(current.widget(), viewportWide);
    assert.equal(resized.width, viewportWide.columns);
    assert.equal(validateAccessibleSnapshot(resized.accessibility).ok, true);
    assertCellsAreInsideFrame(resized);

    const tiny = renderWidgetFrame(current.widget(), viewportTiny);
    assert.equal(tiny.width, viewportTiny.columns);
    assert.equal(tiny.height, viewportTiny.rows);
    assert.equal(validateAccessibleSnapshot(tiny.accessibility).ok, true);
    assertCellsAreInsideFrame(tiny);
    assert.doesNotMatch(renderFramePlain(tiny), /\u001B/u);

    const themedFrame = renderWidgetFrame(current.widget(), viewportNormal, { theme: themed });
    assert.equal(validateAccessibleSnapshot(themedFrame.accessibility).ok, true);
    assertCellsAreInsideFrame(themedFrame);

    const highContrastFrame = renderWidgetFrame(current.widget(), viewportNormal, { theme: highContrastTheme });
    assert.equal(validateAccessibleSnapshot(highContrastFrame.accessibility).ok, true);
    assertCellsAreInsideFrame(highContrastFrame);
    assertWidgetVisualSnapshot(
      createVisualSnapshot({ frame: highContrastFrame, ansi: { capabilities: colorCapabilities(), theme: highContrastTheme } }),
      current,
      viewportNormal,
      `${current.name} high contrast`
    );

    const noColorSnapshot = createVisualSnapshot({ frame, ansi: { capabilities: noColorCapabilities() } });
    assertWidgetVisualSnapshot(noColorSnapshot, current, viewportNormal, `${current.name} no color`);
    assert.doesNotMatch(noColorSnapshot.ansiFrame, /\\x1b\[[0-9;]*m/u, `${current.name} no-color snapshot should not emit SGR`);
  });
}

function assertWidgetVisualSnapshot(snapshot, current, viewport, label) {
  const frameJson = JSON.parse(snapshot.frameJson);
  const hitTargets = JSON.parse(snapshot.hitTargetJson);
  const focusTargets = JSON.parse(snapshot.focusTargetJson);

  assert.equal(snapshot.schemaVersion, 'terminal-ui.visual-snapshots.v1', `${label}: snapshot schema`);
  assert.match(snapshot.plainTextFrame, current.expectText, `${label}: plain frame`);
  assert.match(snapshot.ansiFrame, /\\x1b\[/u, `${label}: ANSI frame`);
  assert.doesNotMatch(snapshot.ansiFrame, /\u001B/u, `${label}: raw ANSI leaked into normalized ANSI artifact`);
  assert.doesNotMatch(snapshot.frameJson, /\u001B/u, `${label}: raw ANSI leaked into frame JSON`);
  assert.doesNotMatch(snapshot.accessibilityJson, /\u001B/u, `${label}: raw ANSI leaked into accessibility JSON`);
  assert.equal(frameJson.schemaVersion, 'terminal-ui.tui-frame.v1', `${label}: frame schema`);
  assert.equal(frameJson.width, viewport.columns, `${label}: frame width`);
  assert.equal(frameJson.height, viewport.rows, `${label}: frame height`);
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
  return createCapabilities({
    runtime: 'memory',
    inputIsTty: true,
    outputIsTty: true,
    rawInput: true
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

function renderSpan(text, options = {}) {
  return {
    text,
    ...options
  };
}
