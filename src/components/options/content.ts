import type { InlineContent } from '../../visual/inline-content.ts';
import type { ScrollPolicy, ScrollState } from '../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import type { ListAction, ListControlAction, ListItemProjector } from '../../ui-model/list.ts';
import type {
  TableAction,
  TableControlAction,
  TablePresentation,
  TableScrollablePresentation
} from '../../ui-model/table.ts';
import type { TreeAction, TreeControlAction, TreeNode } from '../../ui-model/tree.ts';
import type { PaginatorAction } from '../../ui-model/paginator.ts';
import type { ComponentDensity } from '../../ui-model/contracts.ts';
import type {
  TextAreaAction,
  TextAreaControlAction,
  TextAreaPresentation,
  TextAreaScrollablePresentation
} from '../../ui-model/text-area.ts';
import type {
  TableColumn,
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
  readonly segments: InlineContent;
  readonly wrap?: boolean;
}

interface ListBaseOptions<TValue, TMessage> extends InteractiveElementOptions<DataListStylePart, TMessage> {
  readonly items: readonly TValue[];
  readonly projectItem: ListItemProjector<TValue>;
  readonly selectedId?: string;
  readonly filterQuery?: string;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export type ListOptions<TValue, TMessage = never> =
  | PassiveListOptions<TValue, TMessage>
  | ScrollableListOptions<TValue, TMessage>;

export interface PassiveListOptions<TValue, TMessage = never> extends ListBaseOptions<TValue, TMessage> {
  readonly scroll?: never;
  readonly scrollbar?: never;
  readonly scrollPolicy?: never;
  readonly onAction?: (action: ListControlAction) => TMessage;
}

export interface ScrollableListOptions<TValue, TMessage = never> extends ListBaseOptions<TValue, TMessage> {
  readonly scroll: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly onAction: (action: ListAction) => TMessage;
}

interface TreeBaseOptions<
  TMetadata extends Readonly<Record<string, unknown>>,
  TMessage
> extends InteractiveElementOptions<TreeStylePart, TMessage> {
  readonly nodes: readonly TreeNode<TMetadata>[];
  readonly selected?: string;
  readonly filterQuery?: string;
  readonly emptyText?: string;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export type TreeOptions<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
  TMessage = never
> = PassiveTreeOptions<TMetadata, TMessage> | ScrollableTreeOptions<TMetadata, TMessage>;

export interface PassiveTreeOptions<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
  TMessage = never
> extends TreeBaseOptions<TMetadata, TMessage> {
  readonly scroll?: never;
  readonly scrollbar?: never;
  readonly scrollPolicy?: never;
  readonly onAction?: (action: TreeControlAction<TMetadata>) => TMessage;
}

export interface ScrollableTreeOptions<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
  TMessage = never
> extends TreeBaseOptions<TMetadata, TMessage> {
  readonly scroll: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly onAction: (action: TreeAction<TMetadata>) => TMessage;
}

interface TableBaseOptions<TRow, TMessage> extends InteractiveElementOptions<TableStylePart, TMessage> {
  readonly rows: readonly TRow[];
  readonly getRowId: (row: TRow, index: number) => string;
  readonly columns?: readonly TableColumn<TRow>[];
  readonly density?: ComponentDensity;
  readonly stickyHeader?: boolean;
  readonly emptyText?: string;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export type TableOptions<TRow, TMessage = never> =
  | PassiveTableOptions<TRow, TMessage>
  | ScrollableTableOptions<TRow, TMessage>;

export interface PassiveTableOptions<TRow, TMessage = never> extends TableBaseOptions<TRow, TMessage> {
  readonly presentation?: TablePresentation;
  readonly onAction?: (action: TableControlAction) => TMessage;
  readonly scrollbar?: never;
  readonly scrollPolicy?: never;
}

export interface ScrollableTableOptions<TRow, TMessage = never> extends TableBaseOptions<TRow, TMessage> {
  readonly presentation: TableScrollablePresentation;
  readonly onAction: (action: TableAction) => TMessage;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
}

export interface PaginatorOptions<TMessage = never> extends InteractiveElementOptions<PaginatorStylePart, TMessage> {
  readonly page: number;
  readonly pageCount: number;
  readonly label?: string;
  readonly onAction?: (action: PaginatorAction) => TMessage;
  readonly keys?: ElementKeyBindings<TMessage>;
}

interface TextAreaBaseOptions<TMessage> extends InteractiveElementOptions<TextAreaStylePart, TMessage> {
  readonly highlights?: readonly TextAreaHighlight[];
  readonly placeholder?: string;
  readonly lineNumbers?: boolean | TextAreaLineNumberOptions;
  readonly activeLine?: boolean;
  readonly wrap?: boolean | TextAreaWrapOptions;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export type TextAreaOptions<TMessage = never> =
  | PassiveTextAreaOptions<TMessage>
  | ScrollableTextAreaOptions<TMessage>;

export interface PassiveTextAreaOptions<TMessage = never> extends TextAreaBaseOptions<TMessage> {
  readonly presentation: Omit<TextAreaPresentation, 'scroll'> & { readonly scroll?: never };
  readonly scrollbar?: never;
  readonly scrollPolicy?: never;
  readonly onAction?: (action: TextAreaControlAction) => TMessage;
}

export interface ScrollableTextAreaOptions<TMessage = never> extends TextAreaBaseOptions<TMessage> {
  readonly presentation: TextAreaScrollablePresentation;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly onAction: (action: TextAreaAction) => TMessage;
}

export type {
  TableCellRenderInput,
  TableCellSelection,
  TableColumn,
  TableColumnAlignment,
  TableColumnSemantic,
  TableColumnWidth,
  TextAreaHighlight,
  TextAreaLineNumberOptions,
  TextAreaWrapOptions
} from '../../ui-model/content.ts';
