import type { LayoutSize } from '../geometry/types.ts';
import type { InlineContent, InlineContentSegment } from '../visual/inline-content.ts';
import type { TerminalStyle } from '../visual/render.ts';

export type TableColumnWidth = number | LayoutSize;
export type TableColumnAlignment = 'start' | 'center' | 'end';
export type TableColumnSemantic = 'text' | 'metric' | 'metadata';

export interface TableCellRenderInput<TRow = unknown, TValue = unknown> {
  readonly value: TValue;
  readonly row: TRow;
  readonly rowIndex: number;
  readonly columnIndex: number;
}

interface TableColumnBase<TRow> {
  readonly id: string;
  readonly header?: string;
  readonly value: (row: TRow, rowIndex: number) => unknown;
  readonly width?: TableColumnWidth;
  readonly align?: TableColumnAlignment;
  readonly semantic?: TableColumnSemantic;
  readonly hidden?: boolean;
  readonly sortable?: boolean;
  readonly resizable?: boolean;
  readonly style?: TerminalStyle;
  readonly headerStyle?: TerminalStyle;
}

export interface TableValueColumn<TRow = unknown> extends TableColumnBase<TRow> {
  readonly render?: never;
}

const typedTableColumn: unique symbol = Symbol('terminal-ui.tableColumn');

export interface TableRenderedColumn<TRow = unknown> extends TableColumnBase<TRow> {
  readonly renderCell: (
    row: TRow,
    rowIndex: number,
    columnIndex: number
  ) => string | InlineContentSegment | InlineContent;
  readonly [typedTableColumn]: true;
}

export type TableColumn<TRow = unknown> = TableValueColumn<TRow> | TableRenderedColumn<TRow>;

export interface TableColumnDefinition<TRow, TValue>
  extends Omit<TableColumnBase<TRow>, 'value'> {
  readonly value: (row: TRow, rowIndex: number) => TValue;
  readonly render: (input: TableCellRenderInput<TRow, TValue>) => string | InlineContentSegment | InlineContent;
}

export type TableColumnBuilder<TRow> = <TValue>(
  definition: TableColumnDefinition<TRow, TValue>
) => TableRenderedColumn<TRow>;

export function tableColumn<TRow>(): TableColumnBuilder<TRow>;
export function tableColumn<TRow, TValue>(
  definition: TableColumnDefinition<TRow, TValue>
): TableRenderedColumn<TRow>;
export function tableColumn<TRow, TValue>(
  definition?: TableColumnDefinition<TRow, TValue>
): TableRenderedColumn<TRow> | TableColumnBuilder<TRow> {
  if (definition === undefined) {
    return <TCell>(input: TableColumnDefinition<TRow, TCell>) => createTableColumn(input);
  }
  return createTableColumn(definition);
}

function createTableColumn<TRow, TValue>(
  definition: TableColumnDefinition<TRow, TValue>
): TableRenderedColumn<TRow> {
  const render = definition.render;
  const value = definition.value;
  return {
    id: definition.id,
    ...(definition.header === undefined ? {} : { header: definition.header }),
    value,
    ...(definition.width === undefined ? {} : { width: definition.width }),
    ...(definition.align === undefined ? {} : { align: definition.align }),
    ...(definition.semantic === undefined ? {} : { semantic: definition.semantic }),
    ...(definition.hidden === undefined ? {} : { hidden: definition.hidden }),
    ...(definition.sortable === undefined ? {} : { sortable: definition.sortable }),
    ...(definition.resizable === undefined ? {} : { resizable: definition.resizable }),
    ...(definition.style === undefined ? {} : { style: definition.style }),
    ...(definition.headerStyle === undefined ? {} : { headerStyle: definition.headerStyle }),
    renderCell: (row, rowIndex, columnIndex) => render({
      value: value(row, rowIndex),
      row,
      rowIndex,
      columnIndex
    }),
    [typedTableColumn]: true
  };
}

export interface TableCellSelection {
  readonly rowId: string;
  readonly columnIndex?: number;
}

export interface TextAreaHighlight {
  readonly startOffset: number;
  readonly endOffsetExclusive: number;
  readonly label?: string;
  readonly style?: TerminalStyle;
}

export interface TextAreaWrapOptions {
  readonly mode?: 'none' | 'soft';
}

export interface TextAreaLineNumberOptions {
  readonly startNumber?: number;
  readonly minWidth?: number;
}
