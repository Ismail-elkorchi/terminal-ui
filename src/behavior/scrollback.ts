import { applyScrollEvent, createScrollState, scrollReducer } from './scroll.ts';
import type { ScrollState } from '../interaction/scroll.ts';
import {
  scrollbackHistoryRecordMatches
} from '../ui-model/scrollback-history.ts';
import type { ScrollbackHistory, ScrollbackSearchMatch } from '../ui-model/scrollback-history.ts';
import type {
  ScrollbackAction,
  ScrollbackControlAction,
  ScrollbackSelection
} from '../ui-model/scrollback.ts';

interface ScrollbackStateBase {
  readonly searchQuery?: string;
  readonly selectedMatch?: ScrollbackSearchMatch;
  readonly foldedIds: readonly string[];
  readonly followTail: boolean;
  readonly selection?: ScrollbackSelection;
}

export interface PassiveScrollbackState extends ScrollbackStateBase {
  readonly scroll?: never;
}

export interface ScrollableScrollbackState extends ScrollbackStateBase {
  readonly scroll: ScrollState;
}

export type ScrollbackState = PassiveScrollbackState | ScrollableScrollbackState;

export interface ScrollbackPresentation {
  readonly history: ScrollbackHistory;
  readonly followTail: boolean;
  readonly searchQuery?: string;
  readonly selectedMatch?: ScrollbackSearchMatch;
  readonly foldedIds: readonly string[];
  readonly selection?: ScrollbackSelection;
}

export interface ScrollbackScrollablePresentation extends ScrollbackPresentation {
  readonly scroll: ScrollState;
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
      if (state.scroll === undefined) return state;
      return withScroll(state, applyScrollEvent(state.scroll, action.event));
    case 'pointer': {
      const selection = action.action.kind === 'placeCaret'
        ? undefined
        : normalizeScrollbackSelection({
            anchor: action.action.anchor,
            focus: action.action.position
          });
      return withSelection(state, selection);
    }
    case 'setSearchQuery': {
      const query = normalizedQuery(action.query);
      if (query === undefined) return withoutSearch(state);
      if (state.searchQuery === query) return state;
      return { ...withoutSelectedMatch(state), searchQuery: query };
    }
    case 'jumpMatch': {
      const selectedMatch = adjacentMatch(action.matches, state.selectedMatch?.id, action.direction);
      if (selectedMatch?.id === state.selectedMatch?.id) return state;
      if (selectedMatch === undefined) return withoutSelectedMatch(state);
      return { ...state, selectedMatch };
    }
    case 'toggleFold': {
      const foldedIds = state.foldedIds.includes(action.id)
        ? state.foldedIds.filter((current) => current !== action.id)
        : canonicalIds([...state.foldedIds, action.id]);
      return sameStrings(foldedIds, state.foldedIds) ? state : { ...state, foldedIds };
    }
    case 'fold':
      return state.foldedIds.includes(action.id)
        ? state
        : { ...state, foldedIds: canonicalIds([...state.foldedIds, action.id]) };
    case 'unfold': {
      const foldedIds = state.foldedIds.filter((id) => id !== action.id);
      return foldedIds.length === state.foldedIds.length ? state : { ...state, foldedIds };
    }
    case 'setFollowTail':
      return state.followTail === action.followTail ? state : { ...state, followTail: action.followTail };
  }
}

export function scrollbackPresentation(
  history: ScrollbackHistory,
  state: PassiveScrollbackState
): ScrollbackPresentation {
  return scrollbackPresentationBase(history, state);
}

export function scrollbackScrollablePresentation(
  history: ScrollbackHistory,
  state: ScrollableScrollbackState
): ScrollbackScrollablePresentation {
  return { ...scrollbackPresentationBase(history, state), scroll: state.scroll };
}

function scrollbackPresentationBase(
  history: ScrollbackHistory,
  state: ScrollbackStateBase
): ScrollbackPresentation {
  return {
    history,
    followTail: state.followTail,
    foldedIds: state.foldedIds,
    ...(state.searchQuery === undefined ? {} : { searchQuery: state.searchQuery }),
    ...(state.selectedMatch === undefined ? {} : { selectedMatch: state.selectedMatch }),
    ...(state.selection === undefined ? {} : { selection: state.selection })
  };
}

