import {
  paginationWindow,
  prepareListboxCollection,
  prepareTableCollection,
  prepareTreeRows,
  prepareTreeSource,
  prepareTreeView,
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

const listCollection = prepareListboxCollection(
  ['alpha', 'bravo'],
  (value, index) => ({ id: String(index), label: value }),
  { startIndex: 100, totalCount: 1_000, domain: { kind: 'source' } },
);
const tableCollection = prepareTableCollection(
  [{ id: 'one', value: 1 }],
  (row) => row.id,
  { startIndex: 20, totalCount: 500, domain: { kind: 'source' } },
);
const treeCollection = prepareTreeRows([{
  node: { id: 'leaf', label: 'Leaf', kind: 'leaf' },
  depth: 0,
  path: ['leaf'],
  expanded: false,
}], {
  startIndex: 10,
  totalCount: 100,
  domain: { kind: 'projection', query: { text: 'leaf', mode: 'contains' } },
});
void treeCollection;
const interaction = { activeId: 'leaf', selection: { mode: 'none' as const } };
const treeSource = prepareTreeSource([{ id: 'leaf', label: 'Leaf', kind: 'leaf' }]);

listbox({
  id: 'listbox',
  collection: listCollection,
  presentation: { selection: { mode: 'none' } },
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
  view: prepareTreeView(treeSource, { ...interaction, expandedIds: [] }),
  presentation: { ...interaction, expandedIds: [] },
  onTransition: (transition) => transition,
});
paginationWindow({ pageNumber: 2, pageSize: 25, totalCount: 100 });

// @ts-expect-error externally windowed listboxes cannot be filtered locally
listbox({ id: 'filtered-window-listbox', collection: listCollection, query: { text: 'alpha', mode: 'contains' }, presentation: interaction, onTransition: (transition) => transition });
// @ts-expect-error retained listbox collections replace raw item/projector inputs
listbox({ id: 'mixed-listbox', collection: listCollection, items: ['alpha'], projectItem: (value: string) => ({ id: value, label: value }), presentation: interaction, onTransition: (transition) => transition });
// @ts-expect-error retained table collections replace raw row identity inputs
table({ id: 'mixed-table', collection: tableCollection, rows: [{ id: 'two', value: 2 }], getRowId: (row: { id: string }) => row.id });
// @ts-expect-error tree consumes a prepared view rather than parallel raw hierarchy data
tree({ id: 'mixed-tree', view: prepareTreeView(treeSource, { ...interaction, expandedIds: [] }), nodes: [{ id: 'other', label: 'Other', kind: 'leaf' }], presentation: { ...interaction, expandedIds: [] }, onTransition: (transition) => transition });
