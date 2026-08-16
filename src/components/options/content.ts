import type { InlineContent } from '../../visual/inline-content.ts';
import type { ComponentMessage } from '../../component/index.ts';
import type { ScrollPolicy, ScrollState } from '../../interaction/scroll.ts';
import type { MessageResolution } from '../../interaction/message.ts';
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
import type { PointerInteractionAction } from '../../interaction/pointer-interaction.ts';
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
import type { PaginationAction } from '../../ui-model/pagination.ts';
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
  readonly meta?: ComponentMetadataOptions<readonly ['styles', 'layer'], TextStylePart>;
}

export interface RichTextOptions {
  readonly id?: string;
  readonly segments: InlineContent;
  readonly wrap?: boolean;
  readonly meta?: ComponentMetadataOptions<readonly ['styles', 'layer'], TextStylePart>;
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

type ListboxCommonOptions<TValue> = ListboxDataOptions<TValue> & {
  readonly id: string;
  readonly pointerState?: import('../../interaction/pointer-interaction.ts').PointerInteractionState;
  readonly busy?: boolean;
  readonly inert?: boolean;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles'], DataListStylePart>;
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
  readonly onPointerAction?: (action: PointerInteractionAction) => MessageResolution<TMessage>;
}

interface InertListboxCallbacks {
  readonly disabled?: false;
  readonly inert: true;
  readonly pointerState?: never;
  readonly onTransition?: never;
  readonly onActivate?: never;
  readonly onPointerAction?: never;
}

interface DisabledListboxCallbacks {
  readonly disabled: true;
  readonly onTransition?: never;
  readonly onActivate?: never;
  readonly onPointerAction?: never;
  readonly pointerState?: never;
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
  readonly pointerState?: import('../../interaction/pointer-interaction.ts').PointerInteractionState;
  readonly busy?: boolean;
  readonly inert?: boolean;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles'], TreeStylePart>;
}

type TreeBaseOptions<TMetadata extends Readonly<Record<string, unknown>>> = TreeCommonOptions & {
  readonly view: PreparedTreeView<TMetadata>;
};

export type TreeOptions<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
  TTransitionMessage extends ComponentMessage = never,
  TActivateMessage extends ComponentMessage = TTransitionMessage,
  TPointerMessage extends ComponentMessage = TTransitionMessage,
> = UnscrolledTreeOptions<TMetadata, TTransitionMessage, TActivateMessage, TPointerMessage>
  | ScrollableTreeOptions<TMetadata, TTransitionMessage, TActivateMessage, TPointerMessage>;

interface ActiveTreeCallbacks<
  TTransitionMessage extends ComponentMessage,
  TActivateMessage extends ComponentMessage,
  TPointerMessage extends ComponentMessage,
> {
  readonly disabled?: false;
  readonly inert?: false;
  readonly onTransition: (action: TreeTransition) => MessageResolution<TTransitionMessage>;
  readonly onActivate?: (event: TreeActivateEvent) => MessageResolution<TActivateMessage>;
  readonly onPointerAction?: (action: PointerInteractionAction) => MessageResolution<TPointerMessage>;
}

interface InertTreeCallbacks {
  readonly disabled?: false;
  readonly inert: true;
  readonly pointerState?: never;
  readonly onTransition?: never;
  readonly onActivate?: never;
  readonly onPointerAction?: never;
}

interface DisabledTreeCallbacks {
  readonly disabled: true;
  readonly onTransition?: never;
  readonly onActivate?: never;
  readonly onPointerAction?: never;
  readonly pointerState?: never;
  readonly busy?: never;
}

type UnavailableTreeCallbacks = DisabledTreeCallbacks | InertTreeCallbacks;

export type UnscrolledTreeOptions<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
  TTransitionMessage extends ComponentMessage = never,
  TActivateMessage extends ComponentMessage = TTransitionMessage,
  TPointerMessage extends ComponentMessage = TTransitionMessage,
> = TreeBaseOptions<TMetadata> & {
  readonly presentation: UnscrolledTreePresentation;
  readonly scrollbar?: never;
  readonly scrollPolicy?: never;
} & (Omit<ActiveTreeCallbacks<TTransitionMessage, TActivateMessage, TPointerMessage>, 'onTransition'> & {
  readonly onTransition: (action: TreeControlTransition) => MessageResolution<TTransitionMessage>;
} | UnavailableTreeCallbacks);

export type ScrollableTreeOptions<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
  TTransitionMessage extends ComponentMessage = never,
  TActivateMessage extends ComponentMessage = TTransitionMessage,
  TPointerMessage extends ComponentMessage = TTransitionMessage,
> = TreeBaseOptions<TMetadata> & {
  readonly presentation: ScrollableTreePresentation;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
} & (ActiveTreeCallbacks<TTransitionMessage, TActivateMessage, TPointerMessage> | UnavailableTreeCallbacks);

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
  readonly meta?: ComponentMetadataOptions<readonly ['layer', 'styles'], TableStylePart>;
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
  TPointerMessage extends ComponentMessage,
> {
  readonly onTransition: (transition: TTransition) => MessageResolution<TTransitionMessage>;
  readonly onActivate?: (event: DataGridActivateEvent) => MessageResolution<TActivateMessage>;
  readonly onPointerAction?: (action: PointerInteractionAction) => MessageResolution<TPointerMessage>;
}

interface UnavailableDataGridCallbacks {
  readonly onTransition?: never;
  readonly onActivate?: never;
  readonly onPointerAction?: never;
}

interface DataGridBaseOptions extends TableCommonOptions {
  readonly pointerState?: import('../../interaction/pointer-interaction.ts').PointerInteractionState;
  readonly disabled?: boolean;
  readonly busy?: boolean;
  readonly inert?: boolean;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles'], TableStylePart>;
}

type DataGridAvailability<
  TTransition,
  TTransitionMessage extends ComponentMessage,
  TActivateMessage extends ComponentMessage,
  TPointerMessage extends ComponentMessage,
> =
    | (DataGridCallbacks<TTransition, TTransitionMessage, TActivateMessage, TPointerMessage> & {
        readonly disabled?: false;
        readonly inert?: false;
      })
    | (UnavailableDataGridCallbacks & (
        | {
            readonly disabled: true;
            readonly inert?: boolean;
            readonly pointerState?: never;
          }
        | {
            readonly inert: true;
            readonly disabled?: false;
            readonly pointerState?: never;
          }
      ));

export type UnscrolledDataGridOptions<
  TRow,
  TTransitionMessage extends ComponentMessage = never,
  TActivateMessage extends ComponentMessage = TTransitionMessage,
  TPointerMessage extends ComponentMessage = TTransitionMessage,
> = DataGridBaseOptions & TableDataOptions<TRow> & {
  readonly presentation: UnscrolledDataGridPresentation;
  readonly scrollbar?: never;
  readonly scrollPolicy?: never;
} & DataGridAvailability<DataGridControlTransition, TTransitionMessage, TActivateMessage, TPointerMessage>;

export type ScrollableDataGridOptions<
  TRow,
  TTransitionMessage extends ComponentMessage = never,
  TActivateMessage extends ComponentMessage = TTransitionMessage,
  TPointerMessage extends ComponentMessage = TTransitionMessage,
> = DataGridBaseOptions & TableDataOptions<TRow> & {
  readonly presentation: ScrollableDataGridPresentation;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
} & DataGridAvailability<DataGridTransition, TTransitionMessage, TActivateMessage, TPointerMessage>;

export type DataGridOptions<
  TRow,
  TTransitionMessage extends ComponentMessage = never,
  TActivateMessage extends ComponentMessage = TTransitionMessage,
  TPointerMessage extends ComponentMessage = TTransitionMessage,
> = UnscrolledDataGridOptions<TRow, TTransitionMessage, TActivateMessage, TPointerMessage>
  | ScrollableDataGridOptions<TRow, TTransitionMessage, TActivateMessage, TPointerMessage>;

export type { DataGridControlTransition };

export interface PaginationOptions<TMessage extends ComponentMessage = never> {
  readonly id: string;
  readonly pageNumber: number;
  readonly pageCount: number;
  readonly label?: string;
  readonly onAction: (action: PaginationAction) => MessageResolution<TMessage>;
  readonly pointerState?: import('../../interaction/pointer-interaction.ts').PointerInteractionState;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles'], PaginationStylePart>;
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
    readonly presentation: UnscrolledTextAreaPresentation;
    readonly scrollbar?: never;
    readonly scrollPolicy?: never;
    readonly onAction: (action: TextAreaControlAction) => MessageResolution<TMessage>;
    readonly onPointerAction?: (action: PointerInteractionAction) => MessageResolution<TMessage>;
  };

export type ScrollableTextAreaOptions<TMessage extends ComponentMessage = never> =
  & TextAreaBaseOptions
  & {
    readonly disabled?: false;
    readonly presentation: ScrollableTextAreaPresentation;
    readonly scrollbar?: ScrollbarOptions;
    readonly scrollPolicy?: ScrollPolicy;
    readonly onAction: (action: TextAreaAction) => MessageResolution<TMessage>;
    readonly onPointerAction?: (action: PointerInteractionAction) => MessageResolution<TMessage>;
  };

export type DisabledTextAreaOptions = TextAreaBaseOptions & { readonly disabled: true; readonly readOnly?: never; readonly onAction?: never; readonly onPointerAction?: never; readonly pointerState?: never } & (
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
