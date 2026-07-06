import type { TerminalTheme } from '../../../theme/index.ts';
import type { Widget } from '../../../widgets/index.ts';
import type { BorderStyle } from '../../border.ts';
import type { FrameBuffer } from '../../frame.ts';
import { frameCellSource } from '../../frame-source.ts';
import type { LayoutNode, Rect } from '../../layout.ts';
import type { Measurement } from '../../measurement.ts';
import type { TerminalStyle } from '../../render-primitives.ts';
import { numberProp } from '../../widget-props.ts';
import { borderContentBounds } from './border.ts';
import { clampRect, nonNegativeInteger } from './common.ts';

export function modalDialogBounds(widget: Widget, bounds: Rect): Rect {
  const width = Math.min(bounds.width, Math.max(4, Math.floor(numberProp(widget, 'width') ?? Math.min(bounds.width, 60))));
  const height = Math.min(bounds.height, Math.max(3, Math.floor(numberProp(widget, 'height') ?? Math.min(bounds.height, 20))));
  return clampRect({
    row: bounds.row + Math.max(0, Math.floor((bounds.height - height) / 2)),
    column: bounds.column + Math.max(0, Math.floor((bounds.width - width) / 2)),
    width,
    height
  });
}

export function modalChildBounds(
  widget: Widget,
  bounds: Rect,
  border: BorderStyle,
  childMeasures: readonly Measurement[]
): readonly Rect[] {
  const contentBounds = borderContentBounds(modalDialogBounds(widget, bounds), border);
  if (!modalHasActions(widget)) return [contentBounds];
  const actionHeight = modalActionHeight(contentBounds.height, childMeasures[1]);
  const separatorHeight = contentBounds.height > actionHeight ? 1 : 0;
  const bodyHeight = Math.max(0, contentBounds.height - actionHeight - separatorHeight);
  return [
    {
      row: contentBounds.row,
      column: contentBounds.column,
      width: contentBounds.width,
      height: bodyHeight
    },
    {
      row: contentBounds.row + bodyHeight + separatorHeight,
      column: contentBounds.column,
      width: contentBounds.width,
      height: actionHeight
    }
  ];
}

export function drawModalActionSeparator(
  buffer: FrameBuffer,
  node: LayoutNode,
  theme: TerminalTheme,
  style: TerminalStyle | undefined
): void {
  const bounds = modalActionSeparatorBounds(node);
  if (bounds === undefined) return;
  buffer.write(bounds.row, bounds.column, [{
    text: theme.tokens.symbols.borderSingle.horizontal.repeat(bounds.width),
    ...(style === undefined ? {} : { style }),
    source: frameCellSource({ ownerKind: 'modal', family: 'layout', role: 'separator', part: 'action-separator', label: 'action-separator' })
  }]);
}

function modalActionSeparatorBounds(node: LayoutNode): Rect | undefined {
  const body = node.children[0]?.bounds;
  const actions = node.children[1]?.bounds;
  if (body === undefined || actions === undefined || actions.width <= 0 || actions.height <= 0) return undefined;
  const row = actions.row - 1;
  if (row < body.row + body.height || row < node.bounds.row || row >= node.bounds.row + node.bounds.height) return undefined;
  return {
    row,
    column: actions.column,
    width: actions.width,
    height: 1
  };
}

function modalHasActions(widget: Widget): boolean {
  return (widget.children?.length ?? 0) > 1;
}

function modalActionHeight(contentHeight: number, measure: Measurement | undefined): number {
  if (contentHeight <= 0) return 0;
  const preferred = Math.max(1, nonNegativeInteger(measure?.preferredHeight));
  return Math.min(preferred, contentHeight <= 1 ? contentHeight : contentHeight - 1);
}
