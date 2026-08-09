import assert from 'node:assert/strict';
import test from 'node:test';

import {
  prepareSearchPickerIndex,
  searchPickerWindow
} from '../../dist/behavior/index.js';
import { renderElementFrame } from '../../dist/renderer/index.js';
import { searchPicker } from '../../dist/components/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { createTuiRuntime, defineTui } from '../../dist/tui/index.js';

const entries = [
  { id: 'open-file', label: 'Open File', group: 'Files', value: { kind: 'file' }, description: 'Open a file', keywords: ['file'], preview: 'src/index.ts' },
  { id: 'toggle-terminal', label: 'Toggle Terminal', group: 'Workspace', value: { kind: 'action' }, description: 'Show terminal', keywords: ['terminal'] },
  { id: 'run-tests', label: 'Run Tests', group: 'Workspace', value: { kind: 'action' }, description: 'Execute tests', keywords: ['verify'], disabled: true }
];
const index = prepareSearchPickerIndex(entries);

test('searchPicker filtering is fuzzy stable and value-agnostic', () => {
  assert.deepEqual(
    searchPickerWindow({ searchPickerIndex: index, query: 'term' }).entries.map((entry) => entry.id),
    ['toggle-terminal']
  );
  assert.deepEqual(
    searchPickerWindow({ searchPickerIndex: index, query: 'rt' }).entries.map((entry) => entry.id),
    ['run-tests']
  );
});

test('searchPicker filtering reuses immutable entry search text across queries', () => {
  let labelReads = 0;
  const measuredEntry = {
    id: 'measured',
    get label() {
      labelReads += 1;
      return 'Measured entry';
    },
    value: 'measured',
    keywords: ['stable']
  };

  const measuredIndex = prepareSearchPickerIndex([measuredEntry]);
  assert.deepEqual(searchPickerWindow({ searchPickerIndex: measuredIndex, query: 'measured' }).entries.map((entry) => entry.id), ['measured']);
  assert.deepEqual(searchPickerWindow({ searchPickerIndex: measuredIndex, query: 'stable' }).entries.map((entry) => entry.id), ['measured']);
  assert.equal(labelReads, 1);
});

