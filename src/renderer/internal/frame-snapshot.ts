import type { AccessibleSnapshot } from '../../accessibility/types.ts';
import type { Frame, FrameCell, FrameDescriptor } from '../contracts.ts';
import type { DirtyRegionSet } from './damage-contracts.ts';
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
  const metadata = frameSnapshotMetadata(frame);
  if (metadata === undefined) return Object.freeze({ ...frame, accessibility });
  // Preserve the owned flat-cells accessor without forcing materialization merely
  // to attach semantics. It closes over row storage, not this predecessor frame.
  const adopted = Object.freeze(Object.defineProperties({}, {
    ...Object.getOwnPropertyDescriptors(frame),
    accessibility: { value: accessibility, enumerable: true },
  })) as Frame;
  return registerFrameSnapshotMetadata(adopted, metadata);
}

export function sameSnapshotRow(
  left: FrameSnapshotRowIndex | undefined,
  right: FrameSnapshotRowIndex | undefined,
): boolean {
  if (left === right) return true;
  if (left === undefined || right === undefined) return false;
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
  if (left === right) return true;
  if (left === undefined || right === undefined) return false;
  if (left.terminalFingerprint !== right.terminalFingerprint || left.cells.size !== right.cells.size) return false;
  for (const [column, cell] of left.cells) {
    if (!sameTerminalFrameCell(cell, right.cells.get(column))) return false;
  }
  return true;
}

const rowsByMetadata = new WeakMap<FrameSnapshotMetadata, ReadonlyMap<number, FrameSnapshotRowIndex>>();

export function snapshotRow(
  metadata: FrameSnapshotMetadata,
  row: number,
): FrameSnapshotRowIndex | undefined {
  let rows = rowsByMetadata.get(metadata);
  if (rows === undefined) { rows = new Map(metadata.rowIndexes.map(entry => [entry.row, entry])); rowsByMetadata.set(metadata, rows); }
  return rows.get(row);
}
