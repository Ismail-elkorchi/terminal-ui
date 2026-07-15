import { findTextHighlightMatches, sanitizeTerminalText } from '../text/index.ts';
import { applyScrollEvent, createScrollState, scrollReducer } from './scroll.ts';
import type { ScrollState } from '../interaction/scroll.ts';
import type { TextSelection } from '../text/index.ts';
import type { ScrollbackItem } from '../ui-model/documents.ts';
import type { ScrollbackAction, ScrollbackControlAction } from '../ui-model/scrollback.ts';
import { selectionFromTextPointerAction } from './text-editing.ts';

interface ScrollbackStateBase {
  readonly searchQuery?: string;
  readonly selectedMatchIndex?: number;
  readonly foldedIds: readonly string[];
  readonly followTail: boolean;
  readonly selectedRange?: TextSelection;
}

export interface PassiveScrollbackState extends ScrollbackStateBase {
  readonly scroll?: never;
}

export interface ScrollableScrollbackState extends ScrollbackStateBase {
  readonly scroll: ScrollState;
}

export type ScrollbackState = PassiveScrollbackState | ScrollableScrollbackState;

export interface ScrollbackPresentation {
  readonly items: readonly ScrollbackItem[];
  readonly followTail: boolean;
  readonly searchQuery?: string;
  readonly selectedRange?: TextSelection;
}

export interface ScrollbackScrollablePresentation extends ScrollbackPresentation {
  readonly scroll: ScrollState;
}

export interface ScrollbackSearchMark {
  readonly itemId: string;
  readonly itemIndex: number;
  readonly matchCount: number;
}

export function scrollbackReducer(
  state: ScrollableScrollbackState,
  action: ScrollbackAction
): ScrollableScrollbackState;
export function scrollbackReducer(
  state: PassiveScrollbackState,
  action: ScrollbackControlAction
): PassiveScrollbackState;
export function scrollbackReducer(state: ScrollbackState, action: ScrollbackAction): ScrollbackState {
  switch (action.kind) {
    case 'scroll':
      return state.scroll === undefined
        ? state
        : { ...state, scroll: applyScrollEvent(state.scroll, action.event) };
    case 'pointer': {
      const selectedRange = selectionFromTextPointerAction(action.action);
      if (selectedRange !== undefined) return { ...state, selectedRange };
      const { selectedRange: previousSelection, ...withoutSelection } = state;
      return previousSelection === undefined ? state : withoutSelection;
    }
    case 'setSearchQuery':
      return action.query === undefined || action.query.length === 0
        ? withoutSearch(state)
        : { ...state, searchQuery: action.query, selectedMatchIndex: 0 };
    case 'jumpMatch':
      return {
        ...state,
        selectedMatchIndex: wrapIndex((state.selectedMatchIndex ?? 0) + action.direction, action.matchCount)
      };
    case 'toggleFold':
      return {
        ...state,
        foldedIds: toggleId(state.foldedIds, action.id)
      };
    case 'fold':
      return state.foldedIds.includes(action.id)
        ? state
        : { ...state, foldedIds: [...state.foldedIds, action.id] };
    case 'unfold':
      return {
        ...state,
        foldedIds: state.foldedIds.filter((id) => id !== action.id)
      };
    case 'setFollowTail':
      return {
        ...state,
        followTail: action.followTail
      };
  }
}

export function scrollbackPresentation(
  items: readonly ScrollbackItem[],
  state: PassiveScrollbackState
): ScrollbackPresentation {
  return scrollbackPresentationBase(items, state);
}

export function scrollbackScrollablePresentation(
  items: readonly ScrollbackItem[],
  state: ScrollableScrollbackState
): ScrollbackScrollablePresentation {
  return { ...scrollbackPresentationBase(items, state), scroll: state.scroll };
}

function scrollbackPresentationBase(
  items: readonly ScrollbackItem[],
  state: ScrollbackStateBase
): ScrollbackPresentation {
  return {
    items: visibleScrollbackItems(items, state),
    followTail: state.followTail,
    ...(state.searchQuery === undefined ? {} : { searchQuery: state.searchQuery }),
    ...(state.selectedRange === undefined ? {} : { selectedRange: state.selectedRange })
  };
}

export function scrollbackSearchMarks(
  items: readonly ScrollbackItem[],
  query: string
): readonly ScrollbackSearchMark[] {
  const normalized = query.trim();
  if (normalized.length === 0) return [];
  return items.flatMap((item, itemIndex): readonly ScrollbackSearchMark[] => {
    const matchCount = findTextHighlightMatches(sanitizeTerminalText(item.text).text, normalized).length;
    return matchCount === 0
      ? []
      : [{ itemId: item.id, itemIndex, matchCount }];
  });
}

export function nextScrollbackMatch(
  marks: readonly ScrollbackSearchMark[],
  selectedMatchIndex: number | undefined,
  direction: 1 | -1
): ScrollbackSearchMark | undefined {
  if (marks.length === 0) return undefined;
  const index = wrapIndex((selectedMatchIndex ?? 0) + direction, marks.length);
  return marks[index];
}

export function visibleScrollbackItems(
  items: readonly ScrollbackItem[],
  state: Pick<ScrollbackState, 'foldedIds'>
): readonly ScrollbackItem[] {
  return items.map((item) => state.foldedIds.includes(item.id)
    ? {
        ...item,
        text: foldedText(item.text),
        metadata: {
          ...(item.metadata ?? {}),
          folded: 'true'
        }
      }
    : item);
}

export function followTailScrollState(input: {
  readonly contentRows: number;
  readonly viewportRows: number;
  readonly contentColumns?: number;
  readonly viewportColumns?: number;
}): ScrollState {
  return scrollReducer(createScrollState({
    contentRows: input.contentRows,
    viewportRows: input.viewportRows,
    contentColumns: input.contentColumns ?? 0,
    viewportColumns: input.viewportColumns ?? 0,
    followTail: true
  }), { kind: 'bottom' });
}

function foldedText(text: string): string {
  const sanitized = sanitizeTerminalText(text).text;
  const lines = sanitized.split('\n');
  const first = lines[0] ?? '';
  return lines.length > 1 ? `${first} ...` : first;
}

function toggleId(ids: readonly string[], id: string): readonly string[] {
  return ids.includes(id)
    ? ids.filter((current) => current !== id)
    : [...ids, id];
}

function wrapIndex(index: number, count: number): number {
  const size = Math.max(0, Math.floor(count));
  if (size === 0) return 0;
  return ((Math.floor(index) % size) + size) % size;
}

function withoutSearch(state: ScrollbackState): ScrollbackState {
  return {
    foldedIds: state.foldedIds,
    followTail: state.followTail,
    ...(state.scroll === undefined ? {} : { scroll: state.scroll }),
    ...(state.selectedRange === undefined ? {} : { selectedRange: state.selectedRange })
  };
}
