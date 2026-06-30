import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createVisualSnapshot } from '../dist/testing/index.js';
import { diffFrames, renderWidgetFrame } from '../dist/tui/index.js';
import { highContrastTheme, modernTheme, noColorTheme, resolveTerminalStyle, resolveThemeColor } from '../dist/theme/index.js';
import {
  activityFeed,
  activityIndicator,
  barChart,
  box,
  button,
  canvas,
  chart,
  checkbox,
  commandBar,
  contextMenu,
  dropdown,
  field,
  form,
  grid,
  helpBar,
  inputField,
  label,
  menu,
  menuBar,
  modal,
  numberInput,
  overlay,
  palette,
  progressBar,
  radioGroup,
  richText,
  row,
  scrollback,
  selectBox,
  sparkline,
  spinner,
  stack,
  statusBar,
  structuredBlock,
  surface,
  table,
  tabs,
  text,
  textArea,
  textInput,
  tree,
  splitPane
} from '../dist/widgets/index.js';
import { animationSequenceFrames } from '../examples/gallery/animation-sequences.mjs';
import { initialShowcaseState, showcaseView } from '../examples/showcase/app.mjs';

const checkOnly = process.argv.includes('--check');
const root = fileURLToPath(new URL('..', import.meta.url));
const showcaseFixtureDirectory = new URL('../examples/showcase/fixtures/', import.meta.url);
const examplesGalleryFixtureDirectory = new URL('../examples/gallery/fixtures/', import.meta.url);
const docsGalleryDirectory = new URL('../docs/gallery/', import.meta.url);

const ANSI_RGB = {
  0: [0, 0, 0],
  1: [128, 0, 0],
  2: [0, 128, 0],
  3: [128, 128, 0],
  4: [0, 0, 128],
  5: [128, 0, 128],
  6: [0, 128, 128],
  7: [192, 192, 192],
  8: [128, 128, 128],
  9: [255, 0, 0],
  10: [0, 255, 0],
  11: [255, 255, 0],
  12: [0, 0, 255],
  13: [255, 0, 255],
  14: [0, 255, 255],
  15: [255, 255, 255]
};

const variants = [
  {
    id: 'modern-wide',
    label: 'Modern wide',
    viewport: { columns: 160, rows: 42 },
    theme: modernTheme,
    state: {
      ...initialShowcaseState(),
      selectedRoute: 'dashboard',
      selectedInspector: 'selection',
      commandValue: '/overview',
      commandCursor: 9
    }
  },
  {
    id: 'high-contrast-medium',
    label: 'High contrast medium',
    viewport: { columns: 122, rows: 34 },
    theme: highContrastTheme,
    state: {
      ...initialShowcaseState(),
      selectedRoute: 'diagram',
      selectedNavigation: 'diagram',
      selectedInspector: 'render',
      commandValue: '/map',
      commandCursor: 4,
      progress: 88
    }
  },
  {
    id: 'no-color-narrow',
    label: 'No color narrow',
    viewport: { columns: 90, rows: 30 },
    theme: noColorTheme,
    state: {
      ...initialShowcaseState(),
      selectedRoute: 'activity',
      selectedNavigation: 'activity',
      selectedInspector: 'a11y',
      selectedActivity: 2,
      commandValue: '/events',
      commandCursor: 7
    }
  }
];

const galleryCategories = [
  { id: 'forms', label: 'Forms', view: formsGallery },
  { id: 'text-editing', label: 'Text editing', view: textEditingGallery },
  { id: 'tables', label: 'Tables', view: tablesGallery },
  { id: 'trees', label: 'Trees', view: treesGallery },
  { id: 'palette', label: 'Palette', view: paletteGallery },
  { id: 'scrollback', label: 'Scrollback', view: scrollbackGallery },
  { id: 'canvas', label: 'Canvas', view: canvasGallery },
  { id: 'charts', label: 'Charts', view: chartsGallery },
  { id: 'feedback', label: 'Feedback', view: feedbackGallery },
  { id: 'menus', label: 'Menus', view: menusGallery },
  { id: 'layout', label: 'Layout', view: layoutGallery },
  { id: 'accessibility', label: 'Accessibility', view: accessibilityGallery }
];

