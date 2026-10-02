export { prepareTextAreaLayout } from './text-area/preparation.ts';
export type { PreparedTextAreaLayout, TextAreaLayoutRequest } from './text-area/preparation.ts';
export type { TextAreaLayoutSnapshot } from './text-area/contracts.ts';
export { createDataGridKeymap } from './keymaps.ts';
export type { DataGridKeyAction } from './keymaps.ts';
export { createListboxKeymap, createTreeKeymap, createSearchPickerKeymap, createTextInputKeymap, createTextAreaKeymap } from './keymaps.ts';
export type { ListboxKeyAction, TreeKeyAction, SearchPickerKeyAction, TextInputKeyAction, TextAreaKeyAction, TextEditingKeyAction } from './keymaps.ts';
/** Complete built-in component catalog. Prefer a focused category entrypoint when practical. */
export type {
  CalendarDate,
  CalendarDay,
  CalendarMonth,
  CalendarTransition,
} from '../behavior/calendar.ts';
export type {
  CheckboxGroupTransition,
  ColorSwatchPickerTransition,
  RadioGroupTransition,
} from '../behavior/choice-controls.ts';
export type {
  AutocompleteComboboxControlTransition,
  AutocompleteComboboxState,
  AutocompleteComboboxTransition,
  AutocompleteComboboxView,
  ComboboxCommitEvent,
  ComboboxControlTransition,
  ComboboxState,
  ComboboxTransition,
  ScrollableComboboxState,
  UnscrolledComboboxState,
} from '../behavior/combobox.ts';
export { createCommandSuggestions } from '../behavior/command-input-operations.ts';
export type {
  CommandInputSubmitEvent,
  CommandInputTransition,
  CommandInputView,
  CommandSuggestion,
} from '../behavior/command-input.ts';
export type {
  ListViewActivateEvent,
  ListViewControlTransition,
  ListViewState,
  ListViewTransition,
  ScrollableListViewState,
  UnscrolledListViewState,
} from '../behavior/list-view.ts';
export type {
  ListboxActivateEvent,
  ListboxCollection,
  ListboxCollectionItem,
  ListboxControlTransition,
  ListboxOption,
  ListboxOptionMapper,
  ListboxState,
  ListboxTransition,
  ScrollableListboxState,
  UnscrolledListboxState,
} from '../behavior/listbox.ts';
export type { LogEntry, LogHistory } from '../behavior/log-history.ts';
export type {
  LogViewerBodyAnchor,
  LogViewerContextMenuEvent,
  LogViewerControlTransition,
  LogViewerSelection,
  LogViewerTransition,
} from '../behavior/log-viewer.ts';
export type {
  ContextMenuTransition,
  ContextMenuView,
  MenuActionItem,
  MenuActionTone,
  MenuActivateEvent,
  MenuBarTransition,
  MenuBarView,
  MenuCheckItem,
  MenuItem,
  MenuRadioItem,
  MenuSectionItem,
  MenuSeparatorItem,
  MenuSubmenuItem,
  MenuTransition,
  MenuTriggerTransition,
  MenuTriggerView,
  MenuView,
  MenuViewItem,
} from '../behavior/menu.ts';
export type { NotificationHistoryTransition } from '../behavior/notification-history.ts';
export type {
  NotificationItem,
  NotificationPlacement,
  NotificationTone,
} from '../behavior/notification.ts';
export type {
  NumberInputControlTransition,
  NumberInputTransition,
  NumberInputValidity,
} from '../behavior/number-input.ts';
export type { PaginationTransition } from '../behavior/pagination.ts';
export type {
  NumericRange,
  RangeSliderHandle,
  RangeSliderState,
  RangeSliderStepDirection,
  RangeSliderTransition,
  RangeSliderValue,
} from '../behavior/range-slider.ts';
export type {
  ScrollableSearchPickerView,
  SearchPickerAcceptEvent,
  SearchPickerControlTransition,
  SearchPickerTransition,
  SearchPickerView,
  UnscrolledSearchPickerView,
} from '../behavior/search-picker.ts';
export type {
  CompleteTableCollection,
  DataGridActivateEvent,
  DataGridCell,
  DataGridControlTransition,
  DataGridInteraction,
  DataGridState,
  DataGridTransition,
  ScrollableDataGridState,
  TableCollection,
  TableCollectionRow,
  TableSortDirection,
  TableSortState,
  TableState,
  UnscrolledDataGridState,
  WindowedTableCollection,
} from '../behavior/table.ts';
export type { TabCloseEvent, TabsActivation, TabsState, TabsTransition } from '../behavior/tabs.ts';
export type {
  ScrollableTextAreaControlState,
  TextAreaControlState,
  TextAreaControlTransition,
  TextAreaTransition,
  UnscrolledTextAreaControlState,
} from '../behavior/text-area.ts';
export type { TextInputTransition } from '../behavior/text-input.ts';
export type {
  ScrollableTreeState,
  TreeActivateEvent,
  TreeCollection,
  TreeCollectionRow,
  TreeControlTransition,
  TreeDisclosureTransition,
  TreeLoadStatus,
  TreeNode,
  TreeSource,
  TreeState,
  TreeTransition,
  TreeView,
  TreeVisibleRow,
  UnscrolledTreeState,
} from '../behavior/tree.ts';
export type {
  BarChartItem,
  ChartDataStatus,
  ChartInterpolation,
  ChartPoint,
  ChartSampleAlign,
  ChartSampleMode,
  ChartSeries,
  ChartSeriesKind,
  HeatmapCell,
  MeterStatus,
  MeterVariant,
  ValueScale,
  ValueScaleStop,
} from '../behavior/visualization-data.ts';
export type {
  BarChartTransition,
  ChartTransition,
  HeatmapTransition,
  VisualizationActivateEvent,
  VisualizationState,
} from '../behavior/visualization.ts';
export type { MeasuredWindow } from '../collection/measured-window.ts';
export type { AnchoredSurfacePlacement } from '../interaction/anchored-surface.ts';
export type {
  PointerSelectionTransition,
  TextPointerTransition,
} from '../interaction/text-pointer.ts';
export type { CanvasPainter, CanvasPainterInput } from '../renderer/contracts.ts';
export { button } from './action-button/definition.ts';
export type { ButtonOptions } from './action-button/options.ts';
export { checkbox, switchControl } from './boolean-controls/definition.ts';
export type {
  ActiveCheckboxOptions,
  ActiveSwitchOptions,
  CheckboxOptions,
  DisabledCheckboxOptions,
  DisabledSwitchOptions,
  SwitchOptions,
} from './boolean-controls/options.ts';
export { calendar } from './calendar/definition.ts';
export type {
  ActiveCalendarOptions,
  CalendarOptions,
  DisabledCalendarOptions,
} from './calendar/options.ts';
export { barChart } from './charts/bar-chart.ts';
export { chart } from './charts/chart.ts';
export { heatmap } from './charts/heatmap.ts';
export type { BarChartOptions, ChartOptions, HeatmapOptions } from './charts/options.ts';
export { checkboxGroup, colorSwatchPicker, radioGroup } from './choice-controls/definition.ts';
export type {
  ActiveCheckboxGroupOptions,
  ActiveColorSwatchPickerOptions,
  ActiveRadioGroupOptions,
  CheckboxGroupOptions,
  ColorSwatchPickerOptions,
  DisabledCheckboxGroupOptions,
  DisabledColorSwatchPickerOptions,
  DisabledRadioGroupOptions,
  RadioGroupOptions,
} from './choice-controls/options.ts';
export { combobox } from './combobox/definition.ts';
export type {
  ActiveAutocompleteComboboxOptions,
  ActiveComboboxOptions,
  AnyComboboxOptions,
  AutocompleteComboboxOptions,
  ComboboxOptions,
  DisabledComboboxOptions,
  InertComboboxOptions,
  ScrollableComboboxOptions,
  UnscrolledComboboxOptions,
} from './combobox/options.ts';
export type { CommandInputDisplay, CommandInputValidation } from './command-input.ts';
export { commandInput } from './command-input/definition.ts';
export type { CommandInputOptions } from './command-input/options.ts';
export { meter, sparkline } from './compact-visualizations/definition.ts';
export type { MeterOptions, SparklineOptions } from './compact-visualizations/options.ts';
export { tableColumn } from './data-table/column.ts';
export type {
  TableCellRenderInput,
  TableColumn,
  TableColumnAlignment,
  TableColumnBuilder,
  TableColumnDefinition,
  TableColumnSemantic,
  TableColumnWidth,
  TableCustomColumn,
  TableValueColumn,
} from './data-table/column.ts';
export { dataGrid, table } from './data-table/definition.ts';
export type {
  DataGridOptions,
  ScrollableDataGridOptions,
  ScrollableTableOptions,
  TableOptions,
  UnscrolledDataGridOptions,
  UnscrolledTableOptions,
} from './data-table/options.ts';
export type {
  DialogDismissEvent,
  DialogDismissReason,
  DialogDismissal,
  DialogFocusPolicy,
} from './dialog.ts';
export { dialog } from './dialog/definition.ts';
export type { DialogOptions } from './dialog/options.ts';
export type { DisclosureTransition } from './disclosure.ts';
export type { DividerLineKind, DividerOrientation } from './divider/contracts.ts';
export { divider } from './divider/definition.ts';
export type { DividerOptions } from './divider/options.ts';
export { canvas, image } from './drawing/definition.ts';
export type {
  CanvasOptions,
  DecorativeCanvasOptions,
  DecorativeImageOptions,
  ImageOptions,
  SemanticCanvasOptions,
  SemanticImageOptions,
} from './drawing/options.ts';
export { activityIndicator } from './feedback/activity-indicator.ts';
export { helpBar } from './feedback/help-bar.ts';
export type {
  ActivityIndicatorOptions,
  HelpBarOptions,
  ProgressBarOptions,
  StatusBarOptions,
} from './feedback/options.ts';
export { progressBar } from './feedback/progress-bar.ts';
export type {
  ProgressBarDisplay,
  ProgressBarLabelPosition,
  ProgressBarMode,
} from './feedback/progress.ts';
export type { StatusBarItem } from './feedback/status-bar-contracts.ts';
export { statusBar } from './feedback/status-bar.ts';
export type {
  ButtonPressEvent,
  ButtonTone,
  CheckboxTransition,
  ColorSwatchPickerOption,
  SliderTransition,
  SwitchTransition,
} from './form-controls.ts';
export { field, form, label } from './form-layout/definition.ts';
export type { FieldOptions, FormOptions, LabelOptions } from './form-layout/options.ts';
export type { LinkActivateEvent, ToggleButtonTransition } from './foundation-controls.ts';
export { link, toggleButton, toolbar } from './foundation-controls/definition.ts';
export type {
  LinkBaseOptions,
  LinkOptions,
  ToggleButtonBaseOptions,
  ToggleButtonOptions,
  ToolbarOptions,
} from './foundation-controls/options.ts';
export { list, listView } from './list/definition.ts';
export type {
  ListViewItemContent,
  ListViewItemRenderer,
  SemanticListItem,
  SemanticListMessage,
} from './list/item.ts';
export type {
  ListOptions,
  ListViewOptions,
  ListViewScrollbarOptions,
  ScrollableListViewOptions,
  UnscrolledListViewOptions,
} from './list/options.ts';
export { listbox } from './listbox/definition.ts';
export type {
  ListboxOptions,
  ScrollableListboxOptions,
  UnscrolledListboxOptions,
} from './listbox/options.ts';
export { logViewer } from './log-viewer/definition.ts';
export type {
  LogViewerOptions,
  ScrollableLogViewerOptions,
  UnscrolledLogViewerOptions,
} from './log-viewer/options.ts';
export { contextMenu } from './menus/context-menu.ts';
export { menuBar } from './menus/menu-bar.ts';
export { menuTrigger } from './menus/menu-trigger.ts';
export { menu } from './menus/menu.ts';
export type {
  ContextMenuOptions,
  MenuBarOptions,
  MenuOptions,
  MenuTriggerOptions,
} from './menus/options.ts';
export { notificationHistory, notificationRegion } from './notifications/definition.ts';
export type {
  NotificationHistoryOptions,
  NotificationRegionOptions,
} from './notifications/options.ts';
export { pagination } from './pagination/definition.ts';
export type { PaginationOptions } from './pagination/options.ts';
export { rangeSlider, slider } from './range-controls/definition.ts';
export type {
  ActiveRangeSliderOptions,
  ActiveSliderOptions,
  DisabledRangeSliderOptions,
  DisabledSliderOptions,
  RangeSliderOptions,
  SliderOptions,
} from './range-controls/options.ts';
export { searchPicker } from './search-picker/definition.ts';
export type {
  ScrollableSearchPickerOptions,
  SearchPickerOptions,
  UnscrolledSearchPickerOptions,
} from './search-picker/options.ts';
export {
  isNotificationTone,
  isProcessStatus,
  isStatusBarStatus,
  isValidationLevel,
} from './status.ts';
export { tabs } from './tabs/definition.ts';
export type { TabItem, TabsOptions } from './tabs/options.ts';
export type {
  TextAreaConcealDecoration,
  TextAreaDecoration,
  TextAreaReplacementDecoration,
  TextAreaStyleDecoration,
} from './text-area/contracts.ts';
export { createTextAreaDecorations, updateTextAreaDecorations } from './text-area/decorations.ts';
export type {
  CreateTextAreaDecorationsInput,
  TextAreaDecorations,
  UpdateTextAreaDecorationsInput,
} from './text-area/decorations.ts';
export { textArea } from './text-area/definition.ts';
export type {
  DisabledTextAreaOptions,
  ScrollableTextAreaOptions,
  TextAreaOptions,
  UnscrolledTextAreaOptions,
} from './text-area/options.ts';
export { createTextAreaRowOffsetMap } from './text-area/row-offset-map.ts';
export type { TextAreaRowOffsetMapOptions } from './text-area/row-offset-map.ts';
export { disclosure, richText, text } from './text-content/definition.ts';
export type {
  ActiveDisclosureOptions,
  DisabledDisclosureOptions,
  DisclosureMessage,
  DisclosureOptions,
  RichTextLinkActivateEvent,
  RichTextOptions,
  TextOptions,
} from './text-content/options.ts';
export { numberInput } from './text-entry/number-input.ts';
export type {
  ActiveNumberInputOptions,
  ActiveTextInputOptions,
  DisabledNumberInputOptions,
  DisabledTextInputOptions,
  NumberInputOptions,
  PasswordInputOptions,
  TextInputOptions,
} from './text-entry/options.ts';
export { passwordInput, textInput } from './text-entry/text-input.ts';
export type { TooltipTone, TooltipTransition } from './tooltip/contracts.ts';
export { tooltip } from './tooltip/definition.ts';
export type { TooltipOptions } from './tooltip/options.ts';
export { tree } from './tree/definition.ts';
export type { ScrollableTreeOptions, TreeOptions, UnscrolledTreeOptions } from './tree/options.ts';

