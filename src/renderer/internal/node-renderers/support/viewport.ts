import { normalizeScrollState } from '../../../../behavior/scroll.ts';
import {
  finiteNonNegativeIntegerOrZero,
  isNonArrayObject,
} from '../../../../foundation/validation.ts';
import type { Rect } from '../../../../geometry/types.ts';
import { oneCellGlyph } from '../../../../text/cell-geometry.ts';
import type { TerminalTheme } from '../../../../theme/theme.ts';
import { renderNodeFrameSource } from '../../../../visual/frame-source.ts';
import type { LayoutNode, Measurement, RenderTarget } from '../../../contracts.ts';
import { renderNodeStyle } from '../../../style-resolution.ts';
import { numberProp } from '../../render-node-props.ts';
import type { RenderNodeOfKind } from '../../render-tree/types.ts';

type ViewportNode = RenderNodeOfKind<unknown, 'viewport'>;

interface ViewportVisualState {
  readonly offsetRow: number;
  readonly offsetColumn: number;
  readonly contentRows: number;
  readonly contentColumns: number;
  readonly empty: boolean;
  readonly clippedTop: boolean;
  readonly clippedBottom: boolean;
  readonly clippedLeft: boolean;
  readonly clippedRight: boolean;
}

export function viewportAccessibleDescription(
  renderNode: ViewportNode,
  node: LayoutNode,
  contentBounds: Rect,
): string {
  const state = viewportVisualState(renderNode, contentBounds, node);
  if (state.empty) return 'Empty viewport content.';
  const rowEnd = Math.min(state.contentRows, state.offsetRow + contentBounds.height);
  const columnEnd = Math.min(state.contentColumns, state.offsetColumn + contentBounds.width);
  return `Showing rows ${String(state.offsetRow + 1)}-${String(rowEnd)} of ${String(state.contentRows)}, columns ${String(state.offsetColumn + 1)}-${String(columnEnd)} of ${String(state.contentColumns)}.`;
}

export function viewportChildBounds(
  renderNode: ViewportNode,
  bounds: Rect,
  content: Measurement
): Rect {
  const contentRows = Math.max(bounds.height, content.preferredHeight);
  const contentColumns = renderNode.props.constrainWidth === true
    ? bounds.width : Math.max(bounds.width, content.preferredWidth);
  const state = viewportVisualStateForSize(
    renderNode,
    bounds,
    contentRows,
    contentColumns
  );
  if (state.empty) return { row: bounds.row, column: bounds.column, width: 0, height: 0 };
  return {
    row: bounds.row - state.offsetRow,
    column: bounds.column - state.offsetColumn,
    width: state.contentColumns,
    height: state.contentRows
  };
}

export function viewportMeasurementState(
  renderNode: ViewportNode,
  bounds: Rect,
  content: Measurement,
): ViewportVisualState {
  return viewportVisualStateForSize(
    renderNode,
    bounds,
    Math.max(bounds.height, content.preferredHeight),
    renderNode.props.constrainWidth === true ? bounds.width : Math.max(bounds.width, content.preferredWidth),
  );
}

export function viewportVisualState(
  renderNode: ViewportNode,
  bounds: Rect,
  node?: Pick<LayoutNode, 'children'>
): ViewportVisualState {
  const child = node?.children[0];
  return viewportVisualStateForSize(
    renderNode,
    bounds,
    child?.bounds.height ?? bounds.height,
    child?.bounds.width ?? bounds.width
  );
}

function viewportVisualStateForSize(
  renderNode: ViewportNode,
  bounds: Rect,
  contentRows: number,
  contentColumns: number
): ViewportVisualState {
  const empty = contentRows === 0 || contentColumns === 0;
  const scroll = normalizeScrollState({
    offsetRow: finiteNonNegativeIntegerOrZero(numberProp(renderNode, 'offsetRow')),
    offsetColumn: finiteNonNegativeIntegerOrZero(numberProp(renderNode, 'offsetColumn')),
    followTail: false
  }, {
    contentRows,
    contentColumns,
    viewportRows: bounds.height,
    viewportColumns: bounds.width,
  });
  return {
    offsetRow: scroll.offsetRow,
    offsetColumn: scroll.offsetColumn,
    contentRows,
    contentColumns,
    empty,
    clippedTop: !empty && scroll.offsetRow > 0,
    clippedBottom: !empty && scroll.offsetRow + bounds.height < contentRows,
    clippedLeft: !empty && scroll.offsetColumn > 0,
    clippedRight: !empty && scroll.offsetColumn + bounds.width < contentColumns
  };
}

