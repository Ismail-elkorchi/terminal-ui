export {
  alignRenderLine,
  clipRenderLine,
  clipRenderSpans,
  compactRenderSpans,
  measureRenderBlock,
  measureRenderLine,
  measureRenderSpans,
  padRenderLine,
  span,
  wrapRenderSpans
} from '../tui/render-primitives.ts';
export type {
  ClipRenderSpansOptions,
  PadRenderLineOptions,
  RenderAlignment,
  RenderBlock,
  RenderBlockSize,
  RenderClipMode,
  RenderLine,
  RenderSpan,
  TerminalColor,
  TerminalLink,
  TerminalStyle
} from '../tui/render-primitives.ts';
export {
  blockGlyph,
  blockSpan,
  brailleCellForPoint,
  brailleCharacter,
  brailleMaskForSubcell,
  canvasTransform,
  composeCanvasTransform,
  createCanvas2D,
  drawAreaSeries,
  drawAxes,
  drawBarSeries,
  drawLineSeries,
  ellipseInteriorPoints,
  ellipseStrokePoints,
  horizontalAxis,
  identityCanvasTransform,
  integerPoint,
  linePoints,
  polygonInteriorPoints,
  rectInteriorPoints,
  rectStrokePoints,
  scaleChartValue,
  tooltipLines,
  transformCanvasPoint,
  transformCanvasRect,
  verticalAxis
} from '../tui/canvas2d/index.ts';
export type {
  AreaSeriesOptions,
  AxisLine,
  BarDatum,
  BarSeriesOptions,
  BlockGlyph,
  BrailleCellPoint,
  Canvas2D,
  CanvasPoint,
  CanvasTransform,
  CanvasTransformInput,
  ChartAxesOptions,
  ChartPoint,
  ChartScale,
  SeriesOptions,
  StrokeFillOptions,
  TooltipLine
} from '../tui/canvas2d/index.ts';
export { drawBorder } from '../tui/border.ts';
export type {
  BorderKind,
  BorderStyle
} from '../tui/border.ts';
export {
  createDirtyRegionSet,
  dirtyRegionsForRegionChanges
} from '../tui/dirty-regions.ts';
export type { DirtyRegionSet } from '../tui/dirty-regions.ts';
export {
  createFrameBuffer
} from '../tui/frame-buffer.ts';
export type {
  AnsiStyleState,
  CursorPosition,
  DiffFramesOptions,
  Frame,
  FrameBuffer,
  FrameBufferSnapshot,
  FrameBufferSnapshotMetadata,
  FrameBufferSnapshotOptions,
  FrameCell,
  FrameHitTarget,
  FrameRowDiff,
  FrameRowFingerprint,
  RenderDiff,
  RenderOperation,
  RenderSerializeOptions
} from '../tui/frame.ts';
export {
  boxDrawingJoinPass
} from '../tui/frame-passes/index.ts';
export type {
  FramePass,
  FramePassContext,
  FrameSemanticRole
} from '../tui/frame-passes/index.ts';
export {
  frameCellSource,
  frameSourcePart,
  sameFrameCellSource,
  sanitizeFrameCellSource,
  renderNodeFrameSource
} from '../tui/frame-source.ts';
export type { FrameCellSource } from '../tui/frame-source.ts';
export {
  clampMeasurement,
  combineMeasurementsHorizontally,
  combineMeasurementsOverlay,
  combineMeasurementsVertically,
  measurement,
  measureBlock,
  measureLine,
  measureSize,
  measureSpans,
  measureText,
  normalizeMeasurement,
  zeroMeasurement
} from '../tui/measurement.ts';
export type {
  Measurement,
  MeasurementInput
} from '../tui/measurement.ts';
export {
  dataWindow,
  rowWindow,
  scrollStateFromUnknown
} from '../tui/data-window.ts';
export type {
  DataWindow,
  DataWindowInput
} from '../tui/data-window.ts';
export { paginationWindow } from '../tui/pagination.ts';
export type {
  PaginationInput,
  PaginationWindow
} from '../tui/pagination.ts';
export {
  copySelectedTextToClipboard,
  resolveSelectedText
} from '../tui/selection-interaction.ts';
export type {
  CopySelectedTextInput,
  CopySelectedTextResult,
  ResolveSelectedTextInput,
  ResolveSelectedTextResult,
  SelectableTextSource,
  SelectionInteractionMode
} from '../tui/selection-interaction.ts';
export {
  clampedTextOffset,
  textOffsetAtVisualColumn,
  textPointerHitTargets,
  textPointerMessageFactory,
  textSelectionBetween
} from '../tui/text-pointer.ts';
export type {
  TextPointerAction,
  TextPointerEvent,
  TextPointerHitTargetInput
} from '../tui/text-pointer.ts';
export {
  extractScrollbackSelectionText
} from '../tui/scrollback.ts';
export type {
  ExtractScrollbackSelectionTextInput
} from '../tui/scrollback.ts';
export {
  highlightRenderSpans
} from '../tui/text-highlight.ts';
export type {
  HighlightRenderSpan,
  HighlightRenderSpansOptions
} from '../tui/text-highlight.ts';
export {
  placeNotificationStack
} from '../tui/notifications.ts';
export type {
  NotificationStackPlacementInput,
  NotificationStackSize
} from '../tui/notifications.ts';
export {
  placeTooltip
} from '../tui/tooltip.ts';
export type {
  TooltipPlacementInput,
  TooltipSize
} from '../tui/tooltip.ts';
export {
  compositeRegions,
  diffFrames,
  renderDiffAnsi,
  renderFrameAnsi,
  renderFrameDebug,
  renderFramePlain,
  renderElementFrame,
  renderElementRegions,
  sameFrameCell,
  serializeRenderSpansStateful,
  sameTerminalColor,
  sameTerminalLink,
  sameTerminalStyle
} from '../tui/render.ts';
export {
  layoutElement
} from '../tui/layout.ts';
export type {
  RenderRegion,
  RenderRegionHitTarget,
  RenderElementProjection
} from '../tui/render.ts';
export {
  createPointerRouter
} from '../tui/pointer-router.ts';
export type {
  PointerRouteResult,
  PointerRouter
} from '../tui/pointer-router.ts';
export type {
  PointerEventKind,
  RoutedPointerEvent
} from '../tui/pointer-types.ts';
export {
  projectTuiOutput,
  renderAccessibleSnapshot
} from '../tui/output-projection.ts';
export type {
  OutputProjection,
  OutputProjectionInput
} from '../tui/output-projection.ts';
export {
  renderScrollbars,
  scrollbarInteractionReducer,
  scrollbarLayout,
  scrollbarVisualStateForTarget
} from '../tui/scrollbar.ts';
export type {
  ScrollbarLayout,
  ScrollbarInteractionAction,
  ScrollbarInteractionState,
  ScrollbarOptions,
  ScrollbarRenderOptions,
  ScrollbarState,
  ScrollbarThumb,
  ScrollbarTrack,
  ScrollbarVisualState
} from '../tui/scrollbar.ts';
export {
  custom
} from './custom-element.ts';
export type {
  CustomElementOptions
} from './custom-element.ts';
export {
  gridCellRects,
  splitTracks
} from '../tui/regions.ts';
export type {
  Layer,
  LayoutNode,
  Rect,
  RegionOpacity
} from '../tui/layout.ts';
export type {
  FocusTarget,
  HitTarget,
  RenderNodeAccessibilityInput,
  RenderNodeFocusInput,
  RenderNodeHitInput,
  RenderNodeLayoutInput,
  RenderNodeMeasureInput,
  RenderNodeRenderer,
  RenderNodeRenderInput
} from '../tui/render-node-renderer.ts';
export type {
  RenderNode,
  RenderNodeAccessibleDefinition,
  RenderNodeChildren,
  RenderNodeFocusOptions,
  RenderNodeFocusScope,
  RenderNodeInputMap,
  RenderNodeKeyMap,
  RenderNodeKind,
  RenderNodeLayerOptions,
  RenderNodeOverflowPriority,
  RenderNodeProps,
  RenderNodeStyleSlots,
  RenderNodeTextRole,
  RenderNodeVisualState
} from '../render-node/index.ts';
