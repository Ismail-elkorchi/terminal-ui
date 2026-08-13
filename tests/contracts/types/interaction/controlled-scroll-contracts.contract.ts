import {
  listbox,
  logViewer,
  searchPicker,
  text,
  textArea,
  tree,
  type Element,
  type ListboxTransition,
  type LogViewerAction,
  type SearchPickerTransition,
  type TextAreaAction,
  type TreeTransition,
} from '@ismail-elkorchi/terminal-ui/components';
import { createScrollState, prepareLogHistory, prepareSearchPickerIndex } from '@ismail-elkorchi/terminal-ui/behavior';
import { viewport } from '@ismail-elkorchi/terminal-ui/layout';
import type { ScrollEvent } from '@ismail-elkorchi/terminal-ui/interaction';
import { prepareTextDocument, textCaretAt } from '@ismail-elkorchi/terminal-ui/text';

export type MessageOf<TElement> = TElement extends Element<infer TMessage> ? TMessage : never;
export type Equal<TLeft, TRight> =
  (<T>() => T extends TLeft ? 1 : 2) extends
  (<T>() => T extends TRight ? 1 : 2) ? true : false;
export type Assert<TValue extends true> = TValue;

const scroll = createScrollState();
const controlledListbox = listbox({
  id: 'listbox',
  items: ['one'],
  projectItem: (value) => ({ id: value, label: value }),
  presentation: { activeId: 'one', selection: { mode: 'none' } },
  scroll,
  scrollbar: { visible: 'auto' },
  onTransition: (transition) => ({ kind: 'listbox' as const, transition }),
});
const controlledTree = tree({
  id: 'tree',
  nodes: [{ id: 'one', label: 'One', kind: 'leaf' }],
  presentation: { activeId: 'one', selection: { mode: 'none' }, expandedIds: [] },
  scroll,
  scrollbar: { visible: 'auto' },
  onTransition: (transition) => ({ kind: 'tree' as const, transition }),
});
const controlledEditor = textArea({
  id: 'editor',
  presentation: { document: prepareTextDocument('value'), caret: textCaretAt(0), scroll },
  scrollbar: { visible: 'auto' },
  onAction: (action: TextAreaAction) => ({ kind: 'editor' as const, action }),
});
const controlledLog = logViewer({
  id: 'log',
  history: prepareLogHistory([{ id: 'one', text: 'One' }]),
  scroll,
  scrollbar: { visible: 'auto' },
  onAction: (action) => ({ kind: 'log' as const, action }),
});
const controlledSearchPicker = searchPicker({
  id: 'searchPicker',
  presentation: { query: { text: '', mode: 'fuzzy' }, scroll },
  searchPickerIndex: prepareSearchPickerIndex([{ id: 'one', label: 'One', value: 1 }]),
  scrollbar: { visible: 'auto' },
  onTransition: (transition) => ({ kind: 'searchPicker' as const, transition }),
});
const controlledViewport = viewport(text({ content: 'content' }), {
  id: 'viewport',
  offset: { row: 0, column: 0 },
  scrollbar: { visible: 'auto' },
  onScroll: (event) => ({ kind: 'viewportScroll' as const, event }),
});

export type _Listbox = Assert<Equal<MessageOf<typeof controlledListbox>, { readonly kind: 'listbox'; readonly transition: ListboxTransition }>>;
export type _Tree = Assert<Equal<MessageOf<typeof controlledTree>, { readonly kind: 'tree'; readonly transition: TreeTransition }>>;
type EditorMessage = { readonly kind: 'editor'; readonly action: TextAreaAction };
export type _EditorActual = Assert<MessageOf<typeof controlledEditor> extends EditorMessage ? true : false>;
export type _EditorExpected = Assert<EditorMessage extends MessageOf<typeof controlledEditor> ? true : false>;
export type _Log = Assert<Equal<MessageOf<typeof controlledLog>, { readonly kind: 'log'; readonly action: LogViewerAction }>>;
export type _Search = Assert<Equal<MessageOf<typeof controlledSearchPicker>, { readonly kind: 'searchPicker'; readonly transition: SearchPickerTransition }>>;
export type _Viewport = Assert<Equal<MessageOf<typeof controlledViewport>, { readonly kind: 'viewportScroll'; readonly event: ScrollEvent }>>;

// @ts-expect-error listbox scrollbar requires controlled scroll state
listbox({ id: 'inert-listbox', items: [], projectItem: () => ({ id: '', label: '' }), presentation: { selection: { mode: 'none' } }, scrollbar: { visible: 'auto' }, onTransition: (transition) => transition });
// @ts-expect-error tree scrollbar requires controlled scroll state
tree({ id: 'inert-tree', nodes: [], presentation: { selection: { mode: 'none' }, expandedIds: [] }, scrollbar: { visible: 'auto' }, onTransition: (transition) => transition });
// @ts-expect-error text-area scrollbar requires scroll presentation
textArea({ id: 'inert-editor', presentation: { document: prepareTextDocument(''), caret: textCaretAt(0) }, scrollbar: { visible: 'auto' }, onAction: (action) => action });
// @ts-expect-error log viewer scrollbar requires scroll state
logViewer({ id: 'inert-log', history: prepareLogHistory([]), scrollbar: { visible: 'auto' }, onAction: (action) => action });
// @ts-expect-error search picker scrollbar requires presentation scroll state
searchPicker({ id: 'inert-searchPicker', presentation: { query: { text: '', mode: 'fuzzy' } }, searchPickerIndex: prepareSearchPickerIndex([]), scrollbar: { visible: 'auto' }, onTransition: (transition) => transition });
// @ts-expect-error viewport scrollbar requires event routing
viewport(text({ content: 'content' }), { id: 'inert-viewport', scrollbar: { visible: 'auto' } });
