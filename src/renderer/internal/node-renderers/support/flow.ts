import type { Measurement, Rect } from '../../../contracts.ts';

export interface FlowGeometry {
  readonly children: readonly Rect[];
  readonly width: number;
  readonly height: number;
}

export function flowGeometry(
  direction: 'horizontal' | 'vertical',
  availablePrimaryCells: number,
  gap: number,
  lineGap: number,
  children: readonly Measurement[]
): FlowGeometry {
  const primaryCells = Math.max(0, Math.floor(availablePrimaryCells));
  if (primaryCells === 0 || children.length === 0) {
    return {
      children: children.map(() => ({ row: 0, column: 0, width: 0, height: 0 })),
      width: 0,
      height: 0
    };
  }
  const childBounds = direction === 'horizontal'
    ? horizontalFlowGeometry(primaryCells, gap, lineGap, children)
    : verticalFlowGeometry(primaryCells, gap, lineGap, children);
  return {
    children: childBounds,
    width: childBounds.reduce(
      (maximum, child) => Math.max(maximum, child.column + child.width),
      0
    ),
    height: childBounds.reduce(
      (maximum, child) => Math.max(maximum, child.row + child.height),
      0
    )
  };
}

export function flowChildBounds(
  bounds: Rect,
  direction: 'horizontal' | 'vertical',
  gap: number,
  lineGap: number,
  children: readonly Measurement[]
): readonly Rect[] {
  const geometry = flowGeometry(
    direction,
    direction === 'horizontal' ? bounds.width : bounds.height,
    gap,
    lineGap,
    children
  );
  return geometry.children.map((child) => clipRelativeRect(child, bounds));
}

function horizontalFlowGeometry(
  availableWidth: number,
  gap: number,
  lineGap: number,
  children: readonly Measurement[]
): readonly Rect[] {
  let row = 0;
  let column = 0;
  let lineHeight = 0;
  return children.map((child): Rect => {
    const width = Math.min(availableWidth, child.preferredWidth);
    const height = child.preferredHeight;
    if (column > 0 && column + width > availableWidth) {
      row += lineHeight + lineGap;
      column = 0;
      lineHeight = 0;
    }
    const result = { row, column, width, height };
    column += width + gap;
    lineHeight = Math.max(lineHeight, height);
    return result;
  });
}

function verticalFlowGeometry(
  availableHeight: number,
  gap: number,
  lineGap: number,
  children: readonly Measurement[]
): readonly Rect[] {
  let row = 0;
  let column = 0;
  let lineWidth = 0;
  return children.map((child): Rect => {
    const width = child.preferredWidth;
    const height = Math.min(availableHeight, child.preferredHeight);
    if (row > 0 && row + height > availableHeight) {
      column += lineWidth + lineGap;
      row = 0;
      lineWidth = 0;
    }
    const result = { row, column, width, height };
    row += height + gap;
    lineWidth = Math.max(lineWidth, width);
    return result;
  });
}

function clipRelativeRect(child: Rect, bounds: Rect): Rect {
  const row = bounds.row + child.row;
  const column = bounds.column + child.column;
  const bottom = bounds.row + bounds.height;
  const right = bounds.column + bounds.width;
  if (row >= bottom || column >= right) {
    return {
      row: Math.min(row, bottom),
      column: Math.min(column, right),
      width: 0,
      height: 0
    };
  }
  return {
    row,
    column,
    width: Math.min(child.width, right - column),
    height: Math.min(child.height, bottom - row)
  };
}
