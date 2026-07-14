export interface MeasuredWindowItem<TValue> {
  readonly id: string;
  readonly value: TValue;
  readonly rows: number;
}

export interface MeasuredWindowEntry<TValue> {
  readonly item: MeasuredWindowItem<TValue>;
  readonly index: number;
  readonly startRow: number;
  readonly endRow: number;
  readonly rowOffset: number;
  readonly clippedRowsBefore: number;
  readonly visibleRows: number;
}

export interface MeasuredWindowInput<TValue> {
  readonly items: readonly MeasuredWindowItem<TValue>[];
  readonly viewportRows: number;
  readonly offsetRow?: number;
  readonly selectedId?: string;
}

export interface MeasuredWindow<TValue> {
  readonly entries: readonly MeasuredWindowEntry<TValue>[];
  readonly totalRows: number;
  readonly viewportRows: number;
  readonly offsetRow: number;
  readonly startIndex: number;
  readonly endIndex: number;
  readonly omittedBefore: number;
  readonly omittedAfter: number;
}

export function measuredWindow<TValue>(input: MeasuredWindowInput<TValue>): MeasuredWindow<TValue> {
  const viewportRows = nonNegativeInteger(input.viewportRows);
  const items = normalizeItems(input.items);
  const starts = itemStarts(items);
  const totalRows = starts.at(-1) ?? 0;
  const maxOffset = Math.max(0, totalRows - viewportRows);
  const requestedOffset = clamp(nonNegativeInteger(input.offsetRow ?? 0), 0, maxOffset);
  const selectedIndex = input.selectedId === undefined
    ? undefined
    : items.findIndex((item) => item.id === input.selectedId);
  const offsetRow = selectedIndex === undefined || selectedIndex < 0
    ? requestedOffset
    : revealItemOffset(
        starts[selectedIndex] ?? 0,
        starts[selectedIndex + 1] ?? 0,
        requestedOffset,
        viewportRows,
        maxOffset
      );
  const viewportEnd = offsetRow + viewportRows;
  const entries = items.flatMap((item, index): readonly MeasuredWindowEntry<TValue>[] => {
    const startRow = starts[index] ?? 0;
    const endRow = starts[index + 1] ?? startRow;
    const visibleStart = Math.max(startRow, offsetRow);
    const visibleEnd = Math.min(endRow, viewportEnd);
    if (visibleEnd <= visibleStart) return [];
    return [{
      item,
      index,
      startRow,
      endRow,
      rowOffset: visibleStart - offsetRow,
      clippedRowsBefore: visibleStart - startRow,
      visibleRows: visibleEnd - visibleStart
    }];
  });
  const startIndex = entries[0]?.index ?? 0;
  const endIndex = (entries.at(-1)?.index ?? -1) + 1;
  return {
    entries,
    totalRows,
    viewportRows,
    offsetRow,
    startIndex,
    endIndex,
    omittedBefore: startIndex,
    omittedAfter: Math.max(0, items.length - endIndex)
  };
}

function normalizeItems<TValue>(items: readonly MeasuredWindowItem<TValue>[]): readonly MeasuredWindowItem<TValue>[] {
  const ids = new Set<string>();
  return items.map((item) => {
    if (ids.has(item.id)) throw new Error(`Duplicate measured item id: ${item.id}`);
    ids.add(item.id);
    return { ...item, rows: nonNegativeInteger(item.rows) };
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

function nonNegativeInteger(value: number): number {
  return Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
