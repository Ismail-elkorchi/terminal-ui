import type { DirtyRegionSet } from './dirty-regions.ts';
import type { Frame, FrameCell, FrameDescriptor } from '../contracts.ts';
import { sameFrameCell } from './frame-cell-equality.ts';

export interface FrameRowFingerprint {
  readonly row: number;
  readonly fingerprint: string;
}

export interface FrameSnapshotRowIndex {
  readonly row: number;
  readonly cells: ReadonlyMap<number, FrameCell>;
  readonly renderable: readonly FrameCell[];
  readonly fingerprint: string;
}

export interface FrameSnapshotMetadata {
  readonly writtenBounds: DirtyRegionSet;
  readonly clearedBounds: DirtyRegionSet;
  readonly rowFingerprints: readonly FrameRowFingerprint[];
  readonly rowIndexes: readonly FrameSnapshotRowIndex[];
  readonly fingerprint: string;
}

const metadataByFrame = new WeakMap<FrameDescriptor, FrameSnapshotMetadata>();

export function registerFrameSnapshotMetadata<TFrame extends Frame>(
  frame: TFrame,
  metadata: FrameSnapshotMetadata,
): TFrame {
  metadataByFrame.set(frame, metadata);
  return frame;
}

export function frameSnapshotMetadata(frame: FrameDescriptor): FrameSnapshotMetadata | undefined {
  return metadataByFrame.get(frame);
}

export function sameSnapshotRow(
  left: FrameSnapshotRowIndex | undefined,
  right: FrameSnapshotRowIndex | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right;
  if (left.fingerprint !== right.fingerprint || left.cells.size !== right.cells.size) return false;
  for (const [column, cell] of left.cells) {
    if (!sameFrameCell(cell, right.cells.get(column))) return false;
  }
  return true;
}

export function snapshotRow(
  metadata: FrameSnapshotMetadata,
  row: number,
): FrameSnapshotRowIndex | undefined {
  return metadata.rowIndexes.find((entry) => entry.row === row);
}

export function sameSnapshotContents(
  left: FrameSnapshotMetadata,
  right: FrameSnapshotMetadata,
): boolean {
  if (left.fingerprint !== right.fingerprint) return false;
  const rows = new Set([
    ...left.rowIndexes.map((entry) => entry.row),
    ...right.rowIndexes.map((entry) => entry.row),
  ]);
  for (const row of rows) {
    if (!sameSnapshotRow(snapshotRow(left, row), snapshotRow(right, row))) return false;
  }
  return true;
}
