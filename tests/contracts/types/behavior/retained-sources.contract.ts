import {
  createTreeSource, createTreeView, prepareTreeSource, prepareTreeSourceUpdate,
  createLogHistory, prepareLogHistory, prepareAppendLogHistory,
  createTableCollection, prepareTableCollection, prepareTableRows,
  createListboxCollection, prepareListboxCollection, createListboxView, prepareListboxView,
  type CooperativeWorkContext,
} from '@ismail-elkorchi/terminal-ui/behavior';

const context: CooperativeWorkContext = { signal: new AbortController().signal, yield: () => Promise.resolve() };
const leaf = { id: 'leaf', kind: 'leaf', label: 'Leaf' } as const;
const tree = createTreeSource([leaf]);
const treeView = createTreeView(tree, { expandedIds: [], selection: { mode: 'none' } });
void prepareTreeSource([[{ node: leaf }]], context);
void prepareTreeSourceUpdate(tree, [[{ kind: 'replace', node: leaf }]], context);
void treeView.collection.itemAt(0);
void treeView.collection.itemById('leaf');
void treeView.collection.window(0, 1);
// @ts-expect-error cooperative tree sources require flat bounded batches, not nested node snapshots
void prepareTreeSource([leaf], context);
// @ts-expect-error retained tree views do not materialize full compatibility arrays
void treeView.collection.items;

const logEntries = [{ id: 'entry', text: 'text' }];
const log = createLogHistory(logEntries);
void prepareLogHistory([logEntries], context);
void prepareAppendLogHistory(log, [logEntries], context);
// @ts-expect-error cooperative logs consume explicit bounded descriptor batches
void prepareLogHistory(logEntries, context);
// @ts-expect-error cooperative append does not snapshot an unbounded raw array
void prepareAppendLogHistory(log, logEntries, context);

const rows = [{ id: 'one', value: 1 }];
const table = createTableCollection(rows, row => row.id);
void prepareTableCollection([rows], row => row.id, context);
void prepareTableRows(table, { columnId: 'value', direction: 'ascending' }, row => row.value, context);
void table.window(0, 1);
// @ts-expect-error table sources expose bounded reads rather than hidden array copies
void table.items;
// @ts-expect-error cooperative table construction requires batches
void prepareTableCollection(rows, row => row.id, context);
// @ts-expect-error cooperative table ordering consumes an accepted immutable source
void prepareTableRows(rows, undefined, row => row, context);

const list = createListboxCollection(rows, row => ({ id: row.id, label: String(row.value) }));
const listView = createListboxView(list);
void prepareListboxCollection([rows], row => ({ id: row.id, label: String(row.value) }), context);
void prepareListboxView(list, { query: { text: 'one' } }, context);
void listView.entryAt(0);
void listView.entryById('one');
void listView.window(0, 1);
// @ts-expect-error listbox sources no longer expose materialized full arrays
void list.items;
// @ts-expect-error listbox views no longer expose materialized full arrays
void listView.entries;
// @ts-expect-error enabled navigation uses the retained interaction index
void listView.selectable;
// @ts-expect-error cooperative listbox construction requires bounded batches
void prepareListboxCollection(rows, row => ({ id: String(row), label: '' }), context);
