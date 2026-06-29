import {
  createScrollState,
  normalizeScrollState,
  scrollReducer,
  visibleWindowFromScroll
} from './scroll.ts';
import type { ScrollState, ScrollVisibleWindow } from './scroll.ts';

export interface DataWindowInput {
  readonly totalRows: number;
  readonly viewportRows: number;
  readonly selectedIndex?: number;
  readonly scroll?: ScrollState;
  readonly contentColumns?: number;
  readonly viewportColumns?: number;
}

export interface DataWindow extends ScrollVisibleWindow {
  readonly totalRows: number;
  readonly selectedIndex?: number;
  readonly selectedVisibleIndex?: number;
  readonly offsetColumn: number;
  readonly omittedBefore: number;
  readonly omittedAfter: number;
}

export function dataWindow(input: DataWindowInput): DataWindow {
  const totalRows = nonNegativeInteger(input.totalRows);
  const viewportRows = nonNegativeInteger(input.viewportRows);
  const selectedIndex = normalizeSelectedIndex(input.selectedIndex, totalRows);
  const contentColumns = nonNegativeInteger(input.contentColumns ?? input.scroll?.contentColumns ?? input.viewportColumns ?? 0);
  const viewportColumns = nonNegativeInteger(input.viewportColumns ?? input.scroll?.viewportColumns ?? contentColumns);
  const scroll = input.scroll === undefined
    ? scrollForSelection({
        totalRows,
        viewportRows,
        contentColumns,
        viewportColumns,
        ...(selectedIndex === undefined ? {} : { selectedIndex })
      })
    : normalizeScrollState({
        ...input.scroll,
        contentRows: totalRows,
        contentColumns,
        viewportRows,
        viewportColumns
      });
  const window = visibleWindowFromScroll(scroll);
  const selectedVisibleIndex = selectedIndex === undefined || selectedIndex < window.start || selectedIndex >= window.end
    ? undefined
    : selectedIndex - window.start;
  return {
    totalRows,
    start: window.start,
    end: window.end,
    ...(selectedIndex === undefined ? {} : { selectedIndex }),
    ...(selectedVisibleIndex === undefined ? {} : { selectedVisibleIndex }),
    offsetColumn: scroll.offsetColumn,
    omittedBefore: window.start,
    omittedAfter: Math.max(0, totalRows - window.end)
  };
}

export function rowWindow<TValue>(
  rows: readonly TValue[],
  input: Omit<DataWindowInput, 'totalRows'>
): DataWindow & { readonly rows: readonly TValue[] } {
  const window = dataWindow({ ...input, totalRows: rows.length });
  return {
    ...window,
    rows: rows.slice(window.start, window.end)
  };
}

export function scrollStateFromUnknown(value: unknown): ScrollState | undefined {
  if (!isRecord(value)) return undefined;
  const offsetRow = numberField(value, 'offsetRow');
  const offsetColumn = numberField(value, 'offsetColumn');
  const contentRows = numberField(value, 'contentRows');
  const contentColumns = numberField(value, 'contentColumns');
  const viewportRows = numberField(value, 'viewportRows');
  const viewportColumns = numberField(value, 'viewportColumns');
  const followTail = value['followTail'];
  if (
    offsetRow === undefined
    || offsetColumn === undefined
    || contentRows === undefined
    || contentColumns === undefined
    || viewportRows === undefined
    || viewportColumns === undefined
    || typeof followTail !== 'boolean'
  ) return undefined;
  return {
    offsetRow,
    offsetColumn,
    contentRows,
    contentColumns,
    viewportRows,
    viewportColumns,
    followTail,
    ...optionalSelectedIndex(value)
  };
}

function scrollForSelection(input: {
  readonly totalRows: number;
  readonly viewportRows: number;
  readonly selectedIndex?: number;
  readonly contentColumns: number;
  readonly viewportColumns: number;
}): ScrollState {
  const base = createScrollState({
    contentRows: input.totalRows,
    contentColumns: input.contentColumns,
    viewportRows: input.viewportRows,
    viewportColumns: input.viewportColumns
  });
  return input.selectedIndex === undefined
    ? base
    : scrollReducer(base, { kind: 'itemIntoView', index: input.selectedIndex });
}

function optionalSelectedIndex(value: Readonly<Record<string, unknown>>): { readonly selectedIndex?: number } {
  const selectedIndex = numberField(value, 'selectedIndex');
  return selectedIndex === undefined ? {} : { selectedIndex };
}

function normalizeSelectedIndex(index: number | undefined, totalRows: number): number | undefined {
  if (index === undefined || totalRows <= 0) return undefined;
  return Math.max(0, Math.min(totalRows - 1, Math.floor(index)));
}

function numberField(value: Readonly<Record<string, unknown>>, key: string): number | undefined {
  const field = value[key];
  return typeof field === 'number' && Number.isFinite(field) ? field : undefined;
}

function nonNegativeInteger(value: number): number {
  return Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