const generatedFiles = new Map([
  ...variantFiles(),
  ...categoryFiles(),
  ...animationFiles(),
  ['examples/showcase/fixtures/manifest.json', `${stableJson({
    schemaVersion: 'terminal-ui.showcase-gallery-fixtures.v1',
    source: 'scripts/generate-visual-gallery.mjs',
    variants: variants.map((variant) => ({
      id: variant.id,
      label: variant.label,
      viewport: variant.viewport,
      theme: variant.theme.name
    }))
  })}\n`],
  ['examples/gallery/fixtures/manifest.json', `${stableJson({
    schemaVersion: 'terminal-ui.widget-gallery.v1',
    source: 'scripts/generate-visual-gallery.mjs',
    categories: galleryCategories.map((category) => ({ id: category.id, label: category.label })),
    variants: variants.map((variant) => ({
      id: variant.id,
      label: variant.label,
      viewport: variant.viewport,
      theme: variant.theme.name
    }))
  })}\n`],
  ['examples/gallery/fixtures/README.md', `${examplesGalleryReadme()}\n`],
  ['docs/gallery/index.md', `${galleryIndex()}\n`]
]);

if (checkOnly) {
  await checkGallery(generatedFiles);
} else {
  await writeGallery(generatedFiles);
}

function variantFiles() {
  const files = [];
  for (const variant of variants) {
    const rendered = variantSnapshot(variant);
    const base = `examples/showcase/fixtures/${variant.id}`;
    files.push([`${base}/plain.txt`, `${rendered.snapshot.plainTextFrame}\n`]);
    files.push([`${base}/ansi.txt`, `${rendered.snapshot.ansiFrame}\n`]);
    files.push([`${base}/frame.json`, `${rendered.snapshot.frameJson}\n`]);
    files.push([`${base}/diff.json`, `${rendered.snapshot.diffJson}\n`]);
    files.push([`${base}/accessibility.json`, `${rendered.snapshot.accessibilityJson}\n`]);
    files.push([`${base}/hit-targets.json`, `${rendered.snapshot.hitTargetJson}\n`]);
    files.push([`${base}/focus-targets.json`, `${rendered.snapshot.focusTargetJson}\n`]);
    files.push([`${base}/preview.svg`, `${previewSvg(variant, rendered)}\n`]);
    files.push([`${base}/preview.html`, `${previewHtml(variant, rendered)}\n`]);
    files.push([`docs/gallery/${variant.id}.svg`, `${previewSvg(variant, rendered)}\n`]);
    files.push([`docs/gallery/${variant.id}.html`, `${previewHtml(variant, rendered)}\n`]);
  }
  return files;
}

function categoryFiles() {
  const files = [];
  for (const category of galleryCategories) {
    for (const variant of variants) {
      const rendered = categorySnapshot(category, variant);
      const base = `examples/gallery/fixtures/${category.id}/${variant.id}`;
      files.push([`${base}/plain.txt`, `${rendered.snapshot.plainTextFrame}\n`]);
      files.push([`${base}/ansi.txt`, `${rendered.snapshot.ansiFrame}\n`]);
      files.push([`${base}/frame.json`, `${rendered.snapshot.frameJson}\n`]);
      files.push([`${base}/accessibility.json`, `${rendered.snapshot.accessibilityJson}\n`]);
      files.push([`${base}/hit-targets.json`, `${rendered.snapshot.hitTargetJson}\n`]);
      files.push([`${base}/focus-targets.json`, `${rendered.snapshot.focusTargetJson}\n`]);
      files.push([`${base}/preview.svg`, `${previewSvg(categoryVariant(category, variant), rendered)}\n`]);
      files.push([`${base}/preview.html`, `${previewHtml(categoryVariant(category, variant), rendered)}\n`]);
      files.push([`docs/gallery/${category.id}-${variant.id}.svg`, `${previewSvg(categoryVariant(category, variant), rendered)}\n`]);
      files.push([`docs/gallery/${category.id}-${variant.id}.html`, `${previewHtml(categoryVariant(category, variant), rendered)}\n`]);
    }
  }
  return files;
}

