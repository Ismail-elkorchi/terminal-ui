import {
  paginationWindow,
  prepareListCollection,
  prepareTableCollection,
  prepareTreeRows
} from '@ismail-elkorchi/terminal-ui/behavior';
import { list, table, tree } from '@ismail-elkorchi/terminal-ui/components';

const listCollection = prepareListCollection(
  ['alpha', 'bravo'],
  (value, index) => ({ id: String(index), label: value }),
  { startIndex: 100, totalCount: 1_000, domain: { kind: 'source' } }
);
const tableCollection = prepareTableCollection(
  [{ id: 'one', value: 1 }],
  (row) => row.id,
  { startIndex: 20, totalCount: 500, domain: { kind: 'source' } }
);
const treeCollection = prepareTreeRows([{
  node: { id: 'leaf', label: 'Leaf', kind: 'leaf' },
  depth: 0,
  path: ['leaf']
}], {
  startIndex: 10,
  totalCount: 100,
  domain: { kind: 'projection', id: 'tree:query', filterQuery: 'leaf' }
});

list({ id: 'list', collection: listCollection });
table({
  id: 'table',
  collection: tableCollection,
  columns: [{ id: 'value', value: (row) => row.value }]
});
tree({ id: 'tree', collection: treeCollection });
paginationWindow({ pageNumber: 2, pageSize: 25, totalCount: 100 });

// @ts-expect-error externally windowed lists cannot be filtered locally
list({ id: 'filtered-window-list', collection: listCollection, filterQuery: 'alpha' });
// @ts-expect-error externally windowed trees cannot be filtered locally
tree({ id: 'filtered-window-tree', collection: treeCollection, filterQuery: 'leaf' });

// @ts-expect-error retained list collections replace raw item/projector inputs
list({ id: 'mixed-list', collection: listCollection, items: ['alpha'], projectItem: (value) => ({ id: value, label: value }) });
// @ts-expect-error retained table collections replace raw row identity inputs
table({ id: 'mixed-table', collection: tableCollection, rows: [{ id: 'two', value: 2 }], getRowId: (row) => row.id });
// @ts-expect-error retained tree collections replace raw hierarchy inputs
tree({ id: 'mixed-tree', collection: treeCollection, nodes: [{ id: 'other', label: 'Other', kind: 'leaf' }] });
