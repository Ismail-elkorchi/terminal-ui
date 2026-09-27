import { visibleRowWindow } from '../../behavior/visible-row-window.ts';
import type { ComponentInput, ComponentMeasureInput } from '../../component/contracts.ts';
import { layoutComponentScrollbar } from '../../component/scrollbar.ts';
import { measureTextCells } from '../../text/measure.ts';
import type { TableColumnWidth } from './column.ts';
import type { TableColumnModel, TableModel, TableRowModel } from './model.ts';
import { activeTablePosition, tableRowModel, tableSourceFor } from './model.ts';

interface TableColumnTrack {
  readonly index: number;
  readonly start: number;
  readonly width: number;
  readonly end: number;
}

export interface TablePlan {
  readonly geometry: ReturnType<typeof layoutComponentScrollbar>;
  readonly widths: readonly number[];
  readonly tracks: readonly TableColumnTrack[];
  readonly markerCells: number;
  readonly separatorCells: number;
  readonly headerHeight: number;
  readonly rows: readonly TableRowModel[];
  readonly startIndex: number;
  readonly endIndexExclusive: number;
  readonly horizontalOffset: number;
}

function tableColumnWidths(
  model: TableModel,
  availableWidth: number,
  widthProfile: ComponentInput<TableModel>['widthProfile'],
): readonly number[] {
  if (model.columns.length === 0) return Object.freeze([]);
  const separatorCells = tableSeparatorCells(model);
  const separators = Math.max(0, model.columns.length - 1) * separatorCells;
  const widthBudget = Math.max(model.columns.length, availableWidth - separators);
  const intrinsic = model.columns.map((column, index) =>
    tableColumnUsesContent(column.width)
      ? tableIntrinsicColumnWidth(model, column, index, widthProfile)
      : tableHeaderWidth(model, column, widthProfile)
  );
  const explicit = model.columns.map((column, index) =>
    explicitTableColumnWidth(
      model.columnWidths[column.id] ?? column.width,
      widthBudget,
      intrinsic[index] ?? 1,
    )
  );
  const used = explicit.reduce<number>((sum, width) => sum + (width ?? 0), 0);
  const remaining = Math.max(0, widthBudget - used);
  const totalWeight = model.columns.reduce<number>(
    (sum, column, index) =>
      explicit[index] === undefined ? sum + tableFillWeight(column.width) : sum,
    0,
  );
  return Object.freeze(
    model.columns.map((column, index) =>
      explicit[index] ??
        Math.max(
          1,
          Math.floor(remaining * (tableFillWeight(column.width) / Math.max(1, totalWeight))),
        )
    ),
  );
}

function tableColumnUsesContent(width: TableColumnWidth | undefined): boolean {
  return width === undefined || (typeof width === 'object' && width.kind === 'content');
}

function tableHeaderWidth(
  model: TableModel,
  column: TableColumnModel,
  widthProfile: ComponentInput<TableModel>['widthProfile'],
): number {
  const sort = model.sort?.columnId === column.id ? tableSortMarker(model.sort.direction) : '';
  const resize = model.semanticRole === 'grid' && column.resizable ? ' ↔' : '';
  return Math.max(1, measureTextCells(`${column.header}${sort}${resize}`, { widthProfile }).cells);
}

function tableIntrinsicColumnWidth(
  model: TableModel,
  column: TableColumnModel,
  index: number,
  widthProfile: ComponentInput<TableModel>['widthProfile'],
): number {
  const headerWidth = tableHeaderWidth(model, column, widthProfile);
  const source = tableSourceFor(model);
  const sampleSize = Math.min(64, source.rows.length);
  let cellWidth = 1;
  for (let localIndex = 0; localIndex < sampleSize; localIndex += 1) {
    const row = tableRowModel(model, localIndex);
    cellWidth = Math.max(
      cellWidth,
      measureTextCells(row.cells[index]?.text ?? '', { widthProfile }).cells,
    );
  }
  return Math.max(1, headerWidth, Math.min(cellWidth, 24));
}

function explicitTableColumnWidth(
  width: TableColumnWidth | undefined,
  availableWidth: number,
  intrinsic: number,
): number | undefined {
  if (typeof width === 'number') return width;
  if (width === undefined) return intrinsic;
  switch (width.kind) {
    case 'fixed':
      return width.cells;
    case 'percent':
      return Math.max(1, Math.floor(availableWidth * width.value / 100));
    case 'content':
      return Math.max(width.min ?? 1, Math.min(width.max ?? intrinsic, intrinsic));
    case 'fill':
      return undefined;
  }
}

function tableFillWeight(width: TableColumnWidth | undefined): number {
  return typeof width === 'object' && width.kind === 'fill' ? width.weight ?? 1 : 1;
}

export function tableSeparatorCells(model: TableModel): number {
  return model.density === 'compact' ? 1 : 2;
}

function tableTracks(
  widths: readonly number[],
  markerCells: number,
  separatorCells: number,
): readonly TableColumnTrack[] {
  let cursor = markerCells;
  return Object.freeze(widths.map((width, index) => {
    if (index > 0) cursor += separatorCells;
    const track = Object.freeze({ index, start: cursor, width, end: cursor + width });
    cursor = track.end;
    return track;
  }));
}

