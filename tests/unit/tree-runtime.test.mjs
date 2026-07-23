import assert from 'node:assert/strict';
import test from 'node:test';
import { createTuiRuntime, defineTui } from '../../dist/tui/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { treeReducer } from '../../dist/behavior/index.js';
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

test('treeReducer toggles nested expansion without mutating input nodes', () => {
  const nodes = [{
    id: 'root',
    label: 'Root',
    kind: 'branch',
    expanded: false,
    children: [{ id: 'child', label: 'Child', kind: 'leaf' }]
  }];
  const expanded = treeReducer({ nodes }, { kind: 'toggle', id: 'root' });
  const frame = renderElementFrame(tree({ id: 'tree', nodes: expanded.nodes }), { columns: 24, rows: 3 });

  assert.equal(nodes[0]?.expanded, false);
  assert.equal(expanded.nodes[0]?.expanded, true);
  assert.match(renderFramePlain(frame), /Child/u);
});

test('tree authoring rejects duplicate identities across nested branches', () => {
  assert.throws(() => tree({
    id: 'duplicate-tree',
    nodes: [
      {
        id: 'root',
        label: 'Root',
        kind: 'branch',
        expanded: true,
        children: [{ id: 'duplicate', label: 'Nested', kind: 'leaf' }]
      },
      { id: 'duplicate', label: 'Top level', kind: 'leaf' }
    ]
  }), /tree item ids must be unique; duplicate id: duplicate/u);
});

test('tree pointer selection and double-click activation match keyboard semantics', async () => {
  const app = defineTui({
    id: 'tree-pointer-activation',
    init: () => ({ actions: [] }),
    update: (state, message) => ({ state: { actions: [...state.actions, message] } }),
    view: () => tree({
      id: 'activation-tree',
      nodes: [{ id: 'leaf', label: 'Leaf', kind: 'leaf' }],
      onAction: (action) => action
    })
  });
  const runtime = createTuiRuntime({ app, host: createMemoryTerminalHost({ viewport: { columns: 20, rows: 2 } }) });

  await runtime.start();
  const target = runtime.frame().hitTargets.find((candidate) => candidate.id.endsWith(':body'));
  assert.ok(target);
  await clickAt(runtime, target.bounds.row, target.bounds.column);
  await clickAt(runtime, target.bounds.row, target.bounds.column);

  assert.deepEqual(runtime.state().actions, [
    { kind: 'select', id: 'leaf' },
    { kind: 'activate', id: 'leaf' }
  ]);
});

test('tree filters through descendants and exposes selected disabled metadata-rich nodes', () => {
  const frame = renderElementFrame(tree({
    id: 'tree',
    selected: 'api',
    filterQuery: 'server',
    nodes: [{
      id: 'root',
      label: 'Workspace',
      icon: '▣',
      kind: 'branch',
      expanded: false,
      children: [
        { id: 'ui', label: 'Terminal UI', kind: 'leaf', metadata: { domain: 'widgets' } },
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
  assert.equal(frame.cells.find((cell) => cell.text === '▣')?.source?.label, 'node.root.icon');
  assert.equal(frame.cells.find((cell) => cell.text === 'A')?.source?.label, 'node.api.label');
  assert.equal(frame.cells.find((cell) => cell.text === 'L')?.source?.label, 'node.api.label');
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

test('tree renders lazy placeholders and clips tiny viewports safely', () => {
  const frame = renderElementFrame(tree({
    id: 'lazy-tree',
    nodes: [{
      id: 'root',
      label: 'Very long root label for clipping',
      kind: 'lazy',
      expanded: true,
      loading: { kind: 'pending' }
    }]
  }), { columns: 14, rows: 2 });

  const output = renderFramePlain(frame);
  assert.match(output, /Very long…/u);
  assert.match(output, /Loading/u);
  assert.equal(frame.cells.find((cell) => cell.text === 'L')?.source?.label, 'node.root:lazy.label');
  assert.equal(frame.accessibility.root.children?.[1]?.disabled, true);
});
