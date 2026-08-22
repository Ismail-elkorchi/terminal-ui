import type { ScrollPolicy, ScrollState } from '../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import type { AnchoredSurfacePlacement } from '../../interaction/anchored-surface.ts';
import type {
  CommandInputDisplay,
  CommandInputValidation
} from '../../ui-model/documents.ts';
import type { LogHistory } from '../../ui-model/log-history.ts';
import type {
  CommandInputPresentation,
  CommandInputSubmitEvent,
  CommandInputTransition,
} from '../../ui-model/command-input.ts';
import type {
  SearchPickerAcceptEvent,
  SearchPickerControlTransition,
  ScrollableSearchPickerPresentation,
  SearchPickerTransition,
  UnscrolledSearchPickerPresentation,
} from '../../ui-model/search-picker.ts';
import type { SearchPickerIndex } from '../../ui-model/search-picker-index.ts';
import type { LogViewerAction, LogViewerControlAction } from '../../ui-model/log-viewer.ts';
import type {
  LogViewerContextMenuEvent,
  LogViewerSelection,
} from '../../ui-model/log-viewer.ts';
import type { ComponentMessage, ComponentMetadataOptions } from '../../component/index.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import type { TextContextMenuEvent } from '../../interaction/text-pointer.ts';
import type {
  CommandInputStylePart,
  LogViewerStylePart,
  SearchPickerStylePart
} from '../../ui-model/style-parts.ts';

interface LogViewerBaseOptions {
  readonly id: string;
  readonly history: LogHistory;
  readonly wrap?: boolean;
  readonly query?: import('../../text/query.ts').CollectionQuery;
  readonly activeMatchId?: string;
  readonly foldedIds?: readonly string[];
  readonly selection?: LogViewerSelection;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<LogViewerStylePart, 'focused' | 'hovered' | 'active' | 'selected' | 'disabled'>;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles']>;
}

export type LogViewerOptions<TMessage extends ComponentMessage = never> =
  | UnscrolledLogViewerOptions<TMessage>
  | ScrollableLogViewerOptions<TMessage>;

export type UnscrolledLogViewerOptions<TMessage extends ComponentMessage = never> = LogViewerBaseOptions & {
  readonly scroll?: never;
  readonly scrollbar?: never;
  readonly scrollPolicy?: never;
} & (
  | {
      readonly onAction: (action: LogViewerControlAction) => MessageResolution<TMessage>;
      readonly onContextMenu?: (event: LogViewerContextMenuEvent) => MessageResolution<TMessage>;
    }
  | {
      readonly onAction?: never;
      readonly onContextMenu?: never;
    }
);

export interface ScrollableLogViewerOptions<TMessage extends ComponentMessage = never> extends LogViewerBaseOptions {
  readonly scroll: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly onAction: (action: LogViewerAction) => MessageResolution<TMessage>;
  readonly onContextMenu?: (event: LogViewerContextMenuEvent) => MessageResolution<TMessage>;
}

interface CommandInputOptionsBase {
  readonly id: string;
  readonly presentation: CommandInputPresentation;
  readonly prompt?: string;
  readonly placeholder?: string;
  readonly completionPreview?: string;
  readonly validation?: CommandInputValidation;
  readonly footer?: string;
  readonly query?: import('../../text/query.ts').CollectionQuery;
  readonly display?: CommandInputDisplay;
  readonly placement?: AnchoredSurfacePlacement;
  readonly maxVisibleSuggestions?: number;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<CommandInputStylePart, 'focused' | 'hovered' | 'pressed' | 'active' | 'selected' | 'disabled' | 'readOnly'>;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles']>;
}

export type CommandInputOptions<
  TTransitionMessage extends ComponentMessage = never,
  TSubmitMessage extends ComponentMessage = TTransitionMessage,
