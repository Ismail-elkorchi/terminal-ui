import { layoutWidget } from './layout.ts';
import { drawBorder } from './border.ts';
import {
  createFrameBuffer,
  clipRenderSpans,
  compositeRegions,
  diffFrames,
  renderDiffAnsi,
  renderFrameAnsi,
  renderFrameDebug,
  renderFramePlain,
  renderWidgetFrame,
  renderWidgetRegions,
  sameFrameCell,
  sameFrameCellSource,
  serializeRenderSpansStateful,
  sameTerminalColor,
  sameTerminalLink,
  sameTerminalStyle
} from './render.ts';
import { boxDrawingJoinPass } from './frame-passes/index.ts';
import { createCanvas2D } from './canvas2d/index.ts';
import { placeNotificationStack } from './notifications.ts';
import { placeTooltip } from './tooltip.ts';
import type {
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
} from './canvas2d/index.ts';
import type { RenderRegion, RenderRegionHitTarget, RenderWidgetFrameProjection } from './render.ts';
import type { BorderKind, BorderStyle } from './border.ts';
import type {
  CommandBarAction,
  CommandBarState
} from './command-surface.ts';
import type { SurfaceVariant } from './surface.ts';
import type { DataWindow, DataWindowInput } from './data-window.ts';
import type { DirtyRegionSet } from './dirty-regions.ts';
import type { FocusPath } from './focus.ts';
import type { FramePass, FramePassContext, FrameSemanticRole } from './frame-passes/index.ts';
import type { Layer, LayoutNode, Rect, RegionOpacity } from './layout.ts';
import type { PaginationInput, PaginationWindow } from './pagination.ts';
import type { PaletteFilterResult, PaletteWindowInput } from './palette.ts';
import type {
  GridLayoutOptions,
  LayoutAlignment,
  LayoutFlowOptions,
  LayoutInsetInput,
  LayoutInsets,
  LayoutJustification,
  LayoutOverflow,
  LayoutSize,
  Screen,
  ScreenStack,
  ScreenStackAction
} from './regions.ts';
import type { CreateScrollStateInput, ScrollAction, ScrollState, ScrollVisibleWindow } from './scroll.ts';
import type {
  ScrollbarLayout,
  ScrollbarOptions,
  ScrollbarState,
  ScrollbarThumb,
  ScrollbarTrack
} from './scrollbar.ts';
import type {
  SpinnerAction,
  SpinnerReducerOptions,
  SpinnerState
} from './spinner.ts';
import type { NotificationStackPlacementInput, NotificationStackSize } from './notifications.ts';
import type { TooltipPlacementInput, TooltipSize } from './tooltip.ts';
import type { HighlightRenderSpan, HighlightRenderSpansOptions } from './text-highlight.ts';
import type {
  FocusTarget,
  HitTarget,
  WidgetAccessibilityInput,
  WidgetFocusInput,
  WidgetHitInput,
  WidgetLayoutInput,
  WidgetMeasureInput,
  WidgetMeasureResult,
  WidgetRenderer,
  WidgetRenderInput
} from './widget-renderer.ts';
import type {
  ExtractScrollbackSelectionTextInput,
  ScrollbackTextSegment,
  ScrollbackVisibleRow,
  ScrollbackWindow
} from './scrollback.ts';
import type {
  AnsiStyleState,
  CursorPosition,
  DiffFramesOptions,
  Frame,
  FrameCell,
  FrameBuffer,
  FrameBufferSnapshot,
  FrameBufferSnapshotMetadata,
  FrameBufferSnapshotOptions,
  FrameCellSource,
  FrameHitTarget,
  FrameRowFingerprint,
  FrameRowDiff,
  RenderDiff,
  RenderBlock,
  RenderLine,
  RenderOperation,
  RenderSerializeOptions,
  RenderSpan,
  TerminalColor,
  TerminalLink,
  TerminalStyle
} from './frame.ts';

