import {
  list,
  logViewer,
  table,
  tree,
  type Element,
  type ListAction,
  type ListControlAction,
  type LogViewerAction,
  type LogViewerControlAction,
  type TableAction,
  type TableControlAction,
  type TextAreaControlAction,
  type TreeInteractionAction,
  type TreeControlAction
} from '@ismail-elkorchi/terminal-ui/components';
import {
  createScrollState,
  listPresentation,
  listScrollablePresentation,
  prepareLogHistory,
  logViewerPresentation,
  logViewerScrollablePresentation,
  tablePresentation,
  tableScrollablePresentation,
  treePresentation,
  treeScrollablePresentation,
  type PassiveListState,
  type PassiveLogViewerState,
  type PassiveTableState,
  type PassiveTreeState,
  type ScrollableListState,
  type ScrollableLogViewerState,
  type ScrollableTableState,
  type ScrollableTreeState
} from '@ismail-elkorchi/terminal-ui/behavior';

export type MessageOf<TElement> = TElement extends Element<infer TMessage> ? TMessage : never;
export type Equal<TLeft, TRight> =
  (<T>() => T extends TLeft ? 1 : 2) extends
  (<T>() => T extends TRight ? 1 : 2) ? true : false;
export type Assert<TValue extends true> = TValue;

const scroll = createScrollState({ contentRows: 20, viewportRows: 5 });
const passiveListState: PassiveListState = {};
const scrollableListState: ScrollableListState = { scroll };
const passiveTableState: PassiveTableState = {};
const scrollableTableState: ScrollableTableState = { scroll };
const passiveTreeState: PassiveTreeState = { nodes: [] };
const scrollableTreeState: ScrollableTreeState = { nodes: [], scroll };
const passiveLogViewerState: PassiveLogViewerState = { foldedIds: [], followTail: false };
const scrollableLogViewerState: ScrollableLogViewerState = { foldedIds: [], followTail: true, scroll };
const history = prepareLogHistory([]);

const passiveList = list({
  id: 'passive-list', items: ['one'],
  projectItem: (value) => ({ id: value, label: value }),
  ...listPresentation(passiveListState),
  onAction: (action) => ({ kind: 'passiveList' as const, action })
});
const scrollableList = list({
  id: 'scrollable-list', items: ['one'],
  projectItem: (value) => ({ id: value, label: value }),
  ...listScrollablePresentation(scrollableListState),
  scrollbar: { visible: 'auto' },
  onAction: (action) => ({ kind: 'scrollableList' as const, action })
});
const passiveTable = table({
  id: 'passive-table', rows: [{ id: 'one' }], getRowId: (row) => row.id,
  presentation: tablePresentation(passiveTableState),
  onAction: (action) => ({ kind: 'passiveTable' as const, action })
});
const scrollableTable = table({
  id: 'scrollable-table', rows: [{ id: 'one' }], getRowId: (row) => row.id,
  presentation: tableScrollablePresentation(scrollableTableState),
  scrollbar: { visible: 'auto' },
  onAction: (action) => ({ kind: 'scrollableTable' as const, action })
});
const passiveTree = tree({
  id: 'passive-tree', ...treePresentation(passiveTreeState),
  onAction: (action) => ({ kind: 'passiveTree' as const, action })
});
const scrollableTree = tree({
  id: 'scrollable-tree', ...treeScrollablePresentation(scrollableTreeState),
  scrollbar: { visible: 'auto' },
  onAction: (action) => ({ kind: 'scrollableTree' as const, action })
});
const passiveLog = logViewer({
  id: 'passive-log', ...logViewerPresentation(history, passiveLogViewerState),
  onAction: (action) => ({ kind: 'passiveLog' as const, action })
});
const scrollableLog = logViewer({
  id: 'scrollable-log', ...logViewerScrollablePresentation(history, scrollableLogViewerState),
  scrollbar: { visible: 'auto' },
  onAction: (action) => ({ kind: 'scrollableLog' as const, action })
});

export type _PassiveList = Assert<Equal<MessageOf<typeof passiveList>, { readonly kind: 'passiveList'; readonly action: ListControlAction }>>;
export type _ScrollableList = Assert<Equal<MessageOf<typeof scrollableList>, { readonly kind: 'scrollableList'; readonly action: ListAction }>>;
export type _PassiveTable = Assert<Equal<MessageOf<typeof passiveTable>, { readonly kind: 'passiveTable'; readonly action: TableControlAction }>>;
export type _ScrollableTable = Assert<Equal<MessageOf<typeof scrollableTable>, { readonly kind: 'scrollableTable'; readonly action: TableAction }>>;
export type _PassiveTree = Assert<Equal<MessageOf<typeof passiveTree>, { readonly kind: 'passiveTree'; readonly action: TreeControlAction }>>;
export type _ScrollableTree = Assert<Equal<MessageOf<typeof scrollableTree>, { readonly kind: 'scrollableTree'; readonly action: TreeInteractionAction }>>;
export type _PassiveLog = Assert<Equal<MessageOf<typeof passiveLog>, { readonly kind: 'passiveLog'; readonly action: LogViewerControlAction }>>;
export type _ScrollableLog = Assert<Equal<MessageOf<typeof scrollableLog>, { readonly kind: 'scrollableLog'; readonly action: LogViewerAction }>>;

declare const textAreaControlAction: TextAreaControlAction;
void textAreaControlAction;
