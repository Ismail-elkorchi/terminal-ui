import type { ElementTextRole } from '../../../element/metadata.ts';
import type { RoutedPointerEvent } from '../../../input/pointer.ts';
import type { ScrollEvent, ScrollPolicy, ScrollState } from '../../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../../interaction/scrollbar.ts';
import type { TextPointerEvent } from '../../../interaction/text-pointer.ts';
import type { TextSelection } from '../../../text/index.ts';
import type {
  TableCellSelection,
  TableColumn,
  TableDensity,
  TextAreaHighlight,
  TextAreaLineNumberOptions,
  TextAreaWrapOptions
} from '../../../ui-model/content.ts';
import type { ListAction } from '../../../ui-model/list.ts';
import type { PaginatorAction } from '../../../ui-model/paginator.ts';
import type { TableAction, TableSortState } from '../../../ui-model/table.ts';
import type { TreeAction, TreeDisclosureAction, TreeNode } from '../../../ui-model/tree.ts';
import type { RenderSpan } from '../../../visual/render.ts';

export interface TextRenderProps {
  readonly textRole?: ElementTextRole;
  readonly content: string;
}

export interface RichTextRenderProps {
  readonly segments: readonly RenderSpan[];
  readonly wrap?: boolean;
}

export interface TextAreaRenderProps<TMessage> {
  readonly value: string;
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
  readonly toScrollMessage?: (event: ScrollEvent) => TMessage;
  readonly toTextPointerMessage?: (event: TextPointerEvent) => TMessage;
}

export interface ListRenderProps<TMessage> {
  readonly items: readonly unknown[];
  readonly selected?: number;
  readonly filterQuery?: string;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly disabledIndices?: readonly number[];
  readonly toScrollMessage?: (event: ScrollEvent) => TMessage;
  readonly toActionMessage?: (action: ListAction) => TMessage;
}

export interface TableRenderProps<TMessage> {
  readonly rows: readonly unknown[];
  readonly columns?: readonly TableColumn[];
  readonly selected?: number;
  readonly selectedCell?: TableCellSelection;
  readonly sort?: TableSortState;
  readonly columnWidths?: Readonly<Record<string, number>>;
  readonly density?: TableDensity;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly toScrollMessage?: (event: ScrollEvent) => TMessage;
  readonly stickyHeader?: boolean;
  readonly emptyText?: string;
  readonly toActionMessage?: (action: TableAction) => TMessage;
}

export interface TreeRenderProps<TMessage> {
  readonly nodes: readonly TreeNode[];
  readonly selected?: string;
  readonly filterQuery?: string;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly emptyText?: string;
  readonly toScrollMessage?: (event: ScrollEvent) => TMessage;
  readonly toMessage?: (node: TreeNode) => TMessage;
  readonly toActionMessage?: (action: TreeAction) => TMessage;
  readonly toDisclosureMessage?: (
    node: TreeNode,
    action: TreeDisclosureAction,
    event: RoutedPointerEvent
  ) => TMessage;
}

export interface PaginatorRenderProps<TMessage> {
  readonly page: number;
  readonly pageCount: number;
  readonly label?: string;
  readonly toActionMessage?: (action: PaginatorAction) => TMessage;
}
