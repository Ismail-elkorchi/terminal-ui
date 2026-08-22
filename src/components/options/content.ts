import type { InlineContent } from '../../visual/inline-content.ts';
import type { ComponentMessage } from '../../component/index.ts';
import type { ScrollPolicy, ScrollState } from '../../interaction/scroll.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import type { TextContextMenuEvent } from '../../interaction/text-pointer.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import type {
  CompleteListboxCollection,
  ListboxActivateEvent,
  ListboxControlTransition,
  ListboxOptionProjector,
  ScrollableListboxPresentation,
  ListboxTransition,
  UnscrolledListboxPresentation,
  WindowedListboxCollection
} from '../../ui-model/list.ts';
import type {
  DataGridActivateEvent,
  DataGridControlTransition,
  ScrollableDataGridPresentation,
  DataGridTransition,
  CompleteTableCollection,
  TablePresentation,
  UnscrolledDataGridPresentation,
  WindowedTableCollection,
} from '../../ui-model/table.ts';
import type {
  PreparedTreeView,
  TreeActivateEvent,
  TreeControlTransition,
  ScrollableTreePresentation,
  TreeTransition,
  UnscrolledTreePresentation,
} from '../../ui-model/tree.ts';
import type { PaginationTransition } from '../../ui-model/pagination.ts';
import type { ComponentDensity } from '../../ui-model/contracts.ts';
import type {
  TextAreaAction,
  TextAreaControlAction,
  ScrollableTextAreaPresentation,
  UnscrolledTextAreaPresentation
} from '../../ui-model/text-area.ts';
import type {
  TableColumn,
  TextAreaHighlight,
  TextAreaLineNumberOptions,
  TextAreaWrapOptions
} from '../../ui-model/content.ts';
import type { ElementTextRole } from '../../element/metadata.ts';
import type {
  DataListStylePart,
  DisclosureStylePart,
  PaginationStylePart,
  RichTextStylePart,
  TableStylePart,
  TextAreaStylePart,
  TextStylePart,
  TreeStylePart
} from '../../ui-model/style-parts.ts';
import type { DisclosureAction } from '../../ui-model/disclosure.ts';
import type { ComponentMetadataOptions } from '../../component/index.ts';
import type { Element, ElementMessage } from '../../element/index.ts';

export interface TextOptions {
  readonly id?: string;
  readonly content: string;
  readonly textRole?: ElementTextRole;
  readonly headingLevel?: number;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<TextStylePart>;
  readonly meta?: ComponentMetadataOptions<readonly ['styles', 'layer']>;
}

export interface RichTextOptions {
  readonly id?: string;
  readonly segments: InlineContent;
  readonly wrap?: boolean | RichTextWrapOptions;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<RichTextStylePart>;
  readonly meta?: ComponentMetadataOptions<readonly ['styles', 'layer']>;
}

export interface RichTextWrapOptions {
  readonly preserveWords?: boolean;
}

