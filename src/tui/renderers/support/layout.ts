import type { ElementOverflowPriority } from '../../../element/metadata.ts';
import type { RenderNode, RenderNodeOfKind, RenderNodesOfKind } from '../../../render-node/index.ts';
import { layoutContentBounds, splitTracks } from '../../../layout/geometry.ts';
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
} from '../../../geometry/types.ts';
import type { Measurement } from '../../measurement.ts';

type GridNode = RenderNodeOfKind<unknown, 'grid'>;
type SplitPaneNode = RenderNodeOfKind<unknown, 'splitPane'>;
type SizedFlowNode = RenderNodesOfKind<unknown, 'row' | 'stack'>;
type LayoutFlowNode = RenderNodesOfKind<
  unknown,
  'field' | 'form' | 'grid' | 'modal' | 'row' | 'splitPane' | 'stack' | 'surface' | 'tabs' | 'viewport'
>;

export function gridChildBounds(widget: GridNode, bounds: Rect, childMeasures: readonly Measurement[]): readonly Rect[] {
  if (Array.isArray(widget.props.areas)) {
    return gridAreaChildBounds(widget, bounds, childMeasures);
  }
  const rows = layoutSizes(widget.props.rows);
  const columns = layoutSizes(widget.props.columns);
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

function gridAreaChildBounds(widget: GridNode, bounds: Rect, childMeasures: readonly Measurement[]): readonly Rect[] {
  const template = gridAreasTemplate(widget.props.areas);
  const areaNames = gridAreaNames(widget.props.areaNames);
  if (template.length === 0 || areaNames.length === 0) return [];
  const rows = layoutSizes(widget.props.rows);
  const columns = layoutSizes(widget.props.columns);
  const options = gridLayoutOptions(widget);
  const contentBounds = layoutContentBounds(bounds, options);
  const rowRects = splitTracks(
    contentBounds,
    'vertical',
    rows.length === 0 ? [{ kind: 'fill' }] : rows,
    gapOnlyOptions(options.rowGap ?? options.gap),
    gridAreaContentSizes(template, areaNames, childMeasures, 'vertical')
  );
  const columnRects = splitTracks(
    contentBounds,
    'horizontal',
    columns.length === 0 ? [{ kind: 'fill' }] : columns,
    gapOnlyOptions(options.columnGap ?? options.gap),
    gridAreaContentSizes(template, areaNames, childMeasures, 'horizontal')
  );
  return areaNames.map((name) => areaBounds(template, name, rowRects, columnRects) ?? emptyRect(bounds));
}

export function splitPaneChildBounds(widget: SplitPaneNode, bounds: Rect, childMeasures: readonly Measurement[]): readonly Rect[] {
  const children = widget.children ?? [];
  const explicit = layoutSizes(widget.props.sizes);
  const tracks = explicit.length === children.length ? explicit : children.map(() => ({ kind: 'fill' as const }));
  const direction = widget.props.direction === 'horizontal' ? 'horizontal' : 'vertical';
  return splitTracks(bounds, direction, tracks, layoutFlowOptions(widget), childMeasures.map((measure) =>
    direction === 'horizontal' ? measure.preferredWidth : measure.preferredHeight
  ));
}

function gridContentSizes(
  childMeasures: readonly Measurement[],
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

function gridAreaContentSizes(
  template: readonly (readonly string[])[],
  areaNames: readonly string[],
  childMeasures: readonly Measurement[],
  orientation: 'horizontal' | 'vertical'
): readonly number[] {
  const trackCount = orientation === 'horizontal' ? (template[0]?.length ?? 0) : template.length;
  const sizes = Array.from({ length: trackCount }, () => 0);
  areaNames.forEach((name, areaIndex) => {
    const span = areaSpan(template, name);
    if (span === undefined) return;
    const measure = childMeasures[areaIndex];
    const preferred = orientation === 'horizontal' ? measure?.preferredWidth : measure?.preferredHeight;
    if (preferred === undefined) return;
    const start = orientation === 'horizontal' ? span.minColumn : span.minRow;
    const end = orientation === 'horizontal' ? span.maxColumn : span.maxRow;
    const trackSpan = Math.max(1, end - start + 1);
    const perTrack = Math.ceil(preferred / trackSpan);
    for (let index = start; index <= end; index += 1) {
      sizes[index] = Math.max(sizes[index] ?? 0, perTrack);
    }
  });
  return sizes;
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

export function childLayoutSizes(widget: SizedFlowNode, fallback?: readonly LayoutSize[]): readonly LayoutSize[] {
  const children = widget.children ?? [];
  const explicit = layoutSizes(widget.props.sizes);
  return explicit.length === children.length ? explicit : fallback ?? fillLayoutSizes(children.length);
}

export function priorityFillLayoutSizes(children: readonly RenderNode[]): readonly LayoutSize[] {
  return children.map((child) => ({
    kind: 'fill',
    weight: overflowPriorityWeight(child.layer?.overflowPriority)
  }));
}

function overflowPriorityWeight(priority: ElementOverflowPriority | undefined): number {
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

export function gridLayoutOptions(widget: GridNode): GridLayoutOptions {
  return {
    ...layoutFlowOptions(widget),
    ...optionalNumberProp(widget, 'rowGap'),
    ...optionalNumberProp(widget, 'columnGap')
  };
}

function gridAreasTemplate(value: unknown): readonly (readonly string[])[] {
  return Array.isArray(value)
    ? value.flatMap((row): readonly string[][] => Array.isArray(row) && row.every((cell) => typeof cell === 'string') ? [row] : [])
    : [];
}

function gridAreaNames(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function areaBounds(
  template: readonly (readonly string[])[],
  name: string,
  rows: readonly Rect[],
  columns: readonly Rect[]
): Rect | undefined {
  const span = areaSpan(template, name);
  if (span === undefined) return undefined;
  const top = rows[span.minRow];
  const bottom = rows[span.maxRow];
  const left = columns[span.minColumn];
  const right = columns[span.maxColumn];
  if (top === undefined || bottom === undefined || left === undefined || right === undefined) return undefined;
  return {
    row: top.row,
    column: left.column,
    width: Math.max(0, right.column + right.width - left.column),
    height: Math.max(0, bottom.row + bottom.height - top.row)
  };
}

function areaSpan(
  template: readonly (readonly string[])[],
  name: string
): { readonly minRow: number; readonly maxRow: number; readonly minColumn: number; readonly maxColumn: number } | undefined {
  const cells = template.flatMap((row, rowIndex) =>
    row.map((value, columnIndex) => ({ value, rowIndex, columnIndex })).filter((cell) => cell.value === name)
  );
  if (cells.length === 0) return undefined;
  return {
    minRow: Math.min(...cells.map((cell) => cell.rowIndex)),
    maxRow: Math.max(...cells.map((cell) => cell.rowIndex)),
    minColumn: Math.min(...cells.map((cell) => cell.columnIndex)),
    maxColumn: Math.max(...cells.map((cell) => cell.columnIndex))
  };
}

export function layoutFlowOptions(widget: LayoutFlowNode): LayoutFlowOptions {
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

function optionalNumberProp(
  widget: LayoutFlowNode,
  key: keyof LayoutFlowOptions | 'columnGap' | 'rowGap'
): Record<string, number> {
  const value = Reflect.get(widget.props, key) as unknown;
  return typeof value === 'number' && Number.isFinite(value) ? { [key]: value } : {};
}

function optionalInsetProp(widget: LayoutFlowNode, key: 'padding' | 'margin'): Record<string, LayoutInsetInput> {
  const value = widget.props[key];
  if (typeof value === 'number' && Number.isFinite(value)) return { [key]: value };
  if (!isInsetObject(value)) return {};
  return { [key]: value };
}

function optionalAlignmentProp(widget: LayoutFlowNode): { readonly align?: LayoutAlignment } {
  const value = widget.props.align;
  return isLayoutAlignment(value) ? { align: value } : {};
}

function optionalJustificationProp(widget: LayoutFlowNode): { readonly justify?: LayoutJustification } {
  const value = widget.props.justify;
  return isLayoutJustification(value) ? { justify: value } : {};
}

function optionalOverflowProp(widget: LayoutFlowNode): { readonly overflow?: LayoutOverflow } {
  const value = widget.props.overflow;
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
