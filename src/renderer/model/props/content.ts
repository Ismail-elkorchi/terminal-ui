import type { ElementTextRole } from '../../../element/metadata.ts';
import type { ScrollEvent, ScrollPolicy, ScrollState } from '../../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../../interaction/scrollbar.ts';
import type { TextCaret, TextDocument, TextDocumentSelection } from '../../../text/index.ts';
import type {
  TableCellSelection,
  TableColumnAlignment,
  TableColumnSemantic,
  TableColumnWidth,
  TextAreaHighlight,
  TextAreaLineNumberOptions,
  TextAreaWrapOptions
} from '../../../ui-model/content.ts';
import type { ListControlAction, ListViewProjection } from '../../../ui-model/list.ts';
import type { ComponentDensity } from '../../../ui-model/contracts.ts';
import type { TextAreaAction } from '../../../ui-model/text-area.ts';
import type { PaginatorAction } from '../../../ui-model/paginator.ts';
import type { TableCollection, TableControlAction, TableSortState } from '../../../ui-model/table.ts';
import type { TreeControlAction, TreeViewProjection } from '../../../ui-model/tree.ts';
import type { InlineContent } from '../../../visual/inline-content.ts';
import type { InlineContentSegment } from '../../../visual/inline-content.ts';
import type { TerminalStyle } from '../../../visual/render.ts';

export interface TextRenderProps {
  readonly textRole?: ElementTextRole;
  readonly content: string;
}

export interface RichTextRenderProps {
  readonly segments: InlineContent;
  readonly wrap?: boolean;
}

export interface TextAreaRenderProps<TMessage> {
  readonly document: TextDocument;
  readonly caret: TextCaret;
  readonly selection?: TextDocumentSelection;
  readonly revealCaret?: boolean;
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
  readonly toActionMessage?: (action: TextAreaAction) => TMessage;
}

export interface ListRenderProps<TMessage> {
  readonly view: ListViewProjection<unknown>;
  readonly selectedId?: string;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly toScrollMessage?: (event: ScrollEvent) => TMessage;
  readonly toActionMessage?: (action: ListControlAction) => TMessage;
}

export interface TableRenderProps<TMessage> {
  readonly collection: TableCollection<unknown>;
  readonly columns?: readonly TableRenderColumn[];
  readonly selectedRowId?: string;
  readonly selectedCell?: TableCellSelection;
  readonly sort?: TableSortState;
  readonly columnWidths?: Readonly<Record<string, number>>;
  readonly density?: ComponentDensity;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly toScrollMessage?: (event: ScrollEvent) => TMessage;
  readonly stickyHeader?: boolean;
  readonly emptyText?: string;
  readonly toActionMessage?: (action: TableControlAction) => TMessage;
}

export interface TableRenderColumn {
  readonly id: string;
  readonly header?: string;
  readonly value: (row: unknown, rowIndex: number) => unknown;
  readonly width?: TableColumnWidth;
  readonly align?: TableColumnAlignment;
  readonly semantic?: TableColumnSemantic;
  readonly hidden?: boolean;
  readonly sortable?: boolean;
  readonly resizable?: boolean;
  readonly style?: TerminalStyle;
  readonly headerStyle?: TerminalStyle;
  readonly renderCell?: (
    row: unknown,
    rowIndex: number,
    columnIndex: number
  ) => string | InlineContentSegment | InlineContent;
}

export interface TreeRenderProps<TMessage> {
  readonly view: TreeViewProjection;
  readonly selected?: string;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly emptyText?: string;
  readonly toScrollMessage?: (event: ScrollEvent) => TMessage;
  readonly toActionMessage?: (action: TreeControlAction) => TMessage;
}

export interface PaginatorRenderProps<TMessage> {
  readonly pageNumber: number;
  readonly pageCount: number;
  readonly label?: string;
  readonly toActionMessage?: (action: PaginatorAction) => TMessage;
}
