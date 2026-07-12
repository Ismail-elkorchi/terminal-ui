import type { TextEditOperation, TextSelection } from '../../text/index.ts';
import type { RenderSpan, TerminalStyle } from '../../tui/render-primitives.ts';
import type { LayoutSize } from '../../layout/geometry.ts';
import type { ScrollEvent, ScrollPolicy, ScrollState } from '../../behavior/scroll.ts';
import type { ScrollbarOptions } from '../../tui/scrollbar.ts';
import type { TextPointerEvent } from '../../tui/text-pointer.ts';
import type { ListAction } from '../list.ts';
import type { TableAction, TableSortState } from '../table.ts';
import type { TreeAction, TreeNode } from '../tree.ts';
import type { PaginatorAction } from '../paginator.ts';
import type { ComponentKeyBindings, ComponentOptions, InteractiveComponentOptions, TextRole } from './base.ts';
import type {
  DataListStylePart,
  PaginatorStylePart,
  TableStylePart,
  TextAreaStylePart,
  TextStylePart,
  TreeStylePart
} from '../style-parts.ts';

export interface TextOptions extends ComponentOptions<TextStylePart> {
  readonly textRole?: TextRole;
}

export interface RichTextOptions extends ComponentOptions<TextStylePart> {
  readonly segments: readonly RenderSpan[];
  readonly wrap?: boolean;
}

export interface ListOptions<TValue, TMessage> extends InteractiveComponentOptions<DataListStylePart> {
  readonly items: readonly TValue[];
  readonly selected?: number;
  readonly filterQuery?: string;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly isDisabled?: (value: TValue, index: number) => boolean;
  readonly onAction?: (action: ListAction) => TMessage;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface TableOptions<TRow, TMessage = never> extends InteractiveComponentOptions<TableStylePart> {
  readonly rows: readonly TRow[];
  readonly columns?: readonly TableColumn<TRow>[];
  readonly selected?: number;
  readonly selectedCell?: TableCellSelection;
  readonly sort?: TableSortState;
  readonly columnWidths?: Readonly<Record<string, number>>;
  readonly density?: TableDensity;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly stickyHeader?: boolean;
  readonly emptyText?: string;
  readonly onAction?: (action: TableAction) => TMessage;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

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

export interface TreeOptions<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
  TMessage = never
> extends InteractiveComponentOptions<TreeStylePart> {
  readonly nodes: readonly TreeNode<TMetadata>[];
  readonly selected?: string;
  readonly filterQuery?: string;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly emptyText?: string;
  readonly onAction?: (action: TreeAction<TMetadata>) => TMessage;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface PaginatorOptions<TMessage = never> extends InteractiveComponentOptions<PaginatorStylePart> {
  readonly page: number;
  readonly pageCount: number;
  readonly label?: string;
  readonly onAction?: (action: PaginatorAction) => TMessage;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface TextAreaOptions<TMessage = never> extends InteractiveComponentOptions<TextAreaStylePart> {
  readonly value?: string;
  readonly cursor?: number;
  readonly selection?: TextSelection;
  readonly highlights?: readonly TextAreaHighlight[];
  readonly placeholder?: string;
  readonly lineNumbers?: boolean | TextAreaLineNumberOptions;
  readonly activeLine?: boolean;
  readonly wrap?: boolean | TextAreaWrapOptions;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly onScroll?: (event: ScrollEvent) => TMessage;
  readonly onTextPointer?: (event: TextPointerEvent) => TMessage;
  readonly onEdit?: (operation: TextEditOperation) => TMessage;
  readonly keys?: ComponentKeyBindings<TMessage>;
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
