import type { Widget, WidgetOverflowPriority } from '../../../widgets/index.ts';
import { layoutContentBounds, splitTracks } from '../../regions.ts';
import { emptyRect, isRecord } from './common.ts';
import type { Rect } from '../../layout.ts';
import type {
  GridLayoutOptions,
  LayoutAlignment,
  LayoutFlowOptions,
  LayoutInsetInput,
  LayoutJustification,
  LayoutOverflow,
  LayoutSize
} from '../../regions.ts';
import type { WidgetMeasureResult } from '../../widget-renderer.ts';

export function gridChildBounds(widget: Widget, bounds: Rect, childMeasures: readonly WidgetMeasureResult[]): readonly Rect[] {
  const rows = layoutSizes(widget.props['rows']);
  const columns = layoutSizes(widget.props['columns']);
  const resolvedRows = rows.length === 0 ? [{ kind: 'fill' as const }] : rows;
  const resolvedColumns = columns.length === 0 ? [{ kind: 'fill' as const }] : columns;
  const options = gridLayoutOptions(widget);
  const contentBounds = layoutContentBounds(bounds, options);
  const rowRects = splitTracks(
    contentBounds,
    'vertical',
    resolvedRows,
    gapOnlyOptions(options.rowGap ?? options.gap),
    gridContentSizes(childMeasures, resolvedRows.length, resolvedColumns.length, 'vertical')
  );
  const columnRects = splitTracks(
    contentBounds,
    'horizontal',
    resolvedColumns,
    gapOnlyOptions(options.columnGap ?? options.gap),
    gridContentSizes(childMeasures, resolvedRows.length, resolvedColumns.length, 'horizontal')
  );
  const cells = rowRects.flatMap((rowRect) => columnRects.map((columnRect) => ({
    row: rowRect.row,
    column: columnRect.column,
    width: columnRect.width,
    height: rowRect.height
  })));
  return (widget.children ?? []).map((_child, index) => cells[index] ?? emptyRect(bounds));
}

export function areaGridChildBounds(widget: Widget, bounds: Rect): readonly Rect[] {
  const template = areaGridTemplate(widget.props['areas']);
  const areaNames = areaGridAreaNames(widget.props['areaNames']);
  if (template.length === 0 || areaNames.length === 0) return [];
  const rows = layoutSizes(widget.props['rows']);
  const columns = layoutSizes(widget.props['columns']);
  const options = gridLayoutOptions(widget);
  const contentBounds = layoutContentBounds(bounds, options);
  const rowRects = splitTracks(
    contentBounds,
    'vertical',
    rows.length === 0 ? [{ kind: 'fill' }] : rows,
    gapOnlyOptions(options.rowGap ?? options.gap)
  );
  const columnRects = splitTracks(
    contentBounds,
    'horizontal',
    columns.length === 0 ? [{ kind: 'fill' }] : columns,
    gapOnlyOptions(options.columnGap ?? options.gap)
  );
  return areaNames.map((name) => areaBounds(template, name, rowRects, columnRects) ?? emptyRect(bounds));
}

export function splitPaneChildBounds(widget: Widget, bounds: Rect, childMeasures: readonly WidgetMeasureResult[]): readonly Rect[] {
  const children = widget.children ?? [];
  const explicit = layoutSizes(widget.props['sizes']);
  const tracks = explicit.length === children.length ? explicit : children.map(() => ({ kind: 'fill' as const }));
  const direction = widget.props['direction'] === 'horizontal' ? 'horizontal' : 'vertical';
  return splitTracks(bounds, direction, tracks, layoutFlowOptions(widget), childMeasures.map((measure) =>
    direction === 'horizontal' ? measure.preferredWidth : measure.preferredHeight
  ));
}

function gridContentSizes(
  childMeasures: readonly WidgetMeasureResult[],
  rowCount: number,
  columnCount: number,
  orientation: 'horizontal' | 'vertical'
): readonly number[] {
  const count = orientation === 'horizontal' ? columnCount : rowCount;
  return Array.from({ length: count }, (_item, trackIndex) => childMeasures.reduce((max, measure, childIndex) => {
    const rowIndex = columnCount === 0 ? 0 : Math.floor(childIndex / columnCount);
    const columnIndex = columnCount === 0 ? 0 : childIndex % columnCount;
    const matches = orientation === 'horizontal' ? columnIndex === trackIndex : rowIndex === trackIndex;
    if (!matches) return max;
    return Math.max(max, orientation === 'horizontal' ? measure.preferredWidth : measure.preferredHeight);
  }, 0));
}

function gapOnlyOptions(gap: number | undefined): LayoutFlowOptions {
  return gap === undefined ? {} : { gap };
}

export function layoutSizes(value: unknown): readonly LayoutSize[] {
  return Array.isArray(value)
    ? value.flatMap((track): LayoutSize[] => {
        if (typeof track !== 'object' || track === null) return [];
        const kind = (track as { readonly kind?: unknown }).kind;
        if (kind === 'fixed') {
          const cells = (track as { readonly cells?: unknown }).cells;
          return typeof cells === 'number' ? [{ kind, cells }] : [];
        }
        if (kind === 'percent') {
          const value = (track as { readonly value?: unknown }).value;
          return typeof value === 'number' ? [{ kind, value }] : [];
        }
        if (kind === 'fill') {
          const weight = (track as { readonly weight?: unknown }).weight;
          return typeof weight === 'number' ? [{ kind, weight }] : [{ kind }];
        }
        if (kind === 'content') {
          const min = (track as { readonly min?: unknown }).min;
          const max = (track as { readonly max?: unknown }).max;
          return [{
            kind,
            ...(typeof min === 'number' ? { min } : {}),
            ...(typeof max === 'number' ? { max } : {})
          }];
        }
        return [];
      })
    : [];
}

