import assert from 'node:assert/strict';
import test from 'node:test';

import {
  validateAccessibleSnapshot } from '../../dist/accessibility/index.js';
import { createVisualSnapshot } from '../../dist/testing/index.js';
import {
  catppuccinTheme,
  contrastColor,
  defaultTheme,
  deriveSurface,
  draculaTheme,
  ensureContrast,
  gruvboxTheme,
  highContrastTheme,
  monochromeTheme,
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
  commandBar,
  helpBar,
  progressBar,
  richText,
  scrollback,
  table,
  text
} from '../../dist/components/index.js';
import {
  stack,
  surface,
  tabs
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
    assert.equal(typeof theme.tokens.colors['surface.chrome.background'], 'object');
    assert.equal(typeof theme.tokens.colors['surface.raised.background'], 'object');
    assert.equal(typeof theme.tokens.colors['surface.warning.border'], 'object');
    assert.equal(typeof theme.tokens.colors['surface.shadow'], 'object');
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

test('theme matrix snapshots cover core widgets with packs high contrast and no color', () => {
  const themes = [...packedThemes, highContrastTheme, noColorTheme];
  for (const theme of themes) {
    const frame = renderElementFrame(stack([
      surface(text(`Theme ${theme.name}`, { id: `title-${theme.name}` }), {
        id: `surface-${theme.name}`,
        border: { kind: 'rounded', title: theme.name },
        padding: 1
      }),
      progressBar({ id: `progress-${theme.name}`, value: 64, label: 'readable' }),
      barChart({
        id: `chart-${theme.name}`,
        items: [
          { label: 'a', value: 20 },
          { label: 'b', value: 45 },
          { label: 'c', value: 80 }
        ]
      }),
      table({
        id: `table-${theme.name}`,
        columns: [{
          value: (row) => Array.isArray(row) ? row[0] : row, id: 'key', header: 'Key' }, {
          value: (row) => Array.isArray(row) ? row[1] : undefined, id: 'value', header: 'Value' }],
        rows: [{ key: 'focus', value: 'visible' }],
        selected: 0
      })
    ], { id: `matrix-${theme.name}`, gap: 1 }), { columns: 48, rows: 14 }, { theme });

    assert.equal(validateAccessibleSnapshot(frame.accessibility).ok, true, theme.name);
    assert.equal(frame.cells.every((cell) => cell.row >= 1 && cell.row <= frame.height && cell.column >= 1 && cell.column <= frame.width), true);
    assert.equal(createVisualSnapshot({ frame }).schemaVersion, 'terminal-ui.visual-snapshots.v1');
  }
});

test('default theme specimen composes surface control text command log and data tokens', () => {
  const frame = renderElementFrame(surface(stack([
    richText({
      id: 'specimen-title',
      segments: [
        { text: 'terminal-ui ', style: { fg: { kind: 'theme', token: 'accent.primary' }, bold: true } },
        { text: 'docs', link: { href: 'https://example.test/docs' } }
      ]
    }),
    tabs({
      id: 'specimen-tabs',
      selected: 'one',
      tabs: [
        { id: 'one', label: 'tab one', badge: '3', panel: text('First panel') },
        { id: 'two', label: 'tab two', panel: text('Second panel') }
      ]
    }),
    button({ id: 'specimen-button', label: 'Primary', tone: 'primary', state: 'pressed' }),
    commandBar({
      id: 'specimen-command',
      value: '/open readme',
      suggestions: [{ value: '/open', label: 'Open File' }],
      selectedSuggestion: 0,
      display: 'expanded'
    }),
    scrollback({
      id: 'specimen-log',
      items: [
        { id: 'info', level: 'info', text: 'Ready' },
        { id: 'warn', level: 'warning', text: 'High memory' },
        { id: 'err', level: 'error', text: 'Failed request' }
      ],
      scroll: { offsetRow: 0, offsetColumn: 0, contentRows: 3, viewportRows: 4 }
    }),
    progressBar({ id: 'specimen-progress', value: 72, label: 'coverage' }),
    chart({
      id: 'specimen-chart',
      legend: true,
      xLabel: 'time',
      yLabel: 'load',
      series: [
        { id: 'cpu', label: 'CPU', points: [1, 3, 2, 4], glyph: '+' },
        { id: 'io', label: 'IO', points: [3, 1, 4, 2], glyph: 'o' }
      ]
    }),
    table({
      id: 'specimen-table',
      selected: 0,
      columns: [{
        value: (row) => Array.isArray(row) ? row[0] : row, id: 'name', header: 'Name' }, {
        value: (row) => Array.isArray(row) ? row[1] : undefined, id: 'status', header: 'Status' }],
      rows: [{ name: 'Atlas', status: 'Active' }]
    }),
    helpBar({
      id: 'specimen-help',
      bindings: [{ key: '?', label: 'Help' }]
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
    variant: 'raised',
    border: { kind: 'rounded', title: 'Theme specimen' },
    padding: 1
  }), { columns: 72, rows: 32 }, { theme: defaultTheme });

  const tokenAt = (text, predicate = () => true) =>
    frame.cells.find((cell) => cell.text === text && predicate(cell))?.style;

  assert.equal(tokenAt('d')?.fg?.token, 'link.foreground');
  assert.equal(frame.cells.some((cell) => cell.style?.fg?.token === 'tab.active.foreground'), true);
  assert.equal(frame.cells.some((cell) => cell.style?.fg?.token === 'tab.inactive.foreground'), true);
  assert.equal(frame.cells.some((cell) => cell.style?.bg?.token === 'badge.background'), true);
  assert.equal(frame.cells.find((cell) => cell.text === 'P')?.style?.bg?.token, 'control.primary.background');
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
  assert.equal(createVisualSnapshot({ frame }).schemaVersion, 'terminal-ui.visual-snapshots.v1');
});
