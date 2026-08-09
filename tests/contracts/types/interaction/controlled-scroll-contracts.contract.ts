import {
  list,
  searchPicker,
  logViewer,
  text,
  textArea,
  tree,
  type Element,
  type ListAction,
  type LogViewerAction,
  type TextAreaAction,
  type TreeInteractionAction
} from '@ismail-elkorchi/terminal-ui/components';
import {
  createScrollState,
  prepareLogHistory,
  prepareSearchPickerIndex,
  searchPickerReducer
} from '@ismail-elkorchi/terminal-ui/behavior';
import { viewport } from '@ismail-elkorchi/terminal-ui/layout';
import type { ScrollEvent } from '@ismail-elkorchi/terminal-ui/interaction';
import { prepareTextDocument, textCaretAt } from '@ismail-elkorchi/terminal-ui/text';

export type MessageOf<TElement> = TElement extends Element<infer TMessage> ? TMessage : never;
export type Equal<TLeft, TRight> =
  (<T>() => T extends TLeft ? 1 : 2) extends
  (<T>() => T extends TRight ? 1 : 2) ? true : false;
export type Assert<TValue extends true> = TValue;

const scroll = createScrollState({ contentRows: 20, contentColumns: 40 });

const controlledList = list({
  id: 'list',
  items: ['one'],
  projectItem: (value) => ({ id: value, label: value }),
  scroll,
  scrollbar: { visible: 'auto' },
  onAction: (action) => ({ kind: 'list' as const, action })
});
const controlledTree = tree({
  id: 'tree',
  nodes: [{ id: 'one', label: 'One', kind: 'leaf' }],
  scroll,
  scrollbar: { visible: 'auto' },
  onAction: (action) => ({ kind: 'tree' as const, action })
});
const controlledEditor = textArea({
  id: 'editor',
  presentation: { document: prepareTextDocument('value'), caret: textCaretAt(0), scroll },
  scrollbar: { visible: 'auto' },
  onAction: (action: TextAreaAction) => ({ kind: 'editor' as const, action })
});
const controlledLog = logViewer({
  id: 'log',
  history: prepareLogHistory([{ id: 'one', text: 'One' }]),
  scroll,
  scrollbar: { visible: 'auto' },
  onAction: (action) => ({ kind: 'log' as const, action })
});
const controlledSearchPicker = searchPicker({
  id: 'searchPicker',
  searchPickerIndex: prepareSearchPickerIndex([{ id: 'one', label: 'One', value: 1 }]),
  scroll,
  scrollbar: { visible: 'auto' },
  onAction: (action) => ({ kind: 'searchPicker' as const, action })
});
const numericSearchPickerIndex = prepareSearchPickerIndex([
  { id: 'one', label: 'One', value: 1 }
]);
searchPickerReducer(
  { query: '', selectedId: 'one' },
  {
    kind: 'activate',
    entry: { id: 'one', label: 'One', value: 1 }
  },
  { searchPickerIndex: numericSearchPickerIndex }
);
const controlledViewport = viewport(text({ content: 'content' }), {
  id: 'viewport',
  offset: { row: 0, column: 0 },
  scrollbar: { visible: 'auto' },
  onScroll: (event) => ({ kind: 'viewportScroll' as const, event })
});

export type _List = Assert<Equal<
  MessageOf<typeof controlledList>,
  { readonly kind: 'list'; readonly action: ListAction }
>>;
export type _Tree = Assert<Equal<
  MessageOf<typeof controlledTree>,
  { readonly kind: 'tree'; readonly action: TreeInteractionAction }
>>;
type EditorMessage = { readonly kind: 'editor'; readonly action: TextAreaAction };
export type _EditorActual = Assert<MessageOf<typeof controlledEditor> extends EditorMessage ? true : false>;
export type _EditorExpected = Assert<EditorMessage extends MessageOf<typeof controlledEditor> ? true : false>;
export type _Log = Assert<Equal<
  MessageOf<typeof controlledLog>,
  { readonly kind: 'log'; readonly action: LogViewerAction }
>>;
export type _SearchPicker = Assert<Equal<
  MessageOf<typeof controlledSearchPicker>,
  {
    readonly kind: 'searchPicker';
    readonly action: import('@ismail-elkorchi/terminal-ui/components').SearchPickerAction<number>;
  }
>>;
export type _Viewport = Assert<Equal<
  MessageOf<typeof controlledViewport>,
  { readonly kind: 'viewportScroll'; readonly event: ScrollEvent }
>>;

// @ts-expect-error list scrollbar requires controlled scroll state and action routing
list({ id: 'inert-list', items: [], projectItem: () => ({ id: '', label: '' }), scrollbar: { visible: 'auto' } });
// @ts-expect-error tree scrollbar requires controlled scroll state and action routing
tree({ id: 'inert-tree', nodes: [], scrollbar: { visible: 'auto' } });
// @ts-expect-error text-area scrollbar requires scroll presentation and action routing
textArea({ id: 'inert-editor', presentation: { document: prepareTextDocument(''), caret: textCaretAt(0 )}, scrollbar: { visible: 'auto' } });
// @ts-expect-error logViewer scrollbar requires controlled scroll state and action routing
logViewer({ id: 'inert-log', history: prepareLogHistory([]), scrollbar: { visible: 'auto' } });
// @ts-expect-error searchPicker requires one action route
searchPicker({ id: 'inert-searchPicker', searchPickerIndex: prepareSearchPickerIndex([]), scrollbar: { visible: 'auto' } });
// @ts-expect-error viewport scrollbar requires event routing
viewport(text({ content: 'content' }), { id: 'inert-viewport', scrollbar: { visible: 'auto' } });