function animationFiles() {
  const sequence = animationSequenceFrames();
  const files = [
    ['docs/gallery/animations/manifest.json', `${stableJson({
      schemaVersion: 'terminal-ui.animation-gallery.v1',
      source: 'examples/gallery/animation-sequences.mjs',
      viewport: sequence.viewport,
      frames: sequence.frames.map((frame) => ({
        id: frame.id,
        timeMs: frame.timeMs,
        hasDiff: frame.diff !== undefined
      }))
    })}\n`],
    ['docs/gallery/animations/transcript.json', `${stableJson(sequence.transcript)}\n`],
    ['docs/gallery/animations/index.md', `${animationIndex(sequence)}\n`]
  ];
  for (const frame of sequence.frames) {
    const snapshot = createVisualSnapshot({
      frame: frame.frame,
      ...(frame.diff === undefined ? {} : { diff: frame.diff })
    });
    const variant = {
      id: frame.id,
      label: `Animation ${frame.id}`,
      viewport: sequence.viewport,
      theme: modernTheme
    };
    const base = `docs/gallery/animations/${frame.id}`;
    files.push([`${base}.plain.txt`, `${snapshot.plainTextFrame}\n`]);
    files.push([`${base}.frame.json`, `${snapshot.frameJson}\n`]);
    if (frame.diff !== undefined) files.push([`${base}.diff.json`, `${stableJson(frame.diff)}\n`]);
    files.push([`${base}.svg`, `${previewSvg(variant, { frame: frame.frame })}\n`]);
    files.push([`${base}.html`, `${previewHtml(variant, { frame: frame.frame })}\n`]);
  }
  return files;
}

function variantSnapshot(variant) {
  const previousState = initialShowcaseState();
  const previousFrame = renderWidgetFrame(showcaseView(previousState, variant.viewport), variant.viewport, { theme: variant.theme });
  const frame = renderWidgetFrame(showcaseView(variant.state, variant.viewport), variant.viewport, { theme: variant.theme });
  return {
    frame,
    snapshot: createVisualSnapshot({
      frame,
      previousFrame,
      diff: diffFrames(previousFrame, frame)
    })
  };
}

function categorySnapshot(category, variant) {
  const frame = renderWidgetFrame(category.view(variant), variant.viewport, { theme: variant.theme });
  return {
    frame,
    snapshot: createVisualSnapshot({ frame })
  };
}

function categoryVariant(category, variant) {
  return {
    ...variant,
    id: `${category.id}-${variant.id}`,
    label: `${category.label} / ${variant.label}`
  };
}

function galleryIndex() {
  return [
    '# terminal-ui visual gallery',
    '',
    'Generated by `scripts/generate-visual-gallery.mjs`. Do not hand-edit generated preview artifacts.',
    '',
    '## Showcase',
    '',
    '| Variant | Viewport | Theme | Preview |',
    '| --- | ---: | --- | --- |',
    ...variants.map((variant) =>
      `| ${variant.label} | ${String(variant.viewport.columns)}x${String(variant.viewport.rows)} | ${variant.theme.name} | [SVG](./${variant.id}.svg) / [HTML](./${variant.id}.html) |`
    ),
    '',
    '## Widget Families',
    '',
    '| Category | Variant previews |',
    '| --- | --- |',
    ...galleryCategories.map((category) =>
      `| ${category.label} | ${variants.map((variant) => `[${variant.label}](./${category.id}-${variant.id}.html)`).join(' / ')} |`
    ),
    '',
    '## Animation Sequences',
    '',
    '[Deterministic animation frames, diffs, and transcript fixture](./animations/).'
  ].join('\n');
}

function examplesGalleryReadme() {
  return [
    '# terminal-ui widget gallery artifacts',
    '',
    'Generated by `scripts/generate-visual-gallery.mjs`.',
    '',
    'Each category directory contains plain text, ANSI, frame JSON, accessibility, hit target, focus target, SVG, and HTML artifacts for the modern-wide, high-contrast-medium, and no-color-narrow variants.'
  ].join('\n');
}

function animationIndex(sequence) {
  return [
    '# terminal-ui animation sequence gallery',
    '',
    'Generated by `scripts/generate-visual-gallery.mjs` from `examples/gallery/animation-sequences.mjs`.',
    '',
    `Viewport: ${String(sequence.viewport.columns)}x${String(sequence.viewport.rows)}`,
    '',
    '| Frame | Time | Preview | Data |',
    '| --- | ---: | --- | --- |',
    ...sequence.frames.map((frame) =>
      `| ${frame.id} | ${String(frame.timeMs)}ms | [SVG](./${frame.id}.svg) / [HTML](./${frame.id}.html) | [frame](./${frame.id}.frame.json)${frame.diff === undefined ? '' : ` / [diff](./${frame.id}.diff.json)`} |`
    ),
    '',
    '[Transcript fixture](./transcript.json)'
  ].join('\n');
}

