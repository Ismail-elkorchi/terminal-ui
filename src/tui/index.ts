import { layoutWidget } from './layout.ts';
import { diffFrames, renderDiff, renderFrame, renderWidgetFrame } from './render.ts';
import type {
  CommandBarAction,
  CommandBarState,
  CommandPaletteFilterResult,
  CommandPaletteWindowInput
} from './command-surface.ts';
import type { FocusPath } from './focus.ts';
import type { LayoutNode, Rect } from './layout.ts';
import type { PaginationInput, PaginationWindow } from './pagination.ts';
import type { LayoutTrack, Screen, ScreenStack, ScreenStackAction } from './regions.ts';
import type { CreateScrollStateInput, ScrollAction, ScrollState, ScrollVisibleWindow } from './scroll.ts';
import type { TreeAction } from './tree.ts';
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
  RenderDiff,
  RenderFrameOptions,
  RenderOperation
} from './frame.ts';

export type {
  CursorPosition,
  FocusPath,
  Frame,
  FrameCell,
  LayoutNode,
  Rect,
  RenderDiff,
  RenderFrameOptions,
  RenderOperation,
  CommandBarAction,
  CommandBarState,
  CommandPaletteFilterResult,
  CommandPaletteWindowInput,
  PaginationInput,
  PaginationWindow,
  LayoutTrack,
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
  TreeAction
};
export { diffFrames, layoutWidget, renderDiff, renderFrame, renderWidgetFrame };
export { commandBarReducer, commandPaletteWindow, filterCommandPaletteEntries } from './command-surface.ts';
export { paginationWindow } from './pagination.ts';
export { activeScreen, gridCellRects, screenStackReducer, splitTracks } from './regions.ts';
export { createScrollState, normalizeScrollState, scrollReducer, visibleWindowFromScroll } from './scroll.ts';
export { extractScrollbackSelectionText, scrollbackWindow } from './scrollback.ts';
export { treeReducer } from './tree.ts';
export { defineTui } from './definition.ts';
export { createTuiRuntime } from './runtime.ts';
export { runTui } from './run.ts';
export type * from './types.ts';
