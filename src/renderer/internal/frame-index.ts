import type { FrameCell, FrameDescriptor } from '../contracts.ts';
import { frameSnapshotMetadata } from './frame-snapshot.ts';

export interface FrameRowIndex {
  readonly cells: ReadonlyMap<number, FrameCell>;
  readonly renderable: readonly FrameCell[];
  readonly fingerprint?: string;
  readonly terminalFingerprint?: string;
}

export interface FrameIndex {
  readonly frame: FrameDescriptor;
  readonly rows: readonly (FrameRowIndex | undefined)[];
}

const indexes = new WeakMap<FrameDescriptor, FrameIndex>();

export function frameIndex(frame: FrameDescriptor): FrameIndex {
  const cached = indexes.get(frame);
  if (cached !== undefined) return cached;
  const created = createFrameIndex(frame);
  indexes.set(frame, created);
  return created;
}

function createFrameIndex(frame: FrameDescriptor): FrameIndex {
  const retained = frameSnapshotMetadata(frame)?.rowIndexes;
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
          : Object.freeze({
              cells: new Map(),
              renderable: Object.freeze([]),
              fingerprint: fingerprint.fingerprint,
              terminalFingerprint: fingerprint.terminalFingerprint,
            });
      }
      return Object.freeze({
        cells: row.cells,
        renderable: Object.freeze(row.renderable.toSorted((left, right) => left.column - right.column)),
        ...(fingerprint === undefined ? {} : {
          fingerprint: fingerprint.fingerprint,
          terminalFingerprint: fingerprint.terminalFingerprint,
        })
      });
    }))
  });
}

interface MutableFrameRowIndex {
  readonly cells: Map<number, FrameCell>;
  readonly renderable: FrameCell[];
}

function fingerprintRows(
  frame: FrameDescriptor,
): readonly ({ readonly fingerprint: string; readonly terminalFingerprint: string } | undefined)[] | undefined {
  const metadata = frameSnapshotMetadata(frame);
  if (metadata === undefined) return undefined;
  const rows: ({ readonly fingerprint: string; readonly terminalFingerprint: string } | undefined)[] = Array.from({ length: frame.height });
  for (const entry of metadata.rowFingerprints) {
    if (Number.isInteger(entry.row) && entry.row >= 1 && entry.row <= frame.height) {
      rows[entry.row - 1] = entry;
    }
  }
  return Object.freeze(rows);
}

function cellInsideFrame(cell: FrameCell, frame: FrameDescriptor): boolean {
  return Number.isInteger(cell.row)
    && Number.isInteger(cell.column)
    && cell.row >= 1
    && cell.row <= frame.height
    && cell.column >= 1
    && cell.column <= frame.width;
}
