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
} from '../visual/render-content.ts';
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
} from '../visual/render-content.ts';
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
} from './canvas2d/index.ts';
export { createClippedCanvas2D as createLocalCanvas2D } from './canvas2d/canvas2d.ts';
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
} from './canvas2d/index.ts';
export { drawBorder } from './border.ts';
export type {
  BorderKind,
  BorderStyle,
  BorderTitle,
  BorderTitleContent,
  BorderTitleSlots
} from './border.ts';
export {
  createFrameBuffer
} from './frame-buffer.ts';
export type {
  AnsiStyleState,
  DiffFramesOptions,
  FrameBuffer,
  FrameBufferOptions,
  FrameBufferSnapshot,
  FrameBufferSnapshotOptions,
  RenderDiffAnsiOptions,
  RenderSerializeOptions
} from './frame.ts';
export {
  boxDrawingJoinPass
} from './frame-passes/index.ts';
export type {
  FramePass,
  FramePassContext,
  FrameCellRole
} from './frame-passes/index.ts';
export {
  frameCellSource,
  sameFrameCellSource
} from '../visual/frame-source.ts';
export type { FrameCellSource } from '../visual/frame-source.ts';
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
export { decodeMeasurement } from './measurement-validation.ts';
export {
  highlightRenderSpans
} from './text-highlight.ts';
export type {
  HighlightRenderSpan,
  HighlightRenderSpansOptions
} from './text-highlight.ts';
export {
  diffFrames,
  renderDiffAnsi,
  renderFrameAnsi,
  renderFrameDebug,
  renderFramePlain,
  sameFrameCell,
  serializeRenderSpansStateful,
  sameTerminalColor,
  sameTerminalLink,
  sameTerminalStyle
} from './frame.ts';
export { renderElementFrame } from './render-element.ts';
export type {
  RenderElementOptions
} from './render-element.ts';
export type { RenderBudgetLimits } from './render-budget.ts';
export { defaultRenderBudgetLimits } from './render-budget.ts';
export {
  layoutElement
} from './layout.ts';
export type {
  PointerClickCount,
  PointerEventKind,
  RoutedPointerEvent
} from '../input/pointer.ts';
export {
  renderTuiOutput,
  renderAccessibleSnapshot
} from './output.ts';
export type {
  RenderedTuiOutput,
  RenderTuiOutputOptions
} from './output.ts';
export {
  gridCellRects,
  splitTracks
} from '../geometry/layout.ts';
export type { Rect } from '../geometry/types.ts';
