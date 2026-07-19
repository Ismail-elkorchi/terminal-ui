import { numberProp } from '../../render-node-props.ts';
import { normalizeScrollState } from '../../../../behavior/scroll.ts';
import { renderNodeStyle } from '../../render-node-style.ts';
import { renderNodeFrameSource } from '../../../../visual/source.ts';
import { nonNegativeInteger } from './common.ts';
import type { RenderTarget } from '../../../model/render-target.ts';
import type { LayoutNode, Rect } from '../../../model/layout.ts';
import type { RenderNodeOfKind } from '../../../model/index.ts';
import type { TerminalTheme } from '../../../../theme/index.ts';
import { oneCellGlyph } from '../../../../text/index.ts';

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

export function viewportAccessibleDescription(widget: ViewportNode, node: LayoutNode): string {
  const state = viewportVisualState(widget, node.bounds);
  if (state.empty) return 'Empty viewport content.';
  const rowEnd = Math.min(state.contentRows, state.offsetRow + node.bounds.height);
  const columnEnd = Math.min(state.contentColumns, state.offsetColumn + node.bounds.width);
  return `Showing rows ${String(state.offsetRow + 1)}-${String(rowEnd)} of ${String(state.contentRows)}, columns ${String(state.offsetColumn + 1)}-${String(columnEnd)} of ${String(state.contentColumns)}.`;
}

export function viewportChildBounds(widget: ViewportNode, bounds: Rect): Rect {
  const state = viewportVisualState(widget, bounds);
  if (state.empty) return { row: bounds.row, column: bounds.column, width: 0, height: 0 };
  return {
    row: bounds.row - state.offsetRow,
    column: bounds.column - state.offsetColumn,
    width: state.contentColumns,
    height: state.contentRows
  };
}

export function viewportVisualState(widget: ViewportNode, bounds: Rect): ViewportVisualState {
  const contentRows = contentSize(widget, 'contentRows', bounds.height);
  const contentColumns = contentSize(widget, 'contentColumns', bounds.width);
  const empty = contentRows === 0 || contentColumns === 0;
  const scroll = normalizeScrollState({
    offsetRow: nonNegativeInteger(numberProp(widget, 'scrollRow')),
    offsetColumn: nonNegativeInteger(numberProp(widget, 'scrollColumn')),
    contentRows,
    contentColumns,
    viewportRows: bounds.height,
    viewportColumns: bounds.width,
    followTail: false
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
  widget: ViewportNode,
  bounds: Rect,
  theme: TerminalTheme,
  occupiedCells: ReadonlySet<string> = new Set()
): void {
  if (bounds.width <= 0 || bounds.height <= 0) return;
  const state = viewportVisualState(widget, bounds);
  const style = renderNodeStyle(widget, 'empty');
  if (state.empty) {
    writeViewportIndicator(buffer, widget, centered(bounds), theme.tokens.symbols.viewportEmpty, 'empty', style, occupiedCells);
    return;
  }
  if (state.clippedTop) {
    writeViewportIndicator(buffer, widget, { row: bounds.row, column: midpoint(bounds.column, bounds.width) }, theme.tokens.symbols.viewportClipTop, 'clip-top', style, occupiedCells);
  }
  if (state.clippedBottom) {
    writeViewportIndicator(buffer, widget, { row: bounds.row + bounds.height - 1, column: midpoint(bounds.column, bounds.width) }, theme.tokens.symbols.viewportClipBottom, 'clip-bottom', style, occupiedCells);
  }
  if (state.clippedLeft) {
    writeViewportIndicator(buffer, widget, { row: midpoint(bounds.row, bounds.height), column: bounds.column }, theme.tokens.symbols.viewportClipLeft, 'clip-left', style, occupiedCells);
  }
  if (state.clippedRight) {
    writeViewportIndicator(buffer, widget, { row: midpoint(bounds.row, bounds.height), column: bounds.column + bounds.width - 1 }, theme.tokens.symbols.viewportClipRight, 'clip-right', style, occupiedCells);
  }
}

function writeViewportIndicator(
  buffer: RenderTarget,
  widget: ViewportNode,
  position: { readonly row: number; readonly column: number },
  text: string,
  label: string,
  style: ReturnType<typeof renderNodeStyle>,
  occupiedCells: ReadonlySet<string>
): void {
  if (occupiedCells.has(cellKey(position.row, position.column))) return;
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
    source: renderNodeFrameSource(widget, { family: 'layout', role: 'decoration', part: label, label })
  }]);
}

export function viewportIndicatorCellKey(row: number, column: number): string {
  return cellKey(row, column);
}

function contentSize(widget: ViewportNode, key: 'contentRows' | 'contentColumns', fallback: number): number {
  return widget.props[key] === undefined
    ? Math.max(0, fallback + nonNegativeInteger(numberProp(widget, key === 'contentRows' ? 'scrollRow' : 'scrollColumn')))
    : nonNegativeInteger(numberProp(widget, key));
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

function cellKey(row: number, column: number): string {
  return `${String(row)}:${String(column)}`;
}
