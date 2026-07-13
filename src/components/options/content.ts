import type { TextEditOperation, TextSelection } from '../../text/index.ts';
import type { RenderSpan } from '../../visual/render.ts';
import type { ScrollEvent, ScrollPolicy, ScrollState } from '../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import type { TextPointerEvent } from '../../interaction/text-pointer.ts';
import type { ListAction } from '../../ui-model/list.ts';
import type { TableAction, TableSortState } from '../../ui-model/table.ts';
import type { TreeAction, TreeNode } from '../../ui-model/tree.ts';
import type { PaginatorAction } from '../../ui-model/paginator.ts';
import type {
  TableCellSelection,
  TableColumn,
  TableDensity,
  TextAreaHighlight,
  TextAreaLineNumberOptions,
  TextAreaWrapOptions
} from '../../ui-model/content.ts';
import type { ElementKeyBindings, ElementOptions, InteractiveElementOptions, ElementTextRole } from '../../element/metadata.ts';
import type {
  DataListStylePart,
  PaginatorStylePart,
  TableStylePart,
  TextAreaStylePart,
  TextStylePart,
  TreeStylePart
} from '../../ui-model/style-parts.ts';

export interface TextOptions extends ElementOptions<TextStylePart> {
  readonly textRole?: ElementTextRole;
}

export interface RichTextOptions extends ElementOptions<TextStylePart> {
  readonly segments: readonly RenderSpan[];
  readonly wrap?: boolean;
}

export interface ListOptions<TValue, TMessage> extends InteractiveElementOptions<DataListStylePart> {
  readonly items: readonly TValue[];
  readonly getItemId: (value: TValue, index: number) => string;
  readonly selectedId?: string;
  readonly filterQuery?: string;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly isDisabled?: (value: TValue, index: number) => boolean;
  readonly onAction?: (action: ListAction) => TMessage;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export interface TableOptions<TRow, TMessage = never> extends InteractiveElementOptions<TableStylePart> {
  readonly rows: readonly TRow[];
  readonly getRowId: (row: TRow, index: number) => string;
  readonly columns?: readonly TableColumn<TRow>[];
  readonly selectedRowId?: string;
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
  readonly keys?: ElementKeyBindings<TMessage>;
}

export interface TreeOptions<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
  TMessage = never
> extends InteractiveElementOptions<TreeStylePart> {
  readonly nodes: readonly TreeNode<TMetadata>[];
  readonly selected?: string;
  readonly filterQuery?: string;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly emptyText?: string;
  readonly onAction?: (action: TreeAction<TMetadata>) => TMessage;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export interface PaginatorOptions<TMessage = never> extends InteractiveElementOptions<PaginatorStylePart> {
  readonly page: number;
  readonly pageCount: number;
  readonly label?: string;
  readonly onAction?: (action: PaginatorAction) => TMessage;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export interface TextAreaOptions<TMessage = never> extends InteractiveElementOptions<TextAreaStylePart> {
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
  readonly keys?: ElementKeyBindings<TMessage>;
}

export type {
  TableCellRenderInput,
  TableCellSelection,
  TableColumn,
  TableColumnAlignment,
  TableColumnSemantic,
  TableColumnWidth,
  TableDensity,
  TextAreaHighlight,
  TextAreaLineNumberOptions,
  TextAreaWrapOptions
} from '../../ui-model/content.ts';
