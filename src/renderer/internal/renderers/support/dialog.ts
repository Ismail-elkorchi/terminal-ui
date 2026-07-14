import type { TerminalTheme } from '../../../../theme/index.ts';
import type { RenderNode, RenderNodeOfKind } from '../../../model/index.ts';
import type { BorderStyle } from '../../border.ts';
import type { RenderTarget } from '../../../model/render-target.ts';
import { frameCellSource } from '../../../../visual/source.ts';
import type { LayoutNode, Rect } from '../../../model/layout.ts';
import type { Measurement } from '../../measurement.ts';
import type { TerminalStyle } from '../../../../visual/render.ts';
import { numberProp } from '../../render-node-props.ts';
import { borderContentBounds } from './border.ts';
import { clampRect, nonNegativeInteger } from './common.ts';
import type { HitTarget } from '../../../model/renderer.ts';

export function dialogBounds(widget: RenderNode, bounds: Rect): Rect {
  const width = Math.min(bounds.width, Math.max(4, Math.floor(numberProp(widget, 'width') ?? Math.min(bounds.width, 60))));
  const height = Math.min(bounds.height, Math.max(3, Math.floor(numberProp(widget, 'height') ?? Math.min(bounds.height, 20))));
  return clampRect({
    row: bounds.row + Math.max(0, Math.floor((bounds.height - height) / 2)),
    column: bounds.column + Math.max(0, Math.floor((bounds.width - width) / 2)),
    width,
    height
  });
}

export function dialogChildBounds(
  widget: RenderNode,
  bounds: Rect,
  border: BorderStyle,
  childMeasures: readonly Measurement[]
): readonly Rect[] {
  const contentBounds = borderContentBounds(dialogBounds(widget, bounds), border);
  if (!dialogHasActions(widget)) return [contentBounds];
  const actionHeight = dialogActionHeight(contentBounds.height, childMeasures[1]);
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

export function dialogOutsideHitTargets<TMessage>(
  widget: RenderNodeOfKind<TMessage, 'dialog'>,
  bounds: Rect
): readonly HitTarget<TMessage>[] {
  const toDismissMessage = widget.props.toDismissMessage;
  if (!widget.props.dismissOnOutsidePress || toDismissMessage === undefined) return [];
  return outsideRects(bounds, dialogBounds(widget, bounds)).map((targetBounds, index) => ({
    id: `${widget.id ?? 'dialog'}:outside:${String(index)}`,
    bounds: targetBounds,
    accepts: ['click'],
    cursor: 'default',
    message: () => toDismissMessage('outsidePress')
  }));
}

export function drawDialogActionSeparator(
  buffer: RenderTarget,
  node: LayoutNode,
  theme: TerminalTheme,
  style: TerminalStyle | undefined
): void {
  const bounds = dialogActionSeparatorBounds(node);
  if (bounds === undefined) return;
  buffer.write(bounds.row, bounds.column, [{
    text: theme.tokens.symbols.borderSingle.horizontal.repeat(bounds.width),
    ...(style === undefined ? {} : { style }),
    source: frameCellSource({ ownerKind: 'dialog', family: 'component', role: 'separator', part: 'action-separator', label: 'action-separator' })
  }]);
}

function dialogActionSeparatorBounds(node: LayoutNode): Rect | undefined {
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

function dialogHasActions(widget: RenderNode): boolean {
  return (widget.children?.length ?? 0) > 1;
}

function dialogActionHeight(contentHeight: number, measure: Measurement | undefined): number {
  if (contentHeight <= 0) return 0;
  const preferred = Math.max(1, nonNegativeInteger(measure?.preferredHeight));
  return Math.min(preferred, contentHeight <= 1 ? contentHeight : contentHeight - 1);
}

function outsideRects(outer: Rect, inner: Rect): readonly Rect[] {
  const topHeight = Math.max(0, inner.row - outer.row);
  const bottomRow = inner.row + inner.height;
  const bottomHeight = Math.max(0, outer.row + outer.height - bottomRow);
  const middleHeight = Math.max(0, Math.min(outer.row + outer.height, bottomRow) - Math.max(outer.row, inner.row));
  const leftWidth = Math.max(0, inner.column - outer.column);
  const rightColumn = inner.column + inner.width;
  const rightWidth = Math.max(0, outer.column + outer.width - rightColumn);
  return [
    { row: outer.row, column: outer.column, width: outer.width, height: topHeight },
    { row: bottomRow, column: outer.column, width: outer.width, height: bottomHeight },
    { row: inner.row, column: outer.column, width: leftWidth, height: middleHeight },
    { row: inner.row, column: rightColumn, width: rightWidth, height: middleHeight }
  ].filter((rect) => rect.width > 0 && rect.height > 0);
}
