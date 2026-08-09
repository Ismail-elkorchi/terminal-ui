import type { InlineContent } from '../../visual/inline-content.ts';
import type { ComponentMessage } from '../../component/index.ts';
import type { ScrollPolicy, ScrollState } from '../../interaction/scroll.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import type {
  CompleteListCollection,
  ListAction,
  ListControlAction,
  ListItemProjector,
  WindowedListCollection
} from '../../ui-model/list.ts';
import type {
  TableAction,
  TableCollection,
  TableControlAction,
  TablePresentation,
  TableScrollablePresentation
} from '../../ui-model/table.ts';
import type {
  CompleteTreeCollection,
  TreeControlAction,
  TreeInteractionAction,
  TreeNode,
  WindowedTreeCollection
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
import type { ElementOptions, ElementTextRole } from '../../element/metadata.ts';
import type {
  DataListStylePart,
  DisclosureStylePart,
  PaginatorStylePart,
  TableStylePart,
  TextAreaStylePart,
  TextStylePart,
  TreeStylePart
} from '../../ui-model/style-parts.ts';
import type { DisclosureAction } from '../../ui-model/disclosure.ts';
import type { ComponentMetadataOptions } from '../../component/index.ts';
import type { Element, ElementMessage } from '../../element/index.ts';

export interface TextOptions extends ElementOptions<TextStylePart> {
  readonly content: string;
  readonly textRole?: ElementTextRole;
}

export interface RichTextOptions extends ElementOptions<TextStylePart> {
  readonly segments: InlineContent;
  readonly wrap?: boolean;
}

interface DisclosureOptionsBase<TChild extends Element<unknown>> {
  readonly id: string;
  readonly label: string;
  readonly summary?: InlineContent;
  readonly expanded: boolean;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles'], DisclosureStylePart>;
  readonly slots: { readonly content: TChild };
}

export interface ActiveDisclosureOptions<
  TMessage extends ComponentMessage,
  TChild extends Element<ComponentMessage>
>
  extends DisclosureOptionsBase<TChild> {
  readonly disabled?: false;
  readonly onAction: (action: DisclosureAction) => MessageResolution<TMessage>;
}

export interface DisabledDisclosureOptions<TChild extends Element<ComponentMessage>>
  extends DisclosureOptionsBase<TChild> {
  readonly disabled: true;
  readonly onAction?: never;
}

export type DisclosureOptions<
  TMessage extends ComponentMessage = never,
  TChild extends Element<ComponentMessage> = Element
> =
  | ActiveDisclosureOptions<TMessage, TChild>
  | DisabledDisclosureOptions<TChild>;

export type DisclosureMessage<
  TMessage extends ComponentMessage,
  TChild extends Element<ComponentMessage>
> = TMessage | ElementMessage<TChild>;

type ListCommonOptions<TValue> = ElementOptions<DataListStylePart> & ListDataOptions<TValue> & {
  readonly id: string;
  readonly selectedId?: string;
  readonly pointerState?: import('../../interaction/pointer-interaction.ts').PointerInteractionState;
};

type ListDataOptions<TValue> =
  | {
      readonly items: readonly TValue[];
      readonly projectItem: ListItemProjector<TValue>;
      readonly collection?: never;
      readonly filterQuery?: string;
    }
  | {
      readonly collection: CompleteListCollection<TValue>;
      readonly items?: never;
      readonly projectItem?: never;
      readonly filterQuery?: string;
    }
  | {
      readonly collection: WindowedListCollection<TValue>;
      readonly items?: never;
      readonly projectItem?: never;
      readonly filterQuery?: never;
    };

export type ListOptions<TValue, TMessage extends ComponentMessage = never> =
  | PassiveListOptions<TValue, TMessage>
  | ScrollableListOptions<TValue, TMessage>;

export type PassiveListOptions<TValue, TMessage extends ComponentMessage = never> = ListCommonOptions<TValue> & {
  readonly scroll?: never;
  readonly scrollbar?: never;
  readonly scrollPolicy?: never;
  readonly onAction?: (action: ListControlAction) => MessageResolution<TMessage>;
};

export type ScrollableListOptions<TValue, TMessage extends ComponentMessage = never> = ListCommonOptions<TValue> & {
  readonly scroll: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly onAction: (action: ListAction) => MessageResolution<TMessage>;
};

interface TreeCommonOptions {
  readonly id: string;
  readonly selected?: string;
  readonly emptyText?: string;
  readonly pointerState?: import('../../interaction/pointer-interaction.ts').PointerInteractionState;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles'], TreeStylePart>;
}

type TreeDataOptions<TMetadata extends Readonly<Record<string, unknown>>> =
  | {
      readonly nodes: readonly TreeNode<TMetadata>[];
      readonly collection?: never;
      readonly filterQuery?: string;
    }
  | {
      readonly collection: CompleteTreeCollection<TMetadata> | WindowedTreeCollection<TMetadata>;
      readonly nodes?: never;
      readonly filterQuery?: never;
    };

type TreeBaseOptions<TMetadata extends Readonly<Record<string, unknown>>> = TreeCommonOptions & TreeDataOptions<TMetadata>;

export type TreeOptions<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
  TMessage extends ComponentMessage = never
> = PassiveTreeOptions<TMetadata, TMessage> | ScrollableTreeOptions<TMetadata, TMessage>;

export type PassiveTreeOptions<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
  TMessage extends ComponentMessage = never
> = TreeBaseOptions<TMetadata> & {
  readonly scroll?: never;
  readonly scrollbar?: never;
  readonly scrollPolicy?: never;
  readonly onAction?: (action: TreeControlAction) => MessageResolution<TMessage>;
};

export type ScrollableTreeOptions<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
  TMessage extends ComponentMessage = never
> = TreeBaseOptions<TMetadata> & {
  readonly scroll: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly onAction: (action: TreeInteractionAction) => MessageResolution<TMessage>;
};

interface TableCommonOptions<TRow> {
  readonly id: string;
  readonly columns?: readonly TableColumn<TRow>[];
  readonly density?: ComponentDensity;
  readonly stickyHeader?: boolean;
  readonly emptyText?: string;
  readonly pointerState?: import('../../interaction/pointer-interaction.ts').PointerInteractionState;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles'], TableStylePart>;
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

type TableBaseOptions<TRow> = TableCommonOptions<TRow> & TableDataOptions<TRow>;

export type TableOptions<TRow, TMessage extends ComponentMessage = never> =
  | PassiveTableOptions<TRow, TMessage>
  | ScrollableTableOptions<TRow, TMessage>;

export type PassiveTableOptions<TRow, TMessage extends ComponentMessage = never> = TableBaseOptions<TRow> & {
  readonly presentation?: TablePresentation;
  readonly onAction?: (action: TableControlAction) => MessageResolution<TMessage>;
  readonly scrollbar?: never;
  readonly scrollPolicy?: never;
};

export type ScrollableTableOptions<TRow, TMessage extends ComponentMessage = never> = TableBaseOptions<TRow> & {
  readonly presentation: TableScrollablePresentation;
  readonly onAction: (action: TableAction) => MessageResolution<TMessage>;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
};

export interface PaginatorOptions<TMessage extends ComponentMessage = never> {
  readonly id: string;
  readonly pageNumber: number;
  readonly pageCount: number;
  readonly label?: string;
  readonly onAction: (action: PaginatorAction) => MessageResolution<TMessage>;
  readonly pointerState?: import('../../interaction/pointer-interaction.ts').PointerInteractionState;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles'], PaginatorStylePart>;
}

interface TextAreaBaseOptions {
  readonly id: string;
  readonly highlights?: readonly TextAreaHighlight[];
  readonly placeholder?: string;
  readonly lineNumbers?: boolean | TextAreaLineNumberOptions;
  readonly activeLine?: boolean;
  readonly wrap?: boolean | TextAreaWrapOptions;
  readonly required?: boolean;
  readonly error?: string;
  readonly readOnly?: boolean;
  readonly pointerState?: import('../../interaction/pointer-interaction.ts').PointerInteractionState;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles'], TextAreaStylePart>;
}

export type TextAreaOptions<TMessage extends ComponentMessage = never> =
  | UnscrolledTextAreaOptions<TMessage>
  | ScrollableTextAreaOptions<TMessage>
  | DisabledTextAreaOptions;

export type UnscrolledTextAreaOptions<TMessage extends ComponentMessage = never> =
  & TextAreaBaseOptions
  & {
    readonly disabled?: false;
    readonly presentation: Omit<TextAreaPresentation, 'scroll'> & { readonly scroll?: never };
    readonly scrollbar?: never;
    readonly scrollPolicy?: never;
    readonly onAction: (action: TextAreaControlAction) => MessageResolution<TMessage>;
  };

export type ScrollableTextAreaOptions<TMessage extends ComponentMessage = never> =
  & TextAreaBaseOptions
  & {
    readonly disabled?: false;
    readonly presentation: TextAreaScrollablePresentation;
    readonly scrollbar?: ScrollbarOptions;
    readonly scrollPolicy?: ScrollPolicy;
    readonly onAction: (action: TextAreaAction) => MessageResolution<TMessage>;
  };

export type DisabledTextAreaOptions = TextAreaBaseOptions & { readonly disabled: true; readonly readOnly?: never; readonly onAction?: never; readonly pointerState?: never } & (
  | {
      readonly presentation: Omit<TextAreaPresentation, 'scroll'> & { readonly scroll?: never };
      readonly scrollbar?: never;
      readonly scrollPolicy?: never;
    }
  | {
      readonly presentation: TextAreaScrollablePresentation;
      readonly scrollbar?: ScrollbarOptions;
      readonly scrollPolicy?: ScrollPolicy;
    }
);

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
