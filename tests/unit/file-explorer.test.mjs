import assert from 'node:assert/strict';
import test from 'node:test';

import { createScrollState, renderFramePlain, renderWidgetFrame } from '../../dist/tui/index.js';
import {
  fileDialog,
  fileExplorer,
  fileExplorerBreadcrumbs,
  fileExplorerEntriesToTreeNodes,
  text
} from '../../dist/widgets/index.js';

const entries = [
  {
    id: 'root',
    name: 'Workspace',
    path: '.',
    kind: 'directory',
    expanded: true,
    children: [
      {
        id: 'src',
        name: 'src',
        path: 'src',
        kind: 'directory',
        expanded: true,
        children: [
          {
            id: 'src/index.ts',
            name: 'index.ts',
            path: 'src/index.ts',
            kind: 'file',
            metadata: { bytes: 128 }
          }
        ]
      },
      {
        id: 'readme',
        name: 'README.md',
        path: 'README.md',
        kind: 'file'
      }
    ]
  }
];

function styleForCell(frame, predicate) {
  return frame.cells.find(predicate)?.style;
}

test('fileExplorer maps caller-owned entries to existing tree nodes', () => {
  const nodes = fileExplorerEntriesToTreeNodes(entries);
  const leaf = nodes[0]?.children?.[0]?.children?.[0];

  assert.equal(nodes[0]?.label, 'Workspace');
  assert.equal(nodes[0]?.icon, '▸');
  assert.equal(leaf?.label, 'index.ts');
  assert.equal(leaf?.icon, '·');
  assert.deepEqual(leaf?.metadata, {
    bytes: 128,
    path: 'src/index.ts',
    kind: 'file',
    name: 'index.ts'
  });
});

test('fileExplorerBreadcrumbs returns the selected entry path', () => {
  assert.deepEqual(fileExplorerBreadcrumbs(entries, 'src/index.ts'), [
    { id: 'root', label: 'Workspace', path: '.', kind: 'directory' },
    { id: 'src', label: 'src', path: 'src', kind: 'directory' },
    { id: 'src/index.ts', label: 'index.ts', path: 'src/index.ts', kind: 'file' }
  ]);
  assert.deepEqual(fileExplorerBreadcrumbs(entries, 'missing'), []);
});

test('fileExplorer composes breadcrumbs tree filtering and preview without filesystem IO', () => {
  const selectedMessages = [];
  const widget = fileExplorer({
    id: 'files',
    entries,
    selected: 'src/index.ts',
    filterQuery: 'index',
    preview: text('export const value = 1;'),
    toMessage: (entry) => {
      selectedMessages.push(entry);
      return { kind: 'select', path: entry.path };
    }
  });
  const frame = renderWidgetFrame(widget, { columns: 72, rows: 10 });
  const output = renderFramePlain(frame);

  assert.match(output, /Workspace/u);
  assert.match(output, /src/u);
  assert.match(output, /index\.ts/u);
  assert.match(output, /Preview: index\.ts/u);
  assert.match(output, /export const value/u);
  assert.equal(widget.kind, 'splitPane');
  assert.equal(styleForCell(frame, (cell) => cell.text === '/' && cell.style?.fg?.token === 'surface.border')?.fg?.token, 'surface.border');
  assert.equal(styleForCell(frame, (cell) => cell.text === 'i' && cell.style?.fg?.token === 'accent.primary')?.fg?.token, 'accent.primary');
});

test('fileExplorer rendering stays bounded for large trees through existing tree windowing', () => {
  const largeEntries = [{
    id: 'root',
    name: 'root',
    path: '.',
    kind: 'directory',
    expanded: true,
    children: Array.from({ length: 200 }, (_, index) => ({
      id: `file-${String(index).padStart(3, '0')}`,
      name: `file-${String(index).padStart(3, '0')}.txt`,
      path: `file-${String(index).padStart(3, '0')}.txt`,
      kind: 'file'
    }))
  }];
  const frame = renderWidgetFrame(fileExplorer({
    entries: largeEntries,
    selected: 'file-150',
    scroll: createScrollState({ offsetRow: 145, contentRows: 201, viewportRows: 6 }),
    scrollbar: { visible: true }
  }), { columns: 44, rows: 7 });
  const output = renderFramePlain(frame);

  assert.match(output, /file-145\.txt/u);
  assert.match(output, /file-150\.txt/u);
  assert.doesNotMatch(output, /file-001\.txt/u);
  assert.ok(frame.cells.every((cell) => cell.row <= 7 && cell.column <= 44));
});

test('fileDialog composes file explorer filter preview and actions in a modal', () => {
  const widget = fileDialog({
    id: 'open-dialog',
    title: 'Open file',
    entries,
    selected: 'readme',
    filterValue: 'read',
    filterInputMap: { text: (value) => ({ kind: 'filter', value }) },
    preview: text('# Readme'),
    confirmMessage: { kind: 'open' },
    cancelMessage: { kind: 'cancel' },
    width: 70,
    height: 14
  });
  const frame = renderWidgetFrame(widget, { columns: 80, rows: 18 });
  const output = renderFramePlain(frame);

  assert.equal(widget.kind, 'modal');
  assert.match(output, /Open file/u);
  assert.match(output, /Filter/u);
  assert.match(output, /read/u);
  assert.match(output, /README\.md/u);
  assert.match(output, /# Readme/u);
  assert.match(output, /Cancel/u);
  assert.match(output, /Open/u);
  assert.equal(styleForCell(frame, (cell) => cell.text === 'O' && cell.style?.bg?.token === 'selection.background')?.bg?.token, 'selection.background');
});
