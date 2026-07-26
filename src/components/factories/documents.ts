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
import { sanitizeTerminalText } from '../../text/index.ts';
import { isRecordResult, isValidationLevel } from '../../ui-model/status.ts';
import type { FieldItem, LogLevel } from '../../ui-model/contracts.ts';
import type { CommandInputValidation, StructuredBlock } from '../../ui-model/documents.ts';

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
  const block = normalizeStructuredBlock({
    id: options.id ?? 'structured-block',
    title: options.title,
    ...(options.summary === undefined ? {} : { summary: options.summary }),
    ...(options.style === undefined ? {} : { style: options.style }),
    ...(options.result === undefined ? {} : { result: options.result }),
    ...(options.level === undefined ? {} : { level: options.level }),
    ...(options.fields === undefined ? {} : { fields: options.fields }),
    ...(options.body === undefined ? {} : { body: options.body }),
    ...(options.details === undefined ? {} : { details: options.details }),
    ...(options.collapsed === undefined ? {} : { collapsed: options.collapsed })
  });
  return componentElementFromRenderNode<'structuredBlock'>({
    ...optionalId(options.id),
    kind: 'structuredBlock',
    props: {
      title: block.title,
      ...(block.summary === undefined ? {} : { summary: block.summary }),
      ...(block.style === undefined ? {} : { style: block.style }),
      ...(block.result === undefined ? {} : { result: block.result }),
      ...(block.level === undefined ? {} : { level: block.level }),
      ...(block.fields === undefined ? {} : { fields: block.fields }),
      ...(block.body === undefined ? {} : { body: block.body }),
      ...(block.details === undefined ? {} : { details: block.details }),
      ...(block.collapsed === undefined ? {} : { collapsed: block.collapsed })
    },
    ...componentMetaProps(options.meta)
  });
}

export function activityFeed<const TMessage = never>(options: ActivityFeedOptions<TMessage>): Element<TMessage> {
  const blocks = Object.freeze(options.blocks.map(normalizeStructuredBlock));
  const onAction = options.onAction;
  const selectedBlock = options.selectedId === undefined
    ? undefined
    : blocks.find((block) => block.id === options.selectedId);
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
      blocks,
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
  const validation = normalizeCommandInputValidation(options.validation);
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
      ...(validation === undefined ? {} : { validation }),
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

function normalizeStructuredBlock(value: StructuredBlock): StructuredBlock {
  if (value.id.trim().length === 0) throw new TypeError('Structured block id must not be empty.');
  if (value.result !== undefined && !isRecordResult(value.result)) {
    throw new TypeError('Structured block result is invalid.');
  }
  if (value.level !== undefined && !isLogLevel(value.level)) {
    throw new TypeError('Structured block level must be info, warning, or error.');
  }
  const fields = value.fields?.map((field): FieldItem => Object.freeze({
    label: cleanLine(field.label),
    value: cleanLine(field.value)
  }));
  return Object.freeze({
    id: cleanLine(value.id),
    title: cleanLine(value.title),
    ...(value.summary === undefined ? {} : { summary: cleanLine(value.summary) }),
    ...(value.style === undefined ? {} : { style: value.style }),
    ...(value.result === undefined ? {} : { result: value.result }),
    ...(value.level === undefined ? {} : { level: value.level }),
    ...(fields === undefined ? {} : { fields: Object.freeze(fields) }),
    ...(value.body === undefined ? {} : { body: cleanText(value.body) }),
    ...(value.details === undefined ? {} : { details: cleanText(value.details) }),
    ...(value.collapsed === undefined ? {} : { collapsed: value.collapsed })
  });
}

function normalizeCommandInputValidation(
  value: CommandInputValidation | undefined
): CommandInputValidation | undefined {
  if (value === undefined) return undefined;
  if (value.level !== undefined && !isValidationLevel(value.level)) {
    throw new TypeError('Command input validation level must be info, warning, or error.');
  }
  const message = cleanLine(value.message);
  if (message.length === 0) return undefined;
  return Object.freeze({
    message,
    ...(value.level === undefined ? {} : { level: value.level })
  });
}

function isLogLevel(value: unknown): value is LogLevel {
  return value === 'info' || value === 'warning' || value === 'error';
}

function cleanLine(value: string): string {
  return cleanText(value).replace(/\s*\n\s*/gu, ' ');
}

function cleanText(value: string): string {
  return sanitizeTerminalText(value).text;
}
