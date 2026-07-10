import type { AccessibilityOptions, AccessibleNode } from '../accessibility/index.ts';
import type { TextSelection } from '../text/index.ts';
import type { BorderStyle, BorderTitle } from '../tui/border.ts';
import type { RenderSpan, TerminalStyle } from '../tui/render-primitives.ts';
import type {
  GridLayoutOptions,
  LayoutAlignment,
  LayoutFlowOptions,
  LayoutInsetInput,
  LayoutJustification,
  LayoutOverflow,
  LayoutSize
} from '../tui/regions.ts';
import type { ScrollPolicy, ScrollState, ScrollEvent } from '../tui/scroll.ts';
import type { ScrollbarOptions } from '../tui/scrollbar.ts';
import type { TextPointerEvent } from '../tui/text-pointer.ts';
import type { RoutedPointerEvent } from '../tui/pointer-types.ts';
import type { Canvas2D } from '../tui/canvas2d/index.ts';
import type { Rect, RegionOpacity } from '../tui/layout.ts';
import type { TerminalTheme, ThemeColorToken } from '../theme/index.ts';
import type { SurfaceVariant } from '../tui/surface.ts';
import type { Element } from './element.ts';
import type { CommandBarAction } from './command-bar.ts';
import type { PaletteAction } from './palette.ts';
import type {
  ActionItem,
  ChoiceItem,
  FieldItem,
  HierarchyItem,
  HelpBinding,
  LogLevel,
  NavigationItem,
  ProcessStatus,
  RecordStatus,
  SearchEntry,
  SuggestionItem,
  TitledItem,
  ComponentTone,
  TreeItemBase,
  ComponentValidationTone
} from './contracts.ts';

export type ComponentKeyBindings<TMessage> = Record<string, TMessage>;
export type ComponentOverflowPriority = 'required' | 'important' | 'secondary' | 'decorative';
export interface ComponentLayerOptions {
  readonly zIndex?: number;
  readonly visible?: boolean;
  readonly opacity?: RegionOpacity;
  readonly overflowPriority?: ComponentOverflowPriority;
}

export type ComponentVisualState =
  | 'default'
  | 'focused'
  | 'selected'
  | 'disabled'
  | 'active'
  | 'error'
  | 'warning'
  | 'success';

export type TextRole =
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

export type SurfaceVisualState = Extract<ComponentVisualState, 'active' | 'selected' | 'error' | 'warning' | 'success'>;

