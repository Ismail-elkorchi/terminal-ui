import type { AccessibleNode } from '../accessibility/index.ts';
import type { MouseAction } from '../input/index.ts';
import type { TextSelection } from '../text/index.ts';
import type { StyledTone } from '../theme/index.ts';
import type { LayoutTrack } from '../tui/regions.ts';
import type { ScrollState } from '../tui/scroll.ts';

export interface Widget<TMessage = unknown> {
  readonly id?: string;
  readonly kind: WidgetKind;
  readonly props: WidgetProps;
  readonly children?: readonly Widget<TMessage>[];
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly mouseMap?: WidgetMouseMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export type WidgetKind =
  | 'text'
  | 'box'
  | 'stack'
  | 'row'
  | 'list'
  | 'table'
  | 'inputField'
  | 'statusBar'
  | 'progressBar'
  | 'spinner'
  | 'viewport'
  | 'scrollback'
  | 'structuredBlock'
  | 'activityFeed'
  | 'commandBar'
  | 'commandPalette'
  | 'grid'
  | 'splitPane'
  | 'tabs'
  | 'modal'
  | 'custom';

export type WidgetProps = Record<string, unknown>;
export type WidgetChildren<TMessage> = readonly Widget<TMessage>[] | Widget<TMessage>;
export type WidgetKeyMap<TMessage> = Record<string, TMessage>;
export type WidgetMouseMap<TMessage> = Partial<Record<MouseAction, TMessage>>;
export type AccessibleNodeDefinition = AccessibleNode;

export interface TextWidgetOptions {
  readonly id?: string;
  readonly mouseMap?: WidgetMouseMap<never>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface BoxWidgetOptions<TMessage = never> {
  readonly id?: string;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly mouseMap?: WidgetMouseMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface StackWidgetOptions<TMessage = never> {
  readonly id?: string;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly mouseMap?: WidgetMouseMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface RowWidgetOptions<TMessage = never> {
  readonly id?: string;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly mouseMap?: WidgetMouseMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface ListWidgetOptions<TValue, TMessage> {
  readonly id?: string;
  readonly items: readonly TValue[];
  readonly selected?: number;
  readonly toMessage?: (value: TValue) => TMessage;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly mouseMap?: WidgetMouseMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface TableWidgetOptions<TMessage> {
  readonly id?: string;
  readonly rows: readonly unknown[];
  readonly message?: TMessage;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly mouseMap?: WidgetMouseMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface InputFieldWidgetOptions<TMessage> {
  readonly id?: string;
  readonly value?: string;
  readonly message?: TMessage;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly mouseMap?: WidgetMouseMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface StatusBarWidgetOptions<TMessage> {
  readonly id?: string;
  readonly text: string;
  readonly message?: TMessage;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly mouseMap?: WidgetMouseMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface ProgressBarWidgetOptions {
  readonly id?: string;
  readonly label?: string;
  readonly value?: number;
  readonly max?: number;
  readonly indeterminate?: boolean;
  readonly mouseMap?: WidgetMouseMap<never>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface SpinnerWidgetOptions {
  readonly id?: string;
  readonly label?: string;
  readonly mouseMap?: WidgetMouseMap<never>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface ViewportWidgetOptions<TMessage = never> {
  readonly id?: string;
  readonly scrollRow?: number;
  readonly scrollColumn?: number;
  readonly contentRows?: number;
  readonly contentColumns?: number;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly mouseMap?: WidgetMouseMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface ScrollbackItem {
  readonly id: string;
  readonly text: string;
  readonly tone?: StyledTone;
  readonly timestamp?: string;
  readonly metadata?: Record<string, string>;
}

export interface ScrollbackWidgetOptions<TMessage = never> {
  readonly id?: string;
  readonly items: readonly ScrollbackItem[];
  readonly scroll?: ScrollState;
  readonly wrap?: boolean;
  readonly searchQuery?: string;
  readonly selectedRange?: TextSelection;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly mouseMap?: WidgetMouseMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export type StructuredBlockStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled';

export interface StructuredBlockField {
  readonly label: string;
  readonly value: string;
}

export interface StructuredBlock {
  readonly id: string;
  readonly title: string;
  readonly summary?: string;
  readonly tone?: StyledTone;
  readonly status?: StructuredBlockStatus;
  readonly fields?: readonly StructuredBlockField[];
  readonly body?: string;
  readonly details?: string;
  readonly collapsed?: boolean;
}

export interface StructuredBlockWidgetOptions<TMessage = never> extends StructuredBlock {
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly mouseMap?: WidgetMouseMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface ActivityFeedWidgetOptions<TMessage = never> {
  readonly id?: string;
  readonly blocks: readonly StructuredBlock[];
  readonly selected?: number;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly mouseMap?: WidgetMouseMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface CommandBarSuggestion {
  readonly value: string;
  readonly label?: string;
  readonly description?: string;
}

export interface CommandBarWidgetOptions<TMessage = never> {
  readonly id?: string;
  readonly value?: string;
  readonly cursor?: number;
  readonly prompt?: string;
  readonly placeholder?: string;
  readonly suggestions?: readonly CommandBarSuggestion[];
  readonly selectedSuggestion?: number;
  readonly historyIndex?: number;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly mouseMap?: WidgetMouseMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface CommandPaletteEntry {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly keywords?: readonly string[];
  readonly disabled?: boolean;
}

export interface CommandPaletteWidgetOptions<TMessage = never> {
  readonly id?: string;
  readonly title?: string;
  readonly query?: string;
  readonly entries: readonly CommandPaletteEntry[];
  readonly selected?: number;
  readonly maxVisible?: number;
  readonly helpText?: string;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly mouseMap?: WidgetMouseMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface GridWidgetOptions<TMessage = never> {
  readonly id?: string;
  readonly rows: readonly LayoutTrack[];
  readonly columns: readonly LayoutTrack[];
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly mouseMap?: WidgetMouseMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface SplitPaneWidgetOptions<TMessage = never> {
  readonly id?: string;
  readonly direction: 'horizontal' | 'vertical';
  readonly sizes?: readonly LayoutTrack[];
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly mouseMap?: WidgetMouseMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface TabItem<TMessage = never> {
  readonly id: string;
  readonly label: string;
  readonly panel: Widget<TMessage>;
  readonly disabled?: boolean;
}

export interface TabsWidgetOptions<TMessage = never> {
  readonly id?: string;
  readonly tabs: readonly TabItem<TMessage>[];
  readonly selected?: string;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly mouseMap?: WidgetMouseMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface ModalWidgetOptions<TMessage = never> {
  readonly id?: string;
  readonly title?: string;
  readonly width?: number;
  readonly height?: number;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly mouseMap?: WidgetMouseMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}
