import assert from 'node:assert/strict';
import test from 'node:test';

import {
  renderFramePlain,
  renderElementFrame
} from '../../dist/renderer/index.js';
import {
  paginator,
  tree
} from '../../dist/components/index.js';

void test('tree renders expanded visible nodes and accessible selection state', () => {
  const frame = renderElementFrame(tree({
    id: 'tree',
    selected: 'child',
    nodes: [
      {
        id: 'root',
        label: 'Root',
        kind: 'branch',
        expanded: true,
        children: [
          { id: 'child', label: 'Child', kind: 'leaf' },
          { id: 'hidden-parent', label: 'Hidden parent', kind: 'branch', expanded: false, children: [{ id: 'hidden', label: 'Hidden', kind: 'leaf' }] }
        ]
      }
    ]
  }), { columns: 32, rows: 4 });

  const output = renderFramePlain(frame);
  assert.match(output, /▾ Root/u);
  assert.match(output, /› {5}Child/u);
  assert.doesNotMatch(output, /Hidden$/u);
  assert.equal(frame.accessibility.root.role, 'tree');
  const children = frame.accessibility.root.children;
  assert.ok(children !== undefined);
  assert.equal(children[1]?.selected, true);
  assert.equal(children[0]?.expanded, true);
});

void test('paginator normalizes page bounds and renders compact status', () => {
  const frame = renderElementFrame(paginator({
    id: 'pages',
    label: 'Results',
    page: 20,
    pageCount: 4
  }), { columns: 24, rows: 1 });

  assert.equal(renderFramePlain(frame), 'Results Page 4 of 4');
  assert.equal(frame.accessibility.root.label, 'Results');
  assert.equal(frame.accessibility.root.value, 'Page 4 of 4');
});
