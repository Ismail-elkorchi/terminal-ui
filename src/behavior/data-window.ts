import {
  createScrollState,
  normalizeScrollState,
  scrollReducer,
  visibleWindowFromScroll
} from './scroll.ts';
import { finiteNonNegativeIntegerOrZero } from '../foundation/validation.ts';
import type { ScrollState, ScrollVisibleWindow } from '../interaction/scroll.ts';

export interface DataWindowInput {
  readonly totalRows: number;
  readonly viewportRows: number;
  readonly activeIndex?: number;
  readonly scroll?: ScrollState;
  readonly contentColumns?: number;
  readonly viewportColumns?: number;
}

export interface DataWindow extends ScrollVisibleWindow {
  readonly totalRows: number;
  readonly activeIndex?: number;
  readonly activeVisibleIndex?: number;
  readonly offsetColumn: number;
  readonly omittedBefore: number;
  readonly omittedAfter: number;
}

export function dataWindow(input: DataWindowInput): DataWindow {
  const totalRows = finiteNonNegativeIntegerOrZero(input.totalRows);
  const viewportRows = finiteNonNegativeIntegerOrZero(input.viewportRows);
  const activeIndex = normalizeActiveIndex(input.activeIndex, totalRows);
  const contentColumns = finiteNonNegativeIntegerOrZero(input.contentColumns ?? input.viewportColumns ?? 0);
  const viewportColumns = finiteNonNegativeIntegerOrZero(input.viewportColumns ?? contentColumns);
  const geometry = { contentRows: totalRows, contentColumns, viewportRows, viewportColumns };
  const scroll = input.scroll === undefined
    ? scrollForActiveItem({
        totalRows,
        viewportRows,
        contentColumns,
        viewportColumns,
        ...(activeIndex === undefined ? {} : { activeIndex })
      })
    : activeIndex === undefined
      ? normalizeScrollState(input.scroll, geometry)
      : scrollReducer(input.scroll, {
        kind: 'itemIntoView',
        itemIndex: activeIndex,
        alignment: 'nearest',
      }, geometry);
  const window = visibleWindowFromScroll(scroll, geometry);
  const activeVisibleIndex = activeIndex === undefined
    || activeIndex < window.startIndex
    || activeIndex >= window.endIndexExclusive
    ? undefined
    : activeIndex - window.startIndex;
  return {
    totalRows,
    startIndex: window.startIndex,
    endIndexExclusive: window.endIndexExclusive,
    ...(activeIndex === undefined ? {} : { activeIndex }),
    ...(activeVisibleIndex === undefined ? {} : { activeVisibleIndex }),
    offsetColumn: scroll.offsetColumn,
    omittedBefore: window.startIndex,
    omittedAfter: Math.max(0, totalRows - window.endIndexExclusive)
  };
}

export function rowWindow<TValue>(
  rows: readonly TValue[],
  input: Omit<DataWindowInput, 'totalRows'>
): DataWindow & { readonly rows: readonly TValue[] } {
  const window = dataWindow({ ...input, totalRows: rows.length });
  return { ...window, rows: rows.slice(window.startIndex, window.endIndexExclusive) };
}

function scrollForActiveItem(input: {
  readonly totalRows: number;
  readonly viewportRows: number;
  readonly activeIndex?: number;
  readonly contentColumns: number;
  readonly viewportColumns: number;
}): ScrollState {
  const base = createScrollState();
  const geometry = {
    contentRows: input.totalRows,
    contentColumns: input.contentColumns,
    viewportRows: input.viewportRows,
    viewportColumns: input.viewportColumns,
  };
  return input.activeIndex === undefined
    ? base
    : scrollReducer(base, {
      kind: 'itemIntoView',
      itemIndex: input.activeIndex,
      alignment: 'center',
    }, geometry);
}

function normalizeActiveIndex(index: number | undefined, totalRows: number): number | undefined {
  if (index === undefined || totalRows <= 0) return undefined;
  return Math.max(0, Math.min(totalRows - 1, Math.floor(index)));
}
