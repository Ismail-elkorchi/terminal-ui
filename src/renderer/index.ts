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
} from '../visual/render.ts';
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
} from '../visual/render.ts';
export {
  blockGlyph,
  blockSpan,
  brailleCellForSubcell,
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
} from './internal/canvas2d/index.ts';
export type {
  AreaSeriesOptions,
  AxisLine,
  BarDatum,
  BarSeriesOptions,
  BlockGlyph,
  BrailleCellMapping,
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
} from './internal/canvas2d/index.ts';
export { drawBorder } from './internal/border.ts';
export type {
  BorderKind,
  BorderStyle
} from './internal/border.ts';
export {
  createFrameBuffer
} from './internal/frame-buffer.ts';
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
} from './internal/frame.ts';
export type { RenderFocusRelation } from './model/renderer.ts';
export {
  boxDrawingJoinPass
} from './internal/frame-passes/index.ts';
export type {
  FramePass,
  FramePassContext,
  FrameCellRole
} from './internal/frame-passes/index.ts';
export {
  frameCellSource,
  frameSourcePart,
  sameFrameCellSource,
  sanitizeFrameCellSource,
  renderNodeFrameSource
} from '../visual/source.ts';
export type { FrameCellSource } from '../visual/source.ts';
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
} from './internal/measurement.ts';
export type {
  Measurement,
  MeasurementInput
} from './internal/measurement.ts';
export {
  highlightRenderSpans
} from './internal/text-highlight.ts';
export type {
  HighlightRenderSpan,
  HighlightRenderSpansOptions
} from './internal/text-highlight.ts';
export type { TooltipSize } from './internal/tooltip.ts';
export {
  compositeRegions,
  diffFrames,
  renderDiffAnsi,
  renderFrameAnsi,
  renderFrameDebug,
  renderFramePlain,
  renderElementFrame,
  sameFrameCell,
  serializeRenderSpansStateful,
  sameTerminalColor,
  sameTerminalLink,
  sameTerminalStyle
} from './internal/render.ts';
export type {
  RenderElementOptions,
  RenderInstrumentation,
  RenderStage,
  RenderStageMeasurement
} from './internal/render.ts';
export {
  layoutElement
} from './internal/layout.ts';
export type {
  PointerClickCount,
  PointerEventKind,
  RoutedPointerEvent
} from '../input/pointer.ts';
export {
  projectTuiOutput,
  renderAccessibleSnapshot
} from './internal/output-projection.ts';
export type {
  OutputProjection,
  OutputProjectionInput
} from './internal/output-projection.ts';
export {
  gridCellRects,
  splitTracks
} from './internal/layout-geometry.ts';
export type {
  Layer,
  LayoutNode
} from './internal/layout.ts';
export type { Rect } from '../geometry/types.ts';
export type {
  FocusTarget,
  HitTarget
} from './model/renderer.ts';
export type { RenderTarget, RenderTargetCell } from './model/render-target.ts';
