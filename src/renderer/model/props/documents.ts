import type { ScrollEvent, ScrollPolicy, ScrollState } from '../../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../../interaction/scrollbar.ts';
import type { TextSelection } from '../../../text/index.ts';
import type { ActivityFeedAction } from '../../../ui-model/activity-feed.ts';
import type {
  FieldItem,
  LogLevel,
  RecordResult,
  SuggestionItem,
  SearchEntry
} from '../../../ui-model/contracts.ts';
import type {
  CommandInputDisplay,
  CommandInputValidation,
  StructuredBlock
} from '../../../ui-model/documents.ts';
import type { LogHistory } from '../../../ui-model/log-history.ts';
import type { LogSearchMatch } from '../../../ui-model/log-history.ts';
import type { LogViewerSelection } from '../../../ui-model/log-viewer.ts';
import type { SearchPickerAction } from '../../../ui-model/search-picker.ts';
import type { SearchPickerIndex } from '../../../ui-model/search-picker-index.ts';
import type { CommandInputAction } from '../../../ui-model/command-input.ts';
import type { LogViewerAction } from '../../../ui-model/log-viewer.ts';
import type { RenderNodeLayoutProps } from './shared-layout.ts';
import type { TerminalStyle } from '../../../visual/render.ts';
import type { MessageResolution } from '../../../interaction/message.ts';
import type { AnchoredSurfacePlacement } from '../../../interaction/anchored-surface.ts';

export interface ViewportRenderProps<TMessage> extends RenderNodeLayoutProps {
  readonly scrollRow?: number;
  readonly scrollColumn?: number;
  readonly contentRows?: number;
  readonly contentColumns?: number;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly toScrollMessage?: (event: ScrollEvent) => TMessage;
}

export interface LogViewerRenderProps<TMessage> {
  readonly history: LogHistory;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly toActionMessage?: (action: LogViewerAction) => MessageResolution<TMessage>;
  readonly wrap?: boolean;
  readonly searchQuery?: string;
  readonly selectedMatch?: LogSearchMatch;
  readonly foldedIds?: readonly string[];
  readonly selection?: LogViewerSelection;
}

export interface StructuredBlockRenderProps {
  readonly title: string;
  readonly summary?: string;
  readonly style?: TerminalStyle;
  readonly result?: RecordResult;
  readonly level?: LogLevel;
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
  readonly selectedSuggestionIndex?: number;
  readonly historyIndex?: number;
  readonly display?: CommandInputDisplay;
  readonly placement?: AnchoredSurfacePlacement;
  readonly maxVisibleSuggestions: number;
  readonly toActionMessage?: (action: CommandInputAction) => TMessage;
}

export interface SearchPickerRenderProps<TMessage> {
  readonly title?: string;
  readonly query?: string;
  readonly searchPickerIndex: SearchPickerIndex<unknown>;
  readonly toMessage?: (entry: SearchEntry<unknown>) => TMessage;
  readonly selectedIndex?: number;
  readonly selectedId?: string;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly toScrollMessage?: (event: ScrollEvent) => TMessage;
  readonly maxVisible?: number;
  readonly helpText?: string;
  readonly emptyText?: string;
  readonly toActionMessage?: (action: SearchPickerAction) => TMessage;
}
