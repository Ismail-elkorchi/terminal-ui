import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createVisualSnapshot } from '../dist/testing/index.js';
import { renderWidgetFrame } from '../dist/tui/index.js';
import { progressBar, stack, statusBar, table } from '../dist/widgets/index.js';

const checkOnly = process.argv.includes('--check');
const root = fileURLToPath(new URL('..', import.meta.url));
const outputDirectory = new URL('../tests/fixtures/visual-preview/', import.meta.url);

const frame = renderWidgetFrame(stack([
  statusBar({ id: 'status', text: 'Visual fixture' }),
  progressBar({
    id: 'progress',
    label: 'Render',
    value: 3,
    max: 5,
    mode: 'full',
    labelPosition: 'start',
    status: 'running'
  }),
  table({
    id: 'metrics',
    selectedCell: { row: 1, column: 1 },
    columns: [
      { header: 'Area', width: { kind: 'fixed', cells: 10 } },
      { header: 'State', width: { kind: 'fixed', cells: 8 } }
    ],
    rows: [
      ['Frame', 'stable'],
      ['Diff', 'ready']
    ]
  })
]), { columns: 40, rows: 8 });

const snapshot = createVisualSnapshot({ frame });
const files = new Map([
  ['plain.txt', `${snapshot.plainTextFrame}\n`],
  ['ansi.txt', `${snapshot.ansiFrame}\n`],
  ['frame.json', `${snapshot.frameJson}\n`],
  ['accessibility.json', `${snapshot.accessibilityJson}\n`],
  ['diff.json', `${snapshot.diffJson}\n`],
  ['hit-targets.json', `${snapshot.hitTargetJson}\n`],
  ['focus-targets.json', `${snapshot.focusTargetJson}\n`],
  ['manifest.json', `${JSON.stringify({
    schemaVersion: 'terminal-ui.visual-preview-fixtures.v1',
    source: 'scripts/render-fixtures.mjs',
    generatedFrom: snapshot.schemaVersion,
    files: [...filesWithoutManifest()]
  }, null, 2)}\n`],
  ['preview.html', `${previewHtml(snapshot)}\n`]
]);

if (checkOnly) {
  await checkFixtures(files);
} else {
  await writeFixtures(files);
}

function filesWithoutManifest() {
  return [
    'plain.txt',
    'ansi.txt',
    'frame.json',
    'accessibility.json',
    'diff.json',
    'hit-targets.json',
    'focus-targets.json',
    'preview.html'
  ];
}

async function writeFixtures(expectedFiles) {
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([...expectedFiles].map(async ([name, content]) => {
    const target = new URL(name, outputDirectory);
    await mkdir(dirname(fileURLToPath(target)), { recursive: true });
    await writeFile(target, content, 'utf8');
  }));
}

async function checkFixtures(expectedFiles) {
  const mismatches = [];
  for (const [name, expected] of expectedFiles) {
    const target = new URL(name, outputDirectory);
    let actual;
    try {
      actual = await readFile(target, 'utf8');
    } catch {
      mismatches.push(`${name}: missing`);
      continue;
    }
    if (actual !== expected) mismatches.push(`${name}: stale`);
  }
  if (mismatches.length > 0) {
    throw new Error([
      'Visual preview fixtures are stale.',
      `Run from ${root}: npm run fixtures:update`,
      ...mismatches
    ].join('\n'));
  }
}

function previewHtml(currentSnapshot) {
  const frameJson = JSON.parse(currentSnapshot.frameJson);
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<meta charset="utf-8">',
    '<title>terminal-ui visual preview fixture</title>',
    '<style>',
    'body{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;margin:2rem;background:#111;color:#eee}',
    'pre{padding:1rem;border:1px solid #555;overflow:auto;white-space:pre}',
    '</style>',
    '<h1>terminal-ui visual preview fixture</h1>',
    '<pre>',
    escapeHtml(currentSnapshot.plainTextFrame),
    '</pre>',
    '<script type="application/json" id="terminal-ui-frame">',
    escapeHtml(JSON.stringify(frameJson, null, 2)),
    '</script>',
    '</html>'
  ].join('\n');
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
