import assert from 'node:assert/strict';
import test from 'node:test';
import { createTuiRuntime, defineTui } from '../../dist/tui/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import {
  createScrollState,
  listboxReducer,
  listViewReducer,
  prepareListboxCollection
} from '../../dist/behavior/index.js';
import { renderElementFrame, renderFramePlain } from '../../dist/renderer/index.js';
import { renderElementRegions } from '../../dist/renderer/internal/render.js';
import { button, list, listbox, listView, text } from '../../dist/components/index.js';

const mousePress = (row, column) => ({
  kind: 'mouse',
  sequence: '',
  encoding: 'sgr',
  action: 'press',
  button: 'left',
  row,
  column,
  rawCode: 0,
  modifiers: { shift: false, alt: false, ctrl: false }
});
const mouseRelease = (row, column) => ({
  kind: 'mouse',
  sequence: '',
  encoding: 'sgr',
  action: 'release',
  button: 'none',
  row,
  column,
  rawCode: 0,
  modifiers: { shift: false, alt: false, ctrl: false }
});

async function clickAt(runtime, row, column) {
  await runtime.handleInput(mousePress(row, column));
  return runtime.handleInput(mouseRelease(row, column));
}

test('passive list preserves arbitrary child semantics without interaction', () => {
  const frame = renderElementFrame(list({
    id: 'release-notes',
    ordered: true,
    items: [
      { id: 'one', label: 'First change', content: text({ content: 'First\nchange' }) },
      { id: 'two', label: 'Second change', content: text({ content: 'Second change' }) }
    ]
  }), { columns: 24, rows: 4 });

  assert.match(renderFramePlain(frame), /1\. First\n   change/u);
  assert.equal(frame.accessibility.root.role, 'list');
  assert.deepEqual(frame.accessibility.root.children?.map((item) => item.role), ['listitem', 'listitem']);
  assert.equal(frame.focusPath, undefined);
  assert.equal(frame.hitTargets?.length ?? 0, 0);
});

test('listView measures arbitrary rows and derives one active-item scroll window', () => {
  const frame = renderElementFrame(listView({
    id: 'activity',
    items: [
      { id: 'first', label: 'First', content: text({ content: 'First A\nFirst B' }) },
      { id: 'second', label: 'Second', content: text({ content: 'Second' }) },
      { id: 'third', label: 'Third', content: text({ content: 'Third A\nThird B' }) }
    ],
    presentation: {
      activeId: 'third',
      selection: { mode: 'single', selectedId: 'first' },
      scroll: createScrollState()
    },
    scrollbar: { visible: 'always' },
    onTransition: (transition) => transition
  }), { columns: 20, rows: 3 });

  const output = renderFramePlain(frame);
  assert.doesNotMatch(output, /First/u);
  assert.match(output, /Second/u);
  assert.match(output, /Third A/u);
  assert.match(output, /Third B/u);
  assert.equal(frame.accessibility.root.activeDescendant, 'activity:item:third');
  assert.deepEqual(frame.accessibility.root.children?.map((item) => item.id), [
    'activity:item:second',
    'activity:item:third'
  ]);
  assert.equal(
    frame.hitTargets?.find((target) => target.id === 'activity:scroll:content')?.bounds.height,
    3
  );
  assert.equal(
    frame.hitTargets?.find((target) => target.id === 'activity:scrollbar:vertical:thumb')?.bounds.row,
    3
  );
});

test('listView owns retained multiple-selection state at construction', () => {
  const selectedIds = ['first'];
  const element = listView({
    id: 'owned-list-view-selection',
    items: [
      { id: 'first', content: text({ content: 'First' }) },
      { id: 'second', content: text({ content: 'Second' }) }
    ],
    presentation: {
      selection: { mode: 'multiple', selectedIds, anchorId: 'first' }
    },
    onTransition: (transition) => transition
  });

  selectedIds.splice(0, selectedIds.length, 'second');

  const frame = renderElementFrame(element, { columns: 20, rows: 2 });
  assert.deepEqual(frame.accessibility.root.children?.map((item) => item.selected), [true, false]);
});

