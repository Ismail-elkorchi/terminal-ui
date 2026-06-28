import type { Widget } from '../../../widgets/index.ts';
import { numberProp } from '../../widget-props.ts';
import { clampRect, nonNegativeInteger } from './common.ts';
import type { LayoutNode, Rect } from '../../layout.ts';

export function modalChildBounds(widget: Widget, bounds: Rect): Rect {
  const width = Math.min(bounds.width, Math.max(4, Math.floor(numberProp(widget, 'width') ?? Math.min(bounds.width, 60))));
  const height = Math.min(bounds.height, Math.max(3, Math.floor(numberProp(widget, 'height') ?? Math.min(bounds.height, 20))));
  return clampRect({
    row: bounds.row + Math.max(0, Math.floor((bounds.height - height) / 2)),
    column: bounds.column + Math.max(0, Math.floor((bounds.width - width) / 2)),
    width,
    height
  });
}

export function viewportAccessibleDescription(widget: Widget, node: LayoutNode): string {
  const scrollRow = nonNegativeInteger(numberProp(widget, 'scrollRow'));
  const scrollColumn = nonNegativeInteger(numberProp(widget, 'scrollColumn'));
  const contentRows = Math.max(node.bounds.height + scrollRow, nonNegativeInteger(numberProp(widget, 'contentRows')));
  const contentColumns = Math.max(
    node.bounds.width + scrollColumn,
    nonNegativeInteger(numberProp(widget, 'contentColumns'))
  );
  const rowEnd = Math.min(contentRows, scrollRow + node.bounds.height);
  const columnEnd = Math.min(contentColumns, scrollColumn + node.bounds.width);
  return `Showing rows ${String(scrollRow + 1)}-${String(rowEnd)} of ${String(contentRows)}, columns ${String(scrollColumn + 1)}-${String(columnEnd)} of ${String(contentColumns)}.`;
}

export function viewportChildBounds(widget: Widget, bounds: Rect): Rect {
  const scrollRow = nonNegativeInteger(numberProp(widget, 'scrollRow'));
  const scrollColumn = nonNegativeInteger(numberProp(widget, 'scrollColumn'));
  const contentRows = Math.max(bounds.height + scrollRow, nonNegativeInteger(numberProp(widget, 'contentRows')));
  const contentColumns = Math.max(bounds.width + scrollColumn, nonNegativeInteger(numberProp(widget, 'contentColumns')));
  return {
    row: bounds.row - scrollRow,
    column: bounds.column - scrollColumn,
    width: contentColumns,
    height: contentRows
  };
}
