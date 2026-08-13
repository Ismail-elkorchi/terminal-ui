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
  SearchPickerPresentation,
  SearchPickerTransition,
} from '../../ui-model/search-picker.ts';
import type { SearchPickerIndex } from '../../ui-model/search-picker-index.ts';
import type { LogViewerAction, LogViewerControlAction } from '../../ui-model/log-viewer.ts';
import type { LogViewerSelection } from '../../ui-model/log-viewer.ts';
import type { LogSearchMatch } from '../../ui-model/log-history.ts';
import type { ComponentMessage, ComponentMetadataOptions } from '../../component/index.ts';
import type { PointerInteractionState } from '../../interaction/pointer-interaction.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import type {
  CommandInputStylePart,
  LogViewerStylePart,
  SearchPickerStylePart
} from '../../ui-model/style-parts.ts';

interface LogViewerBaseOptions {
  readonly id: string;
  readonly history: LogHistory;
  readonly wrap?: boolean;
  readonly searchQuery?: string;
  readonly activeMatch?: LogSearchMatch;
  readonly foldedIds?: readonly string[];
  readonly selection?: LogViewerSelection;
  readonly pointerState?: PointerInteractionState;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles'], LogViewerStylePart>;
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
      readonly onPointerAction?: (action: import('../../interaction/pointer-interaction.ts').PointerInteractionAction) => MessageResolution<TMessage>;
    }
  | {
      readonly onAction?: never;
      readonly onPointerAction?: never;
      readonly pointerState?: never;
    }
);

export interface ScrollableLogViewerOptions<TMessage extends ComponentMessage = never> extends LogViewerBaseOptions {
  readonly scroll: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly onAction: (action: LogViewerAction) => MessageResolution<TMessage>;
  readonly onPointerAction?: (action: import('../../interaction/pointer-interaction.ts').PointerInteractionAction) => MessageResolution<TMessage>;
}

interface CommandInputOptionsBase {
  readonly id: string;
  readonly presentation: CommandInputPresentation;
  readonly prompt?: string;
  readonly placeholder?: string;
  readonly completionPreview?: string;
  readonly validation?: CommandInputValidation;
  readonly footer?: string;
  readonly matchQuery?: string;
  readonly display?: CommandInputDisplay;
  readonly placement?: AnchoredSurfacePlacement;
  readonly maxVisibleSuggestions?: number;
  readonly pointerState?: PointerInteractionState;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles'], CommandInputStylePart>;
}

export type CommandInputOptions<
  TTransitionMessage extends ComponentMessage = never,
  TSubmitMessage extends ComponentMessage = TTransitionMessage,
  TPointerMessage extends ComponentMessage = TTransitionMessage,
> = CommandInputOptionsBase & (
  | {
      readonly disabled: true;
      readonly readOnly?: never;
      readonly pointerState?: never;
      readonly onTransition?: never;
      readonly onSubmit?: never;
      readonly onPointerAction?: never;
    }
  | {
      readonly disabled?: false;
      readonly readOnly?: boolean;
      readonly onTransition: (transition: CommandInputTransition) => MessageResolution<TTransitionMessage>;
      readonly onSubmit?: (event: CommandInputSubmitEvent) => MessageResolution<TSubmitMessage>;
      readonly onPointerAction?: (action: import('../../interaction/pointer-interaction.ts').PointerInteractionAction) => MessageResolution<TPointerMessage>;
    }
);

interface SearchPickerOptionsBase<TValue> {
  readonly id: string;
  readonly title?: string;
  readonly searchPickerIndex: SearchPickerIndex<TValue>;
  readonly maxVisible?: number;
  readonly helpText?: string;
  readonly emptyText?: string;
  readonly pointerState?: PointerInteractionState;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles'], SearchPickerStylePart>;
}

interface ActiveSearchPickerCallbacks<
  TTransitionMessage extends ComponentMessage,
  TAcceptMessage extends ComponentMessage,
  TPointerMessage extends ComponentMessage,
  TTransition,
> {
  readonly disabled?: false;
  readonly readOnly?: boolean;
  readonly busy?: boolean;
  readonly inert?: false;
  readonly onTransition: (transition: TTransition) => MessageResolution<TTransitionMessage>;
  readonly onAccept?: (event: SearchPickerAcceptEvent) => MessageResolution<TAcceptMessage>;
  readonly onPointerAction?: (action: import('../../interaction/pointer-interaction.ts').PointerInteractionAction) => MessageResolution<TPointerMessage>;
}

interface InertSearchPickerCallbacks {
  readonly disabled?: false;
  readonly readOnly?: never;
  readonly busy?: boolean;
  readonly inert: true;
  readonly onTransition?: never;
  readonly onAccept?: never;
  readonly onPointerAction?: never;
}

interface DisabledSearchPickerCallbacks {
  readonly disabled: true;
  readonly pointerState?: never;
  readonly readOnly?: never;
  readonly busy?: never;
  readonly inert?: never;
  readonly onTransition?: never;
  readonly onAccept?: never;
  readonly onPointerAction?: never;
}

export type UnscrolledSearchPickerOptions<
  TValue = string,
  TTransitionMessage extends ComponentMessage = never,
  TAcceptMessage extends ComponentMessage = TTransitionMessage,
  TPointerMessage extends ComponentMessage = TTransitionMessage,
> = SearchPickerOptionsBase<TValue> & {
  readonly presentation: Omit<SearchPickerPresentation, 'scroll'> & { readonly scroll?: never };
  readonly scrollbar?: never;
  readonly scrollPolicy?: never;
} & (ActiveSearchPickerCallbacks<
  TTransitionMessage,
  TAcceptMessage,
  TPointerMessage,
  SearchPickerControlTransition
> | DisabledSearchPickerCallbacks | InertSearchPickerCallbacks);

export type ScrollableSearchPickerOptions<
  TValue = string,
  TTransitionMessage extends ComponentMessage = never,
  TAcceptMessage extends ComponentMessage = TTransitionMessage,
  TPointerMessage extends ComponentMessage = TTransitionMessage,
> = SearchPickerOptionsBase<TValue> & {
  readonly presentation: SearchPickerPresentation & { readonly scroll: ScrollState };
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
} & (ActiveSearchPickerCallbacks<
  TTransitionMessage,
  TAcceptMessage,
  TPointerMessage,
  SearchPickerTransition
> | DisabledSearchPickerCallbacks | InertSearchPickerCallbacks);

export type SearchPickerOptions<
  TValue = string,
  TTransitionMessage extends ComponentMessage = never,
  TAcceptMessage extends ComponentMessage = TTransitionMessage,
  TPointerMessage extends ComponentMessage = TTransitionMessage,
> = UnscrolledSearchPickerOptions<TValue, TTransitionMessage, TAcceptMessage, TPointerMessage>
  | ScrollableSearchPickerOptions<TValue, TTransitionMessage, TAcceptMessage, TPointerMessage>;

export type {
  CommandInputDisplay,
  CommandInputValidation
} from '../../ui-model/documents.ts';
export type { LogHistory, LogEntry } from '../../ui-model/log-history.ts';
