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
  CommandBarRenderProps,
  PaletteRenderProps,
  ScrollbackRenderProps,
  StructuredBlockRenderProps,
  ViewportRenderProps
} from './documents.ts';
import type {
  ActivityIndicatorRenderProps,
  BarChartRenderProps,
  ChartRenderProps,
  GaugeRenderProps,
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
  CheckboxListRenderProps,
  CheckboxRenderProps,
  ColorPickerRenderProps,
  DatePickerRenderProps,
  FieldRenderProps,
  FormRenderProps,
  LabelRenderProps,
  NumberInputRenderProps,
  RadioGroupRenderProps,
  RangeSliderRenderProps,
  SelectBoxRenderProps,
  SliderRenderProps,
  TextInputRenderProps,
  ToggleSwitchRenderProps
} from './forms.ts';
import type {
  GridRenderProps,
  ModalRenderProps,
  RowRenderProps,
  SplitPaneRenderProps,
  StackRenderProps,
  TabsRenderProps
} from './layout.ts';
import type {
  ContextMenuRenderProps,
  DividerRenderProps,
  DropdownRenderProps,
  MenuBarRenderProps,
  MenuRenderProps,
  TooltipRenderProps
} from './menus.ts';
import type {
  AbsoluteRenderProps,
  CanvasRenderProps,
  OverlayRenderProps,
  SurfaceRenderProps
} from './surfaces.ts';

export interface RenderNodePropsByKind<TMessage> {
  readonly text: TextRenderProps;
  readonly richText: RichTextRenderProps;
  readonly stack: StackRenderProps;
  readonly row: RowRenderProps;
  readonly list: ListRenderProps<TMessage>;
  readonly table: TableRenderProps<TMessage>;
  readonly tree: TreeRenderProps<TMessage>;
  readonly paginator: PaginatorRenderProps;
  readonly textArea: TextAreaRenderProps<TMessage>;
  readonly form: FormRenderProps;
  readonly field: FieldRenderProps;
  readonly label: LabelRenderProps;
  readonly button: ButtonRenderProps<TMessage>;
  readonly checkbox: CheckboxRenderProps<TMessage>;
  readonly toggleSwitch: ToggleSwitchRenderProps<TMessage>;
  readonly slider: SliderRenderProps<TMessage>;
  readonly rangeSlider: RangeSliderRenderProps<TMessage>;
  readonly checkboxList: CheckboxListRenderProps<TMessage>;
  readonly colorPicker: ColorPickerRenderProps<TMessage>;
  readonly datePicker: DatePickerRenderProps<TMessage>;
  readonly radioGroup: RadioGroupRenderProps<TMessage>;
  readonly selectBox: SelectBoxRenderProps<TMessage>;
  readonly textInput: TextInputRenderProps<TMessage>;
  readonly numberInput: NumberInputRenderProps;
  readonly menu: MenuRenderProps<TMessage>;
  readonly menuBar: MenuBarRenderProps<TMessage>;
  readonly contextMenu: ContextMenuRenderProps<TMessage>;
  readonly dropdown: DropdownRenderProps<TMessage>;
  readonly divider: DividerRenderProps;
  readonly tooltip: TooltipRenderProps;
  readonly notificationStack: NotificationStackRenderProps<TMessage>;
  readonly canvas: CanvasRenderProps;
  readonly surface: SurfaceRenderProps;
  readonly absolute: AbsoluteRenderProps;
  readonly overlay: OverlayRenderProps;
  readonly statusBar: StatusBarRenderProps;
  readonly helpBar: HelpBarRenderProps;
  readonly activityIndicator: ActivityIndicatorRenderProps;
  readonly progressBar: ProgressBarRenderProps;
  readonly spinner: SpinnerRenderProps;
  readonly sparkline: SparklineRenderProps;
  readonly barChart: BarChartRenderProps;
  readonly chart: ChartRenderProps<TMessage>;
  readonly gauge: GaugeRenderProps;
  readonly heatmap: HeatmapRenderProps<TMessage>;
  readonly viewport: ViewportRenderProps<TMessage>;
  readonly scrollback: ScrollbackRenderProps<TMessage>;
  readonly structuredBlock: StructuredBlockRenderProps;
  readonly activityFeed: ActivityFeedRenderProps<TMessage>;
  readonly commandBar: CommandBarRenderProps<TMessage>;
  readonly palette: PaletteRenderProps<TMessage>;
  readonly grid: GridRenderProps;
  readonly splitPane: SplitPaneRenderProps;
  readonly tabs: TabsRenderProps<TMessage>;
  readonly modal: ModalRenderProps;
  readonly custom: Record<never, never>;
}

export type * from './content.ts';
export type * from './documents.ts';
export type * from './feedback.ts';
export type * from './forms.ts';
export type * from './layout.ts';
export type * from './menus.ts';
export type * from './surfaces.ts';
