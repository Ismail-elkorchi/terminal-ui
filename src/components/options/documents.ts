import type { TerminalStyle } from '../../visual/render.ts';
import type { ScrollEvent, ScrollPolicy, ScrollState } from '../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import type { AnchoredSurfacePlacement } from '../../interaction/anchored-surface.ts';
import type {
  SearchEntry,
  FieldItem,
  LogLevel,
  RecordResult
} from '../../ui-model/contracts.ts';
import type {
  CommandInputDisplay,
  CommandInputValidation,
  StructuredBlock
} from '../../ui-model/documents.ts';
import type { LogHistory } from '../../ui-model/log-history.ts';
import type { CommandInputAction, CommandInputPresentation } from '../../ui-model/command-input.ts';
import type { SearchPickerAction } from '../../ui-model/search-picker.ts';
import type { SearchPickerIndex } from '../../ui-model/search-picker-index.ts';
import type { ActivityFeedAction } from '../../ui-model/activity-feed.ts';
import type { LogViewerAction, LogViewerControlAction } from '../../ui-model/log-viewer.ts';
import type { LogViewerSelection } from '../../ui-model/log-viewer.ts';
import type { LogSearchMatch } from '../../ui-model/log-history.ts';
import type { ElementKeyBindings, ElementOptions, InteractiveElementOptions } from '../../element/metadata.ts';
import type {
  CommandInputStylePart,
  DocumentStylePart,
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

export interface StructuredBlockOptions extends ElementOptions<DocumentStylePart> {
  readonly title: string;
  readonly summary?: string;
  readonly style?: TerminalStyle;
  /** Lifecycle outcome for the work represented by this record. */
  readonly result?: RecordResult;
  /** Informational severity of the record, independent of its lifecycle result. */
  readonly level?: LogLevel;
  readonly fields?: readonly FieldItem[];
  readonly body?: string;
  readonly details?: string;
  readonly collapsed?: boolean;
}

export interface ActivityFeedOptions<TMessage = never> extends InteractiveElementOptions<DocumentStylePart, TMessage> {
  readonly blocks: readonly StructuredBlock[];
  readonly selectedId?: string;
  readonly onAction?: (action: ActivityFeedAction) => TMessage;
  readonly keys?: ElementKeyBindings<TMessage>;
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
  readonly onAction?: (action: CommandInputAction) => TMessage;
  readonly onSubmit?: (value: string) => TMessage;
  readonly keys?: ElementKeyBindings<TMessage>;
}

interface SearchPickerBaseOptions<TValue, TMessage> extends InteractiveElementOptions<SearchPickerStylePart, TMessage> {
  readonly title?: string;
  readonly query?: string;
  readonly searchPickerIndex: SearchPickerIndex<TValue>;
  readonly onSelect?: (entry: SearchEntry<TValue>) => TMessage;
  readonly selectedIndex?: number;
  readonly selectedId?: string;
  readonly maxVisible?: number;
  readonly helpText?: string;
  readonly emptyText?: string;
  readonly onAction?: (action: SearchPickerAction) => TMessage;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export type SearchPickerOptions<TValue = string, TMessage = never> =
  | PassiveSearchPickerOptions<TValue, TMessage>
  | ScrollableSearchPickerOptions<TValue, TMessage>;

export interface PassiveSearchPickerOptions<TValue = string, TMessage = never> extends SearchPickerBaseOptions<TValue, TMessage> {
  readonly scroll?: never;
  readonly scrollbar?: never;
  readonly scrollPolicy?: never;
  readonly onScroll?: never;
}

export interface ScrollableSearchPickerOptions<TValue = string, TMessage = never> extends SearchPickerBaseOptions<TValue, TMessage> {
  readonly scroll: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly onScroll: (event: ScrollEvent) => TMessage;
}

export type {
  CommandInputDisplay,
  CommandInputValidation,
  StructuredBlock
} from '../../ui-model/documents.ts';
export type { LogHistory, LogEntry } from '../../ui-model/log-history.ts';
