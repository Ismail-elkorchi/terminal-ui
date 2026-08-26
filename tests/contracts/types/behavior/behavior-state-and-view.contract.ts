import {
  dataGrid,
  listbox,
  logViewer,
  tabs,
  text,
  tree,
  type DataGridControlTransition,
  type DataGridTransition,
  type Element,
  type ListboxControlTransition,
  type ListboxTransition,
  type LogViewerTransition,
  type LogViewerControlTransition,
  type TextAreaControlTransition,
  type TabsTransition,
  type TreeControlTransition,
  type TreeTransition,
} from '@ismail-elkorchi/terminal-ui/components';
import {
  comboboxReducer,
  commitCombobox,
  createScrollState,
  createLogHistory,
  createTreeSource,
  createTreeView,
  type UnscrolledComboboxState,
} from '@ismail-elkorchi/terminal-ui/behavior';
import { createCollectionInteractionIndex } from '@ismail-elkorchi/terminal-ui/interaction';

export type MessageOf<TElement> = TElement extends Element<infer TMessage> ? TMessage : never;
export type Equal<TLeft, TRight> =
  (<T>() => T extends TLeft ? 1 : 2) extends
  (<T>() => T extends TRight ? 1 : 2) ? true : false;
export type Assert<TValue extends true> = TValue;

const scroll = createScrollState();
const interaction = { activeId: 'one', selection: { mode: 'single' as const, selectedId: 'one' } };
const nodes = [{ id: 'one', label: 'One', kind: 'leaf' as const }];
const treeSource = createTreeSource(nodes);
const rows = [{ id: 'one' }];
const history = createLogHistory([]);
const unscrolledCombobox: UnscrolledComboboxState = {
  kind: 'select',
  open: false,
  interaction: { selection: { mode: 'single' } },
};
const openedCombobox = comboboxReducer(
  unscrolledCombobox,
  { kind: 'open' },
  { index: createCollectionInteractionIndex(['one']) },
);
const committedCombobox = commitCombobox(
  openedCombobox,
  { kind: 'commit', id: 'one' },
  { index: createCollectionInteractionIndex(['one']) },
);

const unscrolledListbox = listbox({
  id: 'unscrolled-listbox',
  items: ['one'],
  toOption: (value) => ({ id: value, label: value }),
  state: interaction,
  onTransition: (transition) => ({ kind: 'unscrolledListbox' as const, transition }),
});
const scrollableListbox = listbox({
  id: 'scrollable-listbox',
  items: ['one'],
  toOption: (value) => ({ id: value, label: value }),
  state: { ...interaction, scroll },
  scrollbar: { visible: 'auto' },
  onTransition: (transition) => ({ kind: 'scrollableListbox' as const, transition }),
});
const unscrolledTree = tree({
  id: 'unscrolled-tree',
  view: createTreeView(treeSource, { ...interaction, expandedIds: [] }),
  state: { ...interaction, expandedIds: [] },
  onTransition: (transition) => ({ kind: 'unscrolledTree' as const, transition }),
});
const scrollableTree = tree({
  id: 'scrollable-tree',
  view: createTreeView(treeSource, { ...interaction, expandedIds: [], scroll }),
  state: { ...interaction, expandedIds: [], scroll },
  scrollbar: { visible: 'auto' },
  onTransition: (transition) => ({ kind: 'scrollableTree' as const, transition }),
});
const rowInteraction = {
  kind: 'row' as const,
  activeRowId: 'one',
  selection: { mode: 'single' as const, selectedRowId: 'one' },
};
const unscrolledGrid = dataGrid({
  id: 'unscrolled-grid',
  rows,
  getRowId: (row) => row.id,
  state: { interaction: rowInteraction },
  onTransition: (transition) => ({ kind: 'unscrolledGrid' as const, transition }),
});
const scrollableGrid = dataGrid({
  id: 'scrollable-grid',
  rows,
  getRowId: (row) => row.id,
  state: { interaction: rowInteraction, scroll },
  scrollbar: { visible: 'auto' },
  onTransition: (transition) => ({ kind: 'scrollableGrid' as const, transition }),
});
const unscrolledLog = logViewer({
  id: 'unscrolled-log',
  history,
  onTransition: (action) => ({ kind: 'unscrolledLog' as const, action }),
});
const scrollableLog = logViewer({
  id: 'scrollable-log',
  history,
  scroll,
  scrollbar: { visible: 'auto' },
  onTransition: (action) => ({ kind: 'scrollableLog' as const, action }),
});
const typedTabs = tabs({
  id: 'typed-tabs',
  tabs: [
    { id: 'one', label: 'One', panel: text({ content: 'One' }) },
    { id: 'two', label: 'Two', panel: text({ content: 'Two' }) },
  ],
  state: { activeId: 'one', selectedId: 'one' },
  onTransition: (transition) => ({ kind: 'tabs' as const, transition }),
});

export type _UnscrolledListbox = Assert<Equal<MessageOf<typeof unscrolledListbox>, { readonly kind: 'unscrolledListbox'; readonly transition: ListboxControlTransition }>>;
export type _ScrollableListbox = Assert<Equal<MessageOf<typeof scrollableListbox>, { readonly kind: 'scrollableListbox'; readonly transition: ListboxTransition }>>;
export type _UnscrolledTree = Assert<Equal<MessageOf<typeof unscrolledTree>, { readonly kind: 'unscrolledTree'; readonly transition: TreeControlTransition }>>;
export type _ScrollableTree = Assert<Equal<MessageOf<typeof scrollableTree>, { readonly kind: 'scrollableTree'; readonly transition: TreeTransition }>>;
export type _UnscrolledGrid = Assert<Equal<MessageOf<typeof unscrolledGrid>, { readonly kind: 'unscrolledGrid'; readonly transition: DataGridControlTransition }>>;
export type _ScrollableGrid = Assert<Equal<MessageOf<typeof scrollableGrid>, { readonly kind: 'scrollableGrid'; readonly transition: DataGridTransition }>>;
export type _UnscrolledLog = Assert<Equal<MessageOf<typeof unscrolledLog>, { readonly kind: 'unscrolledLog'; readonly action: LogViewerControlTransition }>>;
export type _ScrollableLog = Assert<Equal<MessageOf<typeof scrollableLog>, { readonly kind: 'scrollableLog'; readonly action: LogViewerTransition }>>;
export type _TypedTabs = Assert<Equal<
  MessageOf<typeof typedTabs>,
  { readonly kind: 'tabs'; readonly transition: TabsTransition<'one' | 'two'> }
>>;
export type _UnscrolledComboboxReducer = Assert<Equal<
  typeof openedCombobox,
  UnscrolledComboboxState
>>;
export type _UnscrolledComboboxCommit = Assert<Equal<
  typeof committedCombobox,
  UnscrolledComboboxState
>>;

declare const textAreaControlAction: TextAreaControlTransition;
void textAreaControlAction;