function galleryShell(title, child) {
  return box([
    text({ value: title, style: { fg: { kind: 'theme', token: 'accent.primary' }, bold: true } }),
    child
  ], { id: `${slug(title)}-gallery`, border: { label: title } });
}

function formsGallery() {
  return galleryShell('Forms', form([
    field(inputField({ id: 'name', value: 'Nova Operations', cursor: 4 }), { label: 'Name' }),
    field(numberInput({ id: 'budget', value: 42, min: 0, max: 100 }), { label: 'Budget' }),
    checkbox({ id: 'ship', label: 'Ready to ship', checked: true }),
    radioGroup({ id: 'mode', selected: 'guided', options: [
      { value: 'fast', label: 'Fast' },
      { value: 'guided', label: 'Guided' },
      { value: 'safe', label: 'Careful' }
    ] }),
    selectBox({ id: 'region', selected: 'eu', options: [
      { value: 'us', label: 'US' },
      { value: 'eu', label: 'Europe' },
      { value: 'apac', label: 'APAC' }
    ] }),
    button({ id: 'submit', label: 'Apply changes' })
  ], { id: 'forms-body' }));
}

function textEditingGallery() {
  return galleryShell('Text editing', stack([
    textInput({ id: 'text-input', value: 'Search terminal graphemes 🙂', cursor: 24, selection: { anchor: 7, focus: 15 } }),
    textArea({
      id: 'text-area',
      value: 'Line one\nLine two with selection\nLine three',
      cursor: 22,
      selection: { anchor: 9, focus: 22 },
      height: 4
    }),
    commandBar({
      id: 'command',
      prompt: '/',
      value: 'palette',
      cursor: 7,
      suggestions: [
        { value: 'palette', label: 'Open palette' },
        { value: 'wizard', label: 'Open wizard' }
      ],
      selectedSuggestion: 0
    }),
    richText({ id: 'rich', segments: [
      { text: 'Rich ', style: { bold: true } },
      { text: 'styled ', style: { fg: { kind: 'theme', token: 'status.success' } } },
      { text: 'text' }
    ] })
  ]));
}

function tablesGallery() {
  return galleryShell('Tables', table({
    id: 'table-gallery',
    selectedCell: { row: 1, column: 2 },
    stickyHeader: true,
    columns: [
      { header: 'Name', width: { kind: 'content', max: 14 } },
      { header: 'State', width: 10 },
      { header: 'Score', width: 8, align: 'end', sort: 'descending' }
    ],
    rows: [
      ['Atlas', 'active', 92],
      ['Lumen', 'review', 85],
      ['Pulse', 'blocked', 61],
      ['Nova', 'active', 98]
    ]
  }));
}

function treesGallery() {
  return galleryShell('Trees', tree({
    id: 'tree-gallery',
    selected: 'reports',
    nodes: [
      { id: 'workspace', label: 'Workspace', expanded: true, children: [
        { id: 'apps', label: 'Apps', expanded: true, children: [
          { id: 'studio', label: 'Studio' },
          { id: 'reports', label: 'Reports' }
        ] },
        { id: 'assets', label: 'Assets', lazy: true, expanded: true, lazyStatus: 'pending', lazyMessage: 'Loading assets' }
      ] }
    ]
  }));
}

function paletteGallery() {
  return galleryShell('Palette', palette({
    id: 'palette-gallery',
    title: 'Command palette',
    query: 'op',
    selectedId: 'open-dashboard',
    entries: [
      { id: 'open-dashboard', label: 'Open dashboard', value: 'dashboard', group: 'Navigation', preview: 'Switch to the operational dashboard.' },
      { id: 'open-logs', label: 'Open logs', value: 'logs', group: 'Navigation' },
      { id: 'optimize', label: 'Optimize layout', value: 'optimize', group: 'Actions', description: 'Reflow panels' }
    ],
    helpText: 'enter accepts, esc closes'
  }));
}

