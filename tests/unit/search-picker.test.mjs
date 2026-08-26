import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSearchPickerIndex,
  searchPickerWindow
} from '../../dist/behavior/index.js';
import { renderElementFrame } from '../../dist/renderer/index.js';
import { renderElementRegions } from '../../dist/renderer/internal/render-element.js';
import { searchPicker } from '../../dist/components/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { createTuiRuntime, defineTui } from '../../dist/tui/index.js';

const entries = [
  { id: 'open-file', label: 'Open File', group: 'Files', value: { kind: 'file' }, description: 'Open a file', keywords: ['file'], preview: 'src/index.ts' },
  { id: 'toggle-terminal', label: 'Toggle Terminal', group: 'Workspace', value: { kind: 'action' }, description: 'Show terminal', keywords: ['terminal'] },
  { id: 'run-tests', label: 'Run Tests', group: 'Workspace', value: { kind: 'action' }, description: 'Execute tests', keywords: ['verify'], disabled: true }
];
const index = createSearchPickerIndex(entries);

test('searchPicker filtering is fuzzy stable and value-agnostic', () => {
  assert.deepEqual(
    searchPickerWindow({ searchPickerIndex: index, query: { text: 'term', mode: 'fuzzy' } }).entries.map((entry) => entry.id),
    ['toggle-terminal']
  );
  assert.deepEqual(
    searchPickerWindow({ searchPickerIndex: index, query: { text: 'rt', mode: 'fuzzy' } }).entries.map((entry) => entry.id),
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

  const measuredIndex = createSearchPickerIndex([measuredEntry]);
  assert.deepEqual(searchPickerWindow({ searchPickerIndex: measuredIndex, query: { text: 'measured', mode: 'fuzzy' } }).entries.map((entry) => entry.id), ['measured']);
  assert.deepEqual(searchPickerWindow({ searchPickerIndex: measuredIndex, query: { text: 'stable', mode: 'fuzzy' } }).entries.map((entry) => entry.id), ['measured']);
  assert.equal(labelReads, 1);
});

test('searchPickerWindow bounds visible entries around stable id selection and scroll', () => {
  const windowIndex = createSearchPickerIndex(entries.map((entry) => ({
    ...entry,
    disabled: false
  })));
  const centered = searchPickerWindow({ searchPickerIndex: windowIndex, activeId: 'run-tests', limit: 2 });
  assert.equal(centered.totalCount, 3);
  assert.deepEqual(centered.entries.map((entry) => entry.id), ['toggle-terminal', 'run-tests']);
  assert.equal(centered.activeIndex, 1);
  assert.equal(centered.activeEntry?.id, 'run-tests');

  const scrolled = searchPickerWindow({
    searchPickerIndex: windowIndex,
    activeId: 'run-tests',
    scroll: {
      offsetRow: 0,
      offsetColumn: 0,
      followTail: false
    },
    limit: 2
  });
  assert.deepEqual(scrolled.entries.map((entry) => entry.id), ['open-file', 'toggle-terminal']);
  assert.equal(scrolled.activeIndex, undefined);
  assert.equal(scrolled.activeEntry?.id, 'run-tests');
  assert.equal(scrolled.omittedBefore, 0);
  assert.equal(scrolled.omittedAfter, 1);

  const scrolledWithoutSelection = searchPickerWindow({
    searchPickerIndex: windowIndex,
    scroll: {
      offsetRow: 1,
      offsetColumn: 0,
      followTail: false
    },
    limit: 2
  });
  assert.equal(scrolledWithoutSelection.startIndex, 1);
  assert.equal(scrolledWithoutSelection.activeEntry?.id, 'toggle-terminal');
  assert.equal(scrolledWithoutSelection.activeIndex, 0);
});

test('searchPickerWindow rejects disabled or stale active identity in favor of an enabled entry', () => {
  for (const activeId of ['run-tests', 'missing']) {
    const window = searchPickerWindow({
      searchPickerIndex: index,
      activeId,
      limit: 3
    });

    assert.equal(window.activeEntry?.id, 'open-file');
    assert.equal(window.entries[window.activeIndex ?? -1]?.id, 'open-file');
  }
});

test('searchPicker component renders query matches disabled entries preview help empty state and accessibility', () => {
  const frame = renderElementFrame(
    searchPicker({ meta: { accessibleName: "Search" },
      id: 'searchPicker',
      title: 'Things',
      searchPickerIndex: index,
      view: { input: { text: 'run', cursor: 3 }, query: { mode: 'fuzzy' }, activeId: 'run-tests' },
      maxVisible: 2,
      helpText: 'enter accepts, escape closes',
      emptyText: 'Nothing here',
      onTransition: (action) => action
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
  assert.equal(selectedOption?.selected, undefined);
  assert.equal(selectedOption?.current, false);
  assert.equal(selectedOption?.disabled, true);
  assert.deepEqual(selectedOption?.position, {
    positionInSet: 1,
    setSize: 1,
    group: 'Workspace'
  });
  assert.equal(selectedOption?.value, undefined);
});

test('searchPicker preserves explicit scroll while accepting an off-window active item', async () => {
  const manyEntries = Array.from({ length: 5 }, (_, entryIndex) => ({
    id: String(entryIndex),
    label: `Entry ${String(entryIndex)}`,
    value: entryIndex
  }));
  const manyIndex = createSearchPickerIndex(manyEntries);
  const scroll = {
    offsetRow: 0,
    offsetColumn: 0,
    followTail: false
  };
  const app = defineTui({
    id: 'windowed-search-picker',
    init: () => ({ state: ({ actions: [] }) }),
    update: (state, action) => ({ state: { actions: [...state.actions, action] } }),
    view: () => searchPicker({ meta: { accessibleName: "Search" },
      id: 'windowed-picker',
      searchPickerIndex: manyIndex,
      view: { input: { text: '', cursor: 0 }, query: { mode: 'fuzzy' }, activeId: '4', scroll },
      maxVisible: 3,
      onTransition: (action) => action,
      onAccept: (event) => event
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

  assert.deepEqual([...visibleIds], ['0', '1', '2']);
  assert.equal(runtime.frame().cells.some((cell) =>
    cell.source?.itemId === '4' && cell.source.interactionState === 'active'
  ), false);
  assert.deepEqual(runtime.state().actions[0], { kind: 'accept', id: '4' });
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
  const measuredIndex = createSearchPickerIndex(measuredEntries);
  const elementForQuery = (query) => searchPicker({ meta: { accessibleName: "Search" },
    id: 'measured-searchPicker',
      searchPickerIndex: measuredIndex,
    view: { input: { text: query, cursor: query.length }, query: { mode: 'fuzzy' } },
    onTransition: (action) => action
  });

  renderElementFrame(elementForQuery('entry'), { columns: 60, rows: 12 });
  renderElementFrame(elementForQuery('entry-9'), { columns: 60, rows: 12 });

  assert.equal(labelReads, measuredEntries.length);
});

test('searchPicker component renders empty states for unrelated queries', () => {
  const frame = renderElementFrame(
    searchPicker({ meta: { accessibleName: "Search" },
      id: 'searchPicker',
      searchPickerIndex: index,
      view: { input: { text: 'zz', cursor: 2 }, query: { mode: 'fuzzy' } },
      emptyText: 'No available entries',
      onTransition: (action) => action
    }),
    { columns: 32, rows: 4 }
  );

  const text = frame.cells.map((cell) => cell.text).join('');
  assert.match(text, /No available entries/u);
  assert.equal(frame.cells.find((cell) => cell.text === 'N')?.source?.description, 'empty');
});

test('searchPicker exposes enabled visible entry hit targets when toMessage is provided', () => {
  const frame = renderElementFrame(
    searchPicker({ meta: { accessibleName: "Search" },
      id: 'commands',
      searchPickerIndex: index,
      view: { input: { text: '', cursor: 0 }, query: { mode: 'fuzzy' } },
      maxVisible: 3,
      onTransition: (action) => ({ kind: 'action', action })
    }),
    { columns: 48, rows: 6 }
  );

  assert.deepEqual(frame.hitTargets?.map((target) => target.id), [
    'commands:query',
    'commands:open-file',
    'commands:toggle-terminal',
    'commands:scroll:content'
  ]);
});

test('busy searchPicker exposes no editable, option, or scrollbar hit targets', () => {
  const frame = renderElementFrame(searchPicker({
    id: 'busy-search',
    meta: { accessibleName: 'Search' },
    searchPickerIndex: index,
    view: { input: { text: 'open', cursor: 4 }, query: { mode: 'fuzzy' } },
    busy: true,
    onTransition: (transition) => transition,
  }), { columns: 48, rows: 6 });

  assert.deepEqual(frame.hitTargets ?? [], []);
});

test('searchPicker query exposes shared word-selection and context-menu semantics', () => {
  const regions = renderElementRegions(searchPicker({ meta: { accessibleName: 'Search' },
    id: 'search-pointer-semantics',
    searchPickerIndex: index,
    view: {
      input: {
        text: 'alpha bravo',
        cursor: 0,
        selection: { startOffset: 0, endOffsetExclusive: 5 },
      },
      query: { mode: 'fuzzy' },
    },
    onTransition: (transition) => ({ transition }),
    onContextMenu: (event) => ({ context: event }),
  }), { columns: 32, rows: 5 });
  const target = regions.flatMap((region) => region.hitTargets)
    .find((candidate) => candidate.id === 'search-pointer-semantics:query');
  assert.ok(target);
  const event = {
    kind: 'click',
    clickCount: 2,
    source: 'mouse',
    row: target.bounds.row,
    column: target.bounds.column + 9,
    localRow: 1,
    localColumn: 10,
    button: 'left',
    modifiers: { shift: false, alt: false, ctrl: false },
    deltaRows: 0,
    deltaColumns: 0,
    targetId: target.id,
    raw: {
      kind: 'mouse',
      sequence: '',
      encoding: 'sgr',
      action: 'release',
      button: 'left',
      row: target.bounds.row,
      column: target.bounds.column + 9,
      rawCode: 0,
      modifiers: { shift: false, alt: false, ctrl: false },
    },
  };

  assert.deepEqual(target.message(event)?.transition, {
    kind: 'pointer',
    transition: { kind: 'endSelection', anchor: 6, offset: 11 },
  });
  assert.deepEqual(target.message({ ...event, kind: 'contextMenu', button: 'right' })?.context, {
    kind: 'contextMenu',
    offset: 7,
    selection: { startOffset: 0, endOffsetExclusive: 5 },
    row: target.bounds.row,
    column: target.bounds.column + 9,
    modifiers: { shift: false, alt: false, ctrl: false },
  });
});

test('searchPicker emits compact controlled transitions while acceptance remains caller-controlled', async () => {
  const app = defineTui({
    id: 'searchPicker-actions',
    init: () => ({ state: ({ messages: [] }) }),
    update: (state, message) => ({ state: { messages: [...state.messages, message] } }),
    view: () => searchPicker({ meta: { accessibleName: "Search" },
      id: 'commands',
      searchPickerIndex: index,
      view: { input: { text: '', cursor: 0 }, query: { mode: 'fuzzy' }, activeId: 'open-file' },
      onTransition: (action) => ({ kind: 'action', action }),
      onAccept: (event) => ({ kind: 'accept', event })
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
    { kind: 'action', action: { kind: 'edit', operation: { kind: 'insert', text: 'o' } } },
    { kind: 'action', action: { kind: 'edit', operation: { kind: 'insert', text: 'pen' } } },
    { kind: 'action', action: { kind: 'edit', operation: { kind: 'deleteBackward' } } },
    { kind: 'action', action: { kind: 'moveActive', delta: 1 } },
    { kind: 'accept', event: { kind: 'accept', id: 'open-file' } }
  ]);
});
