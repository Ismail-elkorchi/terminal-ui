import type { InlineContent } from '../../visual/inline-content.ts';
import type { ScrollPolicy, ScrollState } from '../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import type { ListAction, ListCollection, ListControlAction, ListItemProjector } from '../../ui-model/list.ts';
import type {
  TableAction,
  TableCollection,
  TableControlAction,
  TablePresentation,
  TableScrollablePresentation
} from '../../ui-model/table.ts';
import type {
  TreeCollection,
  TreeControlAction,
  TreeInteractionAction,
  TreeNode
} from '../../ui-model/tree.ts';
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

interface ListCommonOptions<TMessage> extends InteractiveElementOptions<DataListStylePart, TMessage> {
  readonly selectedId?: string;
  readonly filterQuery?: string;
  readonly keys?: ElementKeyBindings<TMessage>;
}

type ListDataOptions<TValue> =
  | {
      readonly items: readonly TValue[];
      readonly projectItem: ListItemProjector<TValue>;
      readonly collection?: never;
    }
  | {
      readonly collection: ListCollection<TValue>;
      readonly items?: never;
      readonly projectItem?: never;
    };

type ListBaseOptions<TValue, TMessage> = ListCommonOptions<TMessage> & ListDataOptions<TValue>;

export type ListOptions<TValue, TMessage = never> =
  | PassiveListOptions<TValue, TMessage>
  | ScrollableListOptions<TValue, TMessage>;

export type PassiveListOptions<TValue, TMessage = never> = ListBaseOptions<TValue, TMessage> & {
  readonly scroll?: never;
  readonly scrollbar?: never;
  readonly scrollPolicy?: never;
  readonly onAction?: (action: ListControlAction) => TMessage;
};

export type ScrollableListOptions<TValue, TMessage = never> = ListBaseOptions<TValue, TMessage> & {
  readonly scroll: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly onAction: (action: ListAction) => TMessage;
};

interface TreeCommonOptions<TMessage> extends InteractiveElementOptions<TreeStylePart, TMessage> {
  readonly selected?: string;
  readonly filterQuery?: string;
  readonly emptyText?: string;
  readonly keys?: ElementKeyBindings<TMessage>;
}

type TreeDataOptions<TMetadata extends Readonly<Record<string, unknown>>> =
  | {
      readonly nodes: readonly TreeNode<TMetadata>[];
      readonly collection?: never;
    }
  | {
      readonly collection: TreeCollection<TMetadata>;
      readonly nodes?: never;
    };

type TreeBaseOptions<
  TMetadata extends Readonly<Record<string, unknown>>,
  TMessage
> = TreeCommonOptions<TMessage> & TreeDataOptions<TMetadata>;

export type TreeOptions<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
  TMessage = never
> = PassiveTreeOptions<TMetadata, TMessage> | ScrollableTreeOptions<TMetadata, TMessage>;

export type PassiveTreeOptions<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
  TMessage = never
> = TreeBaseOptions<TMetadata, TMessage> & {
  readonly scroll?: never;
  readonly scrollbar?: never;
  readonly scrollPolicy?: never;
  readonly onAction?: (action: TreeControlAction) => TMessage;
};

export type ScrollableTreeOptions<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
  TMessage = never
> = TreeBaseOptions<TMetadata, TMessage> & {
  readonly scroll: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly onAction: (action: TreeInteractionAction) => TMessage;
};

interface TableCommonOptions<TRow, TMessage> extends InteractiveElementOptions<TableStylePart, TMessage> {
  readonly columns?: readonly TableColumn<TRow>[];
  readonly density?: ComponentDensity;
  readonly stickyHeader?: boolean;
  readonly emptyText?: string;
  readonly keys?: ElementKeyBindings<TMessage>;
}

type TableDataOptions<TRow> =
  | {
      readonly rows: readonly TRow[];
      readonly getRowId: (row: TRow, index: number) => string;
      readonly collection?: never;
    }
  | {
      readonly collection: TableCollection<TRow>;
      readonly rows?: never;
      readonly getRowId?: never;
    };

type TableBaseOptions<TRow, TMessage> = TableCommonOptions<TRow, TMessage> & TableDataOptions<TRow>;

export type TableOptions<TRow, TMessage = never> =
  | PassiveTableOptions<TRow, TMessage>
  | ScrollableTableOptions<TRow, TMessage>;

export type PassiveTableOptions<TRow, TMessage = never> = TableBaseOptions<TRow, TMessage> & {
  readonly presentation?: TablePresentation;
  readonly onAction?: (action: TableControlAction) => TMessage;
  readonly scrollbar?: never;
  readonly scrollPolicy?: never;
};

export type ScrollableTableOptions<TRow, TMessage = never> = TableBaseOptions<TRow, TMessage> & {
  readonly presentation: TableScrollablePresentation;
  readonly onAction: (action: TableAction) => TMessage;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
};

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
  TableColumnBuilder,
  TableColumnDefinition,
  TableColumnAlignment,
  TableColumnSemantic,
  TableColumnWidth,
  TableRenderedColumn,
  TableValueColumn,
  TextAreaHighlight,
  TextAreaLineNumberOptions,
  TextAreaWrapOptions
} from '../../ui-model/content.ts';
