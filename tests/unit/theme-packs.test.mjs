import assert from 'node:assert/strict';
import test from 'node:test';
import { createScrollState, prepareCommandSuggestions, prepareLogHistory } from '../../dist/behavior/index.js';
import { ignoreMessage } from '../../dist/component/index.js';

import {
  decodeAccessibleSnapshot } from '../../dist/accessibility/index.js';
import { createVisualSnapshot } from '../../dist/testing/index.js';
import {
  catppuccinTheme,
  contrastColor,
  deriveSurface,
  draculaTheme,
  ensureContrast,
  gruvboxTheme,
  highContrastTheme,
  monochromeTheme,
  modernTheme,
  noColorTheme,
  nordTheme,
  resolveTerminalStyle,
  solarizedTheme,
  themePacks,
  tokyoNightTheme
} from '../../dist/theme/index.js';
import { renderElementFrame
} from '../../dist/renderer/index.js';
import {
  barChart,
  button,
  chart,
  commandInput,
  helpBar,
  progressBar,
  richText,
  logViewer,
  dataGrid,
  tabs,
  text
} from '../../dist/components/index.js';
import {
  column,
  surface
} from '../../dist/layout/index.js';

const packedThemes = [
  catppuccinTheme,
  nordTheme,
  tokyoNightTheme,
  solarizedTheme,
  gruvboxTheme,
  draculaTheme,
  monochromeTheme
];

test('theme packs are exported as optional named TerminalTheme values', () => {
  assert.deepEqual(Object.keys(themePacks), [
    'catppuccin',
    'nord',
    'tokyoNight',
    'solarized',
    'gruvbox',
    'dracula',
    'monochrome'
  ]);

  for (const theme of packedThemes) {
    assert.match(theme.fingerprint, /^theme:[0-9a-f]{8}$/u);
    assert.equal(resolveTerminalStyle({ fg: { kind: 'theme', token: 'accent.primary' } }, theme)?.fg?.kind, 'rgb');
    assert.equal(typeof theme.tokens.colors['surface.background'], 'object');
    assert.equal(typeof theme.tokens.colors['surface.bar.background'], 'object');
    assert.equal(typeof theme.tokens.colors['surface.raised.background'], 'object');
    assert.equal(typeof theme.tokens.colors['surface.warning.border'], 'object');
    assert.equal(typeof theme.tokens.colors['surface.shadow'], 'object');
    assert.equal(typeof theme.tokens.colors['surface.backdrop'], 'object');
    assert.equal(typeof theme.tokens.colors['control.background'], 'object');
    assert.equal(typeof theme.tokens.colors['tab.active.foreground'], 'object');
    assert.equal(typeof theme.tokens.colors['scrollbar.thumb'], 'object');
  }
});

test('contrast helpers preserve readable foreground choices', () => {
  assert.deepEqual(contrastColor({ kind: 'rgb', r: 250, g: 250, b: 250 }), { kind: 'rgb', r: 0, g: 0, b: 0 });
  assert.deepEqual(contrastColor({ kind: 'ansi', value: 0 }), { kind: 'ansi', value: 15 });
  assert.deepEqual(
    ensureContrast({ kind: 'rgb', r: 120, g: 120, b: 120 }, { kind: 'rgb', r: 118, g: 118, b: 118 }, 4.5),
    { kind: 'rgb', r: 255, g: 255, b: 255 }
  );
  assert.deepEqual(deriveSurface({ kind: 'rgb', r: 20, g: 20, b: 20 }, 2), { kind: 'rgb', r: 40, g: 40, b: 40 });
});

