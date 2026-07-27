import type {
  ListRenderProps,
  PaginatorRenderProps,
  RichTextRenderProps,
  TableRenderProps,
  TextAreaRenderProps,
  TextRenderProps,
  TreeRenderProps
} from './content.ts';
import type {
  ActivityFeedRenderProps,
  CommandInputRenderProps,
  SearchPickerRenderProps,
  LogViewerRenderProps,
  StructuredBlockRenderProps,
  ViewportRenderProps
} from './documents.ts';
import type {
  StatusIndicatorRenderProps,
  BarChartRenderProps,
  ChartRenderProps,
  MeterRenderProps,
  HeatmapRenderProps,
  HelpBarRenderProps,
  NotificationStackRenderProps,
  ProgressBarRenderProps,
  SparklineRenderProps,
  SpinnerRenderProps,
  StatusBarRenderProps
} from './feedback.ts';
import type {
  ButtonRenderProps,
  CheckboxGroupRenderProps,
  CheckboxRenderProps,
  ColorSwatchPickerRenderProps,
  CalendarRenderProps,
  FieldRenderProps,
  FormRenderProps,
  LabelRenderProps,
  NumberInputRenderProps,
  RadioGroupRenderProps,
  RangeSliderRenderProps,
  SelectRenderProps,
  SliderRenderProps,
  TextInputRenderProps,
  ToggleSwitchRenderProps
} from './forms.ts';
import type {
  GridRenderProps,
  ColumnRenderProps,
  SplitPaneRenderProps
} from './layout.ts';
import type { DialogRenderProps } from './dialog.ts';
import type { TabsRenderProps } from './tabs.ts';
import type {
  ContextMenuRenderProps,
  DividerRenderProps,
  DropdownMenuRenderProps,
  MenuBarRenderProps,
  MenuRenderProps,
  TooltipRenderProps
} from './menus.ts';
import type {
  AbsoluteRenderProps,
  CanvasRenderProps,
  SurfaceRenderProps
} from './surfaces.ts';

export interface RenderNodePropsByKind<TMessage> {
  readonly text: TextRenderProps;
  readonly richText: RichTextRenderProps;
  readonly column: ColumnRenderProps;
  readonly row: ColumnRenderProps;
  readonly list: ListRenderProps<TMessage>;
  readonly table: TableRenderProps<TMessage>;
  readonly tree: TreeRenderProps<TMessage>;
  readonly paginator: PaginatorRenderProps<TMessage>;
  readonly textArea: TextAreaRenderProps<TMessage>;
  readonly form: FormRenderProps;
  readonly field: FieldRenderProps;
  readonly label: LabelRenderProps;
  readonly button: ButtonRenderProps<TMessage>;
  readonly checkbox: CheckboxRenderProps<TMessage>;
  readonly toggleSwitch: ToggleSwitchRenderProps<TMessage>;
  readonly slider: SliderRenderProps<TMessage>;
  readonly rangeSlider: RangeSliderRenderProps<TMessage>;
  readonly checkboxGroup: CheckboxGroupRenderProps<TMessage>;
  readonly colorSwatchPicker: ColorSwatchPickerRenderProps<TMessage>;
  readonly calendar: CalendarRenderProps<TMessage>;
  readonly radioGroup: RadioGroupRenderProps<TMessage>;
  readonly select: SelectRenderProps<TMessage>;
  readonly textInput: TextInputRenderProps<TMessage>;
  readonly passwordInput: TextInputRenderProps<TMessage>;
  readonly numberInput: NumberInputRenderProps<TMessage>;
  readonly menu: MenuRenderProps<TMessage>;
  readonly menuBar: MenuBarRenderProps<TMessage>;
  readonly contextMenu: ContextMenuRenderProps<TMessage>;
  readonly dropdownMenu: DropdownMenuRenderProps<TMessage>;
  readonly divider: DividerRenderProps;
  readonly tooltip: TooltipRenderProps;
  readonly notificationStack: NotificationStackRenderProps<TMessage>;
  readonly canvas: CanvasRenderProps;
  readonly surface: SurfaceRenderProps;
  readonly absolute: AbsoluteRenderProps;
  readonly overlay: Record<never, never>;
  readonly statusBar: StatusBarRenderProps;
  readonly helpBar: HelpBarRenderProps;
  readonly statusIndicator: StatusIndicatorRenderProps;
  readonly progressBar: ProgressBarRenderProps;
  readonly spinner: SpinnerRenderProps;
  readonly sparkline: SparklineRenderProps;
  readonly barChart: BarChartRenderProps<TMessage>;
  readonly chart: ChartRenderProps<TMessage>;
  readonly meter: MeterRenderProps;
  readonly heatmap: HeatmapRenderProps<TMessage>;
  readonly viewport: ViewportRenderProps<TMessage>;
  readonly logViewer: LogViewerRenderProps<TMessage>;
  readonly structuredBlock: StructuredBlockRenderProps;
  readonly activityFeed: ActivityFeedRenderProps<TMessage>;
  readonly commandInput: CommandInputRenderProps<TMessage>;
  readonly searchPicker: SearchPickerRenderProps<TMessage>;
  readonly grid: GridRenderProps;
  readonly splitPane: SplitPaneRenderProps<TMessage>;
  readonly tabs: TabsRenderProps<TMessage>;
  readonly dialog: DialogRenderProps<TMessage>;
  readonly custom: Record<never, never>;
}

export type * from './content.ts';
export type * from './dialog.ts';
export type * from './documents.ts';
export type * from './feedback.ts';
export type * from './forms.ts';
export type * from './layout.ts';
export type * from './menus.ts';
export type * from './surfaces.ts';
export type * from './tabs.ts';
