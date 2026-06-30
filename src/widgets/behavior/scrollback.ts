import { findTextHighlightMatches, sanitizeTerminalText } from '../../text/index.ts';
import { createScrollState, scrollReducer } from '../../tui/scroll.ts';
import type { ScrollState } from '../../tui/scroll.ts';
import type { ScrollbackItem } from '../types.ts';

export interface ScrollbackState {
  readonly searchQuery?: string;
  readonly selectedMatchIndex?: number;
  readonly foldedIds: readonly string[];
  readonly followTail: boolean;
}

export type ScrollbackAction =
  | { readonly kind: 'setSearchQuery'; readonly query?: string }
  | { readonly kind: 'jumpMatch'; readonly direction: 1 | -1; readonly matchCount: number }
  | { readonly kind: 'toggleFold'; readonly id: string }
  | { readonly kind: 'fold'; readonly id: string }
  | { readonly kind: 'unfold'; readonly id: string }
  | { readonly kind: 'setFollowTail'; readonly followTail: boolean };

export interface ScrollbackSearchMark {
  readonly itemId: string;
  readonly itemIndex: number;
  readonly matchCount: number;
}

export function scrollbackReducer(state: ScrollbackState, action: ScrollbackAction): ScrollbackState {
  switch (action.kind) {
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
        text: firstLine(item.text)
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

function firstLine(text: string): string {
  return sanitizeTerminalText(text).text.split('\n')[0] ?? '';
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
    followTail: state.followTail
  };
}