> = CommandInputOptionsBase & (
  | {
      readonly disabled: true;
      readonly readOnly?: never;
      readonly onTransition?: never;
      readonly onSubmit?: never;
      readonly onContextMenu?: never;
    }
  | {
      readonly disabled?: false;
      readonly readOnly?: boolean;
      readonly onTransition: (transition: CommandInputTransition) => MessageResolution<TTransitionMessage>;
      readonly onSubmit?: (event: CommandInputSubmitEvent) => MessageResolution<TSubmitMessage>;
      readonly onContextMenu?: (event: TextContextMenuEvent) => MessageResolution<TTransitionMessage>;
    }
);

interface SearchPickerOptionsBase<TValue> {
  readonly id: string;
  readonly title?: string;
  readonly searchPickerIndex: SearchPickerIndex<TValue>;
  readonly maxVisible?: number;
  readonly helpText?: string;
  readonly emptyText?: string;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<SearchPickerStylePart, 'focused' | 'hovered' | 'pressed' | 'active' | 'selected' | 'disabled' | 'busy' | 'readOnly'>;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles']>;
}

interface ActiveSearchPickerCallbacks<
  TTransitionMessage extends ComponentMessage,
  TAcceptMessage extends ComponentMessage,
  TTransition,
> {
  readonly disabled?: false;
  readonly readOnly?: boolean;
  readonly busy?: boolean;
  readonly inert?: false;
  readonly onTransition: (transition: TTransition) => MessageResolution<TTransitionMessage>;
  readonly onAccept?: (event: SearchPickerAcceptEvent) => MessageResolution<TAcceptMessage>;
  readonly onContextMenu?: (event: TextContextMenuEvent) => MessageResolution<TTransitionMessage>;
}

interface InertSearchPickerCallbacks {
  readonly disabled?: false;
  readonly readOnly?: never;
  readonly busy?: boolean;
  readonly inert: true;
  readonly onTransition?: never;
  readonly onAccept?: never;
  readonly onContextMenu?: never;
}

interface DisabledSearchPickerCallbacks {
  readonly disabled: true;
  readonly readOnly?: never;
  readonly busy?: never;
  readonly inert?: never;
  readonly onTransition?: never;
  readonly onAccept?: never;
  readonly onContextMenu?: never;
}

export type UnscrolledSearchPickerOptions<
  TValue = string,
  TTransitionMessage extends ComponentMessage = never,
  TAcceptMessage extends ComponentMessage = TTransitionMessage,
> = SearchPickerOptionsBase<TValue> & {
  readonly presentation: UnscrolledSearchPickerPresentation;
  readonly scrollbar?: never;
  readonly scrollPolicy?: never;
} & (ActiveSearchPickerCallbacks<
  TTransitionMessage,
  TAcceptMessage,
  SearchPickerControlTransition
> | DisabledSearchPickerCallbacks | InertSearchPickerCallbacks);

export type ScrollableSearchPickerOptions<
  TValue = string,
  TTransitionMessage extends ComponentMessage = never,
  TAcceptMessage extends ComponentMessage = TTransitionMessage,
> = SearchPickerOptionsBase<TValue> & {
  readonly presentation: ScrollableSearchPickerPresentation;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
} & (ActiveSearchPickerCallbacks<
  TTransitionMessage,
  TAcceptMessage,
  SearchPickerTransition
> | DisabledSearchPickerCallbacks | InertSearchPickerCallbacks);

export type SearchPickerOptions<
  TValue = string,
  TTransitionMessage extends ComponentMessage = never,
  TAcceptMessage extends ComponentMessage = TTransitionMessage,
> = UnscrolledSearchPickerOptions<TValue, TTransitionMessage, TAcceptMessage>
  | ScrollableSearchPickerOptions<TValue, TTransitionMessage, TAcceptMessage>;

export type {
  CommandInputDisplay,
  CommandInputValidation
} from '../../ui-model/documents.ts';
export type { LogHistory, LogEntry } from '../../ui-model/log-history.ts';
