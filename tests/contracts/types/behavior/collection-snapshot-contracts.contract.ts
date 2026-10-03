import {
  paginationWindow,
  createListboxCollection,
  createListboxView,
  createTableCollection,
  createTreeCollectionFromRows,
  createTreeSource,
  createTreeView,
  treeReducer,
} from '@ismail-elkorchi/terminal-ui/behavior';
import { listbox, table, tree } from '@ismail-elkorchi/terminal-ui/components';
import type { SelectionState } from '@ismail-elkorchi/terminal-ui/interaction';

const rangeSelection: SelectionState = {
  mode: 'multiple',
  selectedIds: [],
  rangeSelectionEnabled: true,
};
void rangeSelection;

const contradictorySelection: SelectionState = {
  mode: 'multiple',
  selectedIds: [],
  // @ts-expect-error multiple selection cannot follow the active item
  selectionFollowsActive: true,
};
void contradictorySelection;

const listCollection = createListboxCollection(
  ['alpha', 'bravo'],
  (value, index) => ({ id: String(index), label: value }),
  { startIndex: 100, totalCount: 1_000, scope: { kind: 'source' } },
);
const tableCollection = createTableCollection(
  [{ id: 'one', value: 1 }],
  (row) => row.id,
  { startIndex: 20, totalCount: 500, scope: { kind: 'source' } },
);
const treeCollection = createTreeCollectionFromRows([{
  node: { id: 'leaf', label: 'Leaf', kind: 'leaf' },
  depth: 0,
  path: ['leaf'],
  expanded: false,
}], {
  startIndex: 10,
  totalCount: 100,
  scope: { kind: 'query', query: { text: 'leaf', mode: 'contains' } },
});
void treeCollection;
const interaction = { activeId: 'leaf', selection: { mode: 'none' as const } };
const treeSource = createTreeSource([{ id: 'leaf', label: 'Leaf', kind: 'leaf' }]);

listbox({
  id: 'listbox',
  collection: listCollection,
  view: createListboxView(listCollection),
  state: { selection: { mode: 'none' } },
  onTransition: (transition) => transition,
});
table({
  id: 'table',
  collection: tableCollection,
  columns: [{ id: 'value', value: (row) => row.value }],
});
// @ts-expect-error windowed table collections require explicit columns
table({ id: 'windowed-table-without-columns', collection: tableCollection });
tree({
  id: 'tree',
  source: treeSource,
  view: createTreeView(treeSource, { ...interaction, expandedIds: [] }),
  state: { ...interaction, expandedIds: [] },
  onTransition: (transition) => transition,
});
paginationWindow({ pageNumber: 2, pageSize: 25, totalCount: 100 });

// @ts-expect-error externally windowed listboxes cannot be filtered locally
listbox({ id: 'filtered-window-listbox', collection: listCollection, view: createListboxView(listCollection), query: { text: 'alpha', mode: 'contains' }, state: interaction, onTransition: (transition) => transition });
// @ts-expect-error retained listbox collections replace raw item/projector inputs
listbox({ id: 'mixed-listbox', collection: listCollection, items: ['alpha'], toOption: (value: string) => ({ id: value, label: value }), state: interaction, onTransition: (transition) => transition });
// @ts-expect-error retained table collections replace raw row identity inputs
table({ id: 'mixed-table', collection: tableCollection, rows: [{ id: 'two', value: 2 }], getRowId: (row: { id: string }) => row.id });
// @ts-expect-error a tree source replaces parallel raw hierarchy data
tree({ id: 'mixed-tree', source: treeSource, view: null, nodes: [{ id: 'other', label: 'Other', kind: 'leaf' }], state: { ...interaction, expandedIds: [] }, onTransition: (transition) => transition });
// @ts-expect-error a prepared tree view still requires its source
tree({ id: 'missing-tree-source', view: createTreeView(treeSource, { ...interaction, expandedIds: [] }), state: { ...interaction, expandedIds: [] }, onTransition: (transition) => transition });

// @ts-expect-error live tree controls require an explicit prepared view or pending null
tree({ id: 'missing-tree-view', source: treeSource, state: { ...interaction, expandedIds: [] }, onTransition: (transition) => transition });

// Pending projection is explicit for both rendering and interaction.
tree({ id: 'pending-tree', source: treeSource, view: null, state: { ...interaction, expandedIds: [] }, onTransition: (transition) => transition });
treeReducer({ ...interaction, expandedIds: [] }, { kind: 'moveActive', delta: 1 }, { source: treeSource, view: null });
// @ts-expect-error live tree reducers require an explicit prepared view or pending null
treeReducer({ ...interaction, expandedIds: [] }, { kind: 'moveActive', delta: 1 }, { source: treeSource });
