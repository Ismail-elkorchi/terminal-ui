import assert from 'node:assert/strict';
import test from 'node:test';
import { createTuiRuntime, defineTui } from '../../dist/tui/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import {
  createScrollState,
  listboxReducer,
  listViewReducer,
  measuredWindow,
  prepareMeasuredCollection,
  prepareListboxCollection
} from '../../dist/behavior/index.js';
import { renderElementFrame, renderFramePlain } from '../../dist/renderer/index.js';
import { layoutElement } from '../../dist/renderer/internal/layout.js';
import { renderElementRegions } from '../../dist/renderer/internal/render.js';
import { button, list, listbox, listView, text } from '../../dist/components/index.js';
import { column } from '../../dist/layout/index.js';
import { prepareCollectionInteractionIndex } from '../../dist/interaction/index.js';

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
  const collection = prepareMeasuredCollection([
    { id: 'first', rows: 2, value: { label: 'First', content: text({ content: 'First A\nFirst B' }) } },
    { id: 'second', rows: 1, value: { label: 'Second', content: text({ content: 'Second' }) } },
    { id: 'third', rows: 2, value: { label: 'Third', content: text({ content: 'Third A\nThird B' }) } }
  ]);
  const window = measuredWindow(collection, { viewportRows: 3, activeId: 'third' });
  const frame = renderElementFrame(listView({ meta: { accessibleName: "List" },
    id: 'activity',
    window,
    renderItem: (item) => item.value,
    presentation: {
      activeId: 'third',
      selection: { mode: 'single', selectedId: 'first' },
      scroll: createScrollState({ offsetRow: window.offsetRow })
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

test('listView clips partial measured items at both viewport edges', () => {
  const collection = prepareMeasuredCollection([
    { id: 'first', rows: 3, value: { label: 'First', content: text({ content: 'A1\nA2\nA3' }) } },
    { id: 'second', rows: 3, value: { label: 'Second', content: text({ content: 'B1\nB2\nB3' }) } }
  ]);
  const window = measuredWindow(collection, { viewportRows: 3, offsetRow: 1 });
  const frame = renderElementFrame(listView({ meta: { accessibleName: "List" },
    id: 'clipped-items',
    window,
    renderItem: (item) => item.value,
    presentation: {
      selection: { mode: 'none' },
      scroll: createScrollState({ offsetRow: window.offsetRow })
    },
    scrollbar: { visible: 'always' },
    onTransition: (transition) => transition
  }), { columns: 12, rows: 3 });

  assert.deepEqual(renderFramePlain(frame).split('\n').map((line) => line.slice(0, 4)), [
    '  A2',
    '  A3',
    '  B1'
  ]);
  assert.deepEqual(frame.accessibility.root.children?.map((item) => item.id), [
    'clipped-items:item:first',
    'clipped-items:item:second'
  ]);
  assert.deepEqual(frame.hitTargets?.filter((target) => target.id.includes(':item:')).map((target) => target.bounds), [
    { row: 1, column: 1, width: 11, height: 2 },
    { row: 3, column: 1, width: 11, height: 1 }
  ]);
});

test('listView translates an oversized item through its clipped viewport', () => {
  const collection = prepareMeasuredCollection([{
    id: 'oversized',
    rows: 5,
    value: { content: text({ id: 'oversized-content', content: 'one\ntwo\nthree\nfour\nfive' }) }
  }]);
  const window = measuredWindow(collection, { viewportRows: 3, offsetRow: 1 });
  const frame = renderElementFrame(listView({ meta: { accessibleName: "List" },
    id: 'oversized-list',
    window,
    renderItem: (item) => item.value,
    presentation: {
      activeId: 'oversized',
      selection: { mode: 'none' },
      scroll: createScrollState({ offsetRow: window.offsetRow })
    },
    onTransition: (transition) => transition
  }), { columns: 12, rows: 3 });

  assert.equal(renderFramePlain(frame).split('\n').map((line) => line.trimEnd()).join('\n'), '› two\n  three\n  four');
  assert.equal(frame.accessibility.root.activeDescendant, 'oversized-list:item:oversized');
  assert.equal(frame.accessibility.root.children?.[0]?.children?.[0]?.id, 'oversized-content');
});

test('listView translates nested pointer targets in a clipped item', () => {
  const collection = prepareMeasuredCollection([{
    id: 'action',
    rows: 2,
    value: {
      content: column([
        text({ content: 'heading' }),
        button({ id: 'clipped-action', label: 'Run', onAction: () => ({ kind: 'run' }) })
      ])
    }
  }]);
  const window = measuredWindow(collection, { viewportRows: 1, offsetRow: 1 });
  const element = listView({ meta: { accessibleName: "List" },
    id: 'clipped-actions',
    window,
    renderItem: (item) => item.value,
    presentation: {
      selection: { mode: 'none' },
      scroll: createScrollState({ offsetRow: window.offsetRow })
    },
    onTransition: (transition) => transition
  });
  const frame = renderElementFrame(element, { columns: 16, rows: 1 });
  const target = renderElementRegions(element, { columns: 16, rows: 1 })
    .flatMap((region) => region.hitTargets)
    .find((candidate) => candidate.id === 'clipped-action:control');

  assert.match(renderFramePlain(frame), /Run/u);
  assert.deepEqual(target?.bounds, { row: 1, column: 3, width: 14, height: 1 });
  assert.deepEqual(target?.message({ kind: 'click' }), { kind: 'run' });
});

test('listView intrinsic height is the supplied viewport and off-window activity remains valid', () => {
  const collection = prepareMeasuredCollection([
    { id: 'first', rows: 50, value: { content: text({ content: Array(50).fill('first').join('\n') }) } },
    { id: 'second', rows: 50, value: { content: text({ content: Array(50).fill('second').join('\n') }) } }
  ]);
  const window = measuredWindow(collection, { viewportRows: 3 });
  const view = listView({ meta: { accessibleName: "List" },
    id: 'intrinsic-list',
    window,
    renderItem: (item) => item.value,
    presentation: { selection: { mode: 'none' } },
    onTransition: (transition) => transition
  });
  const layout = layoutElement(column([view, text({ content: 'footer' })], {
    sizes: [{ kind: 'content' }, { kind: 'content' }]
  }), { columns: 20, rows: 4 });

  assert.equal(layout.children[0]?.bounds.height, 3);
  assert.equal(layout.children[1]?.bounds.row, 4);
  const offWindowActive = listView({ meta: { accessibleName: "List" },
    id: 'invalid-active-list',
    window,
    renderItem: (item) => item.value,
    presentation: { activeId: 'second', selection: { mode: 'none' } },
    onTransition: (transition) => transition
  });
  assert.equal(
    renderElementFrame(offWindowActive, { columns: 20, rows: 3 }).accessibility.root.activeDescendant,
    undefined,
  );
  assert.throws(() => listView({ meta: { accessibleName: "List" },
    id: 'invalid-horizontal-list',
    window,
    renderItem: (item) => item.value,
    presentation: { selection: { mode: 'none' }, scroll: createScrollState() },
    scrollbar: { axis: 'horizontal' },
    onTransition: (transition) => transition
  }), /scrollbar axis must be vertical/u);
});

test('listView owns retained multiple-selection state at construction', () => {
  const selectedIds = ['first'];
  const window = measuredWindow(prepareMeasuredCollection([
    { id: 'first', rows: 1, value: { content: text({ content: 'First' }) } },
    { id: 'second', rows: 1, value: { content: text({ content: 'Second' }) } }
  ]), { viewportRows: 2 });
  const element = listView({ meta: { accessibleName: "List" },
    id: 'owned-list-view-selection',
    window,
    renderItem: (item) => item.value,
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
  const index = prepareCollectionInteractionIndex(['first', 'second']);
  const collection = prepareMeasuredCollection([
    { id: 'first', rows: 1, value: 'First' },
    { id: 'second', rows: 1, value: 'Second' }
  ]);
  const moved = listViewReducer(state, { kind: 'moveActive', delta: 1 }, {
    index,
    collection,
    viewportRows: 1,
  });
  const committed = listViewReducer(moved, { kind: 'commitActive' }, {
    index,
    collection,
    viewportRows: 1,
  });
  const actionWindow = measuredWindow(prepareMeasuredCollection([{
    id: 'row', rows: 1,
    value: { content: button({ id: 'row-action', label: 'Run', onAction: () => ({ kind: 'run' }) }) }
  }]), { viewportRows: 1 });
  const actionList = listView({ meta: { accessibleName: "List" },
    id: 'actions',
    window: actionWindow,
    renderItem: (item) => item.value,
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

test('listView reducer returns controlled reveal scroll and rejects conflicting row geometry', () => {
  const collection = prepareMeasuredCollection([
    { id: 'first', rows: 2, value: 'First' },
    { id: 'second', rows: 2, value: 'Second' }
  ]);
  const moved = listViewReducer({
    activeId: 'first',
    selection: { mode: 'none' },
    scroll: createScrollState()
  }, { kind: 'moveActive', delta: 1 }, {
    index: prepareCollectionInteractionIndex(['first', 'second']),
    collection,
    viewportRows: 2
  });
  assert.equal(moved.activeId, 'second');
  assert.equal(moved.scroll.offsetRow, 2);
  assert.equal(listViewReducer(moved, {
    kind: 'scroll',
    event: { nextState: moved.scroll, source: 'wheel', target: 'content' }
  }, {
    index: prepareCollectionInteractionIndex(['first', 'second']),
    collection,
    viewportRows: 2
  }), moved);

  const window = measuredWindow(collection, {
    viewportRows: 2,
    offsetRow: moved.scroll.offsetRow
  });
  assert.throws(() => renderElementFrame(listView({ meta: { accessibleName: "List" },
    id: 'height-mismatch',
    window,
    renderItem: (item) => ({ content: text({ content: item.value }) }),
    presentation: { selection: { mode: 'none' }, scroll: moved.scroll },
    onTransition: (transition) => transition
  }), { columns: 20, rows: 2 }), /declares 2/u);
});

test('windowed collection uses its declared external projection query', () => {
  const collection = prepareListboxCollection(
    ['Item 100'],
    (item, index) => ({ id: String(index), label: item }),
    {
      startIndex: 100,
      totalCount: 1_000,
      domain: { kind: 'projection', query: { text: 'item', mode: 'contains' } }
    }
  );
  const frame = renderElementFrame(listbox({ meta: { accessibleName: "List" },
    id: 'window-filter',
    collection,
    presentation: { selection: { mode: 'none' } },
    onTransition: (transition) => transition
  }), { columns: 24, rows: 2 });

  assert.match(renderFramePlain(frame), /Item 100/u);
});

test('listbox component filters items and can use explicit shared scroll state', () => {
  const frame = renderElementFrame(listbox({ meta: { accessibleName: "List" },
    projectItem: (item) => ({ id: String(item), label: String(item) }),
    id: 'filtered-listbox',
    items: ['alpha', 'bravo', 'charlie', 'delta'],
    query: { text: 'a' },
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
  const frame = renderElementFrame(listbox({ meta: { accessibleName: "List" },
    projectItem: (item) => ({ id: String(item), label: String(item) }),
    id: 'items',
    items: ['Atlas', 'Pulse'],
    presentation: { activeId: 'Atlas', selection: { mode: 'single', selectedId: 'Atlas' } },
    query: { text: 'at' },
    onTransition: (transition) => transition
  }), { columns: 24, rows: 2 });
  const emptyFrame = renderElementFrame(listbox({ meta: { accessibleName: "List" },
    projectItem: (item) => ({ id: String(item), label: String(item) }),
    id: 'empty-items',
    items: [],
    presentation: { selection: { mode: 'none' } },
    query: { text: 'missing' },
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
  const frame = renderElementFrame(listbox({ meta: { accessibleName: "List" },
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
    query: { text: 'metrics' },
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
  const frame = renderElementFrame(listbox({ meta: { accessibleName: "List" },
    projectItem: (item) => ({ id: String(item), label: String(item) }),
    id: 'clickable-listbox',
    items: ['alpha', 'bravo', 'charlie', 'delta'],
    query: { text: 'br' },
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
    init: () => ({ state: ({ selected: 'none' }) }),
    update: (_state, message) => ({
      state: { selected: message.action.id }
    }),
    view: () => listbox({ meta: { accessibleName: "List" },
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

  assert.equal(press.handled, true);
  assert.equal(press.state.selected, 'bravo');
  assert.equal(release.state.selected, 'bravo');
});

test('listbox active position and committed selection use stable identity across data changes', () => {
  const items = ['alpha', 'bravo', 'charlie'];
  const projectItem = (item) => ({ id: item, label: item });
  const selected = listboxReducer(
    { activeId: 'bravo', selection: { mode: 'single', selectedId: 'bravo' } },
    { kind: 'commitActive' },
    { items, projectItem }
  );
  const reordered = [items[2], items[1], items[0]];
  const moved = listboxReducer(selected, { kind: 'moveActive', delta: 1 }, { items: reordered, projectItem });
  const inserted = ['delta', ...reordered];
  const filtered = listboxReducer(selected, { kind: 'moveActive', delta: 1 }, {
    items: inserted,
    projectItem,
    query: { text: 'bravo' }
  });
  const deleted = inserted.filter((item) => item !== 'bravo');
  const recovered = listboxReducer(selected, { kind: 'moveActive', delta: 1 }, { items: deleted, projectItem });

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
    query: { text: 'visible' },
    pageSize: 1
  });
  const paged = listboxReducer(first, { kind: 'pageActive', delta: 1 }, {
    items,
    projectItem,
    query: { text: 'visible' },
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
    pageSize: 10
  });

  assert.equal(selected.selection.selectedId, '100');
  assert.equal(selected.scroll.offsetRow, 91);
});

test('listbox pointer selection and double-click activation match keyboard semantics', async () => {
  const app = defineTui({
    id: 'listbox-pointer-activation',
    init: () => ({ state: ({ actions: [] }) }),
    update: (state, message) => ({ state: { actions: [...state.actions, message] } }),
    view: () => listbox({ meta: { accessibleName: "List" },
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
    { kind: 'setActive', id: 'alpha' },
    { kind: 'activate', id: 'alpha', itemIndex: 0 }
  ]);
});

test('listbox preserves the component runtime rejection of null application messages', async () => {
  const app = defineTui({
    id: 'listbox-null-message',
    init: () => ({ state: undefined }),
    update: (state) => ({ state }),
    view: () => listbox({ meta: { accessibleName: "List" },
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
    await assert.rejects(
      runtime.handleInput(mousePress(1, 1)),
      /onAction returned null or undefined.*ignoreMessage/u
    );
  } finally {
    await runtime.dispose();
  }
});
