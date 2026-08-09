import assert from 'node:assert/strict';
import test from 'node:test';
import { createTuiRuntime, defineTui } from '../../dist/tui/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { createScrollState, listReducer, prepareListCollection } from '../../dist/behavior/index.js';
import { renderElementFrame, renderFramePlain } from '../../dist/renderer/index.js';
import { list } from '../../dist/components/index.js';

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

test('windowed collection uses its declared external projection query', () => {
  const collection = prepareListCollection(
    ['Item 100'],
    (item, index) => ({ id: String(index), label: item }),
    {
      startIndex: 100,
      totalCount: 1_000,
      domain: { kind: 'projection', id: 'items:item', filterQuery: 'item' }
    }
  );
  const frame = renderElementFrame(list({ id: 'window-filter', collection }), { columns: 24, rows: 2 });

  assert.match(renderFramePlain(frame), /Item 100/u);
});

test('list component filters items and can use explicit shared scroll state', () => {
  const frame = renderElementFrame(list({
    projectItem: (item) => ({ id: String(item), label: String(item) }),
    id: 'filtered-list',
    items: ['alpha', 'bravo', 'charlie', 'delta'],
    filterQuery: 'a',
    scroll: createScrollState({ offsetRow: 1, contentRows: 4, viewportRows: 2 })
  }), { columns: 24, rows: 2 });

  const output = renderFramePlain(frame);
  assert.match(output, /bravo/u);
  assert.match(output, /charlie/u);
  assert.doesNotMatch(output, /alpha/u);
  assert.equal(frame.accessibility.root.description, 'Showing 2-3 of 4 items.');
});

test('list component exposes source-aware row values matches and empty filter state', () => {
  const frame = renderElementFrame(list({
    projectItem: (item) => ({ id: String(item), label: String(item) }),
    id: 'items',
    items: ['Atlas', 'Pulse'],
    selectedId: 'Atlas',
    filterQuery: 'at'
  }), { columns: 24, rows: 2 });
  const emptyFrame = renderElementFrame(list({
    projectItem: (item) => ({ id: String(item), label: String(item) }),
    id: 'empty-items',
    items: [],
    filterQuery: 'missing'
  }), { columns: 24, rows: 2 });

  const marker = frame.cells.find((cell) => cell.source?.description === 'item.Atlas.marker');
  assert.equal(marker?.text, ' ');
  assert.equal(marker?.style?.bg?.token, 'selection.background');
  assert.equal(frame.cells.find((cell) => cell.text === 'A')?.source?.description, 'item.Atlas.match');
  assert.equal(frame.cells.find((cell) => cell.text === 'l')?.source?.description, 'item.Atlas.value');
  assert.equal(emptyFrame.cells.find((cell) => cell.text === 'N')?.source?.description, 'filter.empty');
  assert.match(renderFramePlain(emptyFrame), /No matching items/u);
});

test('list projects object values once for visible text filtering and accessibility', () => {
  const frame = renderElementFrame(list({
    id: 'object-list',
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
    filterQuery: 'metrics'
  }), { columns: 32, rows: 3 });

  const output = renderFramePlain(frame);
  assert.match(output, /Pulse/u);
  assert.match(output, /Telemetry workspace/u);
  assert.doesNotMatch(output, /\[object Object\]/u);
  assert.equal(frame.accessibility.root.children?.[0]?.label, 'Pulse');
  assert.equal(frame.accessibility.root.children?.[0]?.description, 'Telemetry workspace');
});