test('listView reducer separates active position, committed selection, and child actions', () => {
  const state = {
    activeId: 'first',
    selection: { mode: 'single', selectedId: 'first' }
  };
  const items = [{ id: 'first' }, { id: 'second' }];
  const moved = listViewReducer(state, { kind: 'moveActive', delta: 1 }, {
    items,
    selection: { mode: 'single', commitment: 'manual' }
  });
  const committed = listViewReducer(moved, { kind: 'commitActive' }, {
    items,
    selection: { mode: 'single', commitment: 'manual' }
  });
  const actionList = listView({
    id: 'actions',
    items: [{
      id: 'row',
      content: button({ id: 'row-action', label: 'Run', onAction: () => ({ kind: 'run' }) })
    }],
    presentation: { activeId: 'row', selection: { mode: 'none' } },
    onTransition: (transition) => transition
  });
  const actionTarget = renderElementRegions(actionList, { columns: 16, rows: 1 })
    .flatMap((region) => region.hitTargets)
    .find((target) => target.id === 'row-action:control');

  assert.equal(moved.activeId, 'second');
  assert.deepEqual(moved.selection, { mode: 'single', selectedId: 'first' });
  assert.deepEqual(committed.selection, { mode: 'single', selectedId: 'second' });
  assert.deepEqual(
    actionTarget?.message({ kind: 'click' }),
    { kind: 'run' }
  );
});

test('windowed collection uses its declared external projection query', () => {
  const collection = prepareListboxCollection(
    ['Item 100'],
    (item, index) => ({ id: String(index), label: item }),
    {
      startIndex: 100,
      totalCount: 1_000,
      domain: { kind: 'projection', id: 'items:item', filterQuery: 'item' }
    }
  );
  const frame = renderElementFrame(listbox({
    id: 'window-filter',
    collection,
    presentation: { selection: { mode: 'none' } },
    onTransition: (transition) => transition
  }), { columns: 24, rows: 2 });

  assert.match(renderFramePlain(frame), /Item 100/u);
});

test('listbox component filters items and can use explicit shared scroll state', () => {
  const frame = renderElementFrame(listbox({
    projectItem: (item) => ({ id: String(item), label: String(item) }),
    id: 'filtered-listbox',
    items: ['alpha', 'bravo', 'charlie', 'delta'],
    filterQuery: { text: 'a' },
    presentation: {
      selection: { mode: 'none' },
      scroll: createScrollState({ offsetRow: 1 })
    },
    onTransition: (transition) => transition
  }), { columns: 24, rows: 2 });

  const output = renderFramePlain(frame);
  assert.match(output, /bravo/u);
  assert.match(output, /charlie/u);
  assert.doesNotMatch(output, /alpha/u);
  assert.equal(frame.accessibility.root.description, 'Showing 2-3 of 4 items.');
});

test('listbox component exposes source-aware row values matches and empty filter state', () => {
  const frame = renderElementFrame(listbox({
    projectItem: (item) => ({ id: String(item), label: String(item) }),
    id: 'items',
    items: ['Atlas', 'Pulse'],
    presentation: { activeId: 'Atlas', selection: { mode: 'single', selectedId: 'Atlas' } },
    filterQuery: { text: 'at' },
    onTransition: (transition) => transition
  }), { columns: 24, rows: 2 });
  const emptyFrame = renderElementFrame(listbox({
    projectItem: (item) => ({ id: String(item), label: String(item) }),
    id: 'empty-items',
    items: [],
    presentation: { selection: { mode: 'none' } },
    filterQuery: { text: 'missing' },
    onTransition: (transition) => transition
  }), { columns: 24, rows: 2 });

  const marker = frame.cells.find((cell) => cell.source?.description === 'item.Atlas.marker');
  assert.equal(marker?.text, ' ');
  assert.equal(marker?.style?.bg?.token, 'selection.background');
  assert.equal(frame.cells.find((cell) => cell.text === 'A')?.source?.description, 'item.Atlas.match');
  assert.equal(frame.cells.find((cell) => cell.text === 'l')?.source?.description, 'item.Atlas.value');
  assert.equal(emptyFrame.cells.find((cell) => cell.text === 'N')?.source?.description, 'filter.empty');
  assert.match(renderFramePlain(emptyFrame), /No matching items/u);
});

