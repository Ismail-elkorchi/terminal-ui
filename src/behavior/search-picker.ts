import { editTextBuffer } from '../text/index.ts';
import { rowWindow } from './data-window.ts';
import type { ScrollState } from '../interaction/scroll.ts';
import type { SearchEntry } from '../ui-model/contracts.ts';
import type { SearchPickerAction } from '../ui-model/search-picker.ts';
import { querySearchPickerIndex } from '../ui-model/search-picker-index.ts';
import type { SearchPickerIndex } from '../ui-model/search-picker-index.ts';
import { cyclicIndex } from '../foundation/cyclic-index.ts';
import {
  applyScrollEvent,
  normalizeScrollState,
  scrollReducer,
  visibleWindowFromScroll
} from './scroll.ts';

export interface SearchPickerState {
  readonly query: string;
  readonly selectedId?: string;
  readonly scroll?: ScrollState;
}

export interface SearchPickerReducerOptions<TValue = string> {
  readonly searchPickerIndex: SearchPickerIndex<TValue>;
}

export interface SearchPickerWindowInput<TValue = string> {
  readonly searchPickerIndex: SearchPickerIndex<TValue>;
  readonly query?: string;
  readonly selectedId?: string;
  readonly scroll?: ScrollState;
  readonly limit?: number;
}

export interface SearchPickerWindow<TValue = string> {
  readonly entries: readonly SearchEntry<TValue>[];
  readonly selectedIndex?: number;
  readonly selectedEntry?: SearchEntry<TValue>;
  readonly totalCount: number;
  readonly startIndex: number;
  readonly endIndexExclusive: number;
  readonly omittedBefore: number;
  readonly omittedAfter: number;
}

export interface SearchPickerSelectionInput<TValue = string> {
  readonly searchPickerIndex: SearchPickerIndex<TValue>;
  readonly state: SearchPickerState;
  readonly scroll?: ScrollState;
  readonly limit?: number;
}

export function searchPickerReducer<TValue>(
  state: SearchPickerState,
  action: SearchPickerAction<TValue>,
  options: SearchPickerReducerOptions<TValue>
): SearchPickerState {
  switch (action.kind) {
    case 'setQuery':
      return selectionForQuery(state, action.query, options.searchPickerIndex);
    case 'insertQuery': {
      const next = editTextBuffer({ text: state.query, cursor: state.query.length }, { kind: 'insert', text: action.text });
      return selectionForQuery(state, next.text, options.searchPickerIndex);
    }
    case 'deleteQueryBackward': {
      const next = editTextBuffer({ text: state.query, cursor: state.query.length }, { kind: 'deleteBackward' });
      return selectionForQuery(state, next.text, options.searchPickerIndex);
    }
    case 'moveSelection':
      return moveSelection(state, action.delta, options.searchPickerIndex);
    case 'activate':
      return state;
    case 'scroll':
      return scrollSelection(state, action.event, options.searchPickerIndex);
  }
}

export function searchPickerWindow<TValue>(input: SearchPickerWindowInput<TValue>): SearchPickerWindow<TValue> {
  const result = querySearchPickerIndex(input.searchPickerIndex, input.query ?? '');
  const filtered = result.entries;
  const totalCount = filtered.length;
  const limit = Math.max(1, Math.floor(input.limit ?? totalCount));
  if (totalCount === 0) {
    return {
      entries: [],
      totalCount,
      startIndex: 0,
      endIndexExclusive: 0,
      omittedBefore: 0,
      omittedAfter: 0
    };
  }
  const initialWindow = rowWindow(filtered, {
    viewportRows: limit,
    ...(input.scroll === undefined ? {} : { scroll: input.scroll })
  });
  const selectedAbsolute = selectedIndex(filtered, input.selectedId, {
    startIndex: initialWindow.startIndex,
    endIndexExclusive: initialWindow.endIndexExclusive
  });
  const scroll = input.scroll === undefined
    ? undefined
    : scrollForSelection(input.scroll, totalCount, limit, selectedAbsolute);
  const window = rowWindow(filtered, {
    viewportRows: limit,
    ...(selectedAbsolute === undefined ? {} : { selectedIndex: selectedAbsolute }),
    ...(scroll === undefined ? {} : { scroll })
  });
  const selectedEntry = selectedAbsolute === undefined
    ? undefined
    : filtered[selectedAbsolute];
  return {
    entries: window.rows,
    ...(window.selectedVisibleIndex === undefined ? {} : { selectedIndex: window.selectedVisibleIndex }),
    ...(selectedEntry === undefined ? {} : { selectedEntry }),
    totalCount,
    startIndex: window.startIndex,
    endIndexExclusive: window.endIndexExclusive,
    omittedBefore: window.omittedBefore,
    omittedAfter: window.omittedAfter
  };
}

export function selectedSearchPickerEntry<TValue>(input: SearchPickerSelectionInput<TValue>): SearchEntry<TValue> | undefined {
  const scroll = input.scroll ?? input.state.scroll;
  return searchPickerWindow({
    searchPickerIndex: input.searchPickerIndex,
    query: input.state.query,
    ...(input.state.selectedId === undefined
      ? {}
      : { selectedId: input.state.selectedId }),
    ...(scroll === undefined ? {} : { scroll }),
    ...(input.limit === undefined ? {} : { limit: input.limit })
  }).selectedEntry;
}

