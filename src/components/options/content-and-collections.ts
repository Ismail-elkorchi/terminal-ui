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
  ListboxOptionMapper,
  ScrollableListboxState,
  ListboxTransition,
  UnscrolledListboxState,
  WindowedListboxCollection
} from '../../behavior/listbox.ts';
import type {
  DataGridActivateEvent,
  DataGridControlTransition,
  ScrollableDataGridState,
  DataGridTransition,
  CompleteTableCollection,
  TableState,
  UnscrolledDataGridState,
  WindowedTableCollection,
} from '../../behavior/table.ts';
import type {
  TreeView,
  TreeActivateEvent,
  TreeControlTransition,
  ScrollableTreeState,
  TreeTransition,
  UnscrolledTreeState,
} from '../../behavior/tree.ts';
import type { PaginationControlTransition } from '../../behavior/pagination.ts';
import type { ComponentDensity } from '../density.ts';
import type {
  TextAreaTransition,
  TextAreaControlTransition,
  ScrollableTextAreaControlState,
  UnscrolledTextAreaControlState
} from '../../behavior/text-area.ts';
import type { TableColumn } from '../table-column.ts';
import type {
  TextAreaLineNumberOptions,
  TextAreaWrapOptions
} from '../text-area.ts';
import type { TextAreaDecorations } from '../text-area-decorations.ts';
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
} from '../style-parts.ts';
import type { DisclosureTransition } from '../disclosure.ts';
import type { ComponentMetadataOptions } from '../../component/index.ts';
import type { Element, ElementMessage } from '../../element/index.ts';
import type { KeyModifiers, MouseButton, MouseModifiers } from '../../input/index.ts';
import type { TerminalLink } from '../../visual/render-content.ts';

export interface TextOptions {
  readonly id?: string;
  readonly content: string;
  readonly textRole?: ElementTextRole;
  readonly headingLevel?: number;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<TextStylePart>;
  readonly meta?: ComponentMetadataOptions<readonly ['styles', 'layer']>;
}

export interface RichTextLinkActivateEvent {
  readonly kind: 'activate';
  readonly link: TerminalLink;
  readonly trigger:
    | { readonly kind: 'keyboard'; readonly modifiers: KeyModifiers }
    | { readonly kind: 'pointer'; readonly button: MouseButton; readonly modifiers: MouseModifiers };
}

export interface RichTextOptions<TMessage extends ComponentMessage = never> {
  readonly id?: string;
  readonly segments: InlineContent;
  readonly wrap?: boolean | RichTextWrapOptions;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<
    RichTextStylePart,
    'focused' | 'hovered' | 'pressed'
  >;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'styles', 'layer']>;
  readonly onLinkActivate?: (event: RichTextLinkActivateEvent) => MessageResolution<TMessage>;
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
  readonly onTransition: (transition: DisclosureTransition) => MessageResolution<TMessage>;
}

export interface DisabledDisclosureOptions<TChild extends Element<ComponentMessage>>
  extends DisclosureOptionsBase<TChild> {
  readonly disabled: true;
  readonly onTransition?: never;
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
      readonly toOption: ListboxOptionMapper<TValue>;
      readonly collection?: never;
      readonly query?: import('../../text/query.ts').CollectionQuery;
    }
  | {
      readonly collection: CompleteListboxCollection<TValue>;
      readonly items?: never;
      readonly toOption?: never;
      readonly query?: import('../../text/query.ts').CollectionQuery;
    }
  | {
      readonly collection: WindowedListboxCollection<TValue>;
      readonly items?: never;
      readonly toOption?: never;
      readonly query?: never;
    };

interface ActiveListboxCallbacks<TMessage extends ComponentMessage> {
  readonly disabled?: false;
  readonly inert?: false;
  readonly onTransition: (transition: ListboxTransition) => MessageResolution<TMessage>;
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
  readonly state: UnscrolledListboxState;
  readonly scrollbar?: never;
  readonly scrollPolicy?: never;
} & (Omit<ActiveListboxCallbacks<TMessage>, 'onTransition'> & {
  readonly onTransition: (transition: ListboxControlTransition) => MessageResolution<TMessage>;
} | UnavailableListboxCallbacks);

