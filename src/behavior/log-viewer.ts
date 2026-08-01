import { applyScrollEvent, createScrollState, scrollReducer } from './scroll.ts';
import type { ScrollState } from '../interaction/scroll.ts';
import {
  logHistoryRecordMatches
} from '../ui-model/log-history.ts';
import type { LogHistory, LogSearchMatch } from '../ui-model/log-history.ts';
import type {
  LogViewerAction,
  LogViewerControlAction,
  LogViewerSelection
} from '../ui-model/log-viewer.ts';
import { cyclicIndex } from '../foundation/cyclic-index.ts';

interface LogViewerStateBase {
  readonly searchQuery?: string;
  readonly selectedMatch?: LogSearchMatch;
  readonly foldedIds: readonly string[];
  readonly followTail: boolean;
  readonly selection?: LogViewerSelection;
}

export interface PassiveLogViewerState extends LogViewerStateBase {
  readonly scroll?: never;
}

export interface ScrollableLogViewerState extends LogViewerStateBase {
  readonly scroll: ScrollState;
}

export type LogViewerState = PassiveLogViewerState | ScrollableLogViewerState;

export function logViewerReducer(
  state: ScrollableLogViewerState,
  action: LogViewerAction
): ScrollableLogViewerState;
export function logViewerReducer(
  state: PassiveLogViewerState,
  action: LogViewerControlAction
): PassiveLogViewerState;
export function logViewerReducer(state: LogViewerState, action: LogViewerAction): LogViewerState {
  switch (action.kind) {
    case 'scroll':
      if (state.scroll === undefined) return state;
      return withScroll(state, applyScrollEvent(state.scroll, action.event));
    case 'pointer': {
      const selection = action.action.kind === 'placeCaret'
        ? undefined
        : normalizeLogViewerSelection({
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

export function logViewerSearchMatches(
  history: LogHistory,
  query: string
): readonly LogSearchMatch[] {
  const normalized = query.trim();
  if (normalized.length === 0) return [];
  return Object.freeze(history.segments.flatMap((segment) =>
    segment.records.flatMap((record) => logHistoryRecordMatches(record, normalized))
  ));
}

export function nextLogViewerMatch(
  matches: readonly LogSearchMatch[],
  selectedMatchId: string | undefined,
  direction: 1 | -1
): LogSearchMatch | undefined {
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

function withoutSearch(state: LogViewerState): LogViewerState {
  if (state.searchQuery === undefined && state.selectedMatch === undefined) return state;
  return {
    foldedIds: state.foldedIds,
    followTail: state.followTail,
    ...(state.scroll === undefined ? {} : { scroll: state.scroll }),
    ...(state.selection === undefined ? {} : { selection: state.selection })
  };
}

function withoutSelectedMatch(state: LogViewerState): LogViewerState {
  if (state.selectedMatch === undefined) return state;
  return {
    foldedIds: state.foldedIds,
    followTail: state.followTail,
    ...(state.searchQuery === undefined ? {} : { searchQuery: state.searchQuery }),
    ...(state.scroll === undefined ? {} : { scroll: state.scroll }),
    ...(state.selection === undefined ? {} : { selection: state.selection })
  };
}

function withScroll(state: ScrollableLogViewerState, scroll: ScrollState): ScrollableLogViewerState {
  return scroll === state.scroll ? state : { ...state, scroll };
}

function withSelection(state: LogViewerState, selection: LogViewerSelection | undefined): LogViewerState {
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

function normalizeLogViewerSelection(selection: LogViewerSelection): LogViewerSelection | undefined {
  const anchor = normalizeAnchor(selection.anchor);
  const focus = normalizeAnchor(selection.focus);
  return anchor.entryId === focus.entryId && anchor.offset === focus.offset
    ? undefined
    : Object.freeze({ anchor, focus });
}

function normalizeAnchor(anchor: LogViewerSelection['anchor']): LogViewerSelection['anchor'] {
  return Object.freeze({ entryId: anchor.entryId, offset: Math.max(0, Math.floor(anchor.offset)) });
}

function sameSelection(left: LogViewerSelection | undefined, right: LogViewerSelection | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.anchor.entryId === right.anchor.entryId
    && left.anchor.offset === right.anchor.offset
    && left.focus.entryId === right.focus.entryId
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
  matches: readonly LogSearchMatch[],
  selectedId: string | undefined,
  direction: 1 | -1
): LogSearchMatch | undefined {
  if (matches.length === 0) return undefined;
  const selectedIndex = selectedId === undefined
    ? direction > 0 ? -1 : 0
    : matches.findIndex((match) => match.id === selectedId);
  return matches[cyclicIndex(selectedIndex + direction, matches.length)];
}