export interface ComponentStyleSlots {
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
export type ComponentFocusScope = 'none' | 'contain';
export interface ComponentFocusOptions {
  readonly disabled?: boolean;
  readonly order?: number;
  readonly scope?: ComponentFocusScope;
}
export type AccessibleNodeDefinition = AccessibleNode | AccessibilityOptions;
export interface ComponentMeta {
  readonly accessibility?: AccessibleNodeDefinition;
  readonly focus?: ComponentFocusOptions;
  readonly layer?: ComponentLayerOptions;
  readonly styles?: ComponentStyleSlots;
}
export interface ComponentOptions {
  readonly id?: string;
  readonly meta?: ComponentMeta;
}
export interface ComponentTextInputHandlers<TMessage> {
  readonly onInput?: (text: string) => TMessage;
  readonly onPaste?: (text: string) => TMessage;
}

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

export interface FormOptions<TMessage = never> extends ComponentOptions, LayoutFlowOptions {
  readonly title?: string;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface FieldOptions<TMessage = never> extends ComponentOptions, LayoutFlowOptions {
  readonly label: string;
  readonly description?: string;
  readonly error?: string;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface LabelOptions<TMessage = never> extends ComponentOptions {
  readonly text: string;
  readonly forId?: string;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export type ButtonTone = Extract<ComponentTone, 'default' | 'primary' | 'secondary' | 'destructive'>;

export interface ButtonOptions<TMessage = never> extends ComponentOptions {
  readonly label: string;
  readonly onPress?: TMessage;
  readonly disabled?: boolean;
  readonly tone?: ButtonTone;
  readonly pressed?: boolean;
  readonly pending?: boolean;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface CheckboxOptions<TMessage = never> extends ComponentOptions {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange?: (checked: boolean) => TMessage;
  readonly onTextPointer?: (event: TextPointerEvent) => TMessage;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface ToggleSwitchOptions<TMessage = never> extends ComponentOptions {
  readonly label: string;
  readonly checked: boolean;
  readonly onLabel?: string;
  readonly offLabel?: string;
  readonly onChange?: (checked: boolean) => TMessage;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface SliderOptions<TMessage = never> extends ComponentOptions {
  readonly label?: string;
  readonly value: number;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly width?: number;
  readonly onChange?: (value: number) => TMessage;
  readonly onStep?: (event: SliderStepEvent) => TMessage;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export type SliderStepDirection = 'decrement' | 'increment';

export interface SliderStepEvent {
  readonly direction: SliderStepDirection;
}

export interface RangeSliderValue {
  readonly start: number;
  readonly end: number;
}

export interface RangeSliderOptions<TMessage = never> extends ComponentOptions {
  readonly label?: string;
  readonly start: number;
  readonly end: number;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly width?: number;
  readonly onChange?: (value: RangeSliderValue) => TMessage;
  readonly onStep?: (event: RangeSliderStepEvent) => TMessage;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface RangeSliderStepEvent {
  readonly handle: 'start' | 'end';
  readonly direction: SliderStepDirection;
}

export interface CheckboxListOptions<TValue = string, TMessage = never> extends ComponentOptions {
  readonly label?: string;
  readonly options: readonly ChoiceItem<TValue>[];
  readonly selected?: readonly string[];
  readonly onChange?: (option: ChoiceItem<TValue>, checked: boolean) => TMessage;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface ColorPickerOption<TValue = string> extends ChoiceItem<TValue> {
  readonly swatch?: string;
  readonly style?: TerminalStyle;
}

export interface ColorPickerOptions<TValue = string, TMessage = never> extends ComponentOptions {
  readonly label?: string;
  readonly options: readonly ColorPickerOption<TValue>[];
  readonly selected?: string;
  readonly columns?: number;
  readonly onChange?: (option: ColorPickerOption<TValue>) => TMessage;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface DatePickerDay<TValue = string> extends ChoiceItem<TValue> {
  readonly today?: boolean;
  readonly outsideMonth?: boolean;
}

export interface DatePickerOptions<TValue = string, TMessage = never> extends ComponentOptions {
  readonly label?: string;
  readonly days: readonly DatePickerDay<TValue>[];
  readonly selected?: string;
  readonly columns?: number;
  readonly onChange?: (day: DatePickerDay<TValue>) => TMessage;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface RadioGroupOptions<TValue = string, TMessage = never> extends ComponentOptions {
  readonly label?: string;
  readonly options: readonly ChoiceItem<TValue>[];
  readonly selected?: string;
  readonly onChange?: (option: ChoiceItem<TValue>) => TMessage;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface SelectBoxOptions<TValue = string, TMessage = never> extends ComponentOptions {
  readonly label?: string;
  readonly options: readonly ChoiceItem<TValue>[];
  readonly selected?: string;
  readonly placeholder?: string;
  readonly onChange?: (option: ChoiceItem<TValue>) => TMessage;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface TextInputOptions<TMessage = never> extends ComponentOptions {
  readonly value?: string;
  readonly cursor?: number;
  readonly selection?: TextSelection;
  readonly placeholder?: string;
  readonly onSubmit?: TMessage;
  readonly onTextPointer?: (event: TextPointerEvent) => TMessage;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly keys?: ComponentKeyBindings<TMessage>;
  readonly onInput?: (text: string) => TMessage;
  readonly onPaste?: (text: string) => TMessage;
}

export interface NumberInputOptions<TMessage = never> extends ComponentOptions {
  readonly value?: number;
  readonly cursor?: number;
  readonly placeholder?: string;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly keys?: ComponentKeyBindings<TMessage>;
  readonly onInput?: (text: string) => TMessage;
  readonly onPaste?: (text: string) => TMessage;
}

export interface MenuItem<TMessage = never> extends ActionItem<TMessage>, HierarchyItem<MenuItem<TMessage>> {
  readonly checked?: boolean;
}

export interface MenuOptions<TMessage = never> extends ComponentOptions {
  readonly items: readonly MenuItem<TMessage>[];
  readonly selected?: string;
  readonly emptyText?: string;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly onScroll?: (event: ScrollEvent) => TMessage;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface MenuBarOptions<TMessage = never> extends ComponentOptions {
  readonly items: readonly MenuItem<TMessage>[];
  readonly selected?: string;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface ContextMenuOptions<TMessage = never> extends ComponentOptions {
  readonly items: readonly MenuItem<TMessage>[];
  readonly selected?: string;
  readonly title?: string;
  readonly emptyText?: string;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly onScroll?: (event: ScrollEvent) => TMessage;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface DropdownOptions<TMessage = never> extends ComponentOptions {
  readonly label?: string;
  readonly items: readonly MenuItem<TMessage>[];
  readonly selected?: string;
  readonly open?: boolean;
  readonly placeholder?: string;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export type DividerOrientation = 'horizontal' | 'vertical';
export type DividerLineKind = 'single' | 'double' | 'heavy' | 'dashed' | 'dotted' | 'ascii' | 'empty';

export interface DividerOptions<TMessage = never> extends ComponentOptions {
  readonly orientation?: DividerOrientation;
  readonly line?: DividerLineKind;
  readonly label?: string;
  readonly labelAlign?: 'start' | 'center' | 'end';
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export type TooltipPlacement = 'auto' | 'above' | 'below' | 'left' | 'right' | 'cursor';
export type TooltipTone = Extract<ComponentTone, 'default' | 'info' | 'success' | 'warning' | 'error'>;

export interface TooltipOptions<TMessage = never> extends ComponentOptions {
  readonly content: string | readonly string[];
  readonly title?: string;
  readonly tone?: TooltipTone;
  readonly placement?: TooltipPlacement;
  readonly maxWidth?: number;
  readonly border?: BorderStyle;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export type NotificationTone = Extract<ComponentTone, 'info' | 'success' | 'warning' | 'error' | 'progress'>;
export type NotificationPlacement = 'top-right' | 'bottom-right' | 'centered-stack';

export interface NotificationItem extends TitledItem {
  readonly message?: string;
  readonly tone?: NotificationTone;
  readonly progress?: number;
  readonly createdAt?: number;
  readonly expiresAt?: number;
  readonly paused?: boolean;
}

export interface NotificationStackOptions<TMessage = never> extends ComponentOptions {
  readonly items: readonly NotificationItem[];
  readonly selected?: number;
  readonly placement?: NotificationPlacement;
  readonly maxVisible?: number;
  readonly maxWidth?: number;
  readonly onDismiss?: (item: NotificationItem) => TMessage;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface CanvasPainterInput {
  readonly canvas: Canvas2D;
  readonly bounds: Rect;
  readonly theme: TerminalTheme;
  readonly state?: unknown;
}

export type CanvasPainter = (input: CanvasPainterInput) => void;

export interface CanvasOptions<TMessage = never> extends ComponentOptions {
  readonly painter: CanvasPainter;
  readonly state?: unknown;
  readonly label?: string;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface SurfaceOptions<TMessage = never> extends ComponentOptions {
  readonly label?: string;
  readonly title?: BorderTitle;
  readonly variant?: SurfaceVariant;
  readonly visualState?: SurfaceVisualState;
  readonly border?: BorderStyle;
  readonly shadow?: boolean;
  readonly disabled?: boolean;
  readonly padding?: LayoutInsetInput;
  readonly margin?: LayoutInsetInput;
  readonly minWidth?: number;
  readonly minHeight?: number;
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  readonly align?: LayoutAlignment;
  readonly justify?: LayoutJustification;
  readonly overflow?: LayoutOverflow;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface AbsoluteOptions<TMessage = never> extends ComponentOptions {
  readonly row: number;
  readonly column: number;
  readonly width?: number;
  readonly height?: number;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface OverlayOptions<TMessage = never> extends ComponentOptions {
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface StatusBarOptions<TMessage> extends ComponentOptions {
  readonly text: string;
  readonly onPress?: TMessage;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface HelpBarOptions<TMessage = never> extends ComponentOptions {
  readonly bindings: readonly HelpBinding[];
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface ActivityIndicatorOptions extends ComponentOptions {
  readonly label?: string;
  readonly status?: ProcessStatus;
}

export type ProgressBarDisplay = 'bar' | 'bar+percent' | 'bar+value' | 'bar+value+percent';
export type ProgressBarLabelPosition = 'start' | 'end' | 'none';

export interface ValueScaleStop {
  readonly at: number;
  readonly token: ThemeColorToken;
  readonly label?: string;
}

export type ValueScale = readonly ValueScaleStop[];

export interface ProgressBarOptions extends ComponentOptions {
  readonly label?: string;
  readonly value?: number;
  readonly max?: number;
  readonly indeterminate?: boolean;
  readonly barWidth?: number;
  readonly display?: ProgressBarDisplay;
  readonly labelPosition?: ProgressBarLabelPosition;
  readonly elapsedMs?: number;
  readonly remainingMs?: number;
  readonly frame?: number;
  readonly status?: ProcessStatus;
  readonly valueScale?: ValueScale;
}

export interface SparklineOptions extends ComponentOptions {
  readonly values: readonly number[];
  readonly min?: number;
  readonly max?: number;
  readonly status?: ProcessStatus;
  readonly valueScale?: ValueScale;
  readonly emptyText?: string;
  readonly loadingText?: string;
  readonly errorText?: string;
}

export interface BarChartItem {
  readonly label: string;
  readonly value: number;
}

export interface BarChartOptions<TMessage = never> extends ComponentOptions {
  readonly items: readonly BarChartItem[];
  readonly max?: number;
  readonly selected?: number;
  readonly status?: ProcessStatus;
  readonly emptyText?: string;
  readonly loadingText?: string;
  readonly errorText?: string;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface ChartSeries {
  readonly id: string;
  readonly label?: string;
  readonly points: readonly number[];
  readonly kind?: ChartSeriesKind;
  readonly glyph?: string;
  readonly valueScale?: ValueScale;
  readonly sampleMode?: ChartSampleMode;
  readonly sampleAlign?: ChartSampleAlign;
  readonly interpolation?: ChartInterpolation;
}

export type ChartSeriesKind = 'line' | 'scatter' | 'area' | 'bar';
export type ChartSampleMode = 'one-per-column' | 'fit' | 'window';
export type ChartSampleAlign = 'start' | 'end';
export type ChartInterpolation = 'nearest' | 'linear';

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

export interface ChartOptions<TMessage = never> extends ComponentOptions {
  readonly series: readonly ChartSeries[];
  readonly min?: number;
  readonly max?: number;
  readonly selected?: ChartPointSelection;
  readonly legend?: boolean;
  readonly signedDomain?: boolean;
  readonly xLabel?: string;
  readonly yLabel?: string;
  readonly status?: ProcessStatus;
  readonly valueScale?: ValueScale;
  readonly sampleMode?: ChartSampleMode;
  readonly sampleAlign?: ChartSampleAlign;
  readonly interpolation?: ChartInterpolation;
  readonly emptyText?: string;
  readonly loadingText?: string;
  readonly errorText?: string;
  readonly onSelect?: (point: ChartPointEvent) => TMessage;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export type GaugeVariant = 'linear' | 'dial';

export interface GaugeOptions extends ComponentOptions {
  readonly label?: string;
  readonly value: number;
  readonly min?: number;
  readonly max?: number;
  readonly width?: number;
  readonly variant?: GaugeVariant;
  readonly status?: ProcessStatus;
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

export interface HeatmapOptions<TValue = unknown, TMessage = never> extends ComponentOptions {
  readonly rows: readonly (readonly HeatmapCell<TValue>[])[];
  readonly min?: number;
  readonly max?: number;
  readonly selected?: HeatmapSelection;
  readonly cellWidth?: number;
  readonly gap?: number;
  readonly status?: ProcessStatus;
  readonly valueScale?: ValueScale;
  readonly emptyText?: string;
  readonly loadingText?: string;
  readonly errorText?: string;
  readonly onSelect?: (cell: HeatmapCell<TValue>, row: number, column: number) => TMessage;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface SpinnerOptions extends ComponentOptions {
  readonly frames?: readonly string[];
  readonly frameIndex?: number;
  readonly label?: string;
  readonly status?: ProcessStatus;
}

export interface ViewportOptions<TMessage = never> extends ComponentOptions, LayoutFlowOptions {
  readonly scrollRow?: number;
  readonly scrollColumn?: number;
  readonly contentRows?: number;
  readonly contentColumns?: number;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly onScroll?: (event: ScrollEvent) => TMessage;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface ScrollbackItem {
  readonly id: string;
  readonly text: string;
  readonly level?: LogLevel;
  readonly style?: TerminalStyle;
  readonly timestamp?: string;
  readonly metadata?: Record<string, string>;
}

export interface ScrollbackOptions<TMessage = never> extends ComponentOptions {
  readonly items: readonly ScrollbackItem[];
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly onScroll?: (event: ScrollEvent) => TMessage;
  readonly wrap?: boolean;
  readonly searchQuery?: string;
  readonly selectedRange?: TextSelection;
  readonly keys?: ComponentKeyBindings<TMessage>;
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

export interface StructuredBlockOptions<TMessage = never> extends ComponentOptions {
  readonly title: string;
  readonly summary?: string;
  readonly style?: TerminalStyle;
  readonly status?: RecordStatus;
  readonly fields?: readonly FieldItem[];
  readonly body?: string;
  readonly details?: string;
  readonly collapsed?: boolean;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface ActivityFeedOptions<TMessage = never> extends ComponentOptions {
  readonly blocks: readonly StructuredBlock[];
  readonly selected?: number;
  readonly onSelect?: (block: StructuredBlock, index: number) => TMessage;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface CommandBarValidation {
  readonly message: string;
  readonly tone?: ComponentValidationTone;
}

export type CommandBarDisplay = 'compact' | 'expanded';

export interface CommandBarOptions<TMessage = never> extends ComponentOptions {
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
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface PaletteOptions<TValue = string, TMessage = never> extends ComponentOptions {
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
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface GridOptions<TMessage = never> extends ComponentOptions, GridLayoutOptions {
  readonly rows: readonly LayoutSize[];
  readonly columns: readonly LayoutSize[];
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface GridAreasOptions<TMessage = never> extends ComponentOptions, GridLayoutOptions {
  readonly areas: string;
  readonly children: Readonly<Record<string, Element<TMessage>>>;
  readonly rows: readonly LayoutSize[];
  readonly columns: readonly LayoutSize[];
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface SplitPaneOptions<TMessage = never> extends ComponentOptions, LayoutFlowOptions {
  readonly direction: 'horizontal' | 'vertical';
  readonly sizes?: readonly LayoutSize[];
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface TabItem<TMessage = never> extends NavigationItem<TMessage> {
  readonly badge?: string;
  readonly onClose?: TMessage;
  readonly panel: Element<TMessage>;
}

export interface TabsOptions<TMessage = never> extends ComponentOptions, LayoutFlowOptions {
  readonly tabs: readonly TabItem<TMessage>[];
  readonly selected?: string;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface ModalOptions<TMessage = never> extends ComponentOptions, LayoutFlowOptions {
  readonly title?: string;
  readonly border?: BorderStyle;
  readonly width?: number;
  readonly height?: number;
  readonly actions?: Element<TMessage>;
  readonly keys?: ComponentKeyBindings<TMessage>;
}
