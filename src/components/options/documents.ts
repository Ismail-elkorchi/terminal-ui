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
import type { ElementKeyBindings, InteractiveElementOptions } from '../../element/metadata.ts';
import type {
  CommandInputStylePart,
  SearchPickerStylePart,
  TextAreaStylePart
} from '../../ui-model/style-parts.ts';

interface LogViewerBaseOptions<TMessage> extends InteractiveElementOptions<TextAreaStylePart, TMessage> {
  readonly history: LogHistory;
  readonly wrap?: boolean;
  readonly searchQuery?: string;
  readonly selectedMatch?: LogSearchMatch;
  readonly foldedIds?: readonly string[];
  readonly selection?: LogViewerSelection;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export type LogViewerOptions<TMessage = never> =
  | PassiveLogViewerOptions<TMessage>
  | ScrollableLogViewerOptions<TMessage>;

export interface PassiveLogViewerOptions<TMessage = never> extends LogViewerBaseOptions<TMessage> {
  readonly scroll?: never;
  readonly scrollbar?: never;
  readonly scrollPolicy?: never;
  readonly onAction?: (action: LogViewerControlAction) => TMessage;
}

export interface ScrollableLogViewerOptions<TMessage = never> extends LogViewerBaseOptions<TMessage> {
  readonly scroll: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly onAction: (action: LogViewerAction) => TMessage;
}

export interface CommandInputOptions<TMessage = never> extends InteractiveElementOptions<CommandInputStylePart, TMessage> {
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
  readonly onAction: (action: CommandInputAction) => TMessage;
  readonly onSubmit: (value: string) => TMessage;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export interface SearchPickerOptions<TValue = string, TMessage = never>
  extends InteractiveElementOptions<SearchPickerStylePart, TMessage> {
  readonly title?: string;
  readonly query?: string;
  readonly searchPickerIndex: SearchPickerIndex<TValue>;
  readonly selectedId?: string;
  readonly maxVisible?: number;
  readonly helpText?: string;
  readonly emptyText?: string;
  readonly onAction: (action: SearchPickerAction<TValue>) => TMessage;
  readonly keys?: ElementKeyBindings<TMessage>;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
}

export type {
  CommandInputDisplay,
  CommandInputValidation
} from '../../ui-model/documents.ts';
export type { LogHistory, LogEntry } from '../../ui-model/log-history.ts';
