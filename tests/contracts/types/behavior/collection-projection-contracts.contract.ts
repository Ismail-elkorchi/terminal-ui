import {
  prepareListCollection,
  prepareTableCollection,
  prepareTreeRows
} from '@ismail-elkorchi/terminal-ui/behavior';
import { list, table, tree } from '@ismail-elkorchi/terminal-ui/components';

const listCollection = prepareListCollection(
  ['alpha', 'bravo'],
  (value, index) => ({ id: String(index), label: value }),
  { start: 100, total: 1_000 }
);
const tableCollection = prepareTableCollection(
  [{ id: 'one', value: 1 }],
  (row) => row.id,
  { start: 20, total: 500 }
);
const treeCollection = prepareTreeRows([{
  node: { id: 'leaf', label: 'Leaf', kind: 'leaf' },
  depth: 0,
  path: ['leaf']
}], { start: 10, total: 100 });

list({ id: 'list', collection: listCollection });
table({
  id: 'table',
  collection: tableCollection,
  columns: [{ id: 'value', value: (row) => row.value }]
});
tree({ id: 'tree', collection: treeCollection });

// @ts-expect-error retained list collections replace raw item/projector inputs
list({ id: 'mixed-list', collection: listCollection, items: ['alpha'], projectItem: (value) => ({ id: value, label: value }) });
// @ts-expect-error retained table collections replace raw row identity inputs
table({ id: 'mixed-table', collection: tableCollection, rows: [{ id: 'two', value: 2 }], getRowId: (row) => row.id });
// @ts-expect-error retained tree collections replace raw hierarchy inputs
tree({ id: 'mixed-tree', collection: treeCollection, nodes: [{ id: 'other', label: 'Other', kind: 'leaf' }] });
