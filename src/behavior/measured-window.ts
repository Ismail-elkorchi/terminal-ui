import {
  readMeasuredCollection
} from '../ui-model/measured-collection.ts';
import type {
  MeasuredCollection,
  MeasuredCollectionReader
} from '../ui-model/measured-collection.ts';
import type {
  MeasuredAnchorAtOptions,
  MeasuredWindow,
  MeasuredWindowAnchor,
  MeasuredWindowEntry,
  MeasuredWindowOptions,
} from '../ui-model/measured-window.ts';

export type {
  MeasuredAnchorAtOptions,
  MeasuredWindow,
  MeasuredWindowAnchor,
  MeasuredWindowEntry,
  MeasuredWindowOptions,
} from '../ui-model/measured-window.ts';

const measuredWindows = new WeakSet<object>();

export function isMeasuredWindow(value: unknown): value is MeasuredWindow<unknown> {
  return value !== null && (typeof value === 'object' || typeof value === 'function')
    && measuredWindows.has(value);
}

export function measuredAnchorAt<TValue>(
  collection: MeasuredCollection<TValue>,
  options: MeasuredAnchorAtOptions
): MeasuredWindowAnchor | undefined {
  const reader = readMeasuredCollection(collection);
  const offsetRow = nonNegativeSafeInteger(options.offsetRow, 'Measured anchor offsetRow');
  const viewportRow = nonNegativeSafeInteger(options.viewportRow ?? 0, 'Measured anchor viewportRow');
  if (offsetRow > Number.MAX_SAFE_INTEGER - viewportRow) return undefined;
  const absoluteRow = offsetRow + viewportRow;
  const position = reader.positionAtRow(absoluteRow);
  return position === undefined
    ? undefined
    : Object.freeze({
        itemId: position.item.id,
        rowWithinItem: absoluteRow - position.startRowIndex,
        viewportRow
      });
}

export function measuredWindow<TValue>(
  collection: MeasuredCollection<TValue>,
  options: MeasuredWindowOptions
): MeasuredWindow<TValue> {
  const reader = readMeasuredCollection(collection);
  const viewportRows = nonNegativeSafeInteger(options.viewportRows, 'Measured window viewportRows');
  const maxOffset = Math.max(0, reader.totalRows - viewportRows);
  const requestedOffset = clamp(
    nonNegativeSafeInteger(options.offsetRow ?? 0, 'Measured window offsetRow'),
    0,
    maxOffset
  );
  const anchoredOffset = offsetForAnchor(reader, options.anchor, viewportRows, requestedOffset, maxOffset);
  const activeId = optionalItemId(options.activeId, 'Measured window activeId');
  const activePosition = activeId === undefined
    ? undefined
    : reader.positionById(activeId);
  const offsetRow = activePosition === undefined
    ? anchoredOffset
    : revealItemOffset(
        activePosition.startRowIndex,
        activePosition.endRowIndexExclusive,
        anchoredOffset,
        viewportRows,
        maxOffset
      );
  const viewportEnd = offsetRow + viewportRows;
  const entries = Object.freeze(reader.positionsInRows(offsetRow, viewportEnd)
    .map((position): MeasuredWindowEntry<TValue> => {
      const visibleStart = Math.max(position.startRowIndex, offsetRow);
      const visibleEnd = Math.min(position.endRowIndexExclusive, viewportEnd);
      return Object.freeze({
        ...position,
        rowOffset: visibleStart - offsetRow,
        clippedRowsBefore: visibleStart - position.startRowIndex,
        visibleRows: visibleEnd - visibleStart
      });
    }));
  const startIndex = entries[0]?.itemIndex ?? 0;
  const endIndexExclusive = (entries.at(-1)?.itemIndex ?? -1) + 1;
  const window = Object.freeze({
    entries,
    totalRows: reader.totalRows,
    viewportRows,
    offsetRow,
    startIndex,
    endIndexExclusive,
    omittedBefore: startIndex,
    omittedAfter: Math.max(0, reader.itemCount - endIndexExclusive)
  });
  measuredWindows.add(window);
  return window;
}

function offsetForAnchor<TValue>(
  reader: MeasuredCollectionReader<TValue>,
  anchor: MeasuredWindowAnchor | undefined,
  viewportRows: number,
  fallback: number,
  maxOffset: number
): number {
  if (anchor === undefined || viewportRows === 0) return fallback;
  const itemId = optionalItemId(anchor.itemId, 'Measured window anchor.itemId');
  if (itemId === undefined) throw new TypeError('Measured window anchor.itemId must be a non-empty string.');
  const rowWithinItem = nonNegativeSafeInteger(anchor.rowWithinItem, 'Measured window anchor.rowWithinItem');
  const viewportRow = nonNegativeSafeInteger(anchor.viewportRow, 'Measured window anchor.viewportRow');
  const position = reader.positionById(itemId);
  if (position === undefined) return fallback;
  const retainedRow = Math.min(rowWithinItem, position.item.rows - 1);
  const retainedViewportRow = Math.min(viewportRow, viewportRows - 1);
  return clamp(position.startRowIndex + retainedRow - retainedViewportRow, 0, maxOffset);
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
  if (rows > viewportRows) {
    const alreadyVisible = startRow < offsetRow + viewportRows && endRow > offsetRow;
    return alreadyVisible ? offsetRow : clamp(startRow, 0, maxOffset);
  }
  if (startRow < offsetRow) return clamp(startRow, 0, maxOffset);
  if (endRow > offsetRow + viewportRows) return clamp(endRow - viewportRows, 0, maxOffset);
  return offsetRow;
}

function optionalItemId(value: unknown, subject: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${subject} must be a non-empty string when provided.`);
  }
  return value;
}

function nonNegativeSafeInteger(value: unknown, subject: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${subject} must be a non-negative safe integer.`);
  }
  return value;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
