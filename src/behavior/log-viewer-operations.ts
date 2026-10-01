import type { ScrollState } from '../interaction/scroll.ts';
import type { CollectionQuery, CompiledCollectionQuery } from '../text/query.ts';
import { compileCollectionQuery } from '../text/query.ts';
import type { LogHistory } from './log-history.ts';
import { matchingLogViewerView, nextLogViewerMatch, type LogViewerView } from './log-viewer-view.ts';
import type {
  LogViewerControlTransition,
  LogViewerSelection,
  LogViewerTransition,
} from './log-viewer.ts';
import { applyScrollRequest, createScrollState, scrollReducer } from './scroll.ts';

interface LogViewerStateBase {
  readonly query?: CompiledCollectionQuery;
  readonly activeMatchId?: string;
  readonly foldedIds: readonly string[];
  readonly followTail: boolean;
  readonly selection?: LogViewerSelection;
}

export interface UnscrolledLogViewerState extends LogViewerStateBase {
  readonly scroll?: never;
}

export interface ScrollableLogViewerState extends LogViewerStateBase {
  readonly scroll: ScrollState;
}

export type LogViewerState = UnscrolledLogViewerState | ScrollableLogViewerState;

export interface LogViewerReducerOptions {
  readonly history: LogHistory;
  readonly view: LogViewerView | null;
}

export function logViewerReducer(
  state: ScrollableLogViewerState,
  transition: LogViewerTransition,
  options: LogViewerReducerOptions,
): ScrollableLogViewerState;
export function logViewerReducer(
  state: UnscrolledLogViewerState,
  transition: LogViewerControlTransition,
  options: LogViewerReducerOptions,
): UnscrolledLogViewerState;
export function logViewerReducer(
  state: LogViewerState,
  transition: LogViewerTransition,
  options: LogViewerReducerOptions,
): LogViewerState {
  switch (transition.kind) {
    case 'scroll':
      if (state.scroll === undefined) return state;
      return withScroll(state, applyScrollRequest(state.scroll, transition.request));
    case 'pointer': {
      const selection = transition.transition.kind === 'placeCaret'
        ? undefined
        : normalizeLogViewerSelection({
            anchor: transition.transition.anchor,
            focus: transition.transition.position
          });
      const selected = withSelection(state, selection);
      if (transition.scrollRequest === undefined || selected.scroll === undefined) return selected;
      const scroll = applyScrollRequest(selected.scroll, transition.scrollRequest);
      return scroll === selected.scroll ? selected : { ...selected, scroll };
    }
    case 'setQuery': {
      const query = normalizedQuery(transition.query);
      if (query === undefined) return withoutSearch(state);
      if (sameQuery(state.query, query)) return state;
      return { ...withoutActiveMatch(state), query };
    }
    case 'jumpMatch': {
      const result = matchingLogViewerView({ history: options.history, ...(state.query === undefined ? {} : { query: state.query }), foldedIds: state.foldedIds }, options.view);
      if (result === undefined) return state;
      const activeMatch = nextLogViewerMatch(result, state.activeMatchId, transition.direction);
      if (activeMatch?.id === state.activeMatchId) return state;
      if (activeMatch === undefined) return withoutActiveMatch(state);
      return { ...state, activeMatchId: activeMatch.id };
    }
    case 'toggleFold': {
      const foldedIds = state.foldedIds.includes(transition.id)
        ? state.foldedIds.filter((current) => current !== transition.id)
        : canonicalIds([...state.foldedIds, transition.id]);
      return sameStrings(foldedIds, state.foldedIds) ? state : { ...withoutActiveMatch(state), foldedIds };
    }
    case 'fold':
      return state.foldedIds.includes(transition.id)
        ? state
        : { ...withoutActiveMatch(state), foldedIds: canonicalIds([...state.foldedIds, transition.id]) };
    case 'unfold': {
      const foldedIds = state.foldedIds.filter((id) => id !== transition.id);
      return foldedIds.length === state.foldedIds.length ? state : { ...withoutActiveMatch(state), foldedIds };
    }
    case 'setFollowTail':
      return state.followTail === transition.followTail ? state : { ...state, followTail: transition.followTail };
  }
}

export function followTailScrollState(input: {
  readonly contentRows: number;
  readonly viewportRows: number;
  readonly contentColumns?: number;
  readonly viewportColumns?: number;
}): ScrollState {
  return scrollReducer(createScrollState({ followTail: true }), { kind: 'bottom' }, {
    contentRows: input.contentRows,
    viewportRows: input.viewportRows,
    contentColumns: input.contentColumns ?? 0,
    viewportColumns: input.viewportColumns ?? 0,
  });
}

function withoutSearch(state: LogViewerState): LogViewerState {
  if (state.query === undefined && state.activeMatchId === undefined) return state;
  return {
    foldedIds: state.foldedIds,
    followTail: state.followTail,
    ...(state.scroll === undefined ? {} : { scroll: state.scroll }),
    ...(state.selection === undefined ? {} : { selection: state.selection })
  };
}

function withoutActiveMatch(state: LogViewerState): LogViewerState {
  if (state.activeMatchId === undefined) return state;
  return {
    foldedIds: state.foldedIds,
    followTail: state.followTail,
    ...(state.query === undefined ? {} : { query: state.query }),
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
      ...(state.query === undefined ? {} : { query: state.query }),
      ...(state.activeMatchId === undefined ? {} : { activeMatchId: state.activeMatchId }),
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

function normalizedQuery(query: CollectionQuery | undefined): CompiledCollectionQuery | undefined {
  if (query === undefined) return undefined;
  const normalized = compileCollectionQuery(query);
  return normalized.text.length === 0 ? undefined : normalized;
}

function sameQuery(left: CompiledCollectionQuery | undefined, right: CompiledCollectionQuery): boolean {
  return left?.text === right.text
    && left.mode === right.mode
    && left.caseSensitive === right.caseSensitive;
}
