import { elementFromRenderNode } from '../../render-node/element.ts';
import type { Element } from '../../element/index.ts';
import type {
  ActivityFeedOptions,
  CommandBarOptions,
  PaletteOptions,
  ScrollbackOptions,
  StructuredBlockOptions
} from '../../ui-model/options/documents.ts';
import {
  commandBarKeyBindings,
  componentMetaProps,
  interactionProps,
  mergeKeyBindings,
  paletteKeyBindings
} from '../factory-internals/interaction.ts';
import { optionalId, requiredId } from '../factory-internals/render-node.ts';
import {
  searchEntriesForRenderer,
  searchSelectionHandler
} from '../factory-internals/domain.ts';
import type {
  ComponentKeyBindingMessages,
  IndependentInteractionOptions,
  InferredElementKeyBindings
} from '../factory-internals/messages.ts';

export function scrollback<const TMessage = never>(options: ScrollbackOptions<TMessage>): Element<TMessage> {
  const onAction = options.onAction;
  return elementFromRenderNode<'scrollback', TMessage>({
    ...requiredId(options.id, 'scrollback'),
    kind: 'scrollback',
    props: {
      items: options.items,
      ...(options.scroll === undefined ? {} : { scroll: options.scroll }),
      ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
      ...(options.scrollPolicy === undefined ? {} : { scrollPolicy: options.scrollPolicy }),
      ...(onAction === undefined ? {} : {
        toScrollMessage: (event) => onAction({ kind: 'scroll', event })
      }),
      ...(options.wrap === undefined ? {} : { wrap: options.wrap }),
      ...(options.searchQuery === undefined ? {} : { searchQuery: options.searchQuery }),
      ...(options.selectedRange === undefined ? {} : { selectedRange: options.selectedRange })
    },
    ...interactionProps(options)
  });
}

export function structuredBlock(options: StructuredBlockOptions): Element {
  return elementFromRenderNode<'structuredBlock'>({
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
    ...componentMetaProps(options.meta)
  });
}

export function activityFeed<const TMessage = never>(options: ActivityFeedOptions<TMessage>): Element<TMessage> {
  const onAction = options.onAction;
  const selectedBlock = options.selected === undefined ? undefined : options.blocks[options.selected];
  const generatedKeys = onAction === undefined ? undefined : {
    arrowUp: () => onAction({ kind: 'selectPrevious' }),
    arrowDown: () => onAction({ kind: 'selectNext' }),
    home: () => onAction({ kind: 'select', index: 0 }),
    end: () => onAction({ kind: 'select', index: Math.max(0, options.blocks.length - 1) }),
    enter: () => selectedBlock === undefined ? undefined : onAction({ kind: 'toggleBlock', id: selectedBlock.id })
  } satisfies import('../../element/metadata.ts').ElementKeyBindings<TMessage>;
  const keyMap = mergeKeyBindings(generatedKeys, options.keys);
  return elementFromRenderNode<'activityFeed', TMessage>({
    ...requiredId(options.id, 'activityFeed'),
    kind: 'activityFeed',
    props: {
      blocks: options.blocks,
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(onAction === undefined ? {} : { toActionMessage: onAction })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ meta: options.meta })
  });
}

export function commandBar<
  const TActionMessage = never,
  const TTextPointerMessage = never,
  const TSubmitMessage = never,
  const TKeys extends InferredElementKeyBindings | undefined = undefined
>(
  options: IndependentInteractionOptions<
    CommandBarOptions,
    {
      readonly onAction: TActionMessage;
      readonly onTextPointer: TTextPointerMessage;
    },
    { readonly onSubmit: TSubmitMessage },
    TKeys
  >
): Element<TActionMessage | TTextPointerMessage | TSubmitMessage | ComponentKeyBindingMessages<TKeys>>;
export function commandBar(options: CommandBarOptions<unknown>): Element<unknown> {
  const action = options.onAction;
  const generatedKeys = action === undefined ? undefined : commandBarKeyBindings(action);
  const submitKeys = options.onSubmit === undefined ? undefined : { enter: () => options.onSubmit };
  const keyMap = mergeKeyBindings(mergeKeyBindings(generatedKeys, submitKeys), options.keys);
  return elementFromRenderNode<'commandBar', unknown>({
    ...requiredId(options.id, 'commandBar'),
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
  const TKeys extends InferredElementKeyBindings | undefined = undefined
>(
  options: IndependentInteractionOptions<
    PaletteOptions<TValue>,
    {
      readonly onSelect: TSelectMessage;
      readonly onScroll: TScrollMessage;
      readonly onAction: TActionMessage;
    },
    Record<never, never>,
    TKeys
  >
): Element<TSelectMessage | TScrollMessage | TActionMessage | ComponentKeyBindingMessages<TKeys>>;
export function palette<TValue>(options: PaletteOptions<TValue, unknown>): Element<unknown> {
  const action = options.onAction;
  const generatedKeys = action === undefined ? undefined : paletteKeyBindings(action);
  const keyMap = mergeKeyBindings(generatedKeys, options.keys);
  const toMessage = searchSelectionHandler(options.onSelect);
  return elementFromRenderNode<'palette', unknown>({
    ...requiredId(options.id, 'palette'),
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
