import type { DirtyRegionSet } from './dirty-regions.ts';
import type { Frame, FrameCell, FrameDescriptor } from '../contracts.ts';
import type { AccessibleSnapshot } from '../../accessibility/index.ts';
import { sameFrameCell, sameTerminalFrameCell } from './frame-cell-equality.ts';

export interface FrameRowFingerprint {
  readonly row: number;
  readonly fingerprint: string;
  readonly terminalFingerprint: string;
}

export interface FrameSnapshotRowIndex {
  readonly row: number;
  readonly cells: ReadonlyMap<number, FrameCell>;
  readonly renderable: readonly FrameCell[];
  readonly fingerprint: string;
  readonly terminalFingerprint: string;
}

export interface FrameSnapshotMetadata {
  readonly writtenBounds: DirtyRegionSet;
  readonly clearedBounds: DirtyRegionSet;
  readonly rowFingerprints: readonly FrameRowFingerprint[];
  readonly rowIndexes: readonly FrameSnapshotRowIndex[];
  readonly fingerprint: string;
  readonly terminalFingerprint: string;
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

export function withFrameAccessibility(frame: Frame, accessibility: AccessibleSnapshot): Frame {
  if (frame.accessibility === accessibility) return frame;
  const adopted = Object.freeze({ ...frame, accessibility });
  const metadata = frameSnapshotMetadata(frame);
  return metadata === undefined ? adopted : registerFrameSnapshotMetadata(adopted, metadata);
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

export function sameTerminalSnapshotRow(
  left: FrameSnapshotRowIndex | undefined,
  right: FrameSnapshotRowIndex | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right;
  if (left.terminalFingerprint !== right.terminalFingerprint || left.cells.size !== right.cells.size) return false;
  for (const [column, cell] of left.cells) {
    if (!sameTerminalFrameCell(cell, right.cells.get(column))) return false;
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
