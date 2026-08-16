import type { GraphicPlacement } from '../graphics/index.ts';
import type { Rect } from '../geometry/types.ts';

/** @experimental */
export interface TerminalCellPixels {
  readonly width: number;
  readonly height: number;
}

/** @experimental */
export interface ResolvedGraphicGeometry {
  readonly destination: Rect;
  readonly source: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
}

/** @experimental */
export function resolveGraphicGeometry(
  placement: GraphicPlacement,
  cellPixels?: TerminalCellPixels,
): ResolvedGraphicGeometry | undefined {
  if (placement.fit !== 'fill' && cellPixels === undefined) return undefined;
  const image = placement.image;
  let destination = placement.bounds;
  let source = { x: 0, y: 0, width: image.width, height: image.height };
  if (placement.fit === 'contain' && cellPixels !== undefined) {
    const scale = Math.min(
      placement.bounds.width * cellPixels.width / image.width,
      placement.bounds.height * cellPixels.height / image.height,
    );
    const width = Math.max(1, Math.min(placement.bounds.width, Math.round(image.width * scale / cellPixels.width)));
    const height = Math.max(1, Math.min(placement.bounds.height, Math.round(image.height * scale / cellPixels.height)));
    destination = {
      row: placement.bounds.row + Math.floor((placement.bounds.height - height) / 2),
      column: placement.bounds.column + Math.floor((placement.bounds.width - width) / 2),
      width,
      height,
    };
  } else if (placement.fit === 'cover' && cellPixels !== undefined) {
    const targetAspect = placement.bounds.width * cellPixels.width
      / (placement.bounds.height * cellPixels.height);
    const sourceAspect = image.width / image.height;
    if (sourceAspect > targetAspect) {
      const width = Math.max(1, Math.round(image.height * targetAspect));
      source = { x: Math.floor((image.width - width) / 2), y: 0, width, height: image.height };
    } else if (sourceAspect < targetAspect) {
      const height = Math.max(1, Math.round(image.width / targetAspect));
      source = { x: 0, y: Math.floor((image.height - height) / 2), width: image.width, height };
    }
  }
  const visible = intersectRects(destination, placement.clip);
  if (visible === undefined) return undefined;
  return { destination: visible, source: cropSource(source, destination, visible) };
}

function cropSource(
  source: ResolvedGraphicGeometry['source'],
  destination: Rect,
  visible: Rect,
): ResolvedGraphicGeometry['source'] {
  const left = (visible.column - destination.column) / destination.width;
  const top = (visible.row - destination.row) / destination.height;
  const right = (visible.column + visible.width - destination.column) / destination.width;
  const bottom = (visible.row + visible.height - destination.row) / destination.height;
  const x = source.x + Math.floor(source.width * left);
  const y = source.y + Math.floor(source.height * top);
  const sourceRight = source.x + Math.ceil(source.width * right);
  const sourceBottom = source.y + Math.ceil(source.height * bottom);
  return { x, y, width: Math.max(1, sourceRight - x), height: Math.max(1, sourceBottom - y) };
}

function intersectRects(left: Rect, right: Rect): Rect | undefined {
  const row = Math.max(left.row, right.row);
  const column = Math.max(left.column, right.column);
  const bottom = Math.min(left.row + left.height, right.row + right.height);
  const edge = Math.min(left.column + left.width, right.column + right.width);
  return bottom <= row || edge <= column
    ? undefined
    : { row, column, width: edge - column, height: bottom - row };
}
