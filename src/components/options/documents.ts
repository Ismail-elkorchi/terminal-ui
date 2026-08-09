import type { ScrollPolicy, ScrollState } from '../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import type { AnchoredSurfacePlacement } from '../../interaction/anchored-surface.ts';
import type {
  CommandInputDisplay,
  CommandInputValidation
} from '../../ui-model/documents.ts';
import type { LogHistory } from '../../ui-model/log-history.ts';
import type { CommandInputAction, CommandInputPresentation } from '../../ui-model/command-input.ts';
import type { SearchPickerAction } from '../../ui-model/search-picker.ts';
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
  readonly selectedMatch?: LogSearchMatch;
  readonly foldedIds?: readonly string[];
  readonly selection?: LogViewerSelection;
  readonly pointerState?: PointerInteractionState;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles'], LogViewerStylePart>;
}

export type LogViewerOptions<TMessage extends ComponentMessage = never> =
  | PassiveLogViewerOptions<TMessage>
  | ScrollableLogViewerOptions<TMessage>;

export interface PassiveLogViewerOptions<TMessage extends ComponentMessage = never> extends LogViewerBaseOptions {
  readonly scroll?: never;
  readonly scrollbar?: never;
  readonly scrollPolicy?: never;
  readonly onAction?: (action: LogViewerControlAction) => MessageResolution<TMessage>;
}

export interface ScrollableLogViewerOptions<TMessage extends ComponentMessage = never> extends LogViewerBaseOptions {
  readonly scroll: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly onAction: (action: LogViewerAction) => MessageResolution<TMessage>;
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
  readonly readOnly?: boolean;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles'], CommandInputStylePart>;
}

export type CommandInputOptions<TMessage extends ComponentMessage = never> = CommandInputOptionsBase & (
  | { readonly disabled: true; readonly onAction?: never }
  | { readonly disabled?: false; readonly onAction: (action: CommandInputAction) => MessageResolution<TMessage> }
);

interface SearchPickerOptionsBase<TValue> {
  readonly id: string;
  readonly title?: string;
  readonly query?: string;
  readonly searchPickerIndex: SearchPickerIndex<TValue>;
  readonly selectedId?: string;
  readonly maxVisible?: number;
  readonly helpText?: string;
  readonly emptyText?: string;
  readonly pointerState?: PointerInteractionState;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles'], SearchPickerStylePart>;
}

export type SearchPickerOptions<
  TValue = string,
  TMessage extends ComponentMessage = never
> = SearchPickerOptionsBase<TValue> & (
  | { readonly disabled: true; readonly onAction?: never }
  | { readonly disabled?: false; readonly onAction: (action: SearchPickerAction<TValue>) => MessageResolution<TMessage> }
);

export type {
  CommandInputDisplay,
  CommandInputValidation
} from '../../ui-model/documents.ts';
export type { LogHistory, LogEntry } from '../../ui-model/log-history.ts';