function tableContentWidth(
  widths: readonly number[],
  markerCells: number,
  separatorCells: number,
): number {
  return markerCells + widths.reduce((sum, width) => sum + width, 0) +
    Math.max(0, widths.length - 1) * separatorCells;
}

export function tablePlan(input: ComponentInput<TableModel>): TablePlan {
  const source = tableSourceFor(input.model);
  const markerCells = input.model.semanticRole === 'grid' ? 2 : 0;
  const separatorCells = tableSeparatorCells(input.model);
  const headerHeight = input.model.hasHeader && input.model.stickyHeader ? 1 : 0;
  const scrollingBounds = headerHeight === 0 ? input.bounds : {
    ...input.bounds,
    row: input.bounds.row + headerHeight,
    height: Math.max(0, input.bounds.height - headerHeight),
  };
  const baseScroll = input.model.scroll ??
    Object.freeze({
      offsetRow: 0,
      offsetColumn: 0,
      followTail: false,
    });
  let widths = tableColumnWidths(
    input.model,
    Math.max(1, input.bounds.width - markerCells),
    input.widthProfile,
  );
  let contentColumns = tableContentWidth(widths, markerCells, separatorCells);
  let geometry = layoutComponentScrollbar({
    bounds: scrollingBounds,
    scroll: baseScroll,
    contentRows: input.model.totalCount,
    contentColumns,
    ...(input.model.scrollbar === undefined ? {} : { options: input.model.scrollbar }),
    defaultAxis: 'vertical',
  });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    widths = tableColumnWidths(
      input.model,
      Math.max(1, geometry.contentBounds.width - markerCells),
      input.widthProfile,
    );
    contentColumns = tableContentWidth(widths, markerCells, separatorCells);
    geometry = layoutComponentScrollbar({
      bounds: scrollingBounds,
      scroll: baseScroll,
      contentRows: input.model.totalCount,
      contentColumns,
      ...(input.model.scrollbar === undefined ? {} : { options: input.model.scrollbar }),
      defaultAxis: 'vertical',
    });
  }
  const bodyHeight = geometry.contentBounds.height;
  const activeIndex = activeTablePosition(input.model)?.rowIndex;
  const requested = visibleRowWindow({
    totalRows: input.model.totalCount,
    viewportRows: bodyHeight,
    ...(activeIndex === undefined ? {} : { activeIndex }),
    ...(input.model.scroll === undefined ? {} : {
      scroll: input.model.scroll,
    }),
    contentColumns,
    viewportColumns: geometry.contentBounds.width,
  });
  const availableEnd = input.model.startIndex + source.rows.length;
  const lastStart = Math.max(
    input.model.startIndex,
    availableEnd - Math.min(bodyHeight, source.rows.length),
  );
  const startIndex = Math.max(input.model.startIndex, Math.min(lastStart, requested.startIndex));
  const localStart = startIndex - input.model.startIndex;
  const rows = Object.freeze(Array.from(
    { length: Math.min(bodyHeight, source.rows.length - localStart) },
    (_unused, offset) => tableRowModel(input.model, localStart + offset),
  ));
  return Object.freeze({
    geometry,
    widths,
    tracks: tableTracks(widths, markerCells, separatorCells),
    markerCells,
    separatorCells,
    headerHeight,
    rows,
    startIndex,
    endIndexExclusive: startIndex + rows.length,
    horizontalOffset: requested.offsetColumn,
  });
}

export function measureTable(input: ComponentMeasureInput<TableModel>) {
  const markerCells = input.model.semanticRole === 'grid' ? 2 : 0;
  const widths = input.model.columns.map((column, index) => {
    const controlled = input.model.columnWidths[column.id];
    if (controlled !== undefined) return controlled;
    if (typeof column.width === 'number') return column.width;
    if (column.width?.kind === 'fixed') return column.width.cells;
    return tableColumnUsesContent(column.width)
      ? tableIntrinsicColumnWidth(input.model, column, index, input.widthProfile)
      : tableHeaderWidth(input.model, column, input.widthProfile);
  });
  return {
    minWidth: Math.max(1, markerCells + input.model.columns.length),
    minHeight: 1,
    preferredWidth: boundedTableContentWidth(widths, markerCells, tableSeparatorCells(input.model)),
    preferredHeight: Math.max(
      1,
      Math.min(Number.MAX_SAFE_INTEGER, input.model.totalCount + (input.model.hasHeader ? 1 : 0)),
    ),
  };
}

function boundedTableContentWidth(
  widths: readonly number[],
  markerCells: number,
  separatorCells: number,
): number {
  let result = markerCells + Math.max(0, widths.length - 1) * separatorCells;
  for (const width of widths) result = Math.min(Number.MAX_SAFE_INTEGER, result + width);
  return result;
}

export function tableSortMarker(direction: 'ascending' | 'descending'): string {
  return direction === 'ascending' ? ' ↑' : ' ↓';
}

export function visibleTableTrack(
  track: TableColumnTrack,
  horizontalOffset: number,
  viewportWidth: number,
): { readonly start: number; readonly end: number } | undefined {
  const start = Math.max(0, track.start - horizontalOffset);
  const end = Math.min(viewportWidth, track.end - horizontalOffset);
  return end <= start ? undefined : { start, end };
}