export type { ChoiceItem, LabeledItem, SearchEntry } from '../collection/item.ts';
export type {
  ComponentCapabilityInspection,
  ComponentInspectionRecord,
  ComponentInspectionValue,
  ComponentSemanticInspection,
  ElementFactoryCategory,
  ElementFactoryIdentity,
  ElementFocusCapability,
  ElementInputInspection,
  ElementInspection,
  ElementMetaInspection,
} from '../element/inspection-contracts.ts';
export { inspectRegisteredElement as inspectElement } from '../element/registry.ts';
export type {
  Element,
  ElementChildren,
  ElementChildrenMessage,
  ElementMessage,
  ElementValue,
} from '../element/types.ts';
export type {
  InlineContent,
  InlineContentSegment,
  InlineSymbolSegment,
  InlineTextSegment,
} from '../visual/inline-content.ts';
export type { ComponentDensity } from './density.ts';
export type { HelpBinding, HelpGroup } from './feedback/help.ts';
export type {
  ProcessStatus,
  StatusBarSection,
  StatusBarStatus,
} from './feedback/status-bar-contracts.ts';
export type {
  ActivityIndicatorStylePart,
  BarChartStylePart,
  ButtonStylePart,
  CalendarStylePart,
  CanvasStylePart,
  ChartStylePart,
  ChoiceStylePart,
  ColorSwatchPickerStylePart,
  ComboboxStylePart,
  CommandInputStylePart,
  DataListStylePart,
  DialogStylePart,
  DisclosureStylePart,
  DividerStylePart,
  FieldStylePart,
  FormStylePart,
  HeatmapStylePart,
  HelpBarStylePart,
  ImageStylePart,
  LabelStylePart,
  LinkStylePart,
  ListViewStylePart,
  LogViewerStylePart,
  MenuStylePart,
  MeterStylePart,
  NotificationHistoryStylePart,
  NotificationStylePart,
  NumberInputStylePart,
  PaginationStylePart,
  ProgressBarStylePart,
  RichTextStylePart,
  SearchPickerStylePart,
  SemanticListStylePart,
  SliderStylePart,
  SparklineStylePart,
  StatusBarStylePart,
  TableStylePart,
  TabsStylePart,
  TextAreaStylePart,
  TextEntryStylePart,
  TextStylePart,
  ToggleStylePart,
  TooltipStylePart,
  TreeStylePart,
} from './style-parts.ts';
export type { ValidationLevel } from './validation.ts';