function scrollbackGallery() {
  return galleryShell('Scrollback', scrollback({
    id: 'scrollback-gallery',
    searchQuery: 'warn',
    items: [
      { id: '1', tone: 'info', text: 'info: booted terminal runtime' },
      { id: '2', tone: 'warning', text: 'warn: input queue is filling' },
      { id: '3', tone: 'success', text: 'ok: frame diff committed' },
      { id: '4', tone: 'error', text: 'error: provider event dropped' }
    ]
  }));
}

function canvasGallery() {
  return galleryShell('Canvas', canvas({
    id: 'canvas-gallery',
    label: 'Canvas primitives',
    painter({ canvas }) {
      canvas.rect({ row: 1, column: 2, width: 16, height: 6 }, { stroke: { text: '·' } });
      canvas.circle({ x: 26, y: 5 }, 4, { stroke: { text: 'o' } });
      canvas.fillPolygon([{ x: 42, y: 2 }, { x: 55, y: 5 }, { x: 46, y: 9 }], { text: '▲' });
      canvas.text(4, 4, [{ text: 'Canvas2D' }]);
    }
  }));
}

function chartsGallery() {
  return galleryShell('Charts', grid([
    sparkline({ id: 'spark', values: [2, 3, 4, 8, 5, 7, 9, 6] }),
    barChart({ id: 'bars', selected: 1, items: [
      { label: 'input', value: 86 },
      { label: 'a11y', value: 94 },
      { label: 'diff', value: 78 }
    ] }),
    chart({
      id: 'chart',
      series: [{ id: 'series', points: [{ x: 0, y: 3 }, { x: 3, y: 1 }, { x: 6, y: 4 }] }]
    })
  ], { columns: [{ kind: 'fill' }, { kind: 'fill' }, { kind: 'fill' }] }));
}

function feedbackGallery() {
  return galleryShell('Feedback', stack([
    statusBar({ id: 'status', text: 'Connected' }),
    helpBar({ id: 'help', bindings: [{ key: 'Tab', label: 'focus' }, { key: 'Enter', label: 'activate' }] }),
    activityIndicator({ id: 'activity', label: 'Rendering', status: 'running' }),
    progressBar({ id: 'progress', label: 'Coverage', value: 72, max: 100, showPercentage: true, status: 'success' }),
    progressBar({ id: 'pending', label: 'Streaming', indeterminate: true, frame: 3 }),
    spinner({ id: 'spinner', label: 'Refreshing', frameIndex: 2 })
  ]));
}

function menusGallery() {
  return galleryShell('Menus', stack([
    menuBar({ id: 'menubar', selected: 'tools', items: [
      { id: 'file', label: 'File' },
      { id: 'tools', label: 'Tools' },
      { id: 'help', label: 'Help' }
    ] }),
    row([
      menu({ id: 'menu', selected: 'format', title: 'Tools', items: [
        { id: 'build', label: 'Build' },
        { id: 'format', label: 'Format', checked: true },
        { id: 'deploy', label: 'Deploy', disabled: true }
      ] }),
      dropdown({ id: 'dropdown', label: 'Theme', selected: 'modern', open: true, items: [
        { id: 'modern', label: 'Modern' },
        { id: 'contrast', label: 'High contrast' }
      ] }),
      contextMenu({ id: 'context', title: 'Context', selected: 'copy', items: [
        { id: 'copy', label: 'Copy' },
        { id: 'inspect', label: 'Inspect' }
      ] })
    ])
  ]));
}

function layoutGallery() {
  return galleryShell('Layout', overlay([
    splitPane([
      tabs({
        id: 'tabs',
        selected: 'overview',
        tabs: [
          { id: 'overview', label: 'Overview', panel: text({ value: 'Tabbed workspace' }) },
          { id: 'details', label: 'Details', panel: text({ value: 'Hidden panel' }) }
        ]
      }),
      box(text({ value: 'Inspector panel' }), { id: 'inspector', border: { label: 'Inspector' } })
    ], { direction: 'horizontal', sizes: [{ kind: 'fill' }, { kind: 'fixed', cells: 24 }] }),
    modal(text({ value: 'Modal focus scope' }), { id: 'layout-modal', title: 'Dialog', width: 28, height: 5 })
  ]));
}

