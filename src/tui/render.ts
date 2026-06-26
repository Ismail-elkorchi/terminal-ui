import { toAccessibleSnapshot } from '../accessibility/index.ts';
import { clipTextCells, measureTextCells } from '../text/index.ts';
import { findWidgetFocusTarget, resolveFocusPath } from './focus.ts';
import { compareCells } from './frame.ts';
import { layoutWidget } from './layout.ts';
import { accessibleNode } from './render-accessibility.ts';
import { visibleWindow } from './visible-window.ts';
import { numberProp, stringify } from './widget-props.ts';
import type { TerminalViewport } from '../host/index.ts';
import type { Widget } from '../widgets/index.ts';
import type { FocusPath } from './focus.ts';
import type { Frame, FrameCell } from './frame.ts';
import type { LayoutNode, Rect } from './layout.ts';

export { diffFrames, renderDiff, renderFrame } from './frame.ts';
export type {
  CursorPosition,
  Frame,
  FrameCell,
  FocusPath,
  RenderDiff,
  RenderFrameOptions,
  RenderOperation
} from './frame.ts';

export interface RenderWidgetFrameOptions {
  readonly focusPath?: FocusPath;
}

export function renderWidgetFrame(
  widget: Widget,
  viewport: TerminalViewport,
  options: RenderWidgetFrameOptions = {}
): Frame {
  const layout = layoutWidget(widget, viewport);
  const cells: FrameCell[] = [];
  renderWidget(widget, layout, cells);
  const resolvedFocusPath = resolveFocusPath(layout, options.focusPath);
  const cursor = cursorForFocusedWidget(widget, layout, resolvedFocusPath);
  const accessibility = toAccessibleSnapshot({
    source: 'tui',
    root: accessibleNode(widget, layout, [], resolvedFocusPath),
    ...(resolvedFocusPath === undefined ? {} : { focusPath: resolvedFocusPath })
  });
  return {
    schemaVersion: 'terminal-ui.tui-frame.v1',
    width: viewport.columns,
    height: viewport.rows,
    cells: cells.sort(compareCells),
    accessibility,
    ...(cursor === undefined ? {} : { cursor }),
    ...(resolvedFocusPath === undefined ? {} : { focusPath: resolvedFocusPath })
  };
}

function renderWidget(widget: Widget, node: LayoutNode, cells: FrameCell[]): void {
  switch (widget.kind) {
    case 'text':
      writeBlock(cells, node.bounds, stringify(widget.props['content']));
      break;
    case 'statusBar':
      writeBlock(cells, node.bounds, stringify(widget.props['text']));
      break;
    case 'inputField':
      writeBlock(cells, node.bounds, stringify(widget.props['value']));
      break;
    case 'spinner':
      writeBlock(cells, node.bounds, `${stringify(widget.props['label']) || 'Loading'} ...`);
      break;
    case 'progressBar':
      writeBlock(cells, node.bounds, progressText(widget));
      break;
    case 'list':
      writeBlock(cells, node.bounds, listText(widget, node.bounds.height));
      break;
    case 'table':
      writeBlock(cells, node.bounds, tableText(widget, node.bounds.height));
      break;
    case 'box':
      drawBox(cells, node.bounds);
      break;
    case 'stack':
    case 'row':
    case 'custom':
      break;
    case 'viewport':
      renderViewport(widget, node, cells);
      return;
  }
  const children = widget.children ?? [];
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    const childNode = node.children[index];
    if (child !== undefined && childNode !== undefined) renderWidget(child, childNode, cells);
  }
}

function renderViewport(widget: Widget, node: LayoutNode, cells: FrameCell[]): void {
  const children = widget.children ?? [];
  const viewportCells: FrameCell[] = [];
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    const childNode = node.children[index];
    if (child !== undefined && childNode !== undefined) renderWidget(child, childNode, viewportCells);
  }
  cells.push(...viewportCells.filter((cell) => cellInside(cell, node.bounds)));
}

