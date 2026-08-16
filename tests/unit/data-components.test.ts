import assert from 'node:assert/strict';
import test from 'node:test';

import {
  renderFramePlain,
  renderElementFrame
} from '../../dist/renderer/index.js';
import {
  pagination,
  tree
} from '../../dist/components/index.js';
import { prepareTreeSource, prepareTreeView } from '../../dist/behavior/index.js';

void test('tree component renders expanded visible nodes and accessible selection state', () => {
  const presentation = {
    expandedIds: ['root'],
    activeId: 'root',
    selection: { mode: 'single' as const, selectedId: 'child' }
  };
  const source = prepareTreeSource([
    {
      id: 'root',
      label: 'Root',
      kind: 'branch',
      children: [
        { id: 'child', label: 'Child', kind: 'leaf' },
        { id: 'hidden-parent', label: 'Hidden parent', kind: 'branch', children: [{ id: 'hidden', label: 'Hidden', kind: 'leaf' }] }
      ]
    }
  ]);
  const frame = renderElementFrame(tree({
    id: 'tree',
    presentation,
    view: prepareTreeView(source, presentation),
    onTransition: (transition) => transition,
  }), { columns: 32, rows: 4 });

  const output = renderFramePlain(frame);
  assert.match(output, /▼ Root/u);
  assert.match(output, / {6}Child/u);
  assert.doesNotMatch(output, /Hidden$/u);
  assert.deepEqual(
    frame.cells.find((cell) => cell.text === 'C')?.style?.bg,
    { kind: 'theme', token: 'selection.background' }
  );
  assert.equal(frame.accessibility.root.role, 'tree');
  const children = frame.accessibility.root.children;
  assert.ok(children !== undefined);
  assert.equal(children[1]?.selected, true);
  assert.equal(children[0]?.expanded, true);
});

void test('pagination normalizes page bounds and renders navigation controls', () => {
  const frame = renderElementFrame(pagination({
    id: 'pages',
      label: 'Results',
      pageNumber: 20,
      pageCount: 4,
      onAction: (action) => action
  }), { columns: 40, rows: 1 });

  assert.equal(renderFramePlain(frame), 'Results  «   ‹  Page 4 of 4  ›   »');
  assert.equal(frame.accessibility.root.label, 'Results');
  assert.equal(frame.accessibility.root.value, 'Page 4 of 4');
});
