import type { Frame, FrameCell } from '../contracts.ts';

export interface FrameRowIndex {
  readonly cells: ReadonlyMap<number, FrameCell>;
  readonly renderable: readonly FrameCell[];
  readonly fingerprint?: string;
}

export interface FrameIndex {
  readonly frame: Frame;
  readonly rows: readonly (FrameRowIndex | undefined)[];
}

interface FrameWithSnapshotMetadata extends Frame {
  readonly metadata?: {
    readonly rowFingerprints?: readonly { readonly row: number; readonly fingerprint: string }[];
    readonly rowIndexes?: readonly {
      readonly row: number;
      readonly cells: ReadonlyMap<number, FrameCell>;
      readonly renderable: readonly FrameCell[];
      readonly fingerprint: string;
    }[];
  };
}

const indexes = new WeakMap<Frame, FrameIndex>();

export function frameIndex(frame: Frame): FrameIndex {
  const cached = indexes.get(frame);
  if (cached !== undefined) return cached;
  const created = createFrameIndex(frame);
  indexes.set(frame, created);
  return created;
}

function createFrameIndex(frame: Frame): FrameIndex {
  const retained = (frame as FrameWithSnapshotMetadata).metadata?.rowIndexes;
  if (retained !== undefined) {
    const rows: (FrameRowIndex | undefined)[] = Array.from({ length: frame.height });
    for (const row of retained) {
      if (row.row >= 1 && row.row <= frame.height) rows[row.row - 1] = row;
    }
    return Object.freeze({ frame, rows: Object.freeze(rows) });
  }
  const fingerprints = fingerprintRows(frame);
  const mutableRows: (MutableFrameRowIndex | undefined)[] = Array.from({ length: frame.height });
  for (const cell of frame.cells) {
    if (!cellInsideFrame(cell, frame)) continue;
    const rowIndex = cell.row - 1;
    const row: MutableFrameRowIndex = mutableRows[rowIndex] ?? { cells: new Map(), renderable: [] };
    mutableRows[rowIndex] = row;
    row.cells.set(cell.column, cell);
    if (cell.continuation !== true) row.renderable.push(cell);
  }
  return Object.freeze({
    frame,
    rows: Object.freeze(mutableRows.map((row, index): FrameRowIndex | undefined => {
      const fingerprint = fingerprints?.[index];
      if (row === undefined) {
        return fingerprint === undefined
          ? undefined
          : Object.freeze({ cells: new Map(), renderable: Object.freeze([]), fingerprint });
      }
      return Object.freeze({
        cells: row.cells,
        renderable: Object.freeze(row.renderable.toSorted((left, right) => left.column - right.column)),
        ...(fingerprint === undefined ? {} : { fingerprint })
      });
    }))
  });
}

interface MutableFrameRowIndex {
  readonly cells: Map<number, FrameCell>;
  readonly renderable: FrameCell[];
}

function fingerprintRows(frame: Frame): readonly (string | undefined)[] | undefined {
  const metadata = (frame as FrameWithSnapshotMetadata).metadata;
  if (metadata?.rowFingerprints === undefined) return undefined;
  const rows: (string | undefined)[] = Array.from({ length: frame.height });
  for (const entry of metadata.rowFingerprints) {
    if (Number.isInteger(entry.row) && entry.row >= 1 && entry.row <= frame.height) {
      rows[entry.row - 1] = entry.fingerprint;
    }
  }
  return Object.freeze(rows);
}

function cellInsideFrame(cell: FrameCell, frame: Frame): boolean {
  return Number.isInteger(cell.row)
    && Number.isInteger(cell.column)
    && cell.row >= 1
    && cell.row <= frame.height
    && cell.column >= 1
    && cell.column <= frame.width;
}
