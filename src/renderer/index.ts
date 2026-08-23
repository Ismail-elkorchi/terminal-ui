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
export { mergeTerminalStyles } from '../visual/terminal-style.ts';
export type {
  Canvas2D,
  CanvasPainter,
  CanvasPainterInput,
  CanvasPoint,
  CanvasTransform,
  CanvasTransformInput,
  CursorPosition,
  FocusTarget,
  Frame,
  FrameDescriptor,
  FrameCell,
  FrameHitTarget,
  GraphicOperation,
  GraphicPlacement,
  GraphicPlacementInput,
  FrameRowDiff,
  HitTarget,
  Layer,
  LayoutFocusRegion,
  LayoutNode,
  Measurement,
  MeasurementInput,
  RenderDiff,
  RenderDiffDescriptor,
  RenderFocusRelation,
  RenderInstrumentation,
  RenderOperation,
  RenderStage,
  RenderStageMeasurement,
  RenderTarget,
  RenderTargetCell,
  RenderWorkInstrumentation,
  RenderWorkKind,
  RenderWorkMeasurement,
  StrokeFillOptions
} from './contracts.ts';
export type { ImageFit } from '../graphics/index.ts';
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
export { createClippedCanvas2D as createLocalCanvas2D } from './internal/canvas2d/canvas2d.ts';
export type {
  AreaSeriesOptions,
  AxisLine,
  BarDatum,
  BarSeriesOptions,
  BlockGlyph,
  BrailleCellMapping,
  ChartAxesOptions,
  ChartPoint,
  ChartScale,
  SeriesOptions,
  TooltipLine
} from './internal/canvas2d/index.ts';
export { drawBorder } from './internal/border.ts';
export type {
  BorderKind,
  BorderStyle,
  BorderTitle,
  BorderTitleContent,
  BorderTitleSlots
} from './internal/border.ts';
export {
  createFrameBuffer
} from './internal/frame-buffer.ts';
export type {
  AnsiStyleState,
  DiffFramesOptions,
  FrameBuffer,
  FrameBufferOptions,
  FrameBufferSnapshot,
  FrameBufferSnapshotOptions,
  RenderDiffAnsiOptions,
  RenderSerializeOptions
} from './internal/frame.ts';
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
  sameFrameCellSource
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
} from './measurement.ts';
export { adoptMeasurement } from './measurement-validation.ts';
export {
  highlightRenderSpans
} from './internal/text-highlight.ts';
export type {
  HighlightRenderSpan,
  HighlightRenderSpansOptions
} from './internal/text-highlight.ts';
export {
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
  RenderElementOptions
} from './internal/render.ts';
export type { RenderBudgetLimits } from './internal/render-budget.ts';
export { defaultRenderBudgetLimits } from './internal/render-budget.ts';
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
} from '../geometry/layout.ts';
export type { Rect } from '../geometry/types.ts';
