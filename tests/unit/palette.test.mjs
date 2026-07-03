import assert from 'node:assert/strict';
import test from 'node:test';

import { filterPaletteEntries, paletteWindow, renderWidgetFrame } from '../../dist/tui/index.js';
import { palette } from '../../dist/widgets/index.js';

const entries = [
  { id: 'open-file', label: 'Open File', group: 'Files', value: { kind: 'file' }, description: 'Open a file', keywords: ['file'], preview: 'src/index.ts' },
  { id: 'toggle-terminal', label: 'Toggle Terminal', group: 'Workspace', value: { kind: 'action' }, description: 'Show terminal', keywords: ['shell'] },
  { id: 'run-tests', label: 'Run Tests', group: 'Workspace', value: { kind: 'action' }, description: 'Execute tests', keywords: ['verify'], disabled: true }
];

test('palette filtering is fuzzy stable and value-agnostic', () => {
  assert.deepEqual(
    filterPaletteEntries(entries, 'term').map((entry) => entry.id),
    ['toggle-terminal']
  );
  assert.deepEqual(
    filterPaletteEntries(entries, 'rt').map((entry) => entry.id),
    ['run-tests']
  );
});

test('paletteWindow bounds visible entries around stable id selection and scroll', () => {
  const centered = paletteWindow({ entries, selectedId: 'run-tests', limit: 2 });
  assert.equal(centered.total, 3);
  assert.deepEqual(centered.entries.map((entry) => entry.id), ['toggle-terminal', 'run-tests']);
  assert.equal(centered.selected, 1);
  assert.equal(centered.selectedEntry?.id, 'run-tests');

  const scrolled = paletteWindow({
    entries,
    selectedId: 'run-tests',
    scroll: {
      offsetRow: 0,
      offsetColumn: 0,
      contentRows: 3,
      contentColumns: 1,
      viewportRows: 2,
      viewportColumns: 1,
      followTail: false
    },
    limit: 2
  });
  assert.deepEqual(scrolled.entries.map((entry) => entry.id), ['open-file', 'toggle-terminal']);
  assert.equal(scrolled.selected, undefined);
  assert.equal(scrolled.omittedAfter, 1);
});

test('palette widget renders query matches disabled entries preview help empty state and accessibility', () => {
  const frame = renderWidgetFrame(
    palette({
      id: 'palette',
      title: 'Things',
      query: 'run',
      entries,
      selectedId: 'run-tests',
      maxVisible: 2,
      helpText: 'enter accepts, escape closes',
      emptyText: 'Nothing here'
    }),
    { columns: 48, rows: 6 }
  );

  const lines = frame.cells.reduce((byRow, cell) => {
    byRow.set(cell.row, `${byRow.get(cell.row) ?? ''}${cell.text}`);
    return byRow;
  }, new Map());
  const matchCell = frame.cells.find((cell) => cell.text === 'R');
  const disabledCell = frame.cells.find((cell) =>
    cell.source?.label === 'entry.run-tests.description'
    && cell.text.trim().length > 0
  );

  assert.match(lines.get(1) ?? '', /Things/u);
  assert.match(lines.get(1) ?? '', /1\/3 match/u);
  assert.match(lines.get(2) ?? '', /› run/u);
  assert.match([...lines.values()].join('\n'), /Run Tests/u);
  assert.match([...lines.values()].join('\n'), /\[Workspace\]/u);
  assert.match([...lines.values()].join('\n'), /enter accepts/u);
  assert.equal(frame.cells.find((cell) => cell.text === 'T')?.source?.label, 'title');
  assert.equal(frame.cells.find((cell) => cell.text === '›')?.source?.label, 'query.marker');
  assert.equal(frame.cells.find((cell) => cell.text === 'r')?.source?.label, 'query');
  assert.equal(frame.cells.find((cell) => cell.text === '[')?.source?.label, 'entry.run-tests.group');
  assert.equal(matchCell?.source?.label, 'entry.run-tests.match');
  assert.equal(disabledCell?.source?.label, 'entry.run-tests.description');
  assert.equal(matchCell?.style?.fg?.token, 'menu.match');
  assert.equal(disabledCell?.style?.fg?.token, 'text.muted');
  assert.equal(frame.accessibility.root.role, 'menu');
  assert.deepEqual(frame.accessibility.root.scope, { kind: 'menu' });
  assert.equal(frame.accessibility.root.children?.[0]?.selected, true);
  assert.equal(frame.accessibility.root.children?.[0]?.disabled, true);
  assert.equal(frame.accessibility.root.children?.[0]?.position?.group, 'Workspace');
  assert.equal(frame.accessibility.root.children?.[0]?.value, undefined);
});

test('palette widget renders empty states for unrelated queries', () => {
  const frame = renderWidgetFrame(
    palette({
      id: 'palette',
      query: 'zz',
      entries,
      emptyText: 'No available entries'
    }),
    { columns: 32, rows: 4 }
  );

  const text = frame.cells.map((cell) => cell.text).join('');
  assert.match(text, /No available entries/u);
  assert.equal(frame.cells.find((cell) => cell.text === 'N')?.source?.label, 'empty');
});

test('palette exposes enabled visible entry hit targets when toMessage is provided', () => {
  const frame = renderWidgetFrame(
    palette({
      id: 'commands',
      query: '',
      entries,
      maxVisible: 3,
      toMessage: (entry) => ({ kind: 'select', id: entry.id })
    }),
    { columns: 48, rows: 6 }
  );

  assert.deepEqual(frame.hitTargets?.map((target) => target.id), [
    'commands:open-file',
    'commands:toggle-terminal'
  ]);
});
