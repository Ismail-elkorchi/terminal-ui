import { componentElementFromRenderNode } from '../../renderer/model/element.ts';
import type { Element } from '../../element/index.ts';
import type {
  ActivityFeedOptions,
  CommandInputOptions,
  PassiveSearchPickerOptions,
  PassiveLogViewerOptions,
  SearchPickerOptions,
  ScrollableSearchPickerOptions,
  ScrollableLogViewerOptions,
  LogViewerOptions,
  StructuredBlockOptions
} from '../options/documents.ts';
import {
  commandInputKeyBindings,
  componentMetaProps,
  interactionProps,
  mergeKeyBindings,
  searchPickerKeyBindings
} from '../internal/interaction.ts';
import { optionalId, requiredId } from '../../authoring/render-node.ts';
import { ignoreMessage } from '../../interaction/message.ts';
import { searchSelectionHandler } from '../internal/domain.ts';
import type {
  ComponentKeyBindingMessages,
  IndependentInteractionOptions,
  InferredElementKeyBindings
} from '../internal/messages.ts';
import type { LogViewerAction, LogViewerControlAction } from '../../ui-model/log-viewer.ts';
import { assertLogHistory } from '../../ui-model/log-history.ts';

/* eslint-disable @typescript-eslint/unified-signatures -- Separate overloads preserve contextual action types for passive and scrollable controls. */
export function logViewer<
  const TActionMessage = unknown,
  const TPointerMessage = never,
  const TKeys extends InferredElementKeyBindings | undefined = undefined
>(
  options: IndependentInteractionOptions<
    ScrollableLogViewerOptions,
    { readonly onAction: TActionMessage },
    TKeys,
    TPointerMessage
  >
): Element<TActionMessage | TPointerMessage | ComponentKeyBindingMessages<TKeys>>;
export function logViewer<
  const TActionMessage = never,
  const TPointerMessage = never,
  const TKeys extends InferredElementKeyBindings | undefined = undefined
>(
  options: IndependentInteractionOptions<
    PassiveLogViewerOptions,
    { readonly onAction: TActionMessage },
    TKeys,
    TPointerMessage
  >
): Element<TActionMessage | TPointerMessage | ComponentKeyBindingMessages<TKeys>>;
/* eslint-enable @typescript-eslint/unified-signatures */
export function logViewer(options: LogViewerOptions<unknown>): Element<unknown> {
  assertLogHistory(options.history);
  const onControlAction: ((action: LogViewerControlAction) => unknown) | undefined = options.onAction;
  const onAction: ((action: LogViewerAction) => unknown) | undefined = options.onAction === undefined
    ? undefined
    : isScrollableLogViewerOptions(options)
      ? options.onAction
      : (action) => action.kind === 'scroll'
        ? ignoreMessage()
        : onControlAction === undefined
          ? ignoreMessage()
          : onControlAction(action);
  return componentElementFromRenderNode<'logViewer', unknown>({
    ...requiredId(options.id, 'logViewer'),
    kind: 'logViewer',
    props: {
      history: options.history,
      ...(options.scroll === undefined ? {} : { scroll: options.scroll }),
      ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
      ...(options.scrollPolicy === undefined ? {} : { scrollPolicy: options.scrollPolicy }),
      ...(onAction === undefined ? {} : { toActionMessage: onAction }),
      ...(options.wrap === undefined ? {} : { wrap: options.wrap }),
      ...(options.searchQuery === undefined ? {} : { searchQuery: options.searchQuery }),
      ...(options.selectedMatch === undefined ? {} : { selectedMatch: options.selectedMatch }),
      ...(options.foldedIds === undefined ? {} : { foldedIds: options.foldedIds }),
      ...(options.selection === undefined ? {} : { selection: options.selection })
    },
    ...interactionProps(options)
  });
}

function isScrollableLogViewerOptions<TMessage>(
  options: LogViewerOptions<TMessage>
): options is ScrollableLogViewerOptions<TMessage> {
  return options.scroll !== undefined;
}