function cellInside(cell: FrameCell, bounds: Rect): boolean {
  return cell.row >= bounds.row
    && cell.row < bounds.row + bounds.height
    && cell.column >= bounds.column
    && cell.column < bounds.column + bounds.width;
}

function writeBlock(cells: FrameCell[], bounds: Rect, text: string): void {
  if (bounds.width <= 0 || bounds.height <= 0) return;
  const lines = text.split('\n').slice(0, bounds.height);
  for (let offset = 0; offset < lines.length; offset += 1) {
    const line = clipTextCells(lines[offset] ?? '', bounds.width).text;
    writeText(cells, bounds.row + offset, bounds.column, line);
  }
}

function writeText(cells: FrameCell[], row: number, column: number, text: string): void {
  let nextColumn = column;
  for (const segment of measureTextCells(text).graphemes) {
    cells.push({ row, column: nextColumn, text: segment.text });
    nextColumn += segment.cells;
  }
}

function drawBox(cells: FrameCell[], bounds: Rect): void {
  if (bounds.width < 2 || bounds.height < 2) return;
  const top = `┌${'─'.repeat(Math.max(0, bounds.width - 2))}┐`;
  const bottom = `└${'─'.repeat(Math.max(0, bounds.width - 2))}┘`;
  writeText(cells, bounds.row, bounds.column, top);
  for (let row = bounds.row + 1; row < bounds.row + bounds.height - 1; row += 1) {
    writeText(cells, row, bounds.column, '│');
    writeText(cells, row, bounds.column + bounds.width - 1, '│');
  }
  writeText(cells, bounds.row + bounds.height - 1, bounds.column, bottom);
}

function progressText(widget: Widget): string {
  const label = stringify(widget.props['label']);
  const prefix = label.length === 0 ? '' : `${label} `;
  if (widget.props['indeterminate'] === true || widget.props['value'] === undefined) {
    return `${prefix}[----------]`;
  }
  const value = numberProp(widget, 'value');
  const rawMax = numberProp(widget, 'max') ?? 100;
  const max = rawMax > 0 ? rawMax : 100;
  if (value === undefined) return `${prefix}[----------]`;
  const clamped = Math.max(0, Math.min(max, value));
  const filled = Math.round((clamped / max) * 10);
  return `${prefix}[${'#'.repeat(filled)}${'-'.repeat(10 - filled)}] ${String(clamped)}/${String(max)}`;
}

function listText(widget: Widget, height: number): string {
  const items = Array.isArray(widget.props['items']) ? widget.props['items'] : [];
  const selected = numberProp(widget, 'selected') ?? -1;
  const window = visibleWindow(items.length, height, selected);
  return items
    .slice(window.start, window.end)
    .map((item, index) => {
      const itemIndex = window.start + index;
      return `${itemIndex === selected ? '›' : ' '} ${String(item)}`;
    })
    .join('\n');
}

function tableText(widget: Widget, height: number): string {
  const rows = Array.isArray(widget.props['rows']) ? widget.props['rows'] : [];
  const window = visibleWindow(rows.length, height, 0);
  return rows
    .slice(window.start, window.end)
    .map((row) => Array.isArray(row) ? row.map(String).join('  ') : String(row))
    .join('\n');
}

function cursorForFocusedWidget(
  widget: Widget,
  layout: LayoutNode,
  focusPath: FocusPath | undefined
): { readonly row: number; readonly column: number } | undefined {
  const target = findWidgetFocusTarget(widget, layout, focusPath);
  if (target === undefined) return undefined;
  if (target.widget.kind !== 'list') {
    return { row: target.bounds.row, column: target.bounds.column };
  }
  const items = Array.isArray(target.widget.props['items']) ? target.widget.props['items'] : [];
  const selected = numberProp(target.widget, 'selected');
  if (selected === undefined || items.length === 0 || target.bounds.height <= 0) {
    return { row: target.bounds.row, column: target.bounds.column };
  }
  const window = visibleWindow(items.length, target.bounds.height, selected);
  const selectedRow = selected >= window.start && selected < window.end
    ? target.bounds.row + selected - window.start
    : target.bounds.row;
  return { row: selectedRow, column: target.bounds.column };
}