test('list cursor and mouse hit targets use the filtered visible rows', async () => {
  const frame = renderElementFrame(list({
    projectItem: (item) => ({ id: String(item), label: String(item) }),
    id: 'clickable-list',
    items: ['alpha', 'bravo', 'charlie', 'delta'],
    filterQuery: 'br',
    selectedId: 'bravo',
    onAction: (action) => ({ kind: 'chosen', action })
  }), { columns: 24, rows: 2 });

  assert.deepEqual(frame.cursor, {
    row: 1,
    column: 1,
    source: {
      elementId: 'clickable-list',
      elementKind: 'terminal-ui/components/list',
      rendererFamily: 'component',
      cellRole: 'cursor',
      partName: 'cursor',
      partType: 'cursor',
      description: 'cursor'
    }
  });
  assert.deepEqual(
    frame.hitTargets?.filter((target) => target.id.includes(':option:')).map((target) => target.id),
    ['clickable-list:option:bravo']
  );

  const app = defineTui({
    id: 'list-click-flow',
    init: () => ({ selected: 'none' }),
    update: (_state, message) => ({
      state: { selected: message.action.id }
    }),
    view: () => list({
    projectItem: (item) => ({ id: String(item), label: String(item) }),
    id: 'clickable-list',
      items: ['alpha', 'bravo'],
      onAction: (action) => ({ kind: 'chosen', action })
    })
  });
  const runtime = createTuiRuntime({ app, host: createMemoryTerminalHost({ terminalSize: { columns: 24, rows: 2 } }) });

  await runtime.start();
  const press = await runtime.handleInput(mousePress(2, 1));
  const release = await runtime.handleInput(mouseRelease(2, 1));

  assert.equal(press.handled, false);
  assert.equal(release.state.selected, 'bravo');
});

test('list selection uses stable identity across reorder, filter, insertion, and deletion', () => {
  const items = ['alpha', 'bravo', 'charlie'];
  const projectItem = (item) => ({ id: item, label: item });
  const selected = listReducer({}, { kind: 'select', id: 'bravo', itemIndex: 1 }, { items, projectItem });
  const reordered = [items[2], items[1], items[0]];
  const moved = listReducer(selected, { kind: 'move', delta: 1 }, { items: reordered, projectItem });
  const inserted = ['delta', ...reordered];
  const filtered = listReducer(selected, { kind: 'move', delta: 1 }, {
    items: inserted,
    projectItem,
    filterQuery: 'bravo'
  });
  const deleted = inserted.filter((item) => item !== 'bravo');
  const recovered = listReducer(selected, { kind: 'move', delta: 1 }, { items: deleted, projectItem });

  assert.equal(selected.selectedId, 'bravo');
  assert.equal(moved.selectedId, 'alpha');
  assert.equal(filtered.selectedId, 'bravo');
  assert.equal(recovered.selectedId, 'delta');
});

test('filtered list scrolling uses visible positions instead of sparse source indexes', () => {
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
    scroll: createScrollState({ contentRows: 3, viewportRows: 1, offsetRow: 0 })
  };

  const first = listReducer(base, { kind: 'select', id: 'item-500', itemIndex: 500 }, {
    items,
    projectItem,
    filterQuery: 'visible'
  });
  const paged = listReducer(first, { kind: 'page', delta: 1 }, {
    items,
    projectItem,
    filterQuery: 'visible'
  });

  assert.equal(first.selectedId, 'item-500');
  assert.equal(first.scroll.offsetRow, 0);
  assert.equal(paged.selectedId, 'item-900');
  assert.equal(paged.scroll.offsetRow, 2);
});

test('windowed list selection keeps global collection indexes in scroll state', () => {
  const collection = prepareListCollection(
    ['Item 100', 'Item 101'],
    (item, index) => ({ id: String(index), label: item }),
    { startIndex: 100, totalCount: 1_000, domain: { kind: 'source' } }
  );
  const state = {
    scroll: createScrollState({ contentRows: 1_000, viewportRows: 10 })
  };

  const selected = listReducer(state, { kind: 'select', id: '100', itemIndex: 100 }, { collection });

  assert.equal(selected.selectedId, '100');
  assert.equal(selected.scroll.selectedIndex, 100);
  assert.equal(selected.scroll.offsetRow, 95);
});

test('list pointer selection and double-click activation match keyboard semantics', async () => {
  const app = defineTui({
    id: 'list-pointer-activation',
    init: () => ({ actions: [] }),
    update: (state, message) => ({ state: { actions: [...state.actions, message] } }),
    view: () => list({
      id: 'activation-list',
      items: ['alpha'],
      projectItem: (item) => ({ id: item, label: item }),
      onAction: (action) => action
    })
  });
  const runtime = createTuiRuntime({ app, host: createMemoryTerminalHost({ terminalSize: { columns: 20, rows: 2 } }) });

  await runtime.start();
  await clickAt(runtime, 1, 1);
  await clickAt(runtime, 1, 1);

  assert.deepEqual(runtime.state().actions, [
    { kind: 'select', id: 'alpha', itemIndex: 0 },
    { kind: 'activate', id: 'alpha', itemIndex: 0 }
  ]);
});