test('listbox projects object values once for visible text filtering and accessibility', () => {
  const frame = renderElementFrame(listbox({
    id: 'object-listbox',
    items: [
      { key: 'atlas', title: 'Atlas', detail: 'Primary workspace', aliases: ['north'] },
      { key: 'pulse', title: 'Pulse', detail: 'Telemetry workspace', aliases: ['metrics'] }
    ],
    projectItem: (item) => ({
      id: item.key,
      label: item.title,
      description: item.detail,
      keywords: item.aliases
    }),
    presentation: { selection: { mode: 'none' } },
    filterQuery: { text: 'metrics' },
    onTransition: (transition) => transition
  }), { columns: 32, rows: 3 });

  const output = renderFramePlain(frame);
  assert.match(output, /Pulse/u);
  assert.match(output, /Telemetry workspace/u);
  assert.doesNotMatch(output, /\[object Object\]/u);
  assert.equal(frame.accessibility.root.children?.[0]?.label, 'Pulse');
  assert.equal(frame.accessibility.root.children?.[0]?.description, 'Telemetry workspace');
});

test('listbox cursor and mouse hit targets use the filtered visible rows', async () => {
  const frame = renderElementFrame(listbox({
    projectItem: (item) => ({ id: String(item), label: String(item) }),
    id: 'clickable-listbox',
    items: ['alpha', 'bravo', 'charlie', 'delta'],
    filterQuery: { text: 'br' },
    presentation: { activeId: 'bravo', selection: { mode: 'single', selectedId: 'bravo' } },
    onTransition: (action) => ({ kind: 'chosen', action })
  }), { columns: 24, rows: 2 });

  assert.deepEqual(frame.cursor, {
    row: 1,
    column: 1,
    source: {
      elementId: 'clickable-listbox',
      elementKind: 'terminal-ui/components/listbox',
      rendererFamily: 'component',
      cellRole: 'cursor',
      partName: 'cursor',
      partType: 'cursor',
      description: 'cursor'
    }
  });
  assert.deepEqual(
    frame.hitTargets?.filter((target) => target.id.includes(':option:')).map((target) => target.id),
    ['clickable-listbox:option:bravo']
  );

  const app = defineTui({
    id: 'listbox-click-flow',
    init: () => ({ selected: 'none' }),
    update: (_state, message) => ({
      state: { selected: message.action.id }
    }),
    view: () => listbox({
    projectItem: (item) => ({ id: String(item), label: String(item) }),
    id: 'clickable-listbox',
      items: ['alpha', 'bravo'],
      presentation: { selection: { mode: 'single' } },
      onTransition: (action) => ({ kind: 'chosen', action })
    })
  });
  const runtime = createTuiRuntime({ app, host: createMemoryTerminalHost({ terminalSize: { columns: 24, rows: 2 } }) });

  await runtime.start();
  const press = await runtime.handleInput(mousePress(2, 1));
  const release = await runtime.handleInput(mouseRelease(2, 1));

  assert.equal(press.handled, false);
  assert.equal(release.state.selected, 'bravo');
});

test('listbox active position and committed selection use stable identity across data changes', () => {
  const items = ['alpha', 'bravo', 'charlie'];
  const projectItem = (item) => ({ id: item, label: item });
  const policy = { mode: 'single', commitment: 'manual' };
  const selected = listboxReducer(
    { activeId: 'bravo', selection: { mode: 'single', selectedId: 'bravo' } },
    { kind: 'commitActive' },
    { items, projectItem, selection: policy }
  );
  const reordered = [items[2], items[1], items[0]];
  const moved = listboxReducer(selected, { kind: 'moveActive', delta: 1 }, { items: reordered, projectItem, selection: policy });
  const inserted = ['delta', ...reordered];
  const filtered = listboxReducer(selected, { kind: 'moveActive', delta: 1 }, {
    items: inserted,
    projectItem,
    filterQuery: { text: 'bravo' },
    selection: policy
  });
  const deleted = inserted.filter((item) => item !== 'bravo');
  const recovered = listboxReducer(selected, { kind: 'moveActive', delta: 1 }, { items: deleted, projectItem, selection: policy });

  assert.equal(selected.selection.selectedId, 'bravo');
  assert.equal(moved.activeId, 'alpha');
  assert.equal(moved.selection.selectedId, 'bravo');
  assert.equal(filtered.activeId, 'bravo');
  assert.equal(recovered.activeId, 'delta');
});

