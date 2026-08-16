
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
export { TerminalUiError } from './errors.ts';
export { failure, success } from './result.ts';
export type { Result } from './result.ts';

export { createTerminalHost } from './host/index.ts';
export type {
  CreateTerminalHostOptions,
  TerminalHost,
  TerminalSize
} from './host/index.ts';

export {
  animationSource,
  copySelectedTextToClipboard,
  defineTui,
  intervalSource,
  runTui,
  timeoutSource
} from './tui/index.ts';
export { resolveSelectedText } from './interaction/index.ts';
export type {
  CopySelectedTextInput,
  CopySelectedTextResult,
  TuiApp,
  TuiContext,
  TuiDefinition,
  TuiExit,
  TuiRunOptions,
  TuiUpdate,
  TuiUpdateResult,
  TuiView
} from './tui/index.ts';
export type {
  ResolveSelectedTextInput,
  ResolveSelectedTextResult,
  SelectableTextSource,
  SelectionInteractionMode
} from './interaction/index.ts';

export * from './components/factories.ts';
export { rasterImage } from './graphics/index.ts';
export type {
  ImageFit,
  RasterImage,
  RasterImageInput,
  RasterPixelFormat,
  TerminalGraphicsMode,
} from './graphics/index.ts';
export { prepareCommandSuggestions } from './behavior/command-input-state.ts';
export { tableColumn } from './ui-model/content.ts';
export type * from './components/index.ts';
export {
  absolute,
  anchored,
  column,
  defineBreakpoints,
  flow,
  grid,
  measuredColumn,
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
  SplitPaneAction,
  SplitPaneOptions,
  SurfaceOptions,
  ViewportDimensions,
  ViewportOptions,
} from './layout/index.ts';
export * as behavior from './behavior/index.ts';
