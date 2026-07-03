import type { AccessibilityOptions, AccessibleNode } from '../accessibility/index.ts';
import type { TextSelection } from '../text/index.ts';
import type { BorderStyle } from '../tui/border.ts';
import type { RenderSpan, TerminalStyle } from '../tui/render-primitives.ts';
import type { WidgetRenderer } from '../tui/widget-renderer.ts';
import type { GridLayoutOptions, LayoutFlowOptions, LayoutSize } from '../tui/regions.ts';
import type { ScrollState } from '../tui/scroll.ts';
import type { ScrollbarOptions } from '../tui/scrollbar.ts';
import type { FrameBuffer } from '../tui/frame-buffer.ts';
import type { Canvas2D } from '../tui/canvas2d/index.ts';
import type { Rect, RegionOpacity } from '../tui/layout.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { SurfaceVariant } from '../tui/surface.ts';
import type {
  WidgetActionItem,
  WidgetActionTone,
  WidgetChoiceItem,
  WidgetFieldItem,
  WidgetHierarchyItem,
  WidgetKeyBinding,
  WidgetNavigationItem,
  WidgetProcessStatus,
  WidgetRecordStatus,
  WidgetSearchEntry,
  WidgetSuggestionItem,
  WidgetTitledItem,
  WidgetTone,
  WidgetTreeItem,
  WidgetValidationTone
} from './contracts.ts';

export interface Widget<TMessage = unknown> {
  readonly id?: string;
  readonly kind: WidgetKind;
  readonly props: WidgetProps;
  readonly layer?: WidgetLayerOptions;
  readonly focus?: WidgetFocusOptions;
  readonly styles?: WidgetStyleSlots;
  readonly children?: readonly Widget<TMessage>[];
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly inputMap?: WidgetInputMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
  readonly custom?: CustomWidgetRuntime<TMessage>;
}

export type WidgetKind =
  | 'text'
  | 'richText'
  | 'stack'
  | 'row'
  | 'list'
  | 'table'
  | 'tree'
  | 'paginator'
  | 'textArea'
  | 'form'
  | 'field'
  | 'label'
  | 'button'
  | 'checkbox'
  | 'toggleSwitch'
  | 'slider'
  | 'rangeSlider'
  | 'checkboxList'
  | 'colorPicker'
  | 'datePicker'
  | 'radioGroup'
  | 'selectBox'
  | 'textInput'
  | 'numberInput'
  | 'menu'
  | 'menuBar'
  | 'contextMenu'
  | 'dropdown'
  | 'divider'
  | 'tooltip'
  | 'notificationStack'
  | 'canvas'
  | 'surface'
  | 'absolute'
  | 'overlay'
  | 'statusBar'
  | 'helpBar'
  | 'activityIndicator'
  | 'progressBar'
  | 'spinner'
  | 'sparkline'
  | 'barChart'
  | 'chart'
  | 'gauge'
  | 'heatmap'
  | 'viewport'
  | 'scrollback'
  | 'structuredBlock'
  | 'activityFeed'
  | 'commandBar'
  | 'palette'
  | 'grid'
  | 'splitPane'
  | 'tabs'
  | 'modal'
  | 'custom';

export type WidgetProps = Record<string, unknown>;
export type WidgetChildren<TMessage> = readonly Widget<TMessage>[] | Widget<TMessage>;
export type WidgetKeyMap<TMessage> = Record<string, TMessage>;
export type WidgetOverflowPriority = 'required' | 'important' | 'secondary' | 'decorative';
export interface WidgetLayerOptions {
  readonly zIndex?: number;
  readonly visible?: boolean;
  readonly opacity?: RegionOpacity;
  readonly overflowPriority?: WidgetOverflowPriority;
  readonly focus?: WidgetFocusOptions;
  readonly styles?: WidgetStyleSlots;
}

export type WidgetVisualState =
  | 'default'
  | 'focused'
  | 'selected'
  | 'disabled'
  | 'active'
  | 'error'
  | 'warning'
  | 'success';

export type WidgetTextRole =
  | 'title'
  | 'subtitle'
  | 'heading'
  | 'body'
  | 'caption'
  | 'metadata'
  | 'metric'
  | 'badge'
  | 'danger'
  | 'warning'
  | 'success';

