import { elementFromRenderNode, toRenderNode } from '../../render-node/element.ts';
import type { RenderNode } from '../../render-node/index.ts';
import type { Element, ElementMessage } from '../element.ts';
import type {
  ActivityFeedOptions,
  CommandBarOptions,
  PaletteOptions,
  ScrollbackOptions,
  StructuredBlockOptions,
  ViewportOptions
} from '../options/documents.ts';
import {
  commandBarKeyBindings,
  interactionProps,
  mergeKeyBindings,
  paletteKeyBindings
} from '../factory-internals/interaction.ts';
import { layoutProps, optionalId } from '../factory-internals/layout.ts';
import {
  searchEntriesForRenderer,
  searchSelectionHandler
} from '../factory-internals/domain.ts';
import type { IndependentInteractionOptions } from '../factory-internals/messages.ts';

export function viewport<const TChild extends Element<unknown>, const TMessage = never>(
  child: TChild,
  options: ViewportOptions<TMessage> = {}
): Element<ElementMessage<TChild> | TMessage> {
  type Message = ElementMessage<TChild> | TMessage;
  const childNode = toRenderNode(child);
  return elementFromRenderNode<'viewport', Message>({
    ...optionalId(options.id),
    kind: 'viewport',
    props: {
      ...(options.scrollRow === undefined ? {} : { scrollRow: options.scrollRow }),
      ...(options.scrollColumn === undefined ? {} : { scrollColumn: options.scrollColumn }),
      ...(options.contentRows === undefined ? {} : { contentRows: options.contentRows }),
      ...(options.contentColumns === undefined ? {} : { contentColumns: options.contentColumns }),
      ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
      ...(options.scrollPolicy === undefined ? {} : { scrollPolicy: options.scrollPolicy }),
      ...(options.onScroll === undefined ? {} : { toScrollMessage: options.onScroll }),
      ...layoutProps(options)
    },
    children: [childNode] as readonly RenderNode<Message>[],
    ...interactionProps(options)
  });
}

export function scrollback<const TMessage = never>(options: ScrollbackOptions<TMessage>): Element<TMessage> {
  return elementFromRenderNode<'scrollback', TMessage>({
    ...optionalId(options.id),
    kind: 'scrollback',
    props: {
      items: options.items,
      ...(options.scroll === undefined ? {} : { scroll: options.scroll }),
      ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
      ...(options.scrollPolicy === undefined ? {} : { scrollPolicy: options.scrollPolicy }),
      ...(options.onScroll === undefined ? {} : { toScrollMessage: options.onScroll }),
      ...(options.wrap === undefined ? {} : { wrap: options.wrap }),
      ...(options.searchQuery === undefined ? {} : { searchQuery: options.searchQuery }),
      ...(options.selectedRange === undefined ? {} : { selectedRange: options.selectedRange })
    },
    ...interactionProps(options)
  });
}

export function structuredBlock<const TMessage = never>(options: StructuredBlockOptions<TMessage>): Element<TMessage> {
  return elementFromRenderNode<'structuredBlock', TMessage>({
    ...optionalId(options.id),
    kind: 'structuredBlock',
    props: {
      title: options.title,
      ...(options.summary === undefined ? {} : { summary: options.summary }),
      ...(options.style === undefined ? {} : { style: options.style }),
      ...(options.status === undefined ? {} : { status: options.status }),
      ...(options.fields === undefined ? {} : { fields: options.fields }),
      ...(options.body === undefined ? {} : { body: options.body }),
      ...(options.details === undefined ? {} : { details: options.details }),
      ...(options.collapsed === undefined ? {} : { collapsed: options.collapsed })
    },
    ...interactionProps(options)
  });
}

export function activityFeed<const TMessage = never>(options: ActivityFeedOptions<TMessage>): Element<TMessage> {
  return elementFromRenderNode<'activityFeed', TMessage>({
    ...optionalId(options.id),
    kind: 'activityFeed',
    props: {
      blocks: options.blocks,
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.onSelect === undefined ? {} : {
        toSelectMessage: (index: number) => {
          const block = options.blocks[index];
          return block === undefined ? undefined : options.onSelect?.(block, index);
        }
      })
    },
    ...interactionProps(options)
  });
}

export function commandBar(): Element;
export function commandBar<
  const TActionMessage = never,
  const TTextPointerMessage = never,
  const TSubmitMessage = never,
  const TKeyMessage = never
