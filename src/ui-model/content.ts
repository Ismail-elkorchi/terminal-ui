import type { LayoutSize } from '../geometry/types.ts';
import type { RenderSpan, TerminalStyle } from '../visual/render.ts';

export type TableColumnWidth = number | LayoutSize;
export type TableColumnAlignment = 'start' | 'center' | 'end';
export type TableDensity = 'normal' | 'dense';
export type TableColumnSemantic = 'text' | 'metric' | 'metadata';

export interface TableCellRenderInput<TRow = unknown> {
  readonly value: unknown;
  readonly row: TRow;
  readonly rowIndex: number;
  readonly columnIndex: number;
}

export interface TableColumn<TRow = unknown> {
  readonly id: string;
  readonly header?: string;
  readonly value: (row: TRow, rowIndex: number) => unknown;
  readonly width?: TableColumnWidth;
  readonly align?: TableColumnAlignment;
  readonly semantic?: TableColumnSemantic;
  readonly hidden?: boolean;
  readonly resizable?: boolean;
  readonly style?: TerminalStyle;
  readonly headerStyle?: TerminalStyle;
  readonly render?: (input: TableCellRenderInput<TRow>) => string | RenderSpan | readonly RenderSpan[];
}

export interface TableCellSelection {
  readonly row: number;
  readonly column?: number;
}

export interface TextAreaHighlight {
  readonly start: number;
  readonly end: number;
  readonly label?: string;
  readonly style?: TerminalStyle;
}

export interface TextAreaWrapOptions {
  readonly mode?: 'none' | 'soft';
}

export interface TextAreaLineNumberOptions {
  readonly start?: number;
  readonly minWidth?: number;
}
