export type TextStylePart = 'content';
export type RichTextStylePart = 'content' | 'link';
/** @experimental */
export type ImageStylePart = 'fallback';
export type LinkStylePart = 'label';
export type DisclosureStylePart = 'marker' | 'label' | 'summary';
export type DataListStylePart = 'marker' | 'item' | 'description' | 'match' | 'empty' | 'scrollbarTrack' | 'scrollbarThumb';
export type SemanticListStylePart = 'marker' | 'item';
export type ListViewStylePart = 'marker' | 'item' | 'scrollbarTrack' | 'scrollbarThumb';
export type TableStylePart =
  | 'header'
  | 'headerCell'
  | 'sortIndicator'
  | 'marker'
  | 'row'
  | 'cell'
  | 'metric'
  | 'metadata'
  | 'empty'
  | 'scrollbarTrack'
  | 'scrollbarThumb';
export type TreeStylePart =
  | 'marker'
  | 'indent'
  | 'disclosure'
  | 'icon'
  | 'label'
  | 'metadata'
  | 'match'
  | 'placeholder'
  | 'empty'
  | 'scrollbarTrack'
  | 'scrollbarThumb';
export type PaginationStylePart = 'control' | 'label' | 'value' | 'separator';
export type TextEntryStylePart =
  | 'border'
  | 'label'
  | 'value'
  | 'placeholder'
  | 'selection'
  | 'cursor'
  | 'error';
export type TextAreaStylePart =
  | 'value'
  | 'placeholder'
  | 'selection'
  | 'cursor'
  | 'error'
  | 'gutter'
  | 'lineNumber'
  | 'activeLine'
  | 'highlight'
  | 'scrollbarTrack'
  | 'scrollbarThumb';
export type LogViewerStylePart =
  | 'body'
  | 'timestamp'
  | 'metadata'
  | 'separator'
  | 'marker'
  | 'empty'
  | 'selection'
  | 'highlight'
  | 'scrollbarTrack'
  | 'scrollbarThumb';
export type NumberInputStylePart = Exclude<TextEntryStylePart, 'label'> | 'stepper';
export type FormStylePart = 'title';
export type FieldStylePart = 'label' | 'description';
export type LabelStylePart = 'label';
export type ButtonStylePart = 'frame' | 'marker' | 'leading' | 'label' | 'trailing';
export type ToggleStylePart = 'label' | 'track' | 'handle' | 'onLabel' | 'offLabel' | 'error';
export type SliderStylePart = 'label' | 'track' | 'fill' | 'handle' | 'value' | 'error';
export type ChoiceStylePart = 'label' | 'marker' | 'option' | 'description' | 'error';
export type ColorSwatchPickerStylePart =
  | 'label'
  | 'summary'
  | 'swatch'
  | 'option'
  | 'error';
export type CalendarStylePart =
  | 'label'
  | 'month'
  | 'weekday'
  | 'option'
  | 'error';
export type MenuStylePart =
  | 'control'
  | 'title'
  | 'leading'
  | 'label'
  | 'marker'
  | 'shortcut'
  | 'trailing'
  | 'description'
  | 'separator'
  | 'placeholder'
  | 'empty'
  | 'scrollbarTrack'
  | 'scrollbarThumb';
export type DividerStylePart = 'line' | 'label';
export type TooltipStylePart = 'background' | 'border' | 'title' | 'content';
export type NotificationStylePart =
  | 'background'
  | 'border'
  | 'title'
  | 'message'
  | 'detail'
  | 'progress'
  | 'dismiss';
export type NotificationHistoryStylePart =
  | NotificationStylePart
  | 'scrollbarTrack'
  | 'scrollbarThumb';
export type StatusBarStylePart = 'marker' | 'leading' | 'value' | 'trailing';
export type HelpBarStylePart = 'marker' | 'label' | 'value';
export type ActivityIndicatorStylePart = 'marker' | 'label' | 'value';
export type ProgressBarStylePart = 'marker' | 'label' | 'value' | 'track' | 'fill';
export type MeterStylePart = 'marker' | 'label' | 'value' | 'track' | 'fill';
export type SparklineStylePart = 'value' | 'muted' | 'series';
export type BarChartStylePart =
  | 'label'
  | 'value'
  | 'muted'
  | 'axis'
  | 'series'
  | 'legend';
export type ChartStylePart = BarChartStylePart | 'baseline';
export type HeatmapStylePart = BarChartStylePart;
export type SurfaceStylePart = 'border' | 'title';
export type SplitPaneStylePart = 'divider' | 'dividerActive';
export type TabsStylePart = 'leading' | 'label' | 'indicator' | 'badge' | 'close' | 'overflow';
export type DialogStylePart = 'background' | 'border' | 'title' | 'actionSeparator';
export type CommandInputStylePart =
  | 'value'
  | 'placeholder'
  | 'selection'
  | 'cursor'
  | 'prompt'
  | 'completion'
  | 'suggestion'
  | 'validation'
  | 'status'
  | 'footer';
export type SearchPickerStylePart =
  | TextEntryStylePart
  | 'title'
  | 'entry'
  | 'group'
  | 'description'
  | 'shortcut'
  | 'help'
  | 'status'
  | 'empty'
  | 'scrollbarTrack'
  | 'scrollbarThumb';
export type CanvasStylePart = 'content';