>(
  options: IndependentInteractionOptions<
    CommandBarOptions,
    {
      readonly onAction: TActionMessage;
      readonly onTextPointer: TTextPointerMessage;
    },
    { readonly onSubmit: TSubmitMessage },
    TKeyMessage
  >
): Element<TActionMessage | TTextPointerMessage | TSubmitMessage | TKeyMessage>;
export function commandBar(options: CommandBarOptions<unknown> = {}): Element<unknown> {
  const action = options.onAction;
  const generatedKeys = action === undefined ? undefined : commandBarKeyBindings(action);
  const submitKeys = options.onSubmit === undefined ? undefined : { enter: options.onSubmit };
  const keyMap = mergeKeyBindings(mergeKeyBindings(generatedKeys, submitKeys), options.keys);
  return elementFromRenderNode<'commandBar', unknown>({
    ...optionalId(options.id),
    kind: 'commandBar',
    props: {
      value: options.value ?? '',
      ...(options.cursor === undefined ? {} : { cursor: options.cursor }),
      ...(options.selection === undefined ? {} : { selection: options.selection }),
      ...(options.prompt === undefined ? {} : { prompt: options.prompt }),
      ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
      ...(options.completionPreview === undefined ? {} : { completionPreview: options.completionPreview }),
      ...(options.validation === undefined ? {} : { validation: options.validation }),
      ...(options.footer === undefined ? {} : { footer: options.footer }),
      ...(options.matchQuery === undefined ? {} : { matchQuery: options.matchQuery }),
      ...(options.suggestions === undefined ? {} : { suggestions: options.suggestions }),
      ...(options.selectedSuggestion === undefined ? {} : { selectedSuggestion: options.selectedSuggestion }),
      ...(options.historyIndex === undefined ? {} : { historyIndex: options.historyIndex }),
      ...(options.display === undefined ? {} : { display: options.display }),
      ...(options.onTextPointer === undefined ? {} : { toTextPointerMessage: options.onTextPointer })
    },
    ...interactionProps({
      ...(action === undefined ? {} : {
        onInput: (text) => action({ kind: 'insert', text }),
        onPaste: (text) => action({ kind: 'insert', text })
      }),
      ...(keyMap === undefined ? {} : { keys: keyMap }),
      meta: options.meta
    })
  });
}

export function palette<
  TValue,
  const TSelectMessage = never,
  const TScrollMessage = never,
  const TActionMessage = never,
  const TKeyMessage = never
>(
  options: IndependentInteractionOptions<
    PaletteOptions<TValue>,
    {
      readonly onSelect: TSelectMessage;
      readonly onScroll: TScrollMessage;
      readonly onAction: TActionMessage;
    },
    Record<never, never>,
    TKeyMessage
  >
): Element<TSelectMessage | TScrollMessage | TActionMessage | TKeyMessage>;
export function palette<TValue>(options: PaletteOptions<TValue, unknown>): Element<unknown> {
  const action = options.onAction;
  const generatedKeys = action === undefined ? undefined : paletteKeyBindings(action);
  const keyMap = mergeKeyBindings(generatedKeys, options.keys);
  const toMessage = searchSelectionHandler(options.onSelect);
  return elementFromRenderNode<'palette', unknown>({
    ...optionalId(options.id),
    kind: 'palette',
    props: {
      entries: searchEntriesForRenderer(options.entries),
      ...(options.title === undefined ? {} : { title: options.title }),
      ...(options.query === undefined ? {} : { query: options.query }),
      ...(toMessage === undefined ? {} : { toMessage }),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.selectedId === undefined ? {} : { selectedId: options.selectedId }),
      ...(options.scroll === undefined ? {} : { scroll: options.scroll }),
      ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
      ...(options.scrollPolicy === undefined ? {} : { scrollPolicy: options.scrollPolicy }),
      ...(options.onScroll === undefined ? {} : { toScrollMessage: options.onScroll }),
      ...(options.maxVisible === undefined ? {} : { maxVisible: options.maxVisible }),
      ...(options.helpText === undefined ? {} : { helpText: options.helpText }),
      ...(options.emptyText === undefined ? {} : { emptyText: options.emptyText })
    },
    ...interactionProps({
      ...(action === undefined ? {} : {
        onInput: (text) => action({ kind: 'insertQuery', text }),
        onPaste: (text) => action({ kind: 'insertQuery', text })
      }),
      ...(keyMap === undefined ? {} : { keys: keyMap }),
      meta: options.meta
    })
  });
}