export type {
  CursorPosition,
  AnsiStyleState,
  DiffFramesOptions,
  DirtyRegionSet,
  FocusPath,
  FramePass,
  FramePassContext,
  FrameSemanticRole,
  Frame,
  FrameCell,
  FrameBuffer,
  FrameBufferSnapshot,
  FrameBufferSnapshotMetadata,
  FrameBufferSnapshotOptions,
  FrameCellSource,
  FrameHitTarget,
  FrameRowFingerprint,
  FrameRowDiff,
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
  HighlightRenderSpan,
  HighlightRenderSpansOptions,
  Layer,
  LayoutNode,
  Rect,
  RegionOpacity,
  RenderBlock,
  RenderDiff,
  RenderRegion,
  RenderRegionHitTarget,
  RenderWidgetFrameProjection,
  RenderLine,
  RenderOperation,
  RenderSerializeOptions,
  SeriesOptions,
  RenderSpan,
  StrokeFillOptions,
  TerminalColor,
  TerminalLink,
  TerminalStyle,
  NotificationStackPlacementInput,
  NotificationStackSize,
  TooltipLine,
  TooltipPlacementInput,
  TooltipSize,
  CommandBarAction,
  CommandBarState,
  DataWindow,
  DataWindowInput,
  PaletteFilterResult,
  PaletteWindowInput,
  BorderKind,
  BorderStyle,
  PaginationInput,
  PaginationWindow,
  GridLayoutOptions,
  LayoutAlignment,
  LayoutFlowOptions,
  LayoutInsetInput,
  LayoutInsets,
  LayoutJustification,
  LayoutOverflow,
  LayoutSize,
  Screen,
  ScreenStack,
  ScreenStackAction,
  CreateScrollStateInput,
  ScrollAction,
  ScrollState,
  ScrollVisibleWindow,
  ScrollbarLayout,
  ScrollbarOptions,
  ScrollbarState,
  ScrollbarThumb,
  ScrollbarTrack,
  SpinnerAction,
  SpinnerReducerOptions,
  SpinnerState,
  ExtractScrollbackSelectionTextInput,
  ScrollbackTextSegment,
  ScrollbackVisibleRow,
  ScrollbackWindow,
  SurfaceVariant,
  FocusTarget,
  HitTarget,
  WidgetAccessibilityInput,
  WidgetFocusInput,
  WidgetHitInput,
  WidgetLayoutInput,
  WidgetMeasureInput,
  WidgetMeasureResult,
  WidgetRenderer,
  WidgetRenderInput
};
export {
  createFrameBuffer,
  clipRenderSpans,
  compositeRegions,
  createCanvas2D,
  diffFrames,
  drawBorder,
  layoutWidget,
  renderDiffAnsi,
  renderFrameAnsi,
  renderFrameDebug,
  renderFramePlain,
  renderWidgetFrame,
  renderWidgetRegions,
  placeNotificationStack,
  placeTooltip,
  boxDrawingJoinPass,
  sameFrameCell,
  sameFrameCellSource,
  serializeRenderSpansStateful,
  sameTerminalColor,
  sameTerminalLink,
  sameTerminalStyle
};
export { commandBarReducer } from './command-surface.ts';
export {
  blockGlyph,
  blockSpan,
  brailleCellForPoint,
  brailleCharacter,
  brailleMaskForSubcell,
  canvasTransform,
  composeCanvasTransform,
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
  tooltipLines,
  transformCanvasPoint,
  transformCanvasRect,
  scaleChartValue,
  verticalAxis
} from './canvas2d/index.ts';
export { dataWindow, rowWindow, scrollStateFromUnknown } from './data-window.ts';
export { createDirtyRegionSet, dirtyRegionsForRegionChanges } from './dirty-regions.ts';
export { filterPaletteEntries, paletteWindow } from './palette.ts';
export { paginationWindow } from './pagination.ts';
export { activeScreen, gridCellRects, screenStackReducer, splitTracks } from './regions.ts';
export { createScrollState, normalizeScrollState, scrollReducer, visibleWindowFromScroll } from './scroll.ts';
export { renderScrollbars, scrollbarLayout } from './scrollbar.ts';
export { animationSource, intervalSource, timeoutSource } from './scheduler.ts';
export { nextSpinnerFrameIndex, normalizeSpinnerFrameIndex, spinnerReducer } from './spinner.ts';
export { extractScrollbackSelectionText, scrollbackWindow } from './scrollback.ts';
export { highlightRenderSpans } from './text-highlight.ts';
export { defineTui } from './definition.ts';
export { createTuiRuntime } from './runtime.ts';
export { runTui } from './run.ts';
export type * from './types.ts';
