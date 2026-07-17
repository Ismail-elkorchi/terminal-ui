import { createFrameBuffer } from './frame-buffer.ts';
import type { RenderDiff } from '../model/diff.ts';
import type { CursorPosition } from '../model/cursor.ts';
import type { Frame, FrameCell } from '../model/frame.ts';

export interface RenderDiffProjection {
  readonly width: number;
  readonly height: number;
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
    && (previous.width !== diff.width || previous.height !== diff.height)
  ) {
    throw new Error('An incremental render diff must match the previous frame dimensions.');
  }

  const buffer = createFrameBuffer(diff.width, diff.height);
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
    cells: snapshot.cells,
    ...(snapshot.cursor === undefined ? {} : { cursor: snapshot.cursor })
  });
}
