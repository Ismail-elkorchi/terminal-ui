import { renderNodeId } from '../../foundation/identity.ts';
import type { RenderNode, RenderNodeOfKind } from '../../renderer/model/index.ts';
import type { CommandInputAction } from '../../ui-model/command-input.ts';
import { windowedCollection } from '../../ui-model/collection.ts';
import type { SuggestionItem } from '../../ui-model/contracts.ts';
import type { ListAction, ListCollectionRecord } from '../../ui-model/list.ts';
import { prepareListView } from '../../ui-model/list-view.ts';

export interface CommandInputPopupInput<TMessage> {
  readonly parentElementId: string;
  readonly suggestions: readonly SuggestionItem[];
  readonly selectedSuggestionIndex?: number;
  readonly maxVisibleSuggestions: number;
  readonly toActionMessage?: (action: CommandInputAction) => TMessage;
  readonly toSubmitMessage?: (value: string) => TMessage;
}

export function commandInputPopupRenderNode<TMessage>(
  input: CommandInputPopupInput<TMessage>
): RenderNode<TMessage> {
  return {
    id: renderNodeId(`${input.parentElementId}:popup`, 'command input popup'),
    kind: 'surface',
    props: {
      appearance: 'raised',
      border: { kind: 'rounded' },
      padding: 0
    },
    children: [popupList(input)],
    layer: { zIndex: 20, underlay: 'clear' },
    focus: { disabled: true }
  };
}

function popupList<TMessage>(
  input: CommandInputPopupInput<TMessage>
): RenderNodeOfKind<TMessage, 'list'> {
  const startIndex = popupStartIndex(
    input.suggestions.length,
    input.selectedSuggestionIndex,
    input.maxVisibleSuggestions
  );
  const suggestions = input.suggestions.slice(startIndex, startIndex + input.maxVisibleSuggestions);
  const collection = windowedCollection({
    records: suggestions.map((suggestion, offset): ListCollectionRecord<SuggestionItem> => {
      const itemIndex = startIndex + offset;
      return {
        id: suggestionId(itemIndex),
        itemIndex,
        value: suggestion,
        item: {
          id: suggestionId(itemIndex),
          label: suggestion.label ?? suggestion.value,
          ...(suggestion.description === undefined ? {} : { description: suggestion.description }),
          disabled: suggestion.disabled === true
        }
      };
    }),
    window: {
      startIndex,
      totalCount: input.suggestions.length,
      domain: { kind: 'source' }
    }
  });
  const toActionMessage = input.toActionMessage;
  const toSubmitMessage = input.toSubmitMessage;
  return {
    id: renderNodeId(`${input.parentElementId}:popup:list`, 'command input popup list'),
    kind: 'list',
    props: {
      view: prepareListView(collection),
      ...(input.selectedSuggestionIndex === undefined
        ? {}
        : { selectedId: suggestionId(input.selectedSuggestionIndex) }),
      ...((toActionMessage === undefined && toSubmitMessage === undefined) ? {} : {
        toActionMessage: (action: ListAction) => messageForListAction(
          input.suggestions,
          action,
          toActionMessage,
          toSubmitMessage
        )
      })
    },
    focus: { disabled: true }
  };
}

function messageForListAction<TMessage>(
  suggestions: readonly SuggestionItem[],
  action: ListAction,
  toActionMessage: ((action: CommandInputAction) => TMessage) | undefined,
  toSubmitMessage: ((value: string) => TMessage) | undefined
): TMessage {
  if (action.kind === 'activate') {
    const suggestion = suggestions[action.itemIndex];
    if (suggestion !== undefined && suggestion.disabled !== true && toSubmitMessage !== undefined) {
      return toSubmitMessage(suggestion.value);
    }
  }
  if (action.kind === 'select' || action.kind === 'activate') {
    if (toActionMessage !== undefined) {
      return toActionMessage({ kind: 'selectSuggestion', suggestionIndex: action.itemIndex });
    }
  }
  if (toActionMessage !== undefined) {
    if (action.kind === 'move') return toActionMessage({ kind: 'moveSuggestion', delta: action.delta < 0 ? -1 : 1 });
    if (action.kind === 'first') return toActionMessage({ kind: 'selectSuggestion', suggestionIndex: 0 });
    if (action.kind === 'last') return toActionMessage({
      kind: 'selectSuggestion',
      suggestionIndex: Math.max(0, suggestions.length - 1)
    });
  }
  throw new Error('Command input popup action does not have a matching message handler.');
}

function popupStartIndex(totalCount: number, selectedIndex: number | undefined, visibleCount: number): number {
  if (totalCount <= visibleCount) return 0;
  const selected = Math.max(0, Math.min(totalCount - 1, selectedIndex ?? 0));
  return Math.max(0, Math.min(totalCount - visibleCount, selected - Math.floor(visibleCount / 2)));
}

function suggestionId(index: number): string {
  return `suggestion-${String(index)}`;
}
