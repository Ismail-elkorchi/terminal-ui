import type {
  ListOptions,
  PaginatorOptions,
  RichTextOptions,
  TableCellSelection,
  TableColumn,
  TableDensity,
  TablePointerSelection,
  TextAreaOptions,
  TextOptions,
  TreeDisclosureAction,
  TreeNode,
  TreeOptions
} from '../../components/options/content.ts';
import type { TextPointerEvent } from '../../tui/text-pointer.ts';
import type { ScrollEvent } from '../../tui/scroll.ts';
import type { RoutedPointerEvent } from '../../tui/pointer-types.ts';
import type { AuthoredProps, ReplaceProps } from './shared.ts';

export type TextRenderProps = AuthoredProps<TextOptions> & { readonly content: string };
export type RichTextRenderProps = AuthoredProps<RichTextOptions>;

type TextAreaAuthoredProps = AuthoredProps<TextAreaOptions>;
export type TextAreaRenderProps<TMessage> = ReplaceProps<
  TextAreaAuthoredProps,
  'onScroll' | 'onTextPointer' | 'onEdit' | 'onInput' | 'onPaste',
  {
    readonly toScrollMessage?: (event: ScrollEvent) => TMessage;
    readonly toTextPointerMessage?: (event: TextPointerEvent) => TMessage;
  }
> & { readonly value: string };

type ListAuthoredProps = AuthoredProps<ListOptions<unknown, never>>;
export type ListRenderProps<TMessage> = ReplaceProps<
  ListAuthoredProps,
  'onScroll' | 'onSelect',
  {
    readonly toScrollMessage?: (event: ScrollEvent) => TMessage;
    readonly toMessage?: (value: unknown) => TMessage;
  }
>;

export interface TableRenderProps<TMessage> {
  readonly rows: readonly unknown[];
  readonly columns?: readonly TableColumn[];
  readonly selected?: number;
  readonly selectedCell?: TableCellSelection;
  readonly density?: TableDensity;
  readonly scroll?: ListAuthoredProps['scroll'];
  readonly scrollbar?: ListAuthoredProps['scrollbar'];
  readonly scrollPolicy?: ListAuthoredProps['scrollPolicy'];
  readonly toScrollMessage?: (event: ScrollEvent) => TMessage;
  readonly stickyHeader?: boolean;
  readonly emptyText?: string;
  readonly toMessage?: (selection: TablePointerSelection) => TMessage;
}

type TreeAuthoredProps = AuthoredProps<TreeOptions>;
export type TreeRenderProps<TMessage> = ReplaceProps<
  TreeAuthoredProps,
  'onScroll' | 'onSelect' | 'onDisclosure',
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

export type PaginatorRenderProps = AuthoredProps<PaginatorOptions>;