test('high contrast theme keeps semantic status chart and diff tokens distinct', () => {
  assert.deepEqual(highContrastTheme.tokens.colors['status.error'], { kind: 'ansi', value: 9 });
  assert.deepEqual(highContrastTheme.tokens.colors['status.success'], { kind: 'ansi', value: 10 });
  assert.deepEqual(highContrastTheme.tokens.colors['status.warning'], { kind: 'ansi', value: 11 });
  assert.deepEqual(highContrastTheme.tokens.colors['status.info'], { kind: 'ansi', value: 14 });
  assert.deepEqual(highContrastTheme.tokens.colors['surface.danger.border'], highContrastTheme.tokens.colors['status.error']);
  assert.deepEqual(highContrastTheme.tokens.colors['surface.success.border'], highContrastTheme.tokens.colors['status.success']);
  assert.deepEqual(highContrastTheme.tokens.colors['diff.remove'], highContrastTheme.tokens.colors['status.error']);
  assert.deepEqual(highContrastTheme.tokens.colors['diff.add'], highContrastTheme.tokens.colors['status.success']);
  assert.deepEqual(highContrastTheme.tokens.colors['diff.context'], highContrastTheme.tokens.colors['text.muted']);
  assert.notDeepEqual(highContrastTheme.tokens.colors['chart.series.1'], highContrastTheme.tokens.colors['chart.series.2']);
  assert.notDeepEqual(highContrastTheme.tokens.colors['chart.series.2'], highContrastTheme.tokens.colors['chart.series.3']);
  assert.deepEqual(resolveTerminalStyle({
    fg: { kind: 'theme', token: 'selection.foreground' },
    bg: { kind: 'theme', token: 'selection.background' },
    bold: true
  }, highContrastTheme), {
    fg: { kind: 'ansi', value: 0 },
    bg: { kind: 'ansi', value: 15 },
    bold: true
  });
});

test('theme matrix snapshots cover core components with packs high contrast and no color', () => {
  const themes = [...packedThemes, highContrastTheme, noColorTheme];
  for (const theme of themes) {
    const frame = renderElementFrame(column([
      surface(text({ content: `Theme ${theme.name}`, id: `title-${theme.name}` }), {
        id: `surface-${theme.name}`,
        title: theme.name,
        border: { kind: 'rounded' },
        padding: 1
      }),
      progressBar({ id: `progress-${theme.name}`, mode: { kind: 'determinate', value: 64 }, label: 'readable' }),
      barChart({
        id: `chart-${theme.name}`,
        label: 'Values',
        items: [
          { id: 'a', label: 'a', value: 20 },
          { id: 'b', label: 'b', value: 45 },
          { id: 'c', label: 'c', value: 80 }
        ]
      }),
      dataGrid({
    getRowId: (_row, index) => String(index),
    id: `dataGrid-${theme.name}`,
        columns: [{
          value: (row) => Array.isArray(row) ? row[0] : row, id: 'key', header: 'Key' }, {
          value: (row) => Array.isArray(row) ? row[1] : undefined, id: 'value', header: 'Value' }],
        rows: [{ key: 'focus', value: 'visible' }],
        presentation: {
          interaction: { kind: 'row',
          selectionMode: 'single', activeRowId: '0', selectedRowIds: ['0'] }
        },
        onTransition: (action) => action
      })
    ], { id: `matrix-${theme.name}`, gap: 1 }), { columns: 48, rows: 14 }, { theme });

    assert.equal(decodeAccessibleSnapshot(frame.accessibility).ok, true, theme.name);
    assert.equal(frame.cells.every((cell) => cell.row >= 1 && cell.row <= frame.height && cell.column >= 1 && cell.column <= frame.width), true);
    assert.equal(typeof createVisualSnapshot({ frame }).plainTextFrame, 'string');
  }
});