test('searchPickerWindow bounds visible entries around stable id selection and scroll', () => {
  const windowIndex = prepareSearchPickerIndex(entries.map((entry) => ({
    ...entry,
    disabled: false
  })));
  const centered = searchPickerWindow({ searchPickerIndex: windowIndex, selectedId: 'run-tests', limit: 2 });
  assert.equal(centered.totalCount, 3);
  assert.deepEqual(centered.entries.map((entry) => entry.id), ['toggle-terminal', 'run-tests']);
  assert.equal(centered.selectedIndex, 1);
  assert.equal(centered.selectedEntry?.id, 'run-tests');

  const scrolled = searchPickerWindow({
    searchPickerIndex: windowIndex,
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
  assert.deepEqual(scrolled.entries.map((entry) => entry.id), ['toggle-terminal', 'run-tests']);
  assert.equal(scrolled.selectedIndex, 1);
  assert.equal(scrolled.omittedBefore, 1);
  assert.equal(scrolled.omittedAfter, 0);

  const scrolledWithoutSelection = searchPickerWindow({
    searchPickerIndex: windowIndex,
    scroll: {
      offsetRow: 1,
      offsetColumn: 0,
      contentRows: 3,
      contentColumns: 1,
      viewportRows: 2,
      viewportColumns: 1,
      followTail: false
    },
    limit: 2
  });
  assert.equal(scrolledWithoutSelection.startIndex, 1);
  assert.equal(scrolledWithoutSelection.selectedEntry?.id, 'toggle-terminal');
  assert.equal(scrolledWithoutSelection.selectedIndex, 0);
});

test('searchPickerWindow rejects disabled or stale selection in favor of an enabled entry', () => {
  for (const selectedId of ['run-tests', 'missing']) {
    const window = searchPickerWindow({
      searchPickerIndex: index,
      selectedId,
      limit: 3
    });

    assert.equal(window.selectedEntry?.id, 'open-file');
    assert.equal(window.entries[window.selectedIndex ?? -1]?.id, 'open-file');
  }
});

test('searchPicker component renders query matches disabled entries preview help empty state and accessibility', () => {
  const frame = renderElementFrame(
    searchPicker({
      id: 'searchPicker',
      title: 'Things',
      query: 'run',
      searchPickerIndex: index,
      selectedId: 'run-tests',
      maxVisible: 2,
      helpText: 'enter accepts, escape closes',
      emptyText: 'Nothing here',
      onAction: (action) => action
    }),
    { columns: 48, rows: 6 }
  );

  const lines = frame.cells.reduce((byRow, cell) => {
    byRow.set(cell.row, `${byRow.get(cell.row) ?? ''}${cell.text}`);
    return byRow;
  }, new Map());
  const matchCell = frame.cells.find((cell) => cell.text === 'R');
  const disabledCell = frame.cells.find((cell) =>
    cell.source?.description === 'entry.run-tests.description'
    && cell.text.trim().length > 0
  );

  assert.match(lines.get(1) ?? '', /Things/u);
  assert.match(lines.get(1) ?? '', /1\/3 match/u);
  assert.match(lines.get(2) ?? '', /› run/u);
  assert.match([...lines.values()].join('\n'), /Run Tests/u);
  assert.match([...lines.values()].join('\n'), /\[Workspace\]/u);
  assert.match([...lines.values()].join('\n'), /enter accepts/u);
  assert.equal(frame.cells.find((cell) => cell.text === 'T')?.source?.description, 'title');
  assert.equal(frame.cells.find((cell) => cell.text === '›')?.source?.description, 'query.marker');
  assert.equal(frame.cells.find((cell) => cell.text === 'r')?.source?.description, 'query');
  assert.equal(frame.cells.find((cell) => cell.text === '[')?.source?.description, 'entry.run-tests.group');
  assert.equal(matchCell?.source?.description, 'entry.run-tests.match');
  assert.equal(disabledCell?.source?.description, 'entry.run-tests.description');
  assert.equal(matchCell?.style?.fg?.token, 'command.match');
  assert.equal(disabledCell?.style?.fg?.token, 'text.disabled');
  assert.equal(frame.accessibility.root.role, 'combobox');
  assert.equal(frame.accessibility.root.scope, undefined);
  const selectedOption = frame.accessibility.root.children?.[0]?.children?.[0];
  assert.equal(selectedOption?.selected, false);
  assert.equal(selectedOption?.disabled, true);
  assert.deepEqual(selectedOption?.position, {
    positionInSet: 1,
    setSize: 1,
    group: 'Workspace'
  });
  assert.equal(selectedOption?.value, undefined);
});

test('searchPicker keeps a controlled selection visible before activating it', async () => {
  const manyEntries = Array.from({ length: 5 }, (_, entryIndex) => ({
    id: String(entryIndex),
    label: `Entry ${String(entryIndex)}`,
    value: entryIndex
  }));
  const manyIndex = prepareSearchPickerIndex(manyEntries);
  const scroll = {
    offsetRow: 0,
    offsetColumn: 0,
    contentRows: 5,
    contentColumns: 1,
    viewportRows: 3,
    viewportColumns: 1,
    followTail: false
  };
  const app = defineTui({
    id: 'windowed-search-picker',
    init: () => ({ actions: [] }),
    update: (state, action) => ({ state: { actions: [...state.actions, action] } }),
    view: () => searchPicker({
      id: 'windowed-picker',
      searchPickerIndex: manyIndex,
      selectedId: '4',
      scroll,
      maxVisible: 3,
      onAction: (action) => action
    })
  });
  const runtime = createTuiRuntime({
    app,
    host: createMemoryTerminalHost({ terminalSize: { columns: 24, rows: 5 } })
  });

  await runtime.start();
  const visibleIds = new Set(runtime.frame().cells.flatMap((cell) =>
    cell.source?.itemId === undefined ? [] : [cell.source.itemId]
  ));
  await runtime.handleInput({
    kind: 'key',
    key: 'enter',
    modifiers: { ctrl: false, alt: false, shift: false, meta: false },
    eventType: 'press',
    location: 'standard'
  });

  assert.deepEqual([...visibleIds], ['2', '3', '4']);
  assert.equal(runtime.frame().cells.some((cell) =>
    cell.source?.itemId === '4' && cell.source.interactionState === 'selected'
  ), true);
  assert.equal(runtime.state().actions[0]?.entry.id, '4');
  await runtime.dispose();
});

test('searchPicker reuses normalized entries across repeated factory calls', () => {
  let labelReads = 0;
  const measuredEntries = Array.from({ length: 100 }, (_, index) => ({
    id: `entry-${String(index)}`,
    get label() {
      labelReads += 1;
      return `Entry ${String(index)}`;
    },
    value: index
  }));
  const measuredIndex = prepareSearchPickerIndex(measuredEntries);
  const elementForQuery = (query) => searchPicker({
    id: 'measured-searchPicker',
      searchPickerIndex: measuredIndex,
    query,
    onAction: (action) => action
  });

  renderElementFrame(elementForQuery('entry'), { columns: 60, rows: 12 });
  renderElementFrame(elementForQuery('entry-9'), { columns: 60, rows: 12 });

  assert.equal(labelReads, measuredEntries.length);
});

test('searchPicker component renders empty states for unrelated queries', () => {
  const frame = renderElementFrame(
    searchPicker({
      id: 'searchPicker',
      query: 'zz',
      searchPickerIndex: index,
      emptyText: 'No available entries',
      onAction: (action) => action
    }),
    { columns: 32, rows: 4 }
  );

  const text = frame.cells.map((cell) => cell.text).join('');
  assert.match(text, /No available entries/u);
  assert.equal(frame.cells.find((cell) => cell.text === 'N')?.source?.description, 'empty');
});

test('searchPicker exposes enabled visible entry hit targets when toMessage is provided', () => {
  const frame = renderElementFrame(
    searchPicker({
      id: 'commands',
      query: '',
      searchPickerIndex: index,
      maxVisible: 3,
      onAction: (action) => ({ kind: 'action', action })
    }),
    { columns: 48, rows: 6 }
  );

  assert.deepEqual(frame.hitTargets?.map((target) => target.id), [
    'commands:open-file',
    'commands:toggle-terminal',
    'commands:scroll:content'
  ]);
});

test('searchPicker emits compact controlled actions while acceptance remains caller-controlled', async () => {
  const app = defineTui({
    id: 'searchPicker-actions',
    init: () => ({ messages: [] }),
    update: (state, message) => ({ state: { messages: [...state.messages, message] } }),
    view: () => searchPicker({
      id: 'commands',
      query: '',
      searchPickerIndex: index,
      onAction: (action) => ({ kind: 'action', action })
    })
  });
  const runtime = createTuiRuntime({ app, host: createMemoryTerminalHost() });

  await runtime.start();
  await runtime.handleInput({ kind: 'text', text: 'o', paste: false });
  await runtime.handleInput({ kind: 'paste', text: 'pen', bracketed: true });
  await runtime.handleInput({ kind: 'key', key: 'backspace', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  await runtime.handleInput({ kind: 'key', key: 'arrowDown', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  await runtime.handleInput({ kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  await runtime.handleInput({ kind: 'key', key: 'escape', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });

  assert.deepEqual(runtime.state().messages, [
    { kind: 'action', action: { kind: 'insertQuery', text: 'o' } },
    { kind: 'action', action: { kind: 'insertQuery', text: 'pen' } },
    { kind: 'action', action: { kind: 'deleteQueryBackward' } },
    { kind: 'action', action: { kind: 'moveSelection', delta: 1 } },
    { kind: 'action', action: { kind: 'activate', entry: entries[0] } }
  ]);
});