interface DisclosureOptionsBase<TChild extends Element<unknown>> {
  readonly id: string;
  readonly label: string;
  readonly summary?: InlineContent;
  readonly expanded: boolean;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<DisclosureStylePart, 'focused' | 'hovered' | 'pressed' | 'disabled'>;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles']>;
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

type ListboxCommonOptions<TValue> = ListboxDataOptions<TValue> & {
  readonly id: string;
  readonly busy?: boolean;
  readonly inert?: boolean;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<DataListStylePart, 'focused' | 'hovered' | 'pressed' | 'active' | 'selected' | 'disabled' | 'busy'>;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles']>;
};

type ListboxDataOptions<TValue> =
  | {
      readonly items: readonly TValue[];
      readonly projectItem: ListboxOptionProjector<TValue>;
      readonly collection?: never;
      readonly query?: import('../../text/query.ts').CollectionQuery;
    }
  | {
      readonly collection: CompleteListboxCollection<TValue>;
      readonly items?: never;
      readonly projectItem?: never;
      readonly query?: import('../../text/query.ts').CollectionQuery;
    }
  | {
      readonly collection: WindowedListboxCollection<TValue>;
      readonly items?: never;
      readonly projectItem?: never;
      readonly query?: never;
    };

interface ActiveListboxCallbacks<TMessage extends ComponentMessage> {
  readonly disabled?: false;
  readonly inert?: false;
  readonly onTransition: (action: ListboxTransition) => MessageResolution<TMessage>;
  readonly onActivate?: (event: ListboxActivateEvent) => MessageResolution<TMessage>;
}

interface InertListboxCallbacks {
  readonly disabled?: false;
  readonly inert: true;
  readonly onTransition?: never;
  readonly onActivate?: never;
}

interface DisabledListboxCallbacks {
  readonly disabled: true;
  readonly onTransition?: never;
  readonly onActivate?: never;
  readonly busy?: never;
}

type UnavailableListboxCallbacks = DisabledListboxCallbacks | InertListboxCallbacks;

export type ListboxOptions<TValue, TMessage extends ComponentMessage = never> =
  | UnscrolledListboxOptions<TValue, TMessage>
  | ScrollableListboxOptions<TValue, TMessage>;

export type UnscrolledListboxOptions<TValue, TMessage extends ComponentMessage = never> = ListboxCommonOptions<TValue> & {
  readonly presentation: UnscrolledListboxPresentation;
  readonly scrollbar?: never;
  readonly scrollPolicy?: never;
} & (Omit<ActiveListboxCallbacks<TMessage>, 'onTransition'> & {
  readonly onTransition: (action: ListboxControlTransition) => MessageResolution<TMessage>;
} | UnavailableListboxCallbacks);

export type ScrollableListboxOptions<TValue, TMessage extends ComponentMessage = never> = ListboxCommonOptions<TValue> & {
  readonly presentation: ScrollableListboxPresentation;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
} & (ActiveListboxCallbacks<TMessage> | UnavailableListboxCallbacks);

interface TreeCommonOptions {
  readonly id: string;
  readonly emptyText?: string;
  readonly busy?: boolean;
  readonly inert?: boolean;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<TreeStylePart, 'focused' | 'hovered' | 'pressed' | 'active' | 'selected' | 'disabled' | 'busy'>;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles']>;
}

type TreeBaseOptions<TMetadata extends Readonly<Record<string, unknown>>> = TreeCommonOptions & {
  readonly view: PreparedTreeView<TMetadata>;
};

export type TreeOptions<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
  TTransitionMessage extends ComponentMessage = never,
  TActivateMessage extends ComponentMessage = TTransitionMessage,
> = UnscrolledTreeOptions<TMetadata, TTransitionMessage, TActivateMessage>
  | ScrollableTreeOptions<TMetadata, TTransitionMessage, TActivateMessage>;

interface ActiveTreeCallbacks<
  TTransitionMessage extends ComponentMessage,
  TActivateMessage extends ComponentMessage,
> {
  readonly disabled?: false;
  readonly inert?: false;
  readonly onTransition: (action: TreeTransition) => MessageResolution<TTransitionMessage>;
  readonly onActivate?: (event: TreeActivateEvent) => MessageResolution<TActivateMessage>;
}

interface InertTreeCallbacks {
  readonly disabled?: false;
  readonly inert: true;
  readonly onTransition?: never;
  readonly onActivate?: never;
}

interface DisabledTreeCallbacks {
  readonly disabled: true;
  readonly onTransition?: never;
  readonly onActivate?: never;
  readonly busy?: never;
}

type UnavailableTreeCallbacks = DisabledTreeCallbacks | InertTreeCallbacks;

export type UnscrolledTreeOptions<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
  TTransitionMessage extends ComponentMessage = never,
  TActivateMessage extends ComponentMessage = TTransitionMessage,
> = TreeBaseOptions<TMetadata> & {
  readonly presentation: UnscrolledTreePresentation;
  readonly scrollbar?: never;
  readonly scrollPolicy?: never;
} & (Omit<ActiveTreeCallbacks<TTransitionMessage, TActivateMessage>, 'onTransition'> & {
  readonly onTransition: (action: TreeControlTransition) => MessageResolution<TTransitionMessage>;
} | UnavailableTreeCallbacks);

export type ScrollableTreeOptions<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
  TTransitionMessage extends ComponentMessage = never,
  TActivateMessage extends ComponentMessage = TTransitionMessage,
> = TreeBaseOptions<TMetadata> & {
  readonly presentation: ScrollableTreePresentation;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
} & (ActiveTreeCallbacks<TTransitionMessage, TActivateMessage> | UnavailableTreeCallbacks);

interface TableCommonOptions {
  readonly id: string;
  readonly density?: ComponentDensity;
  readonly stickyHeader?: boolean;
  readonly emptyText?: string;
}

type TableDataOptions<TRow> =
  | {
      readonly rows: readonly TRow[];
      readonly getRowId: (row: TRow, index: number) => string;
      readonly collection?: never;
      readonly columns?: readonly TableColumn<TRow>[];
    }
  | {
      readonly collection: CompleteTableCollection<TRow>;
      readonly rows?: never;
      readonly getRowId?: never;
      readonly columns?: readonly TableColumn<TRow>[];
    }
  | {
      readonly collection: WindowedTableCollection<TRow>;
      readonly rows?: never;
      readonly getRowId?: never;
      readonly columns: readonly TableColumn<TRow>[];
    };

interface TableOptionsBase extends TableCommonOptions {
  readonly presentation?: TablePresentation;
  readonly busy?: boolean;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<TableStylePart, 'active' | 'selected'>;
  readonly meta?: ComponentMetadataOptions<readonly ['layer', 'styles']>;
}

export type UnscrolledTableOptions<TRow> = TableOptionsBase & TableDataOptions<TRow> & {
  readonly scroll?: never;
  readonly scrollbar?: never;
  readonly scrollPolicy?: never;
};

export type ScrollableTableOptions<TRow, TMessage extends ComponentMessage = never> =
  TableOptionsBase & TableDataOptions<TRow> & {
  readonly scroll: {
    readonly state: ScrollState;
    readonly onTransition: (event: import('../../interaction/scroll.ts').ScrollEvent) => MessageResolution<TMessage>;
  };
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
};

export type TableOptions<TRow, TMessage extends ComponentMessage = never> =
  | UnscrolledTableOptions<TRow>
  | ScrollableTableOptions<TRow, TMessage>;

interface DataGridCallbacks<
  TTransition,
  TTransitionMessage extends ComponentMessage,
  TActivateMessage extends ComponentMessage,
> {
  readonly onTransition: (transition: TTransition) => MessageResolution<TTransitionMessage>;
  readonly onActivate?: (event: DataGridActivateEvent) => MessageResolution<TActivateMessage>;
}

interface UnavailableDataGridCallbacks {
  readonly onTransition?: never;
  readonly onActivate?: never;
}

interface DataGridBaseOptions extends TableCommonOptions {
  readonly disabled?: boolean;
  readonly busy?: boolean;
  readonly inert?: boolean;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<TableStylePart, 'focused' | 'hovered' | 'pressed' | 'active' | 'selected' | 'disabled' | 'busy'>;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles']>;
}

type DataGridAvailability<
  TTransition,
  TTransitionMessage extends ComponentMessage,
  TActivateMessage extends ComponentMessage,
> =
    | (DataGridCallbacks<TTransition, TTransitionMessage, TActivateMessage> & {
        readonly disabled?: false;
        readonly inert?: false;
      })
    | (UnavailableDataGridCallbacks & (
        | {
            readonly disabled: true;
            readonly inert?: boolean;
          }
        | {
            readonly inert: true;
            readonly disabled?: false;
          }
      ));

export type UnscrolledDataGridOptions<
  TRow,
  TTransitionMessage extends ComponentMessage = never,
  TActivateMessage extends ComponentMessage = TTransitionMessage,
> = DataGridBaseOptions & TableDataOptions<TRow> & {
  readonly presentation: UnscrolledDataGridPresentation;
  readonly scrollbar?: never;
  readonly scrollPolicy?: never;
} & DataGridAvailability<DataGridControlTransition, TTransitionMessage, TActivateMessage>;

export type ScrollableDataGridOptions<
  TRow,
  TTransitionMessage extends ComponentMessage = never,
  TActivateMessage extends ComponentMessage = TTransitionMessage,
> = DataGridBaseOptions & TableDataOptions<TRow> & {
  readonly presentation: ScrollableDataGridPresentation;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
} & DataGridAvailability<DataGridTransition, TTransitionMessage, TActivateMessage>;

export type DataGridOptions<
  TRow,
  TTransitionMessage extends ComponentMessage = never,
  TActivateMessage extends ComponentMessage = TTransitionMessage,
> = UnscrolledDataGridOptions<TRow, TTransitionMessage, TActivateMessage>
  | ScrollableDataGridOptions<TRow, TTransitionMessage, TActivateMessage>;

export type { DataGridControlTransition };

export interface PaginationOptions<TMessage extends ComponentMessage = never> {
  readonly id: string;
  readonly pageNumber: number;
  readonly pageCount: number;
  readonly label?: string;
  readonly onAction: (action: PaginationTransition) => MessageResolution<TMessage>;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<PaginationStylePart, 'focused' | 'hovered' | 'pressed' | 'disabled'>;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles']>;
}

interface TextAreaBaseOptions {
  readonly id: string;
  readonly highlights?: readonly TextAreaHighlight[];
  readonly placeholder?: string;
  readonly lineNumbers?: boolean | TextAreaLineNumberOptions;
  readonly highlightActiveLine?: boolean;
  readonly wrap?: boolean | TextAreaWrapOptions;
  readonly required?: boolean;
  readonly error?: string;
  readonly readOnly?: boolean;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<TextAreaStylePart, 'focused' | 'hovered' | 'active' | 'selected' | 'disabled' | 'readOnly'>;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles']>;
}

export type TextAreaOptions<TMessage extends ComponentMessage = never> =
  | UnscrolledTextAreaOptions<TMessage>
  | ScrollableTextAreaOptions<TMessage>
  | DisabledTextAreaOptions;

export type UnscrolledTextAreaOptions<TMessage extends ComponentMessage = never> =
  & TextAreaBaseOptions
  & {
    readonly disabled?: false;
    readonly presentation: UnscrolledTextAreaPresentation;
    readonly scrollbar?: never;
    readonly scrollPolicy?: never;
    readonly onAction: (action: TextAreaControlAction) => MessageResolution<TMessage>;
    readonly onContextMenu?: (event: TextContextMenuEvent) => MessageResolution<TMessage>;
  };

export type ScrollableTextAreaOptions<TMessage extends ComponentMessage = never> =
  & TextAreaBaseOptions
  & {
    readonly disabled?: false;
    readonly presentation: ScrollableTextAreaPresentation;
    readonly scrollbar?: ScrollbarOptions;
    readonly scrollPolicy?: ScrollPolicy;
    readonly onAction: (action: TextAreaAction) => MessageResolution<TMessage>;
    readonly onContextMenu?: (event: TextContextMenuEvent) => MessageResolution<TMessage>;
  };

export type DisabledTextAreaOptions = TextAreaBaseOptions & {
  readonly disabled: true;
  readonly readOnly?: never;
  readonly onAction?: never;
  readonly onContextMenu?: never;
} & (
  | {
      readonly presentation: UnscrolledTextAreaPresentation;
      readonly scrollbar?: never;
      readonly scrollPolicy?: never;
    }
  | {
      readonly presentation: ScrollableTextAreaPresentation;
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