test('default theme specimen composes surface control text command log and data tokens', () => {
  const frame = renderElementFrame(surface(column([
    richText({
      id: 'specimen-title',
      segments: [
        { kind: 'text', text: 'terminal-ui ', style: { fg: { kind: 'theme', token: 'accent.primary' }, bold: true } },
        { kind: 'text', text: 'docs', link: { href: 'https://example.test/docs' } }
      ]
    }),
    tabs({
      id: 'specimen-tabs',
      presentation: { activeId: 'one', selectedId: 'one' },
      tabs: [
        { id: 'one', label: 'tab one', badge: '3', panel: text({ content: 'First panel' }) },
        { id: 'two', label: 'tab two', panel: text({ content: 'Second panel' }) }
      ],
      onTransition: (action) => action
    }),
    button({
      id: 'specimen-button',
      label: 'Primary',
      tone: 'primary',
      onAction: () => ignoreMessage(),
      pointerState: { pressedTargetId: 'specimen-button:control' }
    }),
    commandInput({
      id: 'specimen-command',
      presentation: {
        value: '/open readme',
        cursor: 0,
        suggestions: prepareCommandSuggestions([{ id: 'open', value: '/open', label: 'Open File' }]),
        activeSuggestionId: 'open'
      },
      display: 'expanded',
      onTransition: (action) => action
    }),
    logViewer({
      id: 'specimen-log',
      history: prepareLogHistory([
        { id: 'info', level: 'info', text: 'Ready' },
        { id: 'warn', level: 'warning', text: 'High memory' },
        { id: 'err', level: 'error', text: 'Failed request' }
      ]),
      scroll: createScrollState({ offsetRow: 0 }),
      onAction: (action) => action
    }),
    progressBar({ id: 'specimen-progress', mode: { kind: 'determinate', value: 72 }, label: 'coverage' }),
    chart({
      id: 'specimen-chart',
      label: 'System load',
      legend: true,
      xLabel: 'time',
      yLabel: 'load',
      series: [
        {
          id: 'cpu',
          label: 'CPU',
          points: [1, 3, 2, 4].map((value, index) => ({
            id: `cpu-${String(index)}`,
            label: `CPU ${String(index + 1)}`,
            value
          })),
          glyph: '+'
        },
        {
          id: 'io',
          label: 'IO',
          points: [3, 1, 4, 2].map((value, index) => ({
            id: `io-${String(index)}`,
            label: `IO ${String(index + 1)}`,
            value
          })),
          glyph: 'o'
        }
      ]
    }),
    dataGrid({
    getRowId: (_row, index) => String(index),
    id: 'specimen-dataGrid',
      presentation: {
        interaction: { kind: 'row',
        selectionMode: 'single', activeRowId: '0', selectedRowIds: ['0'] }
      },
      onTransition: (action) => action,
      columns: [{
        value: (row) => Array.isArray(row) ? row[0] : row, id: 'name', header: 'Name' }, {
        value: (row) => Array.isArray(row) ? row[1] : undefined, id: 'status', header: 'Status' }],
      rows: [{ name: 'Atlas', status: 'Active' }]
    }),
    helpBar({
      id: 'specimen-help',
      groups: [{
        id: 'primary',
        bindings: [{ binding: { kind: 'codePoint', codePoint: 63 }, label: 'Help' }]
      }]
    })
  ], {
    gap: 1,
    sizes: [
      { kind: 'fixed', cells: 1 },
      { kind: 'fixed', cells: 3 },
      { kind: 'fixed', cells: 1 },
      { kind: 'fixed', cells: 2 },
      { kind: 'fixed', cells: 3 },
      { kind: 'fixed', cells: 1 },
      { kind: 'fixed', cells: 4 },
      { kind: 'fixed', cells: 3 },
      { kind: 'fixed', cells: 1 }
    ]
  }), {
    id: 'specimen-surface',
    appearance: 'raised',
    title: 'Theme specimen',
    border: { kind: 'rounded' },
    padding: 1
  }), { columns: 72, rows: 32 }, { theme: modernTheme });

  const tokenAt = (text, predicate = () => true) =>
    frame.cells.find((cell) => cell.text === text && predicate(cell))?.style;

  assert.equal(tokenAt('d')?.fg?.token, 'link.foreground');
  assert.equal(frame.cells.some((cell) => cell.style?.fg?.token === 'tab.active.foreground'), true);
  assert.equal(frame.cells.some((cell) => cell.style?.fg?.token === 'tab.inactive.foreground'), true);
  assert.equal(frame.cells.some((cell) => cell.style?.bg?.token === 'badge.background'), true);
  assert.equal(frame.cells.find((cell) => cell.text === 'P')?.style?.bg?.token, 'selection.background');
  assert.equal(frame.cells.some((cell) => cell.style?.fg?.token === 'command.prompt'), true);
  assert.equal(frame.cells.some((cell) => cell.style?.fg?.token === 'log.info'), true);
  assert.equal(frame.cells.some((cell) => cell.style?.fg?.token === 'log.warning'), true);
  assert.equal(frame.cells.some((cell) => cell.style?.fg?.token === 'log.error'), true);
  assert.equal(frame.cells.some((cell) => cell.style?.fg?.token === 'control.track.filled'), true);
  assert.equal(frame.cells.some((cell) => cell.style?.fg?.token === 'chart.axis'), true);
  assert.equal(frame.cells.some((cell) => cell.style?.fg?.token === 'chart.series.1'), true);
  assert.equal(frame.cells.some((cell) => cell.style?.fg?.token === 'chart.series.2'), true);
  assert.equal(frame.cells.some((cell) => cell.style?.fg?.token === 'table.header'), true);
  assert.equal(frame.cells.some((cell) => cell.style?.bg?.token === 'surface.raised.background'), true);
  assert.equal(typeof createVisualSnapshot({ frame }).plainTextFrame, 'string');
});
