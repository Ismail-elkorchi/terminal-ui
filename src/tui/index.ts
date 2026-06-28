import { layoutWidget } from './layout.ts';
import { drawBorder } from './border.ts';
import {
  createFrameBuffer,
  clipRenderSpans,
  diffFrames,
  renderDiffAnsi,
  renderFrameAnsi,
  renderFrameDebug,
  renderFramePlain,
  renderWidgetFrame,
  renderWidgetLayers,
  sameFrameCell,
  sameFrameCellSource,
  serializeRenderSpansStateful,
  sameTerminalColor,
  sameTerminalLink,
  sameTerminalStyle
} from './render.ts';
import type { RenderLayer } from './render.ts';
import type { BorderStyle } from './border.ts';
import type {
  CommandBarAction,
  CommandBarState
} from './command-surface.ts';
import type { FocusPath } from './focus.ts';
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
  FocusPath,
  Frame,
  FrameCell,
  FrameBuffer,
  FrameCellSource,
  FrameHitTarget,
  FrameRowDiff,
  Layer,
  LayoutNode,
  Rect,
  RenderBlock,
  RenderDiff,
  RenderLayer,
  RenderLine,
  RenderOperation,
  RenderSerializeOptions,
  RenderSpan,
  TerminalColor,
  TerminalLink,
  TerminalStyle,
  CommandBarAction,
  CommandBarState,
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
  diffFrames,
  drawBorder,
  layoutWidget,
  renderDiffAnsi,
  renderFrameAnsi,
  renderFrameDebug,
  renderFramePlain,
  renderWidgetFrame,
  renderWidgetLayers,
  sameFrameCell,
  sameFrameCellSource,
  serializeRenderSpansStateful,
  sameTerminalColor,
  sameTerminalLink,
  sameTerminalStyle
};
export { commandBarReducer } from './command-surface.ts';
export { filterPaletteEntries, paletteWindow } from './palette.ts';
export { paginationWindow } from './pagination.ts';
export { activeScreen, gridCellRects, screenStackReducer, splitTracks } from './regions.ts';
export { createScrollState, normalizeScrollState, scrollReducer, visibleWindowFromScroll } from './scroll.ts';
export { renderScrollbars, scrollbarLayout } from './scrollbar.ts';
export { nextSpinnerFrameIndex, normalizeSpinnerFrameIndex, spinnerReducer } from './spinner.ts';
export { extractScrollbackSelectionText, scrollbackWindow } from './scrollback.ts';
export { treeReducer } from './tree.ts';
export { defineTui } from './definition.ts';
export { createTuiRuntime } from './runtime.ts';
export { runTui } from './run.ts';
export type * from './types.ts';
