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
import type { AxisLine, BlockGlyph, BrailleCellPoint, Canvas2D, CanvasPoint, StrokeFillOptions, TooltipLine } from './canvas2d/index.ts';
import type { RenderRegion, RenderWidgetFrameProjection } from './render.ts';
import type { BorderStyle } from './border.ts';
import type {
  CommandBarAction,
  CommandBarState
} from './command-surface.ts';
import type { DataWindow, DataWindowInput } from './data-window.ts';
import type { DirtyRegionSet } from './dirty-regions.ts';
import type { FocusPath } from './focus.ts';
import type { FramePass, FramePassContext, FrameSemanticRole } from './frame-passes/index.ts';
import type { Layer, LayoutNode, Rect } from './layout.ts';
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
import type { TreeAction } from './tree.ts';
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
  FrameCellSource,
  FrameHitTarget,
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
  FrameCellSource,
  FrameHitTarget,
  AxisLine,
  BlockGlyph,
  BrailleCellPoint,
  Canvas2D,
  CanvasPoint,
  FrameRowDiff,
  Layer,
  LayoutNode,
  Rect,
  RenderBlock,
  RenderDiff,
  RenderRegion,
  RenderWidgetFrameProjection,
  RenderLine,
  RenderOperation,
  RenderSerializeOptions,
  RenderSpan,
  StrokeFillOptions,
  TerminalColor,
  TerminalLink,
  TerminalStyle,
  TooltipLine,
  CommandBarAction,
  CommandBarState,
  DataWindow,
  DataWindowInput,
  PaletteFilterResult,
  PaletteWindowInput,
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
  TreeAction,
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
  boxDrawingJoinPass,
  sameFrameCell,
  sameFrameCellSource,
  serializeRenderSpansStateful,
  sameTerminalColor,
  sameTerminalLink,
  sameTerminalStyle
};
export { commandBarReducer } from './command-surface.ts';
export { blockGlyph, blockSpan, brailleCellForPoint, brailleCharacter, brailleMaskForSubcell, horizontalAxis, integerPoint, linePoints, rectInteriorPoints, rectStrokePoints, tooltipLines, verticalAxis } from './canvas2d/index.ts';
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
export { treeReducer } from './tree.ts';
export { defineTui } from './definition.ts';
export { createTuiRuntime } from './runtime.ts';
export { runTui } from './run.ts';
export type * from './types.ts';