function accessibilityGallery() {
  return galleryShell('Accessibility', stack([
    structuredBlock({
      id: 'summary',
      title: 'Accessible summary',
      status: 'info',
      summary: 'Scope, window, position, and live metadata are serializable.'
    }),
    activityFeed({
      id: 'activity',
      selected: 1,
      blocks: [
        { id: 'scope', title: 'Modal scope', status: 'success', summary: 'Focus is contained.' },
        { id: 'window', title: 'Window metadata', status: 'running', summary: 'Visible ranges are explicit.' },
        { id: 'live', title: 'Live region', status: 'warning', summary: 'Status updates are polite.' }
      ]
    })
  ]));
}

function previewSvg(variant, rendered) {
  const cellWidth = 8;
  const cellHeight = 18;
  const padding = 16;
  const baselineOffset = 14;
  const width = variant.viewport.columns * cellWidth + padding * 2;
  const height = rendered.frame.height * cellHeight + padding * 2;
  const palette = previewPalette(variant.theme);
  const backgroundRects = styledBackgroundRects(rendered.frame, variant.theme, palette, cellWidth, cellHeight, padding);
  const textRuns = styledTextRuns(rendered.frame, variant.theme, palette, cellWidth, cellHeight, padding, baselineOffset);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}" viewBox="0 0 ${String(width)} ${String(height)}" xml:space="preserve">`,
    `<rect width="100%" height="100%" fill="${palette.background}"/>`,
    ...backgroundRects,
    ...textRuns,
    '</svg>'
  ].join('\n');
}

function previewHtml(variant, rendered) {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<meta charset="utf-8">',
    `<title>terminal-ui ${escapeHtml(variant.label)}</title>`,
    '<style>',
    `body{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;margin:2rem;background:${previewPalette(variant.theme).background};color:${previewPalette(variant.theme).foreground}}`,
    '.preview{overflow:auto}',
    'svg{border:1px solid #555;max-width:100%;height:auto}',
    'a{color:#9cdcfe}',
    '</style>',
    `<h1>${escapeHtml(variant.label)}</h1>`,
    `<p>${String(variant.viewport.columns)}x${String(variant.viewport.rows)} · ${escapeHtml(variant.theme.name)}</p>`,
    '<div class="preview">',
    previewSvg(variant, rendered),
    '</div>',
    '</html>'
  ].join('\n');
}

function styledBackgroundRects(frame, theme, palette, cellWidth, cellHeight, padding) {
  return frame.cells
    .filter((cell) => cell.continuation !== true)
    .map((cell) => {
      const style = effectiveStyle(cell.style, theme, palette);
      if (style.bg === undefined || style.hidden === true) return undefined;
      return `<rect x="${String(padding + (cell.column - 1) * cellWidth)}" y="${String(padding + (cell.row - 1) * cellHeight)}" width="${String(cell.width * cellWidth)}" height="${String(cellHeight)}" fill="${style.bg}"/>`;
    })
    .filter(Boolean);
}

function styledTextRuns(frame, theme, palette, cellWidth, cellHeight, padding, baselineOffset) {
  const runs = [];
  const rows = new Map();
  for (const cell of frame.cells) {
    if (cell.continuation === true) continue;
    rows.set(cell.row, [...(rows.get(cell.row) ?? []), cell]);
  }
  for (const [row, cells] of [...rows.entries()].sort(([left], [right]) => left - right)) {
    const sorted = cells.toSorted((left, right) => left.column - right.column);
    let current;
    for (const cell of sorted) {
      const style = effectiveStyle(cell.style, theme, palette);
      if (style.hidden === true) {
        current = undefined;
        continue;
      }
      const key = textStyleKey(style);
      if (
        current !== undefined
        && current.nextColumn === cell.column
        && current.key === key
      ) {
        current.text += cell.text;
        current.nextColumn = cell.column + cell.width;
        continue;
      }
      current = {
        key,
        style,
        row,
        column: cell.column,
        nextColumn: cell.column + cell.width,
        text: cell.text
      };
      runs.push(current);
    }
  }
  return runs
    .filter((run) => run.text.length > 0)
    .map((run) => {
      const x = padding + (run.column - 1) * cellWidth;
      const y = padding + (run.row - 1) * cellHeight + baselineOffset;
      return `<text x="${String(x)}" y="${String(y)}" ${svgTextAttributes(run.style)}>${escapeXml(run.text)}</text>`;
    });
}

