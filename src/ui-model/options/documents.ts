import type { TextSelection } from '../../text/index.ts';
import type { TerminalStyle } from '../../tui/render-primitives.ts';
import type { ScrollEvent, ScrollPolicy, ScrollState } from '../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../tui/scrollbar.ts';
import type { TextPointerEvent } from '../../tui/text-pointer.ts';
import type {
  ComponentValidationTone,
  FieldItem,
  LogLevel,
  RecordStatus,
  SearchEntry,
  SuggestionItem,
  TitledItem
} from '../contracts.ts';
import type { CommandBarAction } from '../command-bar.ts';
import type { PaletteAction } from '../palette.ts';
import type { ActivityFeedAction } from '../activity-feed.ts';
import type { ScrollbackAction } from '../scrollback.ts';
import type { ElementKeyBindings, ElementOptions, InteractiveElementOptions } from '../../element/metadata.ts';
import type {
  CommandBarStylePart,
  DocumentStylePart,
  PaletteStylePart,
  TextAreaStylePart
} from '../style-parts.ts';

export interface ScrollbackItem {
  readonly id: string;
  readonly text: string;
  readonly level?: LogLevel;
  readonly style?: TerminalStyle;
  readonly timestamp?: string;
  readonly metadata?: Record<string, string>;
}

export interface ScrollbackOptions<TMessage = never> extends InteractiveElementOptions<TextAreaStylePart> {
  readonly items: readonly ScrollbackItem[];
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly onAction?: (action: ScrollbackAction) => TMessage;
  readonly wrap?: boolean;
  readonly searchQuery?: string;
  readonly selectedRange?: TextSelection;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export interface StructuredBlock extends TitledItem {
  readonly summary?: string;
  readonly style?: TerminalStyle;
  readonly status?: RecordStatus;
  readonly fields?: readonly FieldItem[];
  readonly body?: string;
  readonly details?: string;
  readonly collapsed?: boolean;
}

export interface StructuredBlockOptions extends ElementOptions<DocumentStylePart> {
  readonly title: string;
  readonly summary?: string;
  readonly style?: TerminalStyle;
  readonly status?: RecordStatus;
  readonly fields?: readonly FieldItem[];
  readonly body?: string;
  readonly details?: string;
  readonly collapsed?: boolean;
}

export interface ActivityFeedOptions<TMessage = never> extends InteractiveElementOptions<DocumentStylePart> {
  readonly blocks: readonly StructuredBlock[];
  readonly selected?: number;
  readonly onAction?: (action: ActivityFeedAction) => TMessage;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export interface CommandBarValidation {
  readonly message: string;
  readonly tone?: ComponentValidationTone;
}

export type CommandBarDisplay = 'compact' | 'expanded';

export interface CommandBarOptions<TMessage = never> extends InteractiveElementOptions<CommandBarStylePart> {
  readonly value?: string;
  readonly cursor?: number;
  readonly selection?: TextSelection;
  readonly prompt?: string;
  readonly placeholder?: string;
  readonly completionPreview?: string;
  readonly validation?: CommandBarValidation;
  readonly footer?: string;
  readonly matchQuery?: string;
  readonly suggestions?: readonly SuggestionItem[];
  readonly selectedSuggestion?: number;
  readonly historyIndex?: number;
  readonly display?: CommandBarDisplay;
  readonly onAction?: (action: CommandBarAction) => TMessage;
  readonly onSubmit?: TMessage;
  readonly onTextPointer?: (event: TextPointerEvent) => TMessage;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export interface PaletteOptions<TValue = string, TMessage = never> extends InteractiveElementOptions<PaletteStylePart> {
  readonly title?: string;
  readonly query?: string;
  readonly entries: readonly SearchEntry<TValue>[];
  readonly onSelect?: (entry: SearchEntry<TValue>) => TMessage;
  readonly selected?: number;
  readonly selectedId?: string;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly onScroll?: (event: ScrollEvent) => TMessage;
  readonly maxVisible?: number;
  readonly helpText?: string;
  readonly emptyText?: string;
  readonly onAction?: (action: PaletteAction) => TMessage;
  readonly keys?: ElementKeyBindings<TMessage>;
}
