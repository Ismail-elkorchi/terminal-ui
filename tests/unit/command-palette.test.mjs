import assert from 'node:assert/strict';
import test from 'node:test';

import { commandPaletteWindow, filterCommandPaletteEntries, renderWidgetFrame } from '../../dist/tui/index.js';
import { commandPalette } from '../../dist/widgets/index.js';

const entries = [
  { id: 'open-file', label: 'Open File', description: 'Open a file', keywords: ['file'] },
  { id: 'toggle-terminal', label: 'Toggle Terminal', description: 'Show terminal', keywords: ['shell'] },
  { id: 'run-tests', label: 'Run Tests', description: 'Execute tests', keywords: ['verify'] }
];

test('command palette filtering is fuzzy and stable', () => {
  assert.deepEqual(
    filterCommandPaletteEntries(entries, 'term').map((entry) => entry.id),
    ['toggle-terminal']
  );
  assert.deepEqual(
    filterCommandPaletteEntries(entries, 'rt').map((entry) => entry.id),
    ['run-tests']
  );
});

test('commandPaletteWindow bounds visible entries around selection', () => {
  const window = commandPaletteWindow({ entries, selected: 2, limit: 2 });
  assert.equal(window.total, 3);
  assert.deepEqual(window.entries.map((entry) => entry.id), ['toggle-terminal', 'run-tests']);
  assert.equal(window.selected, 1);
});

test('commandPalette widget renders query, filtered entries, help, and accessibility', () => {
  const frame = renderWidgetFrame(
    commandPalette({
      id: 'palette',
      title: 'Actions',
      query: 't',
      entries,
      selected: 1,
      maxVisible: 2,
      helpText: 'enter accepts, escape closes'
    }),
    { columns: 44, rows: 5 }
  );

  const lines = frame.cells.reduce((byRow, cell) => {
    byRow.set(cell.row, `${byRow.get(cell.row) ?? ''}${cell.text}`);
    return byRow;
  }, new Map());
  assert.match(lines.get(1) ?? '', /Actions/u);
  assert.match(lines.get(2) ?? '', /> t/u);
  assert.match([...lines.values()].join('\n'), /Toggle Terminal/u);
  assert.equal(frame.accessibility.root.role, 'menu');
  assert.equal(frame.accessibility.root.children?.[1]?.selected, true);
});
