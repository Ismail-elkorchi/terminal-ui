import { finiteNonNegativeIntegerOrZero } from '../foundation/validation.ts';

export interface MeasuredWindowItem<TValue> {
  readonly id: string;
  readonly value: TValue;
  readonly rows: number;
}

export interface MeasuredWindowEntry<TValue> {
  readonly item: MeasuredWindowItem<TValue>;
  readonly itemIndex: number;
  readonly startRowIndex: number;
  readonly endRowIndexExclusive: number;
  readonly rowOffset: number;
  readonly clippedRowsBefore: number;
  readonly visibleRows: number;
}

export interface MeasuredWindowInput<TValue> {
  readonly items: readonly MeasuredWindowItem<TValue>[];
  readonly viewportRows: number;
  readonly offsetRow?: number;
  readonly activeId?: string;
}

export interface MeasuredWindow<TValue> {
  readonly entries: readonly MeasuredWindowEntry<TValue>[];
  readonly totalRows: number;
  readonly viewportRows: number;
  readonly offsetRow: number;
  readonly startIndex: number;
  readonly endIndexExclusive: number;
  readonly omittedBefore: number;
  readonly omittedAfter: number;
}

export function measuredWindow<TValue>(input: MeasuredWindowInput<TValue>): MeasuredWindow<TValue> {
  const viewportRows = finiteNonNegativeIntegerOrZero(input.viewportRows);
  const items = normalizeItems(input.items);
  const starts = itemStarts(items);
  const totalRows = starts.at(-1) ?? 0;
  const maxOffset = Math.max(0, totalRows - viewportRows);
  const requestedOffset = clamp(finiteNonNegativeIntegerOrZero(input.offsetRow ?? 0), 0, maxOffset);
  const activeIndex = input.activeId === undefined
    ? undefined
    : items.findIndex((item) => item.id === input.activeId);
  const offsetRow = activeIndex === undefined || activeIndex < 0
    ? requestedOffset
    : revealItemOffset(
        starts[activeIndex] ?? 0,
        starts[activeIndex + 1] ?? 0,
        requestedOffset,
        viewportRows,
        maxOffset
      );
  const viewportEnd = offsetRow + viewportRows;
  const entries = items.flatMap((item, itemIndex): readonly MeasuredWindowEntry<TValue>[] => {
    const startRow = starts[itemIndex] ?? 0;
    const endRow = starts[itemIndex + 1] ?? startRow;
    const visibleStart = Math.max(startRow, offsetRow);
    const visibleEnd = Math.min(endRow, viewportEnd);
    if (visibleEnd <= visibleStart) return [];
    return [{
      item,
      itemIndex,
      startRowIndex: startRow,
      endRowIndexExclusive: endRow,
      rowOffset: visibleStart - offsetRow,
      clippedRowsBefore: visibleStart - startRow,
      visibleRows: visibleEnd - visibleStart
    }];
  });
  const startIndex = entries[0]?.itemIndex ?? 0;
  const endIndexExclusive = (entries.at(-1)?.itemIndex ?? -1) + 1;
  return {
    entries,
    totalRows,
    viewportRows,
    offsetRow,
    startIndex,
    endIndexExclusive,
    omittedBefore: startIndex,
    omittedAfter: Math.max(0, items.length - endIndexExclusive)
  };
}

function normalizeItems<TValue>(items: readonly MeasuredWindowItem<TValue>[]): readonly MeasuredWindowItem<TValue>[] {
  const ids = new Set<string>();
  return items.map((item) => {
    if (ids.has(item.id)) throw new Error(`Duplicate measured item id: ${item.id}`);
    ids.add(item.id);
    return { ...item, rows: finiteNonNegativeIntegerOrZero(item.rows) };
  });
}

function itemStarts<TValue>(items: readonly MeasuredWindowItem<TValue>[]): readonly number[] {
  const starts = [0];
  for (const item of items) starts.push((starts.at(-1) ?? 0) + item.rows);
  return starts;
}

function revealItemOffset(
  startRow: number,
  endRow: number,
  offsetRow: number,
  viewportRows: number,
  maxOffset: number
): number {
  if (viewportRows <= 0) return 0;
  const rows = endRow - startRow;
  if (rows > viewportRows) return clamp(startRow, 0, maxOffset);
  if (startRow < offsetRow) return clamp(startRow, 0, maxOffset);
  if (endRow > offsetRow + viewportRows) return clamp(endRow - viewportRows, 0, maxOffset);
  return offsetRow;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
