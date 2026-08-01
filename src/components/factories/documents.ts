import { componentElementFromRenderNode } from '../../renderer/model/element.ts';
import type { Element } from '../../element/index.ts';
import type {
  CommandInputOptions,
  PassiveLogViewerOptions,
  SearchPickerOptions,
  ScrollableLogViewerOptions,
  LogViewerOptions
} from '../options/documents.ts';
import {
  commandInputKeyBindings,
  interactionProps,
  mergeKeyBindings,
  requireComponentHandler,
  searchPickerKeyBindings
} from '../internal/interaction.ts';
import { requiredRenderNodeId } from '../../renderer/model/element.ts';
import { ignoreMessage } from '../../interaction/message.ts';
import type {
  ComponentKeyBindingMessages,
  IndependentInteractionOptions,
  InferredElementKeyBindings
} from '../internal/messages.ts';
import type { LogViewerAction, LogViewerControlAction } from '../../ui-model/log-viewer.ts';
import { assertLogHistory } from '../../ui-model/log-history.ts';
import { sanitizeTerminalText } from '../../text/index.ts';
import { isValidationLevel } from '../../ui-model/status.ts';
import type { CommandInputValidation } from '../../ui-model/documents.ts';
import { commandInputPopupRenderNode } from '../internal/command-input-popup.ts';
import { searchPickerWindow } from '../../behavior/search-picker.ts';
import type { SearchPickerAction } from '../../ui-model/search-picker.ts';
import type {
  PointerInteractionOptions
} from '../../interaction/pointer-interaction.ts';

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
    ...requiredRenderNodeId(options.id, 'logViewer'),
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
  const onSubmit = options.onSubmit;
  requireComponentHandler('commandInput', 'onAction', action);
  requireComponentHandler('commandInput', 'onSubmit', onSubmit);
  const generatedKeys = commandInputKeyBindings(action, options.presentation);
  const selectedSuggestion = options.presentation.selectedSuggestionIndex === undefined
    ? undefined
    : options.presentation.suggestions[options.presentation.selectedSuggestionIndex];
  const submittedValue = selectedSuggestion?.disabled === true
    ? options.presentation.value
    : selectedSuggestion?.value ?? options.presentation.value;
  const submitKeys = { enter: () => onSubmit(submittedValue) };
  const keyMap = mergeKeyBindings(mergeKeyBindings(generatedKeys, submitKeys), options.keys);
  const presentation = options.presentation;
  const validation = normalizeCommandInputValidation(options.validation);
  const maxVisibleSuggestions = commandInputVisibleSuggestionLimit(options.maxVisibleSuggestions);
  const popup = options.display === 'popup' && presentation.suggestions.length > 0
    ? commandInputPopupRenderNode({
        parentElementId: options.id,
        suggestions: presentation.suggestions,
        ...(presentation.selectedSuggestionIndex === undefined
          ? {}
          : { selectedSuggestionIndex: presentation.selectedSuggestionIndex }),
        maxVisibleSuggestions,
        toActionMessage: action,
        toSubmitMessage: onSubmit
      })
    : undefined;
  return componentElementFromRenderNode<'commandInput', unknown>({
    ...requiredRenderNodeId(options.id, 'commandInput'),
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
      ...(options.placement === undefined ? {} : { placement: options.placement }),
      maxVisibleSuggestions,
      toActionMessage: action
    },
    ...(popup === undefined ? {} : { children: [popup] }),
    ...interactionProps({
      onInput: (text) => action({ kind: 'edit', operation: { kind: 'insert', text } }),
      onPaste: (text) => action({ kind: 'edit', operation: { kind: 'insert', text } }),
      ...(keyMap === undefined ? {} : { keys: keyMap }),
      pointer: options.pointer,
      meta: options.meta
    })
  });
}

function commandInputVisibleSuggestionLimit(value: number | undefined): number {
  if (value === undefined) return 8;
  if (!Number.isFinite(value) || value < 1) {
    throw new RangeError('commandInput maxVisibleSuggestions must be a positive finite number.');
  }
  return Math.max(1, Math.floor(value));
}

export function searchPicker<
  TValue,
  const TActionMessage,
  const TPointerMessage = never,
  const TKeys extends InferredElementKeyBindings | undefined = undefined
>(options: SearchPickerFactoryOptions<
  TValue,
  TActionMessage,
  TPointerMessage,
  TKeys
>): Element<TActionMessage | TPointerMessage | ComponentKeyBindingMessages<TKeys>>;
export function searchPicker(options: unknown): Element<unknown> {
  return searchPickerElement(
    options as SearchPickerOptions<unknown, unknown>
  );
}

type SearchPickerFactoryOptions<
  TValue,
  TActionMessage,
  TPointerMessage,
  TKeys extends InferredElementKeyBindings | undefined
> =
  & Omit<SearchPickerOptions<TValue>, 'onAction' | 'keys' | 'pointer'>
  & {
    readonly onAction: (action: SearchPickerAction<TValue>) => TActionMessage;
    readonly keys?: TKeys;
    readonly pointer?: PointerInteractionOptions<TPointerMessage>;
  };

function searchPickerElement(
  options: SearchPickerOptions<unknown, unknown>
): Element<unknown> {
  requireComponentHandler('searchPicker', 'onAction', options.onAction);
  const action = options.onAction;
  const selectedEntry = searchPickerWindow({
    searchPickerIndex: options.searchPickerIndex,
    ...(options.query === undefined ? {} : { query: options.query }),
    ...(options.selectedId === undefined
      ? {}
      : { selectedId: options.selectedId }),
    ...(options.scroll === undefined ? {} : { scroll: options.scroll }),
    ...(options.maxVisible === undefined ? {} : { limit: options.maxVisible })
  }).selectedEntry;
  const keyMap = mergeKeyBindings(
    searchPickerKeyBindings(action, selectedEntry),
    options.keys
  );
  return componentElementFromRenderNode<'searchPicker', unknown>({
    ...requiredRenderNodeId(options.id, 'searchPicker'),
    kind: 'searchPicker',
    props: {
      searchPickerIndex: options.searchPickerIndex,
      ...(options.title === undefined ? {} : { title: options.title }),
      ...(options.query === undefined ? {} : { query: options.query }),
      ...(options.selectedId === undefined ? {} : { selectedId: options.selectedId }),
      ...(options.scroll === undefined ? {} : { scroll: options.scroll }),
      ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
      ...(options.scrollPolicy === undefined ? {} : { scrollPolicy: options.scrollPolicy }),
      ...(options.maxVisible === undefined ? {} : { maxVisible: options.maxVisible }),
      ...(options.helpText === undefined ? {} : { helpText: options.helpText }),
      ...(options.emptyText === undefined ? {} : { emptyText: options.emptyText }),
      toActionMessage: (next: SearchPickerAction<unknown>) => action(next)
    },
    ...interactionProps({
      onInput: (text) => action({ kind: 'insertQuery', text }),
      onPaste: (text) => action({ kind: 'insertQuery', text }),
      keys: keyMap,
      pointer: options.pointer,
      meta: options.meta
    })
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

function cleanLine(value: string): string {
  return cleanText(value).replace(/\s*\n\s*/gu, ' ');
}

function cleanText(value: string): string {
  return sanitizeTerminalText(value).text;
}
