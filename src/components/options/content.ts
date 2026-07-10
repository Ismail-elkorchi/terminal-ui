import type { TextSelection } from '../../text/index.ts';
import type { RenderSpan, TerminalStyle } from '../../tui/render-primitives.ts';
import type { LayoutFlowOptions, LayoutSize } from '../../tui/regions.ts';
import type { ScrollEvent, ScrollPolicy, ScrollState } from '../../tui/scroll.ts';
import type { ScrollbarOptions } from '../../tui/scrollbar.ts';
import type { RoutedPointerEvent } from '../../tui/pointer-types.ts';
import type { TextPointerEvent } from '../../tui/text-pointer.ts';
import type { TreeItemBase } from '../contracts.ts';
import type { ComponentKeyBindings, ComponentOptions, TextRole } from './base.ts';

export interface TextOptions extends ComponentOptions {
  readonly textRole?: TextRole;
}

export interface RichTextOptions<TMessage = never> extends ComponentOptions {
  readonly segments: readonly RenderSpan[];
  readonly wrap?: boolean;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface StackOptions<TMessage = never> extends ComponentOptions, LayoutFlowOptions {
  readonly sizes?: readonly LayoutSize[];
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface RowOptions<TMessage = never> extends ComponentOptions, LayoutFlowOptions {
  readonly sizes?: readonly LayoutSize[];
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface ListOptions<TValue, TMessage> extends ComponentOptions {
  readonly items: readonly TValue[];
  readonly selected?: number;
  readonly filterQuery?: string;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly onScroll?: (event: ScrollEvent) => TMessage;
  readonly onSelect?: (value: TValue) => TMessage;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface TableOptions<TMessage> extends ComponentOptions {
  readonly rows: readonly unknown[];
  readonly columns?: readonly TableColumn[];
  readonly selected?: number;
  readonly selectedCell?: TableCellSelection;
  readonly density?: TableDensity;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly onScroll?: (event: ScrollEvent) => TMessage;
  readonly stickyHeader?: boolean;
  readonly emptyText?: string;
  readonly onSelect?: (selection: TablePointerSelection) => TMessage;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface TablePointerSelection {
  readonly row: unknown;
  readonly rowIndex: number;
  readonly cell?: TableCellPointerSelection;
}

export interface TableCellPointerSelection {
  readonly value: unknown;
  readonly columnIndex: number;
  readonly sourceColumnIndex: number;
  readonly columnLabel: string;
}

export type TableColumnWidth = number | LayoutSize;
export type TableColumnAlignment = 'start' | 'center' | 'end';
export type TableSortDirection = 'ascending' | 'descending';
export type TableDensity = 'normal' | 'dense';
export type TableColumnSemantic = 'text' | 'metric' | 'metadata';

export interface TableCellRenderInput {
  readonly value: unknown;
  readonly row: unknown;
  readonly rowIndex: number;
  readonly columnIndex: number;
}

export interface TableColumn {
  readonly header?: string;
  readonly width?: TableColumnWidth;
  readonly align?: TableColumnAlignment;
  readonly semantic?: TableColumnSemantic;
  readonly hidden?: boolean;
  readonly resizable?: boolean;
  readonly style?: TerminalStyle;
  readonly headerStyle?: TerminalStyle;
  readonly render?: (input: TableCellRenderInput) => string | RenderSpan | readonly RenderSpan[];
  readonly sort?: TableSortDirection;
}

export interface TableCellSelection {
  readonly row: number;
  readonly column?: number;
}

export interface TreeNode extends TreeItemBase<TreeNode> {
  readonly lazy?: boolean;
  readonly lazyStatus?: 'pending' | 'error' | 'empty';
  readonly lazyMessage?: string;
  readonly icon?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export type TreeDisclosureAction =
  | { readonly kind: 'toggle'; readonly id: string }
  | { readonly kind: 'expand'; readonly id: string }
  | { readonly kind: 'collapse'; readonly id: string };

export interface TreeOptions<TMessage = never> extends ComponentOptions {
  readonly nodes: readonly TreeNode[];
  readonly selected?: string;
  readonly filterQuery?: string;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly onScroll?: (event: ScrollEvent) => TMessage;
  readonly emptyText?: string;
  readonly onSelect?: (node: TreeNode) => TMessage;
  readonly onDisclosure?: (node: TreeNode, action: TreeDisclosureAction, event: RoutedPointerEvent) => TMessage;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface PaginatorOptions<TMessage = never> extends ComponentOptions {
  readonly page: number;
  readonly pageCount: number;
  readonly label?: string;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface TextAreaOptions<TMessage = never> extends ComponentOptions {
  readonly value?: string;
  readonly cursor?: number;
  readonly selection?: TextSelection;
  readonly highlights?: readonly TextAreaHighlight[];
  readonly placeholder?: string;
  readonly lineNumbers?: boolean | TextAreaLineNumberOptions;
  readonly activeLine?: boolean;
  readonly wrap?: boolean | TextAreaWrapOptions;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly onScroll?: (event: ScrollEvent) => TMessage;
  readonly onTextPointer?: (event: TextPointerEvent) => TMessage;
  readonly keys?: ComponentKeyBindings<TMessage>;
  readonly onInput?: (text: string) => TMessage;
  readonly onPaste?: (text: string) => TMessage;
}

export interface TextAreaHighlight {
  readonly start: number;
  readonly end: number;
  readonly label?: string;
  readonly style?: TerminalStyle;
}

export interface TextAreaWrapOptions {
  readonly mode?: 'none' | 'soft';
}

export interface TextAreaLineNumberOptions {
  readonly start?: number;
  readonly minWidth?: number;
}
