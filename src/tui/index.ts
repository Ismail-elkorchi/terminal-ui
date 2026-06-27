import { layoutWidget } from './layout.ts';
import { drawBorder } from './border.ts';
import { createFrameBuffer, diffFrames, renderDiff, renderDiffWithOptions, renderFrame, renderWidgetFrame } from './render.ts';
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
  CursorPosition,
  Frame,
  FrameCell,
  FrameBuffer,
  FrameCellSource,
  FrameHitTarget,
  RenderDiff,
  RenderFrameOptions,
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
  FocusPath,
  Frame,
  FrameCell,
  FrameBuffer,
  FrameCellSource,
  FrameHitTarget,
  Layer,
  LayoutNode,
  Rect,
  RenderBlock,
  RenderDiff,
  RenderFrameOptions,
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
export { createFrameBuffer, diffFrames, drawBorder, layoutWidget, renderDiff, renderDiffWithOptions, renderFrame, renderWidgetFrame };
export { commandBarReducer } from './command-surface.ts';
export { filterPaletteEntries, paletteWindow } from './palette.ts';
export { paginationWindow } from './pagination.ts';
export { activeScreen, gridCellRects, screenStackReducer, splitTracks } from './regions.ts';
export { createScrollState, normalizeScrollState, scrollReducer, visibleWindowFromScroll } from './scroll.ts';
export { extractScrollbackSelectionText, scrollbackWindow } from './scrollback.ts';
export { treeReducer } from './tree.ts';
export { defineTui } from './definition.ts';
export { createTuiRuntime } from './runtime.ts';
export { runTui } from './run.ts';
export type * from './types.ts';
