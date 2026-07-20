import type { ScrollEvent, ScrollPolicy, ScrollState } from '../../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../../interaction/scrollbar.ts';
import type { TextSelection } from '../../../text/index.ts';
import type { ActivityFeedAction } from '../../../ui-model/activity-feed.ts';
import type {
  FieldItem,
  RecordStatus,
  SuggestionItem,
  SearchEntry
} from '../../../ui-model/contracts.ts';
import type {
  CommandInputDisplay,
  CommandInputValidation,
  StructuredBlock
} from '../../../ui-model/documents.ts';
import type { ScrollbackHistory } from '../../../ui-model/scrollback-history.ts';
import type { PaletteAction } from '../../../ui-model/palette.ts';
import type { CommandInputAction } from '../../../ui-model/command-input.ts';
import type { ScrollbackAction } from '../../../ui-model/scrollback.ts';
import type { RenderNodeLayoutProps } from './shared-layout.ts';
import type { TerminalStyle } from '../../../visual/render.ts';
import type { MessageResolution } from '../../../interaction/message.ts';

export interface ViewportRenderProps<TMessage> extends RenderNodeLayoutProps {
  readonly scrollRow?: number;
  readonly scrollColumn?: number;
  readonly contentRows?: number;
  readonly contentColumns?: number;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly toScrollMessage?: (event: ScrollEvent) => TMessage;
}

export interface ScrollbackRenderProps<TMessage> {
  readonly history: ScrollbackHistory;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly toActionMessage?: (action: ScrollbackAction) => MessageResolution<TMessage>;
  readonly wrap?: boolean;
  readonly searchQuery?: string;
  readonly selectedRange?: TextSelection;
}

export interface StructuredBlockRenderProps {
  readonly title: string;
  readonly summary?: string;
  readonly style?: TerminalStyle;
  readonly status?: RecordStatus;
  readonly fields?: readonly FieldItem[];
  readonly body?: string;
  readonly details?: string;
  readonly collapsed?: boolean;
}

export interface ActivityFeedRenderProps<TMessage> {
  readonly blocks: readonly StructuredBlock[];
  readonly selectedId?: string;
  readonly toActionMessage?: (action: ActivityFeedAction) => TMessage;
}

export interface CommandInputRenderProps<TMessage> {
  readonly value: string;
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
  readonly toActionMessage?: (action: CommandInputAction) => TMessage;
}

export interface PaletteRenderProps<TMessage> {
  readonly title?: string;
  readonly query?: string;
  readonly entries: readonly SearchEntry<unknown>[];
  readonly toMessage?: (entry: SearchEntry<unknown>) => TMessage;
  readonly selected?: number;
  readonly selectedId?: string;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly toScrollMessage?: (event: ScrollEvent) => TMessage;
  readonly maxVisible?: number;
  readonly helpText?: string;
  readonly emptyText?: string;
  readonly toActionMessage?: (action: PaletteAction) => TMessage;
}
