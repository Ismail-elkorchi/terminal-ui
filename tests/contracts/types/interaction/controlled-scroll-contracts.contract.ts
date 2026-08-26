import {
  combobox,
  listView,
  listbox,
  logViewer,
  searchPicker,
  text,
  textArea,
  table,
  tree,
  type ComboboxTransition,
  type Element,
  type ListViewTransition,
  type ListboxTransition,
  type LogViewerTransition,
  type SearchPickerTransition,
  type TextAreaTransition,
  type TreeTransition,
} from '@ismail-elkorchi/terminal-ui/components';
import { createScrollState, createLogHistory, createSearchPickerIndex, createTreeSource, createTreeView } from '@ismail-elkorchi/terminal-ui/behavior';
import { createMeasuredCollection, measuredWindow } from '@ismail-elkorchi/terminal-ui/collection';
import { viewport } from '@ismail-elkorchi/terminal-ui/layout';
import type { ScrollRequest } from '@ismail-elkorchi/terminal-ui/interaction';
import { createTextDocument, textCaretAt } from '@ismail-elkorchi/terminal-ui/text';

export type MessageOf<TElement> = TElement extends Element<infer TMessage> ? TMessage : never;
export type Equal<TLeft, TRight> =
  (<T>() => T extends TLeft ? 1 : 2) extends
  (<T>() => T extends TRight ? 1 : 2) ? true : false;
export type Assert<TValue extends true> = TValue;

const scroll = createScrollState();
const controlledListbox = listbox({
  id: 'listbox',
  items: ['one'],
  toOption: (value) => ({ id: value, label: value }),
  state: { activeId: 'one', selection: { mode: 'none' }, scroll },
  scrollbar: { visible: 'auto' },
  onTransition: (transition) => ({ kind: 'listbox' as const, transition }),
});
const controlledTree = tree({
  id: 'tree',
  view: createTreeView(createTreeSource([{ id: 'one', label: 'One', kind: 'leaf' }]), { activeId: 'one', selection: { mode: 'none' }, expandedIds: [], scroll }),
  state: { activeId: 'one', selection: { mode: 'none' }, expandedIds: [], scroll },
  scrollbar: { visible: 'auto' },
  onTransition: (transition) => ({ kind: 'tree' as const, transition }),
});
const controlledEditor = textArea({
  id: 'editor',
  state: { document: createTextDocument('value'), caret: textCaretAt(0), scroll },
  scrollbar: { visible: 'auto' },
  onTransition: (transition: TextAreaTransition) => ({ kind: 'editor' as const, transition }),
});
const controlledLog = logViewer({
  id: 'log',
  history: createLogHistory([{ id: 'one', text: 'One' }]),
  scroll,
  scrollbar: { visible: 'auto' },
  onTransition: (transition) => ({ kind: 'log' as const, transition }),
});
const controlledSearchPicker = searchPicker({
  id: 'searchPicker',
  view: { input: { text: '', cursor: 0 }, query: { mode: 'fuzzy' }, scroll },
  searchPickerIndex: createSearchPickerIndex([{ id: 'one', label: 'One', value: 1 }]),
  scrollbar: { visible: 'auto' },
  onTransition: (transition) => ({ kind: 'searchPicker' as const, transition }),
});
const controlledViewport = viewport(text({ content: 'content' }), {
  id: 'viewport',
  offset: { row: 0, column: 0 },
  scrollbar: { visible: 'auto' },
  onScroll: (request) => ({ kind: 'viewportScroll' as const, request }),
});
const controlledListView = listView({
  id: 'list-view',
  window: measuredWindow(createMeasuredCollection([
    { id: 'one', rows: 1, value: 'One' }
  ]), { viewportRows: 1 }),
  renderItem: (item) => ({ content: text({ content: item.value }) }),
  state: { selection: { mode: 'none' }, scroll },
  scrollbar: { visible: 'auto' },
  onTransition: (transition) => ({ kind: 'listView' as const, transition }),
});
const controlledCombobox = combobox({
  id: 'combobox',
  label: 'Choice',
  options: [{ id: 'one', label: 'One', value: 1 }],
  state: { kind: 'select', open: false, interaction: { selection: { mode: 'single' } }, scroll },
  scrollbar: { visible: 'auto' },
  onTransition: (transition) => ({ kind: 'combobox' as const, transition }),
});