export function structuredBlock(options: StructuredBlockOptions): Element {
  return componentElementFromRenderNode<'structuredBlock'>({
    ...optionalId(options.id),
    kind: 'structuredBlock',
    props: {
      title: options.title,
      ...(options.summary === undefined ? {} : { summary: options.summary }),
      ...(options.style === undefined ? {} : { style: options.style }),
      ...(options.result === undefined ? {} : { result: options.result }),
      ...(options.level === undefined ? {} : { level: options.level }),
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
  const selectedBlock = options.selectedId === undefined
    ? undefined
    : options.blocks.find((block) => block.id === options.selectedId);
  const generatedKeys = onAction === undefined ? undefined : {
    arrowUp: () => onAction({ kind: 'selectPrevious' }),
    arrowDown: () => onAction({ kind: 'selectNext' }),
    home: () => onAction({ kind: 'selectFirst' }),
    end: () => onAction({ kind: 'selectLast' }),
    enter: () => selectedBlock === undefined ? ignoreMessage() : onAction({ kind: 'toggleBlock', id: selectedBlock.id })
  } satisfies import('../../element/metadata.ts').ElementKeyBindings<TMessage>;
  const keyMap = mergeKeyBindings(generatedKeys, options.keys);
  return componentElementFromRenderNode<'activityFeed', TMessage>({
    ...requiredId(options.id, 'activityFeed'),
    kind: 'activityFeed',
    props: {
      blocks: options.blocks,
      ...(options.selectedId === undefined ? {} : { selectedId: options.selectedId }),
      ...(onAction === undefined ? {} : { toActionMessage: onAction })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ pointer: options.pointer, meta: options.meta })
  });
}

export function commandInput<
  const TActionMessage = never,
  const TSubmitMessage = never,
  const TPointerMessage = never,
  const TKeys extends InferredElementKeyBindings | undefined = undefined
>(
  options: IndependentInteractionOptions<
    CommandInputOptions,
    {
      readonly onAction: TActionMessage;
      readonly onSubmit: TSubmitMessage;
    },
    TKeys,
    TPointerMessage
  >
): Element<TActionMessage | TSubmitMessage | TPointerMessage | ComponentKeyBindingMessages<TKeys>>;
export function commandInput(options: CommandInputOptions<unknown>): Element<unknown> {
  const action = options.onAction;
  const generatedKeys = action === undefined ? undefined : commandInputKeyBindings(action);
  const onSubmit = options.onSubmit;
  const submitKeys = onSubmit === undefined
    ? undefined
    : { enter: () => onSubmit(options.presentation.value) };
  const keyMap = mergeKeyBindings(mergeKeyBindings(generatedKeys, submitKeys), options.keys);
  const presentation = options.presentation;
  return componentElementFromRenderNode<'commandInput', unknown>({
    ...requiredId(options.id, 'commandInput'),
    kind: 'commandInput',
    props: {
      value: presentation.value,
      cursor: presentation.cursor,
      ...(presentation.selection === undefined ? {} : { selection: presentation.selection }),
      ...(options.prompt === undefined ? {} : { prompt: options.prompt }),
      ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
      ...(options.completionPreview === undefined ? {} : { completionPreview: options.completionPreview }),
      ...(options.validation === undefined ? {} : { validation: options.validation }),
      ...(options.footer === undefined ? {} : { footer: options.footer }),
      ...(options.matchQuery === undefined ? {} : { matchQuery: options.matchQuery }),
      suggestions: presentation.suggestions,
      ...(presentation.selectedSuggestionIndex === undefined ? {} : { selectedSuggestionIndex: presentation.selectedSuggestionIndex }),
      ...(presentation.historyIndex === undefined ? {} : { historyIndex: presentation.historyIndex }),
      ...(options.display === undefined ? {} : { display: options.display }),
      ...(action === undefined ? {} : { toActionMessage: action })
    },
    ...interactionProps({
      ...(action === undefined ? {} : {
        onInput: (text) => action({ kind: 'edit', operation: { kind: 'insert', text } }),
        onPaste: (text) => action({ kind: 'edit', operation: { kind: 'insert', text } })
      }),
      ...(keyMap === undefined ? {} : { keys: keyMap }),
      pointer: options.pointer,
      meta: options.meta
    })
  });
}

export function searchPicker<
  TValue,
  const TSelectMessage = never,
  const TScrollMessage = unknown,
  const TActionMessage = never,
  const TPointerMessage = never,
  const TKeys extends InferredElementKeyBindings | undefined = undefined
>(
  options: IndependentInteractionOptions<
    ScrollableSearchPickerOptions<TValue>,
    {
      readonly onSelect: TSelectMessage;
      readonly onScroll: TScrollMessage;
      readonly onAction: TActionMessage;
    },
    TKeys,
    TPointerMessage
  >
): Element<TSelectMessage | TScrollMessage | TActionMessage | TPointerMessage | ComponentKeyBindingMessages<TKeys>>;
export function searchPicker<
  TValue,
  const TSelectMessage = never,
  const TActionMessage = never,
  const TPointerMessage = never,
  const TKeys extends InferredElementKeyBindings | undefined = undefined
>(
  options: IndependentInteractionOptions<
    PassiveSearchPickerOptions<TValue>,
    {
      readonly onSelect: TSelectMessage;
      readonly onAction: TActionMessage;
    },
    TKeys,
    TPointerMessage
  >
): Element<TSelectMessage | TActionMessage | TPointerMessage | ComponentKeyBindingMessages<TKeys>>;
export function searchPicker<TValue>(options: SearchPickerOptions<TValue, unknown>): Element<unknown> {
  const action = options.onAction;
  const generatedKeys = action === undefined ? undefined : searchPickerKeyBindings(action);
  const keyMap = mergeKeyBindings(generatedKeys, options.keys);
  const toMessage = searchSelectionHandler(options.onSelect);
  return componentElementFromRenderNode<'searchPicker', unknown>({
    ...requiredId(options.id, 'searchPicker'),
    kind: 'searchPicker',
    props: {
      searchPickerIndex: options.searchPickerIndex,
      ...(options.title === undefined ? {} : { title: options.title }),
      ...(options.query === undefined ? {} : { query: options.query }),
      ...(toMessage === undefined ? {} : { toMessage }),
      ...(options.selectedIndex === undefined ? {} : { selectedIndex: options.selectedIndex }),
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
      pointer: options.pointer,
      meta: options.meta
    })
  });
}