export function drawViewportIndicators(
  buffer: RenderTarget,
  renderNode: ViewportNode,
  node: LayoutNode,
  bounds: Rect,
  theme: TerminalTheme,
  cellOccupied: (row: number, column: number) => boolean = () => false
): void {
  if (bounds.width <= 0 || bounds.height <= 0) return;
  const state = viewportVisualState(renderNode, bounds, node);
  const style = renderNodeStyle(renderNode, 'empty');
  if (state.empty) {
    writeViewportIndicator(buffer, renderNode, centered(bounds), theme.tokens.symbols.viewportEmpty, 'empty', style, cellOccupied);
    return;
  }
  const verticalScrollbar = hasScrollbarForAxis(renderNode, 'vertical');
  const horizontalScrollbar = hasScrollbarForAxis(renderNode, 'horizontal');
  if (state.clippedTop && !verticalScrollbar) {
    writeViewportIndicator(buffer, renderNode, { row: bounds.row, column: midpoint(bounds.column, bounds.width) }, theme.tokens.symbols.viewportClipTop, 'clip-top', style, cellOccupied);
  }
  if (state.clippedBottom && !verticalScrollbar) {
    writeViewportIndicator(buffer, renderNode, { row: bounds.row + bounds.height - 1, column: midpoint(bounds.column, bounds.width) }, theme.tokens.symbols.viewportClipBottom, 'clip-bottom', style, cellOccupied);
  }
  if (state.clippedLeft && !horizontalScrollbar) {
    writeViewportIndicator(buffer, renderNode, { row: midpoint(bounds.row, bounds.height), column: bounds.column }, theme.tokens.symbols.viewportClipLeft, 'clip-left', style, cellOccupied);
  }
  if (state.clippedRight && !horizontalScrollbar) {
    writeViewportIndicator(buffer, renderNode, { row: midpoint(bounds.row, bounds.height), column: bounds.column + bounds.width - 1 }, theme.tokens.symbols.viewportClipRight, 'clip-right', style, cellOccupied);
  }
}

function hasScrollbarForAxis(
  renderNode: ViewportNode,
  axis: 'vertical' | 'horizontal'
): boolean {
  const options = renderNode.props.scrollbar;
  if (!isNonArrayObject(options) || options['visible'] === 'never') return false;
  const configuredAxis = options['axis'];
  return configuredAxis === undefined || configuredAxis === 'both' || configuredAxis === axis;
}

function writeViewportIndicator(
  buffer: RenderTarget,
  renderNode: ViewportNode,
  position: { readonly row: number; readonly column: number },
  text: string,
  label: string,
  style: ReturnType<typeof renderNodeStyle>,
  cellOccupied: (row: number, column: number) => boolean
): void {
  if (cellOccupied(position.row, position.column)) return;
  const fallback = label === 'clip-top'
    ? '^'
    : label === 'clip-bottom'
      ? 'v'
      : label === 'clip-left'
        ? '<'
        : label === 'clip-right'
          ? '>'
          : '.';
  buffer.write(position.row, position.column, [{
    text: oneCellGlyph(text, fallback, { widthProfile: buffer.widthProfile }),
    ...(style === undefined ? {} : { style }),
    source: renderNodeFrameSource(renderNode, {
      rendererFamily: 'layout',
      cellRole: 'decoration',
      partName: label,
      description: label
    })
  }]);
}

function centered(bounds: Rect): { readonly row: number; readonly column: number } {
  return {
    row: midpoint(bounds.row, bounds.height),
    column: midpoint(bounds.column, bounds.width)
  };
}

function midpoint(start: number, size: number): number {
  return start + Math.max(0, Math.floor((size - 1) / 2));
}