export type _Listbox = Assert<Equal<MessageOf<typeof controlledListbox>, { readonly kind: 'listbox'; readonly transition: ListboxTransition }>>;
export type _Tree = Assert<Equal<MessageOf<typeof controlledTree>, { readonly kind: 'tree'; readonly transition: TreeTransition }>>;
type EditorMessage = { readonly kind: 'editor'; readonly transition: TextAreaTransition };
export type _EditorActual = Assert<MessageOf<typeof controlledEditor> extends EditorMessage ? true : false>;
export type _EditorExpected = Assert<EditorMessage extends MessageOf<typeof controlledEditor> ? true : false>;
export type _Log = Assert<Equal<MessageOf<typeof controlledLog>, { readonly kind: 'log'; readonly transition: LogViewerTransition }>>;
export type _Search = Assert<Equal<MessageOf<typeof controlledSearchPicker>, { readonly kind: 'searchPicker'; readonly transition: SearchPickerTransition }>>;
export type _Viewport = Assert<Equal<MessageOf<typeof controlledViewport>, { readonly kind: 'viewportScroll'; readonly request: ScrollRequest }>>;
export type _ListView = Assert<Equal<MessageOf<typeof controlledListView>, { readonly kind: 'listView'; readonly transition: ListViewTransition }>>;
export type _Combobox = Assert<Equal<MessageOf<typeof controlledCombobox>, { readonly kind: 'combobox'; readonly transition: ComboboxTransition }>>;

// @ts-expect-error listbox scrollbar requires controlled scroll state
listbox({ id: 'inert-listbox', items: [], toOption: () => ({ id: '', label: '' }), state: { selection: { mode: 'none' } }, scrollbar: { visible: 'auto' }, onTransition: (transition) => transition });
// @ts-expect-error tree scrollbar requires controlled scroll state
tree({ id: 'inert-tree', nodes: [], state: { selection: { mode: 'none' }, expandedIds: [] }, scrollbar: { visible: 'auto' }, onTransition: (transition) => transition });
// @ts-expect-error text-area scrollbar requires scroll state
textArea({ id: 'inert-editor', state: { document: createTextDocument(''), caret: textCaretAt(0) }, scrollbar: { visible: 'auto' }, onTransition: (transition) => transition });
// @ts-expect-error log viewer scrollbar requires scroll state
logViewer({ id: 'inert-log', history: createLogHistory([]), scrollbar: { visible: 'auto' }, onTransition: (transition) => transition });
// @ts-expect-error search picker scrollbar requires view scroll state
searchPicker({ id: 'inert-searchPicker', view: { input: { text: '', cursor: 0 }, query: { mode: 'fuzzy' } }, searchPickerIndex: createSearchPickerIndex([]), scrollbar: { visible: 'auto' }, onTransition: (transition) => transition });
// @ts-expect-error viewport scrollbar requires event routing
viewport(text({ content: 'content' }), { id: 'inert-viewport', scrollbar: { visible: 'auto' } });
// @ts-expect-error list view scrollbar requires view scroll state
listView({ id: 'inert-list-view', window: measuredWindow(createMeasuredCollection([]), { viewportRows: 0 }), renderItem: () => ({ content: text({ content: '' }) }), state: { selection: { mode: 'none' } }, scrollbar: { visible: 'auto' }, onTransition: (transition) => transition });

// @ts-expect-error listView has no horizontal scrolling contract
listView({ id: 'horizontal-list-view', window: measuredWindow(createMeasuredCollection([]), { viewportRows: 0 }), renderItem: () => ({ content: text({ content: '' }) }), state: { selection: { mode: 'none' }, scroll: createScrollState() }, scrollbar: { axis: 'horizontal' }, onTransition: (transition) => transition });
// @ts-expect-error passive table scrollbar requires controlled scroll state and routing
table({ id: 'inert-table', rows: [], getRowId: () => '', scrollbar: { visible: 'auto' } });
// @ts-expect-error combobox scrollbar requires view scroll state
combobox({ id: 'inert-combobox', label: 'Choice', options: [], state: { kind: 'select', open: false, interaction: { selection: { mode: 'single' } } }, scrollbar: { visible: 'auto' }, onTransition: (transition) => transition });
