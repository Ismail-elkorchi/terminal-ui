import { createFrameBuffer } from '../frame-buffer.ts';
import { textWidthProfileKey } from '../../text/index.ts';
import { sameFrameCellSource, sameTerminalStyle } from '../../visual/render-content.ts';
import { sameFrameCell } from '../frame.ts';
import type { FrameDescriptor, RenderDiffDescriptor, RenderOperation } from '../contracts.ts';
import type { CursorPosition } from '../contracts.ts';
import type { FrameCell } from '../contracts.ts';
import type { GraphicPlacementDescriptor } from '../../graphics/index.ts';
import type { TextWidthProfile } from '../../text/index.ts';
import type { TerminalStyle } from '../../visual/render-content.ts';

export function fullRewriteDiffFromFrame(frame: FrameDescriptor): RenderDiffDescriptor {
  const operations: RenderOperation[] = [];
  for (const cell of frame.cells) {
    if (cell.continuation === true) continue;
    operations.push(Object.freeze({
      kind: 'write',
      row: cell.row,
      column: cell.column,
      spans: Object.freeze([Object.freeze({
        text: cell.text,
        ...(cell.style === undefined ? {} : { style: cell.style }),
        ...(cell.link === undefined ? {} : { link: cell.link }),
        ...(cell.source === undefined ? {} : { source: cell.source })
      })])
    }));
  }
  return Object.freeze({
    width: frame.width,
    height: frame.height,
    widthProfile: frame.widthProfile,
    ...(frame.canvasStyle === undefined ? {} : { canvasStyle: frame.canvasStyle }),
    operations: Object.freeze(operations),
    graphicOperations: Object.freeze(frame.graphics.map((placement) => Object.freeze({
      kind: 'place' as const,
      placement
    }))),
    ...(frame.cursor === undefined ? {} : { cursor: frame.cursor }),
    fullRewrite: true
  });
}

export interface ReplayedFrame {
  readonly width: number;
  readonly height: number;
  readonly widthProfile: TextWidthProfile;
  readonly canvasStyle?: TerminalStyle;
  readonly cells: readonly FrameCell[];
  readonly graphics: readonly GraphicPlacementDescriptor[];
  readonly cursor?: CursorPosition;
}

export function applyRenderDiff(
  previous: FrameDescriptor | ReplayedFrame | undefined,
  diff: RenderDiffDescriptor,
): ReplayedFrame {
  if (!diff.fullRewrite && previous === undefined) {
    throw new Error('An incremental render diff requires a previous replayed frame.');
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
  const graphics = new Map<string, GraphicPlacementDescriptor>();
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
    ...(diff.canvasStyle === undefined ? {} : { canvasStyle: diff.canvasStyle }),
    ...(diff.cursor === undefined ? {} : { cursor: diff.cursor })
  });
  return Object.freeze({
    width: snapshot.width,
    height: snapshot.height,
    widthProfile: snapshot.widthProfile,
    ...(snapshot.canvasStyle === undefined ? {} : { canvasStyle: snapshot.canvasStyle }),
    cells: snapshot.cells,
    graphics: Object.freeze([...graphics.values()]),
    ...(snapshot.cursor === undefined ? {} : { cursor: snapshot.cursor })
  });
}

export function replayedFrameMatches(
  replayed: ReplayedFrame,
  frame: FrameDescriptor,
): boolean {
  if (
    replayed.width !== frame.width
    || replayed.height !== frame.height
    || textWidthProfileKey(replayed.widthProfile) !== textWidthProfileKey(frame.widthProfile)
    || !sameTerminalStyle(replayed.canvasStyle, frame.canvasStyle)
    || !sameCursor(replayed.cursor, frame.cursor)
    || replayed.cells.length !== frame.cells.length
    || replayed.graphics.length !== frame.graphics.length
  ) return false;
  return replayed.cells.every((cell, index) => {
    const expected = frame.cells[index];
    if (expected === undefined) return false;
    return cell.row === expected.row
      && cell.column === expected.column
      && sameFrameCell(cell, expected);
  }) && replayed.graphics.every((placement, index) => {
    const expected = frame.graphics[index];
    if (expected === undefined) return false;
    return placement.id === expected.id
      && placement.image.contentDigest === expected.image.contentDigest
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
