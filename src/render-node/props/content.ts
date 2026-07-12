import type {
  ListOptions,
  PaginatorOptions,
  RichTextOptions,
  TableCellSelection,
  TableColumn,
  TableDensity,
  TextAreaOptions,
  TextOptions,
  TreeOptions
} from '../../ui-model/options/content.ts';
import type { ListAction } from '../../ui-model/list.ts';
import type { TableAction } from '../../ui-model/table.ts';
import type { TableSortState } from '../../ui-model/table.ts';
import type { TreeDisclosureAction, TreeNode } from '../../ui-model/tree.ts';
import type { PaginatorAction } from '../../ui-model/paginator.ts';
import type { TextPointerEvent } from '../../tui/text-pointer.ts';
import type { ScrollEvent } from '../../interaction/scroll.ts';
import type { RoutedPointerEvent } from '../../input/pointer.ts';
import type { AuthoredProps, ReplaceProps } from './shared.ts';

export type TextRenderProps = AuthoredProps<TextOptions> & { readonly content: string };
export type RichTextRenderProps = AuthoredProps<RichTextOptions>;

type TextAreaAuthoredProps = AuthoredProps<TextAreaOptions>;
export type TextAreaRenderProps<TMessage> = ReplaceProps<
  TextAreaAuthoredProps,
  'onScroll' | 'onTextPointer' | 'onEdit',
  {
    readonly toScrollMessage?: (event: ScrollEvent) => TMessage;
    readonly toTextPointerMessage?: (event: TextPointerEvent) => TMessage;
  }
> & { readonly value: string };

type ListAuthoredProps = AuthoredProps<ListOptions<unknown, never>>;
export type ListRenderProps<TMessage> = ReplaceProps<
  ListAuthoredProps,
  'onAction' | 'isDisabled',
  {
    readonly disabledIndices?: readonly number[];
    readonly toScrollMessage?: (event: ScrollEvent) => TMessage;
    readonly toActionMessage?: (action: ListAction) => TMessage;
  }
>;

export interface TableRenderProps<TMessage> {
  readonly rows: readonly unknown[];
  readonly columns?: readonly TableColumn[];
  readonly selected?: number;
  readonly selectedCell?: TableCellSelection;
  readonly sort?: TableSortState;
  readonly columnWidths?: Readonly<Record<string, number>>;
  readonly density?: TableDensity;
  readonly scroll?: ListAuthoredProps['scroll'];
  readonly scrollbar?: ListAuthoredProps['scrollbar'];
  readonly scrollPolicy?: ListAuthoredProps['scrollPolicy'];
  readonly toScrollMessage?: (event: ScrollEvent) => TMessage;
  readonly stickyHeader?: boolean;
  readonly emptyText?: string;
  readonly toActionMessage?: (action: TableAction) => TMessage;
}

type TreeAuthoredProps = AuthoredProps<TreeOptions>;
export type TreeRenderProps<TMessage> = ReplaceProps<
  TreeAuthoredProps,
  'onAction',
  {
    readonly toScrollMessage?: (event: ScrollEvent) => TMessage;
    readonly toMessage?: (node: TreeNode) => TMessage;
    readonly toDisclosureMessage?: (
      node: TreeNode,
      action: TreeDisclosureAction,
      event: RoutedPointerEvent
    ) => TMessage;
  }
>;

export type PaginatorRenderProps<TMessage> = ReplaceProps<
  AuthoredProps<PaginatorOptions>,
  'onAction',
  { readonly toActionMessage?: (action: PaginatorAction) => TMessage }
>;
