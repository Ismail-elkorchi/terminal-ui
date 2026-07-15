import type { TextSelection } from '../../text/index.ts';
import type { TerminalStyle } from '../../visual/render.ts';
import type { ScrollEvent, ScrollPolicy, ScrollState } from '../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import type {
  SearchEntry,
  FieldItem,
  RecordStatus
} from '../../ui-model/contracts.ts';
import type {
  CommandInputDisplay,
  CommandInputValidation,
  ScrollbackItem,
  StructuredBlock
} from '../../ui-model/documents.ts';
import type { CommandInputAction, CommandInputPresentation } from '../../ui-model/command-input.ts';
import type { PaletteAction } from '../../ui-model/palette.ts';
import type { ActivityFeedAction } from '../../ui-model/activity-feed.ts';
import type { ScrollbackAction, ScrollbackControlAction } from '../../ui-model/scrollback.ts';
import type { ElementKeyBindings, ElementOptions, InteractiveElementOptions } from '../../element/metadata.ts';
import type {
  CommandInputStylePart,
  DocumentStylePart,
  PaletteStylePart,
  TextAreaStylePart
} from '../../ui-model/style-parts.ts';

interface ScrollbackBaseOptions<TMessage> extends InteractiveElementOptions<TextAreaStylePart, TMessage> {
  readonly items: readonly ScrollbackItem[];
  readonly wrap?: boolean;
  readonly searchQuery?: string;
  readonly selectedRange?: TextSelection;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export type ScrollbackOptions<TMessage = never> =
  | PassiveScrollbackOptions<TMessage>
  | ScrollableScrollbackOptions<TMessage>;

export interface PassiveScrollbackOptions<TMessage = never> extends ScrollbackBaseOptions<TMessage> {
  readonly scroll?: never;
  readonly scrollbar?: never;
  readonly scrollPolicy?: never;
  readonly onAction?: (action: ScrollbackControlAction) => TMessage;
}

export interface ScrollableScrollbackOptions<TMessage = never> extends ScrollbackBaseOptions<TMessage> {
  readonly scroll: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly onAction: (action: ScrollbackAction) => TMessage;
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
  readonly onAction?: (action: CommandInputAction) => TMessage;
  readonly onSubmit?: TMessage;
  readonly keys?: ElementKeyBindings<TMessage>;
}

interface PaletteBaseOptions<TValue, TMessage> extends InteractiveElementOptions<PaletteStylePart, TMessage> {
  readonly title?: string;
  readonly query?: string;
  readonly entries: readonly SearchEntry<TValue>[];
  readonly onSelect?: (entry: SearchEntry<TValue>) => TMessage;
  readonly selected?: number;
  readonly selectedId?: string;
  readonly maxVisible?: number;
  readonly helpText?: string;
  readonly emptyText?: string;
  readonly onAction?: (action: PaletteAction) => TMessage;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export type PaletteOptions<TValue = string, TMessage = never> =
  | PassivePaletteOptions<TValue, TMessage>
  | ScrollablePaletteOptions<TValue, TMessage>;

export interface PassivePaletteOptions<TValue = string, TMessage = never> extends PaletteBaseOptions<TValue, TMessage> {
  readonly scroll?: never;
  readonly scrollbar?: never;
  readonly scrollPolicy?: never;
  readonly onScroll?: never;
}

export interface ScrollablePaletteOptions<TValue = string, TMessage = never> extends PaletteBaseOptions<TValue, TMessage> {
  readonly scroll: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly onScroll: (event: ScrollEvent) => TMessage;
}

export type {
  CommandInputDisplay,
  CommandInputValidation,
  ScrollbackItem,
  StructuredBlock
} from '../../ui-model/documents.ts';
