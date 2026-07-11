export type TextStylePart = 'content' | 'link';
export type DataListStylePart = 'marker' | 'item' | 'match' | 'empty' | 'scrollbar';
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
  | 'scrollbar';
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
  | 'scrollbar';
export type PaginatorStylePart = 'control' | 'label' | 'value' | 'separator';
export type TextEntryStylePart =
  | 'border'
  | 'label'
  | 'value'
  | 'placeholder'
  | 'selection'
  | 'cursor'
  | 'error';
export type TextAreaStylePart = TextEntryStylePart |
  'gutter' | 'lineNumber' | 'activeLine' | 'highlight' | 'scrollbar';
export type NumberInputStylePart = TextEntryStylePart | 'stepper';
export type FormGroupStylePart = 'title' | 'label' | 'description' | 'error';
export type ButtonStylePart = 'chrome' | 'marker' | 'label';
export type ToggleStylePart = 'label' | 'track' | 'handle' | 'onLabel' | 'offLabel' | 'error';
export type SliderStylePart = 'label' | 'track' | 'fill' | 'handle' | 'value' | 'error';
export type ChoiceStylePart = 'label' | 'marker' | 'option' | 'description' | 'error';
export type PickerStylePart =
  | 'label'
  | 'summary'
  | 'swatch'
  | 'navigation'
  | 'month'
  | 'weekday'
  | 'option'
  | 'error';
export type MenuStylePart =
  | 'chrome'
  | 'title'
  | 'label'
  | 'marker'
  | 'shortcut'
  | 'description'
  | 'separator'
  | 'placeholder'
  | 'empty'
  | 'scrollbar';
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
export type StatusStylePart = 'marker' | 'label' | 'value' | 'track' | 'fill';
export type ChartStylePart =
  | 'label'
  | 'value'
  | 'muted'
  | 'axis'
  | 'baseline'
  | 'series'
  | 'legend'
  | 'empty';
export type SurfaceStylePart = 'background' | 'border' | 'title' | 'shadow';
export type TabsStylePart = 'label' | 'indicator' | 'badge' | 'close' | 'overflow';
export type ModalStylePart = 'background' | 'border' | 'title' | 'actionSeparator';
export type DocumentStylePart =
  | 'title'
  | 'summary'
  | 'field'
  | 'body'
  | 'details'
  | 'metadata'
  | 'marker'
  | 'status'
  | 'empty'
  | 'timestamp'
  | 'separator'
  | 'scrollbar';
export type CommandBarStylePart =
  | TextEntryStylePart
  | 'prompt'
  | 'completion'
  | 'suggestion'
  | 'validation'
  | 'status'
  | 'footer';
export type PaletteStylePart =
  | TextEntryStylePart
  | 'title'
  | 'entry'
  | 'group'
  | 'description'
  | 'shortcut'
  | 'help'
  | 'status'
  | 'empty'
  | 'scrollbar';
export type CanvasStylePart = 'content';
