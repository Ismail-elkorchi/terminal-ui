import { createFrameBuffer } from './frame-buffer.ts';
import { textWidthProfileKey } from '../../text/index.ts';
import { sameFrameCellSource, sameTerminalStyle } from '../../visual/render.ts';
import { sameFrameCell } from './frame.ts';
import type { RenderDiff } from '../contracts.ts';
import type { CursorPosition } from '../contracts.ts';
import type { Frame, FrameCell } from '../contracts.ts';
import type { TextWidthProfile } from '../../text/index.ts';

export interface RenderDiffProjection {
  readonly width: number;
  readonly height: number;
  readonly widthProfile: TextWidthProfile;
  readonly cells: readonly FrameCell[];
  readonly cursor?: CursorPosition;
}

export function applyRenderDiff(
  previous: Frame | RenderDiffProjection | undefined,
  diff: RenderDiff
): RenderDiffProjection {
  if (!diff.fullRewrite && previous === undefined) {
    throw new Error('An incremental render diff requires a previous frame projection.');
  }
  if (
    !diff.fullRewrite
    && previous !== undefined
    && (
      previous.width !== diff.width
      || previous.height !== diff.height
      || textWidthProfileKey(previous.widthProfile) !== textWidthProfileKey(diff.widthProfile)
    )
  ) {
    throw new Error('An incremental render diff must match the previous frame dimensions and width profile.');
  }

  const buffer = createFrameBuffer(diff.width, diff.height, { widthProfile: diff.widthProfile });
  if (!diff.fullRewrite && previous !== undefined) {
    for (const cell of previous.cells) buffer.writeCell(cell);
  }
  for (const operation of diff.operations) {
    switch (operation.kind) {
      case 'write':
        buffer.write(operation.row, operation.column, operation.spans);
        break;
      case 'clearRect':
        buffer.clear(operation.bounds);
        break;
    }
  }
  const snapshot = buffer.snapshot({
    ...(diff.cursor === undefined ? {} : { cursor: diff.cursor })
  });
  return Object.freeze({
    width: snapshot.width,
    height: snapshot.height,
    widthProfile: snapshot.widthProfile,
    cells: snapshot.cells,
    ...(snapshot.cursor === undefined ? {} : { cursor: snapshot.cursor })
  });
}

export function renderDiffProjectionMatchesFrame(
  projection: RenderDiffProjection,
  frame: Frame
): boolean {
  if (
    projection.width !== frame.width
    || projection.height !== frame.height
    || textWidthProfileKey(projection.widthProfile) !== textWidthProfileKey(frame.widthProfile)
    || !sameCursor(projection.cursor, frame.cursor)
    || projection.cells.length !== frame.cells.length
  ) return false;
  return projection.cells.every((cell, index) => {
    const expected = frame.cells[index];
    if (expected === undefined) return false;
    return cell.row === expected.row
      && cell.column === expected.column
      && sameFrameCell(cell, expected);
  });
}

function sameCursor(left: CursorPosition | undefined, right: CursorPosition | undefined): boolean {
  return left === undefined || right === undefined
    ? left === right
    : left.row === right.row
      && left.column === right.column
      && sameTerminalStyle(left.style, right.style)
      && sameFrameCellSource(left.source, right.source);
}