export function scrollbackSearchMatches(
  history: ScrollbackHistory,
  query: string
): readonly ScrollbackSearchMatch[] {
  const normalized = query.trim();
  if (normalized.length === 0) return [];
  return Object.freeze(history.segments.flatMap((segment) =>
    segment.records.flatMap((record) => scrollbackHistoryRecordMatches(record, normalized))
  ));
}

export function nextScrollbackMatch(
  matches: readonly ScrollbackSearchMatch[],
  selectedMatchId: string | undefined,
  direction: 1 | -1
): ScrollbackSearchMatch | undefined {
  return adjacentMatch(matches, selectedMatchId, direction);
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

function wrapIndex(index: number, count: number): number {
  const size = Math.max(0, Math.floor(count));
  if (size === 0) return 0;
  return ((Math.floor(index) % size) + size) % size;
}

function withoutSearch(state: ScrollbackState): ScrollbackState {
  if (state.searchQuery === undefined && state.selectedMatch === undefined) return state;
  return {
    foldedIds: state.foldedIds,
    followTail: state.followTail,
    ...(state.scroll === undefined ? {} : { scroll: state.scroll }),
    ...(state.selection === undefined ? {} : { selection: state.selection })
  };
}

function withoutSelectedMatch(state: ScrollbackState): ScrollbackState {
  if (state.selectedMatch === undefined) return state;
  return {
    foldedIds: state.foldedIds,
    followTail: state.followTail,
    ...(state.searchQuery === undefined ? {} : { searchQuery: state.searchQuery }),
    ...(state.scroll === undefined ? {} : { scroll: state.scroll }),
    ...(state.selection === undefined ? {} : { selection: state.selection })
  };
}

function withScroll(state: ScrollableScrollbackState, scroll: ScrollState): ScrollableScrollbackState {
  return scroll === state.scroll ? state : { ...state, scroll };
}

function withSelection(state: ScrollbackState, selection: ScrollbackSelection | undefined): ScrollbackState {
  if (sameSelection(selection, state.selection)) return state;
  if (selection === undefined) {
    return {
      foldedIds: state.foldedIds,
      followTail: state.followTail,
      ...(state.searchQuery === undefined ? {} : { searchQuery: state.searchQuery }),
      ...(state.selectedMatch === undefined ? {} : { selectedMatch: state.selectedMatch }),
      ...(state.scroll === undefined ? {} : { scroll: state.scroll })
    };
  }
  return { ...state, selection };
}

function normalizeScrollbackSelection(selection: ScrollbackSelection): ScrollbackSelection | undefined {
  const anchor = normalizeAnchor(selection.anchor);
  const focus = normalizeAnchor(selection.focus);
  return anchor.itemId === focus.itemId && anchor.offset === focus.offset
    ? undefined
    : Object.freeze({ anchor, focus });
}

function normalizeAnchor(anchor: ScrollbackSelection['anchor']): ScrollbackSelection['anchor'] {
  return Object.freeze({ itemId: anchor.itemId, offset: Math.max(0, Math.floor(anchor.offset)) });
}

function sameSelection(left: ScrollbackSelection | undefined, right: ScrollbackSelection | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.anchor.itemId === right.anchor.itemId
    && left.anchor.offset === right.anchor.offset
    && left.focus.itemId === right.focus.itemId
    && left.focus.offset === right.focus.offset;
}

function canonicalIds(ids: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(ids)].toSorted());
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function normalizedQuery(query: string | undefined): string | undefined {
  const normalized = query?.trim();
  return normalized === undefined || normalized.length === 0 ? undefined : normalized;
}

function adjacentMatch(
  matches: readonly ScrollbackSearchMatch[],
  selectedId: string | undefined,
  direction: 1 | -1
): ScrollbackSearchMatch | undefined {
  if (matches.length === 0) return undefined;
  const selectedIndex = selectedId === undefined
    ? direction > 0 ? -1 : 0
    : matches.findIndex((match) => match.id === selectedId);
  return matches[wrapIndex(selectedIndex + direction, matches.length)];
}
