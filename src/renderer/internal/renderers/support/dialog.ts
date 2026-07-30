import type { TerminalTheme } from '../../../../theme/index.ts';
import { finiteNonNegativeIntegerOrZero } from '../../../../foundation/validation.ts';
import type { RenderNodeOfKind } from '../../../model/index.ts';
import type { BorderStyle } from '../../border.ts';
import type { RenderTarget } from '../../../contracts.ts';
import { frameCellSource } from '../../../../visual/source.ts';
import type { LayoutNode, Rect } from '../../../contracts.ts';
import type { Measurement } from '../../../contracts.ts';
import type { TerminalStyle } from '../../../../visual/render.ts';
import { layoutMarginBounds, layoutPaddingBounds } from '../../layout-geometry.ts';
import { borderContentBounds } from './border.ts';
import { surfaceFrameBounds } from '../../surface.ts';
import { clampRect } from './common.ts';
import type { HitTarget } from '../../../contracts.ts';
import { oneCellGlyph } from '../../../../text/index.ts';

type DialogNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'dialog'>;

export function placeDialog(
  renderNode: DialogNode,
  bounds: Rect,
  measurement: Measurement
): Rect {
  const available = layoutMarginBounds(bounds, renderNode.props.margin);
  const width = Math.min(available.width, measurement.preferredWidth);
  const height = Math.min(available.height, measurement.preferredHeight);
  return clampRect({
    row: available.row + Math.max(0, Math.floor((available.height - height) / 2)),
    column: available.column + Math.max(0, Math.floor((available.width - width) / 2)),
    width,
    height
  });
}

export function dialogChildBounds(
  renderNode: DialogNode,
  bounds: Rect,
  border: BorderStyle,
  measureChild: (index: number) => Measurement
): readonly Rect[] {
  const contentBounds = layoutPaddingBounds(
    borderContentBounds(surfaceFrameBounds(bounds, true), border),
    renderNode.props.padding
  );
  if (!dialogHasActions(renderNode)) return [contentBounds];
  const actionHeight = dialogActionHeight(contentBounds.height, measureChild(1));
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
  renderNode: DialogNode<TMessage>,
  bounds: Rect,
  viewport: Rect
): readonly HitTarget<TMessage>[] {
  const toDismissMessage = renderNode.props.toDismissMessage;
  if (!renderNode.props.dismissOnOutsidePress || toDismissMessage === undefined) return [];
  return outsideRects(viewport, bounds).map((targetBounds, index) => ({
    id: `${renderNode.id ?? 'dialog'}:outside:${String(index)}`,
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
  const glyph = oneCellGlyph(theme.tokens.symbols.borderSingle.horizontal, '-', {
    widthProfile: buffer.widthProfile
  });
  buffer.write(bounds.row, bounds.column, [{
    text: glyph.repeat(bounds.width),
    ...(style === undefined ? {} : { style }),
    source: frameCellSource({
      elementKind: 'dialog',
      rendererFamily: 'component',
      cellRole: 'separator',
      partName: 'action-separator',
      description: 'action-separator'
    })
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

function dialogHasActions(renderNode: DialogNode): boolean {
  return (renderNode.children?.length ?? 0) > 1;
}

function dialogActionHeight(contentHeight: number, measure: Measurement | undefined): number {
  if (contentHeight <= 0) return 0;
  const preferred = Math.max(1, finiteNonNegativeIntegerOrZero(measure?.preferredHeight));
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