export function fillLayoutSizes(count: number): readonly LayoutSize[] {
  return Array.from({ length: Math.max(0, count) }, () => ({ kind: 'fill' }));
}

export function priorityFillLayoutSizes(children: readonly Widget[]): readonly LayoutSize[] {
  return children.map((child) => ({
    kind: 'fill',
    weight: overflowPriorityWeight(child.layer?.overflowPriority)
  }));
}

function overflowPriorityWeight(priority: WidgetOverflowPriority | undefined): number {
  switch (priority) {
    case 'required':
      return 8;
    case 'important':
      return 4;
    case 'decorative':
      return 1;
    case 'secondary':
    default:
      return 2;
  }
}

export function gridLayoutOptions(widget: Widget): GridLayoutOptions {
  return {
    ...layoutFlowOptions(widget),
    ...optionalNumberProp(widget, 'rowGap'),
    ...optionalNumberProp(widget, 'columnGap')
  };
}

function areaGridTemplate(value: unknown): readonly (readonly string[])[] {
  return Array.isArray(value)
    ? value.flatMap((row): readonly string[][] => Array.isArray(row) && row.every((cell) => typeof cell === 'string') ? [row] : [])
    : [];
}

function areaGridAreaNames(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function areaBounds(
  template: readonly (readonly string[])[],
  name: string,
  rows: readonly Rect[],
  columns: readonly Rect[]
): Rect | undefined {
  const cells = template.flatMap((row, rowIndex) =>
    row.map((value, columnIndex) => ({ value, rowIndex, columnIndex })).filter((cell) => cell.value === name)
  );
  if (cells.length === 0) return undefined;
  const minRow = Math.min(...cells.map((cell) => cell.rowIndex));
  const maxRow = Math.max(...cells.map((cell) => cell.rowIndex));
  const minColumn = Math.min(...cells.map((cell) => cell.columnIndex));
  const maxColumn = Math.max(...cells.map((cell) => cell.columnIndex));
  const top = rows[minRow];
  const bottom = rows[maxRow];
  const left = columns[minColumn];
  const right = columns[maxColumn];
  if (top === undefined || bottom === undefined || left === undefined || right === undefined) return undefined;
  return {
    row: top.row,
    column: left.column,
    width: Math.max(0, right.column + right.width - left.column),
    height: Math.max(0, bottom.row + bottom.height - top.row)
  };
}

export function layoutFlowOptions(widget: Widget): LayoutFlowOptions {
  return {
    ...optionalNumberProp(widget, 'gap'),
    ...optionalInsetProp(widget, 'padding'),
    ...optionalInsetProp(widget, 'margin'),
    ...optionalNumberProp(widget, 'minWidth'),
    ...optionalNumberProp(widget, 'minHeight'),
    ...optionalNumberProp(widget, 'maxWidth'),
    ...optionalNumberProp(widget, 'maxHeight'),
    ...optionalAlignmentProp(widget),
    ...optionalJustificationProp(widget),
    ...optionalOverflowProp(widget)
  };
}

function optionalNumberProp(widget: Widget, key: string): Record<string, number> {
  const value = widget.props[key];
  return typeof value === 'number' && Number.isFinite(value) ? { [key]: value } : {};
}

function optionalInsetProp(widget: Widget, key: string): Record<string, LayoutInsetInput> {
  const value = widget.props[key];
  if (typeof value === 'number' && Number.isFinite(value)) return { [key]: value };
  if (!isInsetObject(value)) return {};
  return { [key]: value };
}

function optionalAlignmentProp(widget: Widget): { readonly align?: LayoutAlignment } {
  const value = widget.props['align'];
  return isLayoutAlignment(value) ? { align: value } : {};
}

function optionalJustificationProp(widget: Widget): { readonly justify?: LayoutJustification } {
  const value = widget.props['justify'];
  return isLayoutJustification(value) ? { justify: value } : {};
}

function optionalOverflowProp(widget: Widget): { readonly overflow?: LayoutOverflow } {
  const value = widget.props['overflow'];
  return isLayoutOverflow(value) ? { overflow: value } : {};
}

function isLayoutAlignment(value: unknown): value is LayoutAlignment {
  return value === 'start' || value === 'center' || value === 'end' || value === 'stretch';
}

function isLayoutJustification(value: unknown): value is LayoutJustification {
  return value === 'start' || value === 'center' || value === 'end' || value === 'stretch';
}

function isLayoutOverflow(value: unknown): value is LayoutOverflow {
  return value === 'clip' || value === 'visible';
}

function isInsetObject(value: unknown): value is Exclude<LayoutInsetInput, number> {
  if (!isRecord(value)) return false;
  return insetFieldIsValid(value['top'])
    && insetFieldIsValid(value['right'])
    && insetFieldIsValid(value['bottom'])
    && insetFieldIsValid(value['left']);
}

function insetFieldIsValid(value: unknown): boolean {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value));
}