function selectedIndex<TValue>(
  entries: readonly SearchEntry<TValue>[],
  selectedId: string | undefined,
  fallbackWindow?: { readonly startIndex: number; readonly endIndexExclusive: number }
): number | undefined {
  if (selectedId !== undefined) {
    const byId = entries.findIndex(
      (entry) => entry.id === selectedId && entry.disabled !== true
    );
    if (byId !== -1) return byId;
  }
  if (fallbackWindow !== undefined) {
    const visibleEnabled = entries.findIndex((entry, index) =>
      index >= fallbackWindow.startIndex
      && index < fallbackWindow.endIndexExclusive
      && entry.disabled !== true
    );
    if (visibleEnabled !== -1) return visibleEnabled;
  }
  const firstEnabled = entries.findIndex((entry) => entry.disabled !== true);
  return firstEnabled === -1 ? undefined : firstEnabled;
}

function selectionForQuery<TValue>(
  state: SearchPickerState,
  query: string,
  index: SearchPickerIndex<TValue>
): SearchPickerState {
  const entries = querySearchPickerIndex(index, query).entries;
  const nextIndex = selectedIndex(entries, undefined);
  return stateForSelection(state, query, entries, nextIndex);
}

function moveSelection<TValue>(
  state: SearchPickerState,
  delta: number,
  index: SearchPickerIndex<TValue>
): SearchPickerState {
  const entries = querySearchPickerIndex(index, state.query).entries;
  const enabled = entries.flatMap((entry, entryIndex) =>
    entry.disabled === true ? [] : [{ entry, entryIndex }]
  );
  if (enabled.length === 0) {
    return stateForSelection(state, state.query, entries, undefined);
  }
  const current = enabled.findIndex(({ entry }) => entry.id === state.selectedId);
  const selected = current === -1
    ? delta < 0 ? enabled.at(-1) : enabled[0]
    : enabled[cyclicIndex(current + delta, enabled.length)];
  return stateForSelection(state, state.query, entries, selected?.entryIndex);
}

function scrollSelection<TValue>(
  state: SearchPickerState,
  event: import('../interaction/scroll.ts').ScrollEvent,
  index: SearchPickerIndex<TValue>
): SearchPickerState {
  const entries = querySearchPickerIndex(index, state.query).entries;
  const applied = applyScrollEvent(state.scroll ?? event.scroll, event);
  const scroll = scrollForSelection(
    applied,
    entries.length,
    applied.viewportRows,
    undefined
  );
  const visible = visibleWindowFromScroll(scroll);
  const current = selectedIndex(entries, state.selectedId);
  const visibleEnabled = entries.flatMap((entry, entryIndex) =>
    entry.disabled !== true
      && entryIndex >= visible.startIndex
      && entryIndex < visible.endIndexExclusive
      ? [entryIndex]
      : []
  );
  const nextIndex = current !== undefined
    && current >= visible.startIndex
    && current < visible.endIndexExclusive
    ? current
    : closestIndex(visibleEnabled, current)
      ?? closestIndex(
        entries.flatMap((entry, entryIndex) => entry.disabled === true ? [] : [entryIndex]),
        Math.floor((visible.startIndex + visible.endIndexExclusive) / 2)
      );
  return stateForSelection(state, state.query, entries, nextIndex, scroll);
}

function closestIndex(
  indexes: readonly number[],
  preferred: number | undefined
): number | undefined {
  if (preferred === undefined) return indexes[0];
  return indexes.reduce<number | undefined>((closest, candidate) =>
    closest === undefined
      || Math.abs(candidate - preferred) < Math.abs(closest - preferred)
      ? candidate
      : closest
  , undefined);
}

function stateForSelection<TValue>(
  previous: SearchPickerState,
  query: string,
  entries: readonly SearchEntry<TValue>[],
  nextIndex: number | undefined,
  sourceScroll = previous.scroll
): SearchPickerState {
  const selectedId = nextIndex === undefined ? undefined : entries[nextIndex]?.id;
  const scroll = sourceScroll === undefined
    ? undefined
    : scrollForSelection(
        sourceScroll,
        entries.length,
        sourceScroll.viewportRows,
        nextIndex
      );
  if (previous.query === query
    && previous.selectedId === selectedId
    && sameScroll(previous.scroll, scroll)) return previous;
  return {
    query,
    ...(selectedId === undefined ? {} : { selectedId }),
    ...(scroll === undefined ? {} : { scroll })
  };
}

function scrollForSelection(
  source: ScrollState,
  contentRows: number,
  viewportRows: number,
  nextIndex: number | undefined
): ScrollState {
  const normalized = normalizeScrollState({
    offsetRow: source.offsetRow,
    offsetColumn: source.offsetColumn,
    contentRows,
    contentColumns: source.contentColumns,
    viewportRows,
    viewportColumns: source.viewportColumns,
    followTail: source.followTail,
    ...(nextIndex === undefined ? {} : { selectedIndex: nextIndex })
  });
  if (nextIndex === undefined) return normalized;
  const visible = visibleWindowFromScroll(normalized);
  return nextIndex >= visible.startIndex && nextIndex < visible.endIndexExclusive
    ? normalized
    : scrollReducer(normalized, { kind: 'itemIntoView', itemIndex: nextIndex });
}

function sameScroll(left: ScrollState | undefined, right: ScrollState | undefined): boolean {
  return left === right || left?.offsetRow === right?.offsetRow
    && left?.offsetColumn === right?.offsetColumn
    && left?.contentRows === right?.contentRows
    && left?.contentColumns === right?.contentColumns
    && left?.viewportRows === right?.viewportRows
    && left?.viewportColumns === right?.viewportColumns
    && left?.followTail === right?.followTail
    && left?.selectedIndex === right?.selectedIndex;
}
