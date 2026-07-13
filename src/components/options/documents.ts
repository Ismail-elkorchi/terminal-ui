import type { TextSelection } from '../../text/index.ts';
import type { TerminalStyle } from '../../visual/render.ts';
import type { ScrollEvent, ScrollPolicy, ScrollState } from '../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import type { TextPointerEvent } from '../../interaction/text-pointer.ts';
import type {
  SearchEntry,
  SuggestionItem,
  FieldItem,
  RecordStatus
} from '../../ui-model/contracts.ts';
import type {
  CommandInputDisplay,
  CommandInputValidation,
  ScrollbackItem,
  StructuredBlock
} from '../../ui-model/documents.ts';
import type { CommandInputAction } from '../../ui-model/command-input.ts';
import type { PaletteAction } from '../../ui-model/palette.ts';
import type { ActivityFeedAction } from '../../ui-model/activity-feed.ts';
import type { ScrollbackAction } from '../../ui-model/scrollback.ts';
import type { ElementKeyBindings, ElementOptions, InteractiveElementOptions } from '../../element/metadata.ts';
import type {
  CommandInputStylePart,
  DocumentStylePart,
  PaletteStylePart,
  TextAreaStylePart
} from '../../ui-model/style-parts.ts';

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
  readonly selectedId?: string;
  readonly onAction?: (action: ActivityFeedAction) => TMessage;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export interface CommandInputOptions<TMessage = never> extends InteractiveElementOptions<CommandInputStylePart> {
  readonly value?: string;
  readonly cursor?: number;
  readonly selection?: TextSelection;
  readonly prompt?: string;
  readonly placeholder?: string;
  readonly completionPreview?: string;
  readonly validation?: CommandInputValidation;
  readonly footer?: string;
  readonly matchQuery?: string;
  readonly suggestions?: readonly SuggestionItem[];
  readonly selectedSuggestion?: number;
  readonly historyIndex?: number;
  readonly display?: CommandInputDisplay;
  readonly onAction?: (action: CommandInputAction) => TMessage;
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

export type {
  CommandInputDisplay,
  CommandInputValidation,
  ScrollbackItem,
  StructuredBlock
} from '../../ui-model/documents.ts';