test('filtered listbox scrolling uses visible positions instead of sparse source indexes', () => {
  const items = Array.from({ length: 1_000 }, (_value, index) => ({
    id: `item-${index}`,
    label: index === 500 || index === 700 || index === 900 ? `visible-${index}` : `hidden-${index}`,
    disabled: index === 700
  }));
  const projectItem = (item) => ({
    id: item.id,
    label: item.label,
    disabled: item.disabled
  });
  const base = {
    activeId: 'item-500',
    selection: { mode: 'single', selectedId: 'item-500' },
    scroll: createScrollState()
  };

  const first = listboxReducer(base, { kind: 'commitActive' }, {
    items,
    projectItem,
    filterQuery: { text: 'visible' },
    selection: { mode: 'single', commitment: 'manual' },
    pageSize: 1
  });
  const paged = listboxReducer(first, { kind: 'pageActive', delta: 1 }, {
    items,
    projectItem,
    filterQuery: { text: 'visible' },
    selection: { mode: 'single', commitment: 'manual' },
    pageSize: 1
  });

  assert.equal(first.selection.selectedId, 'item-500');
  assert.equal(first.scroll.offsetRow, 0);
  assert.equal(paged.activeId, 'item-900');
  assert.equal(paged.selection.selectedId, 'item-500');
  assert.equal(paged.scroll.offsetRow, 2);
});

test('windowed listbox active position keeps global collection identity while scroll stays positional', () => {
  const collection = prepareListboxCollection(
    ['Item 100', 'Item 101'],
    (item, index) => ({ id: String(index), label: item }),
    { startIndex: 100, totalCount: 1_000, domain: { kind: 'source' } }
  );
  const state = {
    activeId: '100',
    selection: { mode: 'single' },
    scroll: createScrollState()
  };

  const selected = listboxReducer(state, { kind: 'commitActive' }, {
    collection,
    selection: { mode: 'single', commitment: 'manual' },
    pageSize: 10
  });

  assert.equal(selected.selection.selectedId, '100');
  assert.equal(selected.scroll.offsetRow, 91);
});

test('listbox pointer selection and double-click activation match keyboard semantics', async () => {
  const app = defineTui({
    id: 'listbox-pointer-activation',
    init: () => ({ actions: [] }),
    update: (state, message) => ({ state: { actions: [...state.actions, message] } }),
    view: () => listbox({
      id: 'activation-listbox',
      items: ['alpha'],
      projectItem: (item) => ({ id: item, label: item }),
      presentation: { selection: { mode: 'single' } },
      onTransition: (action) => action,
      onActivate: (event) => event
    })
  });
  const runtime = createTuiRuntime({ app, host: createMemoryTerminalHost({ terminalSize: { columns: 20, rows: 2 } }) });

  await runtime.start();
  await clickAt(runtime, 1, 1);
  await clickAt(runtime, 1, 1);

  assert.deepEqual(runtime.state().actions, [
    { kind: 'setActive', id: 'alpha' },
    { kind: 'activate', id: 'alpha', itemIndex: 0 }
  ]);
});

test('listbox preserves the component runtime rejection of null application messages', async () => {
  const app = defineTui({
    id: 'listbox-null-message',
    init: () => undefined,
    update: (state) => ({ state }),
    view: () => listbox({
      id: 'null-listbox',
      items: ['alpha'],
      projectItem: (item) => ({ id: item, label: item }),
      presentation: { selection: { mode: 'single' } },
      onTransition: () => null
    })
  });
  const runtime = createTuiRuntime({
    app,
    host: createMemoryTerminalHost({ terminalSize: { columns: 20, rows: 2 } })
  });

  try {
    await runtime.start();
    await runtime.handleInput(mousePress(1, 1));
    await assert.rejects(
      runtime.handleInput(mouseRelease(1, 1)),
      /onAction returned null or undefined.*ignoreMessage/u
    );
  } finally {
    await runtime.dispose();
  }
});