export type ScrollableListboxOptions<TValue, TMessage extends ComponentMessage = never> = ListboxCommonOptions<TValue> & {
  readonly state: ScrollableListboxState;
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
  readonly view: TreeView<TMetadata>;
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
  readonly onTransition: (transition: TreeTransition) => MessageResolution<TTransitionMessage>;
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
  readonly state: UnscrolledTreeState;
  readonly scrollbar?: never;
  readonly scrollPolicy?: never;
} & (Omit<ActiveTreeCallbacks<TTransitionMessage, TActivateMessage>, 'onTransition'> & {
  readonly onTransition: (transition: TreeControlTransition) => MessageResolution<TTransitionMessage>;
} | UnavailableTreeCallbacks);

export type ScrollableTreeOptions<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
  TTransitionMessage extends ComponentMessage = never,
  TActivateMessage extends ComponentMessage = TTransitionMessage,
> = TreeBaseOptions<TMetadata> & {
  readonly state: ScrollableTreeState;
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
  readonly state?: TableState;
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
    readonly onScroll: (request: import('../../interaction/scroll.ts').ScrollRequest) => MessageResolution<TMessage>;
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
  readonly state: UnscrolledDataGridState;
  readonly scrollbar?: never;
  readonly scrollPolicy?: never;
} & DataGridAvailability<DataGridControlTransition, TTransitionMessage, TActivateMessage>;

export type ScrollableDataGridOptions<
  TRow,
  TTransitionMessage extends ComponentMessage = never,
  TActivateMessage extends ComponentMessage = TTransitionMessage,
> = DataGridBaseOptions & TableDataOptions<TRow> & {
  readonly state: ScrollableDataGridState;
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
  readonly onTransition: (transition: PaginationControlTransition) => MessageResolution<TMessage>;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<PaginationStylePart, 'focused' | 'hovered' | 'pressed' | 'disabled'>;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles']>;
}

interface TextAreaBaseOptions {
  readonly id: string;
  readonly decorations?: TextAreaDecorations;
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
    readonly state: UnscrolledTextAreaControlState;
    readonly scrollbar?: never;
    readonly scrollPolicy?: never;
    readonly onTransition: (transition: TextAreaControlTransition) => MessageResolution<TMessage>;
    readonly onContextMenu?: (event: TextContextMenuEvent) => MessageResolution<TMessage>;
  };

export type ScrollableTextAreaOptions<TMessage extends ComponentMessage = never> =
  & TextAreaBaseOptions
  & {
    readonly disabled?: false;
    readonly state: ScrollableTextAreaControlState;
    readonly scrollbar?: ScrollbarOptions;
    readonly scrollPolicy?: ScrollPolicy;
    readonly onTransition: (transition: TextAreaTransition) => MessageResolution<TMessage>;
    readonly onContextMenu?: (event: TextContextMenuEvent) => MessageResolution<TMessage>;
  };

export type DisabledTextAreaOptions = TextAreaBaseOptions & {
  readonly disabled: true;
  readonly readOnly?: never;
  readonly onTransition?: never;
  readonly onContextMenu?: never;
} & (
  | {
      readonly state: UnscrolledTextAreaControlState;
      readonly scrollbar?: never;
      readonly scrollPolicy?: never;
    }
  | {
      readonly state: ScrollableTextAreaControlState;
      readonly scrollbar?: ScrollbarOptions;
      readonly scrollPolicy?: ScrollPolicy;
  }
);

export type {
  TableCellRenderInput,
  TableColumn,
  TableColumnBuilder,
  TableColumnDefinition,
  TableColumnAlignment,
  TableColumnSemantic,
  TableColumnWidth,
  TableCustomColumn,
  TableValueColumn,
} from '../table-column.ts';
export type {
  TextAreaConcealDecoration,
  TextAreaDecoration,
  TextAreaLineNumberOptions,
  TextAreaReplacementDecoration,
  TextAreaStyleDecoration,
  TextAreaWrapOptions
} from '../text-area.ts';
export type {
  CreateTextAreaDecorationsInput,
  MapTextAreaDecorationsThroughChangesInput,
  TextAreaDecorations,
} from '../text-area-decorations.ts';
