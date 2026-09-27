export { gridCellRects, splitTracks } from '../geometry/layout.ts';
export type { Rect } from '../geometry/types.ts';
export type {
  GraphicOperation,
  GraphicPlacement,
  GraphicPlacementInput,
  ImageFit,
} from '../graphics/types.ts';
export type { PointerClickCount, PointerEventKind, RoutedPointerEvent } from '../input/pointer.ts';
export type { BorderKind } from '../visual/border.ts';
export { frameCellSource, sameFrameCellSource } from '../visual/frame-source.ts';
export type { FrameCellRole, FrameCellSource } from '../visual/frame-source.ts';
export {
  alignRenderLine,
  clipRenderLine,
  clipRenderSpans,
  compactRenderSpans,
  measureRenderBlock,
  measureRenderLine,
  measureRenderSpans,
  padRenderLine,
  sameTerminalColor,
  sameTerminalLink,
  sameTerminalStyle,
  span,
  wrapRenderSpans,
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
  TerminalStyle,
} from '../visual/render-content.ts';
export { mergeTerminalStyles } from '../visual/terminal-style.ts';
export { drawBorder } from './border.ts';
export type { BorderStyle, BorderTitle, BorderTitleContent, BorderTitleSlots } from './border.ts';
export { horizontalAxis, verticalAxis } from './canvas2d/axes.ts';
export type { AxisLine } from './canvas2d/axes.ts';
export { blockGlyph, blockSpan } from './canvas2d/block.ts';
export type { BlockGlyph } from './canvas2d/block.ts';
export {
  brailleCellForSubcell,
  brailleCharacter,
  brailleMaskForSubcell,
} from './canvas2d/braille.ts';
export type { BrailleCellMapping } from './canvas2d/braille.ts';
export { createCanvas2D, createComponentCanvas2D } from './canvas2d/canvas2d.ts';
export {
  drawAreaSeries,
  drawAxes,
  drawBarSeries,
  drawLineSeries,
  scaleChartValue,
} from './canvas2d/chart.ts';
export type {
  AreaSeriesOptions,
  BarDatum,
  BarSeriesOptions,
  ChartAxesOptions,
  ChartPoint,
  ChartScale,
  SeriesOptions,
} from './canvas2d/chart.ts';
export { integerPoint, linePoints } from './canvas2d/paths.ts';
export {
  ellipseInteriorPoints,
  ellipseStrokePoints,
  polygonInteriorPoints,
  rectInteriorPoints,
  rectStrokePoints,
} from './canvas2d/shapes.ts';
export { tooltipLines } from './canvas2d/tooltip.ts';
export type { TooltipLine } from './canvas2d/tooltip.ts';
export {
  canvasTransform,
  composeCanvasTransform,
  identityCanvasTransform,
  transformCanvasPoint,
  transformCanvasRect,
} from './canvas2d/transform.ts';
export type {
  Canvas2D,
  CanvasPainter,
  CanvasPainterInput,
  CanvasPoint,
  CanvasTransform,
  CanvasTransformInput,
  ComponentRenderTarget,
  CursorPosition,
  FocusTarget,
  Frame,
  FrameCell,
  FrameDescriptor,
  FrameHitTarget,
  FrameRenderTarget,
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
  RenderPreparationContext,
  RenderStage,
  RenderStageMeasurement,
  RenderTarget,
  RenderTargetCell,
  RenderWorkInstrumentation,
  RenderWorkKind,
  RenderWorkMeasurement,
  StrokeFillOptions,
} from './contracts.ts';
export { createFrameBuffer } from './frame-buffer.ts';
export type {
  FrameBuffer,
  FrameBufferOptions,
  FrameBufferSnapshot,
  FrameBufferSnapshotOptions,
} from './frame-buffer.ts';
export { boxDrawingJoinPass } from './frame-passes/box-drawing-join.ts';
export type { FramePass, FramePassContext } from './frame-passes/frame-pass.ts';
export {
  diffFrames,
  renderDiffAnsi,
  renderFrameAnsi,
  renderFrameDebug,
  renderFramePlain,
} from './frame.ts';
export type { DiffFramesOptions, RenderDiffAnsiOptions } from './frame.ts';
export { serializeRenderSpansStateful } from './internal/ansi.ts';
export type { AnsiStyleState, RenderSerializeOptions } from './internal/ansi.ts';
export { sameFrameCell } from './internal/frame-cell-equality.ts';
export { layoutElement } from './layout.ts';
export { decodeMeasurement } from './measurement-validation.ts';
export {
  clampMeasurement,
  combineMeasurementsHorizontally,
  combineMeasurementsOverlay,
  combineMeasurementsVertically,
  measureBlock,
  measureLine,
  measureSize,
  measureSpans,
  measureText,
  measurement,
  normalizeMeasurement,
  zeroMeasurement,
} from './measurement.ts';
export { renderAccessibleSnapshot, renderTuiOutput } from './output.ts';
export type { RenderTuiOutputOptions, RenderedTuiOutput } from './output.ts';
export { defaultRenderBudgetLimits } from './render-budget.ts';
export type { RenderBudgetLimits } from './render-budget.ts';
export { renderElementFrame } from './render-element.ts';
export type { RenderElementOptions } from './render-options.ts';
export { highlightRenderSpans } from './text-highlight.ts';
export type { HighlightRenderSpan, HighlightRenderSpansOptions } from './text-highlight.ts';
