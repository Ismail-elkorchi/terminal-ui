import assert from 'node:assert/strict';
import test from 'node:test';

import { renderFramePlain, renderWidgetFrame } from '../../dist/tui/index.js';
import { paginator, tree } from '../../dist/widgets/index.js';

test('tree renders expanded visible nodes and accessible selection state', () => {
  const frame = renderWidgetFrame(tree({
    id: 'tree',
    selected: 'child',
    nodes: [
      {
        id: 'root',
        label: 'Root',
        expanded: true,
        children: [
          { id: 'child', label: 'Child' },
          { id: 'hidden-parent', label: 'Hidden parent', children: [{ id: 'hidden', label: 'Hidden' }] }
        ]
      }
    ]
  }), { columns: 32, rows: 4 });

  const output = renderFramePlain(frame);
  assert.match(output, /▾ Root/u);
  assert.match(output, /›     Child/u);
  assert.doesNotMatch(output, /Hidden$/u);
  assert.equal(frame.accessibility.root.role, 'listbox');
  assert.equal(frame.accessibility.root.children?.[1]?.selected, true);
  assert.equal(frame.accessibility.root.children?.[0]?.expanded, true);
});

test('paginator normalizes page bounds and renders compact status', () => {
  const frame = renderWidgetFrame(paginator({
    id: 'pages',
    label: 'Results',
    page: 20,
    pageCount: 4
  }), { columns: 24, rows: 1 });

  assert.equal(renderFramePlain(frame), 'Results Page 4 of 4');
  assert.equal(frame.accessibility.root.value, 'Results Page 4 of 4');
});
