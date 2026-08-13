import assert from 'node:assert/strict';
import test from 'node:test';
import { createTuiRuntime, defineTui } from '../../dist/tui/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { prepareTreeRows, treeReducer } from '../../dist/behavior/index.js';
import { renderElementFrame, renderFramePlain } from '../../dist/renderer/index.js';
import { tree } from '../../dist/components/index.js';

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

test('treeReducer keeps disclosure state separate from immutable input nodes', () => {
  const nodes = [{
    id: 'root',
    label: 'Root',
    kind: 'branch',
    children: [{ id: 'child', label: 'Child', kind: 'leaf' }]
  }];
  const state = { expandedIds: [], selection: { mode: 'single' } };
  const expanded = treeReducer(state, { kind: 'toggle', id: 'root' }, {
    nodes,
    selection: { mode: 'single', commitment: 'manual' }
  });
  const frame = renderElementFrame(tree({
    id: 'tree',
    nodes,
    presentation: expanded,
    onTransition: (action) => action
  }), { columns: 24, rows: 3 });

  assert.equal('expanded' in nodes[0], false);
  assert.deepEqual(expanded.expandedIds, ['root']);
  assert.match(renderFramePlain(frame), /Child/u);
});

test('tree factory rejects duplicate identities across nested branches', () => {
  assert.throws(() => tree({
    id: 'duplicate-tree',
    nodes: [
      {
        id: 'root',
        label: 'Root',
        kind: 'branch',
        children: [{ id: 'duplicate', label: 'Nested', kind: 'leaf' }]
      },
      { id: 'duplicate', label: 'Top level', kind: 'leaf' }
    ],
    presentation: { expandedIds: ['root'], selection: { mode: 'none' } },
    onTransition: (action) => action
  }), /tree item ids must be unique; duplicate id: duplicate/u);
});

test('tree validates every prepared collection row during construction', () => {
  const collection = prepareTreeRows([{
    node: { id: 'invalid', label: 42, kind: 'leaf' },
    depth: 0,
    path: ['invalid']
  }]);

  assert.throws(
    () => tree({
      id: 'invalid-tree',
      collection,
      presentation: { expandedIds: [], selection: { mode: 'none' } },
      onTransition: (action) => action
    }),
    /tree collection row\.node\.label must be a string/u
  );
});

test('tree pointer selection and double-click activation match keyboard semantics', async () => {
  const app = defineTui({
    id: 'tree-pointer-activation',
    init: () => ({ actions: [] }),
    update: (state, message) => ({ state: { actions: [...state.actions, message] } }),
    view: () => tree({
      id: 'activation-tree',
      nodes: [{ id: 'leaf', label: 'Leaf', kind: 'leaf' }],
      presentation: { expandedIds: [], selection: { mode: 'single' } },
      onTransition: (action) => action,
      onActivate: (event) => event
    })
  });
  const runtime = createTuiRuntime({ app, host: createMemoryTerminalHost({ terminalSize: { columns: 20, rows: 2 } }) });

  await runtime.start();
  const target = runtime.frame().hitTargets.find((candidate) => candidate.id.endsWith(':body'));
  assert.ok(target);
  await clickAt(runtime, target.bounds.row, target.bounds.column);
  await clickAt(runtime, target.bounds.row, target.bounds.column);

  assert.deepEqual(runtime.state().actions, [
    { kind: 'setActive', id: 'leaf' },
    { kind: 'activate', id: 'leaf' }
  ]);
});

test('tree filters through descendants and exposes selected disabled metadata-rich nodes', () => {
  const frame = renderElementFrame(tree({
    id: 'tree',
    presentation: {
      expandedIds: [],
      activeId: 'api',
      selection: { mode: 'single', selectedId: 'api' },
      query: { text: 'server', mode: 'contains' }
    },
    onTransition: (action) => action,
    nodes: [{
      id: 'root',
      label: 'Workspace',
      icon: '▣',
      kind: 'branch',
      children: [
        { id: 'ui', label: 'Terminal UI', kind: 'leaf', metadata: { domain: 'components' } },
        { id: 'api', label: 'API Layer', kind: 'leaf', description: 'Server request boundary', disabled: true, metadata: { domain: 'server' } }
      ]
    }]
  }), { columns: 32, rows: 4 });

  const output = renderFramePlain(frame);
  const disabledCell = frame.cells.find((cell) => cell.text === 'A');

  assert.match(output, /Workspace/u);
  assert.match(output, /API Layer/u);
  assert.doesNotMatch(output, /Terminal UI/u);
  assert.equal(disabledCell?.style?.fg?.token, 'text.disabled');
  assert.equal(frame.cells.find((cell) => cell.text === '▣')?.source?.description, 'node.root.icon');
  assert.equal(frame.cells.find((cell) => cell.text === 'A')?.source?.description, 'node.api.label');
  assert.equal(frame.cells.find((cell) => cell.text === 'L')?.source?.description, 'node.api.label');
  assert.equal(frame.accessibility.root.children?.[1]?.selected, true);
  assert.equal(frame.accessibility.root.children?.[1]?.disabled, true);
  assert.equal(frame.accessibility.root.children?.[1]?.description, 'Server request boundary');
  assert.deepEqual(frame.accessibility.root.window, {
    startIndex: 0,
    endIndexExclusive: 2,
    totalCount: 2,
    omittedBefore: 0,
    omittedAfter: 0
  });
  assert.deepEqual(frame.accessibility.root.children?.[1]?.position, {
    positionInSet: 2,
    setSize: 2,
    level: 2
  });
  assert.equal(frame.accessibility.root.children?.[1]?.value, 'root/api');
});

test('tree owns retained multiple-selection state at construction', () => {
  const selectedIds = ['first'];
  const element = tree({
    id: 'owned-tree-selection',
    nodes: [
      { id: 'first', label: 'First', kind: 'leaf' },
      { id: 'second', label: 'Second', kind: 'leaf' }
    ],
    presentation: {
      expandedIds: [],
      selection: { mode: 'multiple', selectedIds, anchorId: 'first' }
    },
    onTransition: (transition) => transition
  });

  selectedIds.splice(0, selectedIds.length, 'second');

  const frame = renderElementFrame(element, { columns: 20, rows: 2 });
  assert.deepEqual(frame.accessibility.root.children?.map((item) => item.selected), [true, false]);
});

test('tree renders lazy placeholders and clips tiny viewports safely', () => {
  const frame = renderElementFrame(tree({
    id: 'lazy-tree',
    nodes: [{
      id: 'root',
      label: 'Very long root label for clipping',
      kind: 'lazy',
    }],
    presentation: {
      expandedIds: ['root'],
      selection: { mode: 'none' },
      loadStates: { root: { kind: 'pending' } }
    },
    onTransition: (action) => action
  }), { columns: 14, rows: 2 });

  const output = renderFramePlain(frame);
  assert.match(output, /Very long…/u);
  assert.match(output, /Loading/u);
  assert.equal(frame.cells.find((cell) => cell.text === 'L')?.source?.description, 'node.root:status.label');
  assert.equal(frame.accessibility.root.children?.[1]?.disabled, true);
});