export interface WidgetStyleSlots {
  readonly root?: TerminalStyle;
  readonly border?: TerminalStyle;
  readonly title?: TerminalStyle;
  readonly label?: TerminalStyle;
  readonly value?: TerminalStyle;
  readonly placeholder?: TerminalStyle;
  readonly selected?: TerminalStyle;
  readonly focused?: TerminalStyle;
  readonly disabled?: TerminalStyle;
  readonly error?: TerminalStyle;
  readonly warning?: TerminalStyle;
  readonly success?: TerminalStyle;
}
export type WidgetFocusScope = 'none' | 'contain';
export interface WidgetFocusOptions {
  readonly disabled?: boolean;
  readonly order?: number;
  readonly scope?: WidgetFocusScope;
}
export interface WidgetInputMap<TMessage> {
  readonly text?: (text: string) => TMessage;
  readonly paste?: (text: string) => TMessage;
}
export type AccessibleNodeDefinition = AccessibleNode | AccessibilityOptions;

export interface CustomWidgetRuntime<TMessage = unknown> {
  readonly renderer: WidgetRenderer<TMessage>;
  readonly state?: unknown;
}

export interface CustomWidgetOptions<TMessage> extends WidgetLayerOptions {
  readonly id?: string;
  readonly renderer: WidgetRenderer<TMessage>;
  readonly state?: unknown;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly inputMap?: WidgetInputMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface TextWidgetOptions extends WidgetLayerOptions {
  readonly id?: string;
  readonly textRole?: WidgetTextRole;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface RichTextWidgetOptions<TMessage = never> extends WidgetLayerOptions {
  readonly id?: string;
  readonly segments: readonly RenderSpan[];
  readonly wrap?: boolean;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface StackWidgetOptions<TMessage = never> extends WidgetLayerOptions, LayoutFlowOptions {
  readonly id?: string;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface RowWidgetOptions<TMessage = never> extends WidgetLayerOptions, LayoutFlowOptions {
  readonly id?: string;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface ListWidgetOptions<TValue, TMessage> extends WidgetLayerOptions {
  readonly id?: string;
  readonly items: readonly TValue[];
  readonly selected?: number;
  readonly filterQuery?: string;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly toMessage?: (value: TValue) => TMessage;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface TableWidgetOptions<TMessage> extends WidgetLayerOptions {
  readonly id?: string;
  readonly rows: readonly unknown[];
  readonly columns?: readonly TableColumn[];
  readonly selected?: number;
  readonly selectedCell?: TableCellSelection;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly stickyHeader?: boolean;
  readonly emptyText?: string;
  readonly message?: TMessage;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export type TableColumnWidth = number | LayoutSize;
export type TableColumnAlignment = 'start' | 'center' | 'end';
export type TableSortDirection = 'ascending' | 'descending';

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

export interface TreeNode extends WidgetTreeItem<TreeNode> {
  readonly lazy?: boolean;
  readonly lazyStatus?: 'pending' | 'error' | 'empty';
  readonly lazyMessage?: string;
  readonly icon?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface TreeWidgetOptions<TMessage = never> extends WidgetLayerOptions {
  readonly id?: string;
  readonly nodes: readonly TreeNode[];
  readonly selected?: string;
  readonly filterQuery?: string;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly emptyText?: string;
  readonly toMessage?: (node: TreeNode) => TMessage;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface PaginatorWidgetOptions<TMessage = never> extends WidgetLayerOptions {
  readonly id?: string;
  readonly page: number;
  readonly pageCount: number;
  readonly label?: string;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface TextAreaWidgetOptions<TMessage = never> extends WidgetLayerOptions {
  readonly id?: string;
  readonly value?: string;
  readonly cursor?: number;
  readonly selection?: TextSelection;
  readonly placeholder?: string;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly inputMap?: WidgetInputMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface FormWidgetOptions<TMessage = never> extends WidgetLayerOptions, LayoutFlowOptions {
  readonly id?: string;
  readonly title?: string;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface FieldWidgetOptions<TMessage = never> extends WidgetLayerOptions, LayoutFlowOptions {
  readonly id?: string;
  readonly label: string;
  readonly description?: string;
  readonly error?: string;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface LabelWidgetOptions<TMessage = never> extends WidgetLayerOptions {
  readonly id?: string;
  readonly text: string;
  readonly forId?: string;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export type ButtonTone = Extract<WidgetTone, 'default' | 'primary' | 'secondary' | 'destructive'>;

export interface ButtonWidgetOptions<TMessage = never> extends WidgetLayerOptions {
  readonly id?: string;
  readonly label: string;
  readonly message?: TMessage;
  readonly disabled?: boolean;
  readonly tone?: ButtonTone;
  readonly pressed?: boolean;
  readonly pending?: boolean;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface CheckboxWidgetOptions<TMessage = never> extends WidgetLayerOptions {
  readonly id?: string;
  readonly label: string;
  readonly checked: boolean;
  readonly message?: TMessage;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface ToggleSwitchWidgetOptions<TMessage = never> extends WidgetLayerOptions {
  readonly id?: string;
  readonly label: string;
  readonly checked: boolean;
  readonly onLabel?: string;
  readonly offLabel?: string;
  readonly message?: TMessage;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface SliderWidgetOptions<TMessage = never> extends WidgetLayerOptions {
  readonly id?: string;
  readonly label?: string;
  readonly value: number;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly width?: number;
  readonly toMessage?: (value: number) => TMessage;
  readonly decrementMessage?: TMessage;
  readonly incrementMessage?: TMessage;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface RangeSliderValue {
  readonly start: number;
  readonly end: number;
}

export interface RangeSliderWidgetOptions<TMessage = never> extends WidgetLayerOptions {
  readonly id?: string;
  readonly label?: string;
  readonly start: number;
  readonly end: number;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly width?: number;
  readonly toMessage?: (value: RangeSliderValue) => TMessage;
  readonly decrementStartMessage?: TMessage;
  readonly incrementStartMessage?: TMessage;
  readonly decrementEndMessage?: TMessage;
  readonly incrementEndMessage?: TMessage;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export type FormOption<TValue = string> = WidgetChoiceItem<TValue>;

export interface CheckboxListWidgetOptions<TValue = string, TMessage = never> extends WidgetLayerOptions {
  readonly id?: string;
  readonly label?: string;
  readonly options: readonly FormOption<TValue>[];
  readonly selected?: readonly string[];
  readonly toMessage?: (option: FormOption<TValue>, checked: boolean) => TMessage;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface ColorPickerOption<TValue = string> extends FormOption<TValue> {
  readonly swatch?: string;
  readonly style?: TerminalStyle;
}

export interface ColorPickerWidgetOptions<TValue = string, TMessage = never> extends WidgetLayerOptions {
  readonly id?: string;
  readonly label?: string;
  readonly options: readonly ColorPickerOption<TValue>[];
  readonly selected?: string;
  readonly columns?: number;
  readonly toMessage?: (option: ColorPickerOption<TValue>) => TMessage;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface DatePickerDay<TValue = string> extends WidgetChoiceItem<TValue> {
  readonly today?: boolean;
  readonly outsideMonth?: boolean;
}

export interface DatePickerWidgetOptions<TValue = string, TMessage = never> extends WidgetLayerOptions {
  readonly id?: string;
  readonly label?: string;
  readonly days: readonly DatePickerDay<TValue>[];
  readonly selected?: string;
  readonly columns?: number;
  readonly toMessage?: (day: DatePickerDay<TValue>) => TMessage;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface RadioGroupWidgetOptions<TValue = string, TMessage = never> extends WidgetLayerOptions {
  readonly id?: string;
  readonly label?: string;
  readonly options: readonly FormOption<TValue>[];
  readonly selected?: string;
  readonly toMessage?: (option: FormOption<TValue>) => TMessage;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface SelectBoxWidgetOptions<TValue = string, TMessage = never> extends WidgetLayerOptions {
  readonly id?: string;
  readonly label?: string;
  readonly options: readonly FormOption<TValue>[];
  readonly selected?: string;
  readonly placeholder?: string;
  readonly toMessage?: (option: FormOption<TValue>) => TMessage;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface TextInputWidgetOptions<TMessage = never> extends WidgetLayerOptions {
  readonly id?: string;
  readonly value?: string;
  readonly cursor?: number;
  readonly selection?: TextSelection;
  readonly placeholder?: string;
  readonly message?: TMessage;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly inputMap?: WidgetInputMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface NumberInputWidgetOptions<TMessage = never> extends WidgetLayerOptions {
  readonly id?: string;
  readonly value?: number;
  readonly cursor?: number;
  readonly placeholder?: string;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly inputMap?: WidgetInputMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export type MenuItemTone = WidgetActionTone;

export interface MenuItem<TMessage = never> extends WidgetActionItem<TMessage>, WidgetHierarchyItem<MenuItem<TMessage>> {
  readonly checked?: boolean;
}

export interface MenuWidgetOptions<TMessage = never> extends WidgetLayerOptions {
  readonly id?: string;
  readonly items: readonly MenuItem<TMessage>[];
  readonly selected?: string;
  readonly emptyText?: string;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface MenuBarWidgetOptions<TMessage = never> extends WidgetLayerOptions {
  readonly id?: string;
  readonly items: readonly MenuItem<TMessage>[];
  readonly selected?: string;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface ContextMenuWidgetOptions<TMessage = never> extends WidgetLayerOptions {
  readonly id?: string;
  readonly items: readonly MenuItem<TMessage>[];
  readonly selected?: string;
  readonly title?: string;
  readonly emptyText?: string;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface DropdownWidgetOptions<TMessage = never> extends WidgetLayerOptions {
  readonly id?: string;
  readonly label?: string;
  readonly items: readonly MenuItem<TMessage>[];
  readonly selected?: string;
  readonly open?: boolean;
  readonly placeholder?: string;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export type DividerOrientation = 'horizontal' | 'vertical';
export type DividerLineKind = 'single' | 'double' | 'heavy' | 'dashed' | 'dotted' | 'ascii' | 'empty';

export interface DividerWidgetOptions<TMessage = never> extends WidgetLayerOptions {
  readonly id?: string;
  readonly orientation?: DividerOrientation;
  readonly line?: DividerLineKind;
  readonly label?: string;
  readonly labelAlign?: 'start' | 'center' | 'end';
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export type TooltipPlacement = 'auto' | 'above' | 'below' | 'left' | 'right' | 'cursor';
export type TooltipTone = Extract<WidgetTone, 'default' | 'info' | 'success' | 'warning' | 'error'>;

export interface TooltipWidgetOptions<TMessage = never> extends WidgetLayerOptions {
  readonly id?: string;
  readonly content: string | readonly string[];
  readonly title?: string;
  readonly tone?: TooltipTone;
  readonly placement?: TooltipPlacement;
  readonly maxWidth?: number;
  readonly border?: BorderStyle;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export type NotificationTone = Extract<WidgetTone, 'info' | 'success' | 'warning' | 'error' | 'progress'>;
export type NotificationPlacement = 'top-right' | 'bottom-right' | 'centered-stack';

export interface NotificationItem extends WidgetTitledItem {
  readonly message?: string;
  readonly tone?: NotificationTone;
  readonly progress?: number;
  readonly createdAt?: number;
  readonly expiresAt?: number;
  readonly paused?: boolean;
}

export interface NotificationStackWidgetOptions<TMessage = never> extends WidgetLayerOptions {
  readonly id?: string;
  readonly items: readonly NotificationItem[];
  readonly selected?: number;
  readonly placement?: NotificationPlacement;
  readonly maxVisible?: number;
  readonly maxWidth?: number;
  readonly toDismissMessage?: (item: NotificationItem) => TMessage;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface CanvasPainterInput {
  readonly buffer: FrameBuffer;
  readonly canvas: Canvas2D;
  readonly bounds: Rect;
  readonly theme: TerminalTheme;
  readonly state?: unknown;
}

export type CanvasPainter = (input: CanvasPainterInput) => void;

export interface CanvasWidgetOptions<TMessage = never> extends WidgetLayerOptions {
  readonly id?: string;
  readonly painter: CanvasPainter;
  readonly state?: unknown;
  readonly label?: string;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface SurfaceWidgetOptions<TMessage = never> extends WidgetLayerOptions, LayoutFlowOptions {
  readonly id?: string;
  readonly label?: string;
  readonly variant?: SurfaceVariant;
  readonly border?: BorderStyle;
  readonly shadow?: boolean;
  readonly disabled?: boolean;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface AbsoluteWidgetOptions<TMessage = never> extends WidgetLayerOptions {
  readonly id?: string;
  readonly row: number;
  readonly column: number;
  readonly width?: number;
  readonly height?: number;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface OverlayWidgetOptions<TMessage = never> extends WidgetLayerOptions {
  readonly id?: string;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface StatusBarWidgetOptions<TMessage> extends WidgetLayerOptions {
  readonly id?: string;
  readonly text: string;
  readonly message?: TMessage;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export type HelpBinding = WidgetKeyBinding;

export interface HelpBarWidgetOptions<TMessage = never> extends WidgetLayerOptions {
  readonly id?: string;
  readonly bindings: readonly HelpBinding[];
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export type ActivityIndicatorStatus = WidgetProcessStatus;

export interface ActivityIndicatorWidgetOptions extends WidgetLayerOptions {
  readonly id?: string;
  readonly label?: string;
  readonly status?: ActivityIndicatorStatus;
  readonly accessibility?: AccessibleNodeDefinition;
}

export type ProgressBarMode = 'compact' | 'full';
export type ProgressBarLabelPosition = 'start' | 'end' | 'none';

export interface ProgressBarWidgetOptions extends WidgetLayerOptions {
  readonly id?: string;
  readonly label?: string;
  readonly value?: number;
  readonly max?: number;
  readonly indeterminate?: boolean;
  readonly barWidth?: number;
  readonly mode?: ProgressBarMode;
  readonly labelPosition?: ProgressBarLabelPosition;
  readonly showPercentage?: boolean;
  readonly elapsedMs?: number;
  readonly remainingMs?: number;
  readonly frame?: number;
  readonly status?: ActivityIndicatorStatus;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface SparklineWidgetOptions extends WidgetLayerOptions {
  readonly id?: string;
  readonly values: readonly number[];
  readonly min?: number;
  readonly max?: number;
  readonly status?: ActivityIndicatorStatus;
  readonly emptyText?: string;
  readonly loadingText?: string;
  readonly errorText?: string;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface BarChartItem {
  readonly label: string;
  readonly value: number;
}

export interface BarChartWidgetOptions<TMessage = never> extends WidgetLayerOptions {
  readonly id?: string;
  readonly items: readonly BarChartItem[];
  readonly max?: number;
  readonly selected?: number;
  readonly status?: ActivityIndicatorStatus;
  readonly emptyText?: string;
  readonly loadingText?: string;
  readonly errorText?: string;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface ChartSeries {
  readonly id: string;
  readonly label?: string;
  readonly points: readonly number[];
  readonly kind?: ChartSeriesKind;
  readonly glyph?: string;
}

export type ChartSeriesKind = 'line' | 'scatter';

export interface ChartPointSelection {
  readonly series: string;
  readonly point: number;
}

export interface ChartPointEvent {
  readonly series: string;
  readonly seriesLabel?: string;
  readonly point: number;
  readonly value: number;
}

export interface ChartWidgetOptions<TMessage = never> extends WidgetLayerOptions {
  readonly id?: string;
  readonly series: readonly ChartSeries[];
  readonly min?: number;
  readonly max?: number;
  readonly selected?: ChartPointSelection;
  readonly legend?: boolean;
  readonly xLabel?: string;
  readonly yLabel?: string;
  readonly status?: ActivityIndicatorStatus;
  readonly emptyText?: string;
  readonly loadingText?: string;
  readonly errorText?: string;
  readonly toMessage?: (point: ChartPointEvent) => TMessage;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export type GaugeVariant = 'linear' | 'dial';

export interface GaugeWidgetOptions extends WidgetLayerOptions {
  readonly id?: string;
  readonly label?: string;
  readonly value: number;
  readonly min?: number;
  readonly max?: number;
  readonly width?: number;
  readonly variant?: GaugeVariant;
  readonly status?: ActivityIndicatorStatus;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface HeatmapCell<TValue = unknown> {
  readonly id: string;
  readonly label?: string;
  readonly value: number;
  readonly payload?: TValue;
  readonly disabled?: boolean;
}

export interface HeatmapSelection {
  readonly row: number;
  readonly column: number;
}

export interface HeatmapWidgetOptions<TValue = unknown, TMessage = never> extends WidgetLayerOptions {
  readonly id?: string;
  readonly rows: readonly (readonly HeatmapCell<TValue>[])[];
  readonly min?: number;
  readonly max?: number;
  readonly selected?: HeatmapSelection;
  readonly cellWidth?: number;
  readonly gap?: number;
  readonly status?: ActivityIndicatorStatus;
  readonly emptyText?: string;
  readonly loadingText?: string;
  readonly errorText?: string;
  readonly toMessage?: (cell: HeatmapCell<TValue>, row: number, column: number) => TMessage;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface SpinnerWidgetOptions extends WidgetLayerOptions {
  readonly id?: string;
  readonly frames?: readonly string[];
  readonly frameIndex?: number;
  readonly label?: string;
  readonly status?: ActivityIndicatorStatus;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface ViewportWidgetOptions<TMessage = never> extends WidgetLayerOptions, LayoutFlowOptions {
  readonly id?: string;
  readonly scrollRow?: number;
  readonly scrollColumn?: number;
  readonly contentRows?: number;
  readonly contentColumns?: number;
  readonly scrollbar?: ScrollbarOptions;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface ScrollbackItem {
  readonly id: string;
  readonly text: string;
  readonly style?: TerminalStyle;
  readonly timestamp?: string;
  readonly metadata?: Record<string, string>;
}

export interface ScrollbackWidgetOptions<TMessage = never> extends WidgetLayerOptions {
  readonly id?: string;
  readonly items: readonly ScrollbackItem[];
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly wrap?: boolean;
  readonly searchQuery?: string;
  readonly selectedRange?: TextSelection;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export type StructuredBlockStatus = WidgetRecordStatus;

export type StructuredBlockField = WidgetFieldItem;

export interface StructuredBlock extends WidgetTitledItem {
  readonly summary?: string;
  readonly style?: TerminalStyle;
  readonly status?: StructuredBlockStatus;
  readonly fields?: readonly StructuredBlockField[];
  readonly body?: string;
  readonly details?: string;
  readonly collapsed?: boolean;
}

export interface StructuredBlockWidgetOptions<TMessage = never> extends StructuredBlock, WidgetLayerOptions {
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface ActivityFeedWidgetOptions<TMessage = never> extends WidgetLayerOptions {
  readonly id?: string;
  readonly blocks: readonly StructuredBlock[];
  readonly selected?: number;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export type CommandBarSuggestion = WidgetSuggestionItem;

export type CommandBarValidationTone = WidgetValidationTone;

export interface CommandBarValidation {
  readonly message: string;
  readonly tone?: CommandBarValidationTone;
}

export interface CommandBarWidgetOptions<TMessage = never> extends WidgetLayerOptions {
  readonly id?: string;
  readonly value?: string;
  readonly cursor?: number;
  readonly selection?: TextSelection;
  readonly prompt?: string;
  readonly placeholder?: string;
  readonly completionPreview?: string;
  readonly validation?: CommandBarValidation;
  readonly footer?: string;
  readonly matchQuery?: string;
  readonly suggestions?: readonly CommandBarSuggestion[];
  readonly selectedSuggestion?: number;
  readonly historyIndex?: number;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly inputMap?: WidgetInputMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export type PaletteEntry<TValue = string> = WidgetSearchEntry<TValue>;

export interface PaletteWidgetOptions<TValue = string, TMessage = never> extends WidgetLayerOptions {
  readonly id?: string;
  readonly title?: string;
  readonly query?: string;
  readonly entries: readonly PaletteEntry<TValue>[];
  readonly toMessage?: (entry: PaletteEntry<TValue>) => TMessage;
  readonly selected?: number;
  readonly selectedId?: string;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly maxVisible?: number;
  readonly helpText?: string;
  readonly emptyText?: string;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly inputMap?: WidgetInputMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface GridWidgetOptions<TMessage = never> extends WidgetLayerOptions, GridLayoutOptions {
  readonly id?: string;
  readonly rows: readonly LayoutSize[];
  readonly columns: readonly LayoutSize[];
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface GridAreasWidgetOptions<TMessage = never> extends WidgetLayerOptions, GridLayoutOptions {
  readonly id?: string;
  readonly areas: string;
  readonly children: Readonly<Record<string, Widget<TMessage>>>;
  readonly rows: readonly LayoutSize[];
  readonly columns: readonly LayoutSize[];
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface SplitPaneWidgetOptions<TMessage = never> extends WidgetLayerOptions, LayoutFlowOptions {
  readonly id?: string;
  readonly direction: 'horizontal' | 'vertical';
  readonly sizes?: readonly LayoutSize[];
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface TabItem<TMessage = never> extends WidgetNavigationItem<TMessage> {
  readonly panel: Widget<TMessage>;
}

export interface TabsWidgetOptions<TMessage = never> extends WidgetLayerOptions, LayoutFlowOptions {
  readonly id?: string;
  readonly tabs: readonly TabItem<TMessage>[];
  readonly selected?: string;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface ModalWidgetOptions<TMessage = never> extends WidgetLayerOptions, LayoutFlowOptions {
  readonly id?: string;
  readonly title?: string;
  readonly border?: BorderStyle;
  readonly width?: number;
  readonly height?: number;
  readonly actions?: Widget<TMessage>;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}
