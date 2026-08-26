
export {
  createDiagnosticOccurrenceReporter,
  diagnostic,
  diagnosticOccurrenceIssue,
  terminalDiagnosticCodes
} from './diagnostics.ts';
export type {
  DiagnosticOccurrence,
  DiagnosticOccurrenceReporter,
  TerminalDiagnostic,
  TerminalDiagnosticCode,
  TerminalDiagnosticValue,
  TerminalSeverity
} from './diagnostics.ts';
export type { JsonPrimitive, JsonValue } from './foundation/json.ts';
export { mergeElementStyles } from './element/styles.ts';
export { mergeTerminalStyles } from './visual/terminal-style.ts';
export type { ElementStyles, ElementVisualState } from './element/metadata.ts';
export type { TerminalColor, TerminalStyle } from './visual/render-content.ts';
export { TerminalUiError } from './errors.ts';
export { failure, success } from './result.ts';
export type { Result } from './result.ts';

export * as collection from './collection/index.ts';

export { createTerminalHost } from './host/index.ts';
export type {
  CreateTerminalHostOptions,
  TerminalHost,
  TerminalSize
} from './host/index.ts';

export {
  animationSource,
  defineTui,
  intervalSource,
  runTui,
  TuiRunError,
  timeoutSource
} from './tui/index.ts';
export type {
  CopySelectedTextInput,
  CopySelectedTextResult,
  SelectedText,
  TuiApp,
  TuiContext,
  TuiDefinition,
  TuiExit,
  TuiRunResult,
  TuiRunOptions,
  TuiUpdate,
  TuiUpdateResult,
  TuiView
} from './tui/index.ts';

export * from './components/factories.ts';
export {
  createTextAreaRowOffsetMap,
  type TextAreaRowOffsetMapOptions
} from './components/factories/text-area.ts';
export { rasterImage } from './graphics/index.ts';
export type {
  ImageFit,
  RasterImage,
  RasterImageInput,
  RasterPixelFormat,
  TerminalGraphicsMode,
} from './graphics/index.ts';
export { createCommandSuggestions } from './behavior/command-input-operations.ts';
export { tableColumn } from './components/table-column.ts';
export type * from './components/index.ts';
export {
  absolute,
  anchored,
  column,
  defineBreakpoints,
  flow,
  grid,
  measuredColumn,
  measuredViewport,
  overlay,
  portal,
  responsive,
  row,
  splitPane,
  surface,
  viewport,
  viewportVariant,
} from './layout/index.ts';
export type {
  AbsoluteOptions,
  AnchoredOptions,
  BreakpointRange,
  ColumnOptions,
  FlowOptions,
  GridAreasOptions,
  GridLayoutOptions,
  GridOptions,
  ElementKeyBindings,
  ElementKeyEvent,
  ElementKeyHandler,
  ElementKeyTriggerBinding,
  InteractiveElementOptions,
  LayoutAlignment,
  LayoutFlowOptions,
  LayoutInsetInput,
  LayoutInsets,
  LayoutJustification,
  LayoutOverflow,
  LayoutSize,
  PortalOptions,
  ResponsiveBreakpointMap,
  ResponsiveVariants,
  RowOptions,
  ScrollableViewportOptions,
  SplitPaneTransition,
  SplitPaneOptions,
  SurfaceOptions,
  StructuralElementOptions,
  ViewportOffset,
  ViewportDimensions,
  ViewportOptions,
} from './layout/index.ts';
export * as behavior from './behavior/index.ts';
