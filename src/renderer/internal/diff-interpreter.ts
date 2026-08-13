import { createFrameBuffer } from './frame-buffer.ts';
import { textWidthProfileKey } from '../../text/index.ts';
import { sameFrameCellSource, sameTerminalStyle } from '../../visual/render.ts';
import { sameFrameCell } from './frame.ts';
import type { RenderDiff } from '../contracts.ts';
import type { CursorPosition } from '../contracts.ts';
import type { Frame, FrameCell } from '../contracts.ts';
import type { GraphicPlacement } from '../../graphics/index.ts';
import type { TextWidthProfile } from '../../text/index.ts';

export interface RenderDiffProjection {
  readonly width: number;
  readonly height: number;
  readonly widthProfile: TextWidthProfile;
  readonly cells: readonly FrameCell[];
  readonly graphics: readonly GraphicPlacement[];
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
  const graphics = new Map<string, GraphicPlacement>();
  if (!diff.fullRewrite && previous !== undefined) {
    for (const cell of previous.cells) buffer.writeCell(cell);
    for (const graphic of previous.graphics) graphics.set(graphic.id, graphic);
  }
  for (const operation of diff.graphicOperations) {
    if (operation.kind === 'place') {
      graphics.set(operation.placement.id, operation.placement);
      continue;
    }
    graphics.delete(operation.id);
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
    graphics: Object.freeze([...graphics.values()]),
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
    || projection.graphics.length !== frame.graphics.length
  ) return false;
  return projection.cells.every((cell, index) => {
    const expected = frame.cells[index];
    if (expected === undefined) return false;
    return cell.row === expected.row
      && cell.column === expected.column
      && sameFrameCell(cell, expected);
  }) && projection.graphics.every((placement, index) => {
    const expected = frame.graphics[index];
    if (expected === undefined) return false;
    return placement.id === expected.id
      && placement.image.contentFingerprint === expected.image.contentFingerprint
      && placement.image.width === expected.image.width
      && placement.image.height === expected.image.height
      && placement.image.format === expected.image.format
      && placement.image.byteLength === expected.image.byteLength
      && placement.fit === expected.fit
      && placement.bounds.row === expected.bounds.row
      && placement.bounds.column === expected.bounds.column
      && placement.bounds.width === expected.bounds.width
      && placement.bounds.height === expected.bounds.height
      && placement.clip.row === expected.clip.row
      && placement.clip.column === expected.clip.column
      && placement.clip.width === expected.clip.width
      && placement.clip.height === expected.clip.height;
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