function effectiveStyle(style, theme, palette) {
  const resolved = resolveTerminalStyle(style, theme) ?? {};
  const fg = colorHex(resolved.fg) ?? palette.foreground;
  const bg = colorHex(resolved.bg);
  if (resolved.inverse === true) {
    return {
      ...resolved,
      fg: bg ?? palette.background,
      bg: fg
    };
  }
  return { ...resolved, fg, ...(bg === undefined ? {} : { bg }) };
}

function svgTextAttributes(style) {
  const attributes = [
    `fill="${style.fg}"`,
    'font-family="ui-monospace,SFMono-Regular,Consolas,monospace"',
    'font-size="14"'
  ];
  if (style.bold === true) attributes.push('font-weight="700"');
  if (style.italic === true) attributes.push('font-style="italic"');
  const decorations = [
    style.underline === true ? 'underline' : undefined,
    style.strikethrough === true ? 'line-through' : undefined
  ].filter(Boolean);
  if (decorations.length > 0) attributes.push(`text-decoration="${decorations.join(' ')}"`);
  if (style.dim === true) attributes.push('opacity="0.68"');
  return attributes.join(' ');
}

function textStyleKey(style) {
  return JSON.stringify({
    fg: style.fg,
    bold: style.bold === true,
    dim: style.dim === true,
    italic: style.italic === true,
    underline: style.underline === true,
    strikethrough: style.strikethrough === true,
    hidden: style.hidden === true
  });
}

function previewPalette(theme) {
  return {
    background: colorHex(resolveThemeColor(theme, 'app.background')) ?? '#101014',
    foreground: colorHex(resolveThemeColor(theme, 'app.foreground')) ?? '#f5f5f5'
  };
}

function colorHex(color) {
  if (color === undefined) return undefined;
  if (color.kind === 'rgb') return `#${hex(color.r)}${hex(color.g)}${hex(color.b)}`;
  const [r, g, b] = ANSI_RGB[color.value] ?? ANSI_RGB[15];
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function hex(value) {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
}

async function writeGallery(files) {
  await rm(showcaseFixtureDirectory, { recursive: true, force: true });
  await rm(examplesGalleryFixtureDirectory, { recursive: true, force: true });
  await rm(docsGalleryDirectory, { recursive: true, force: true });
  await writeFiles(files);
}

async function writeFiles(files) {
  await Promise.all([...files].map(async ([name, content]) => {
    const target = new URL(`../${name}`, import.meta.url);
    await mkdir(dirname(fileURLToPath(target)), { recursive: true });
    await writeFile(target, content, 'utf8');
  }));
}

async function checkGallery(files) {
  const mismatches = [];
  const expectedNames = new Set(files.keys());
  for (const [name, expected] of files) {
    const target = new URL(`../${name}`, import.meta.url);
    let actual;
    try {
      actual = await readFile(target, 'utf8');
    } catch {
      mismatches.push(`${name}: missing`);
      continue;
    }
    if (actual !== expected) mismatches.push(`${name}: stale`);
  }
  for (const actual of await listGeneratedFiles()) {
    if (!expectedNames.has(actual)) mismatches.push(`${actual}: stale extra`);
  }
  if (mismatches.length > 0) {
    throw new Error([
      'Showcase gallery fixtures are stale.',
      `Run from ${root}: node scripts/generate-visual-gallery.mjs`,
      ...mismatches
    ].join('\n'));
  }
}

async function listGeneratedFiles() {
  const roots = [
    ['examples/showcase/fixtures', showcaseFixtureDirectory],
    ['examples/gallery/fixtures', examplesGalleryFixtureDirectory],
    ['docs/gallery', docsGalleryDirectory]
  ];
  const files = [];
  for (const [prefix, directory] of roots) {
    const directoryPath = fileURLToPath(directory);
    const collected = [];
    await collectFiles(directoryPath, collected);
    files.push(...collected.map((path) => `${prefix}/${relative(directoryPath, path).replaceAll('\\', '/')}`));
  }
  return files.sort();
}

async function collectFiles(directory, output) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }
  await Promise.all(entries.map(async (entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      await collectFiles(path, output);
      return;
    }
    if (entry.isFile()) output.push(path);
  }));
}

function stableJson(value) {
  return JSON.stringify(value, null, 2);
}

function slug(value) {
  return value.toLocaleLowerCase().replaceAll(/[^a-z0-9]+/gu, '-').replaceAll(/^-|-$/gu, '');
}

function escapeHtml(value) {
  return escapeXml(value).replaceAll('"', '&quot;');
}

function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
