import { span } from './frame.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { FrameBuffer } from './frame.ts';
import type { Rect } from './layout.ts';
import type { TerminalStyle } from './render-primitives.ts';

export interface ScrollbarOptions {
  readonly visible?: 'auto' | 'always' | 'never';
  readonly axis?: 'vertical' | 'horizontal' | 'both';
}

export interface ScrollbarState {
  readonly offsetRow: number;
  readonly offsetColumn: number;
  readonly contentRows: number;
  readonly contentColumns: number;
}

export interface ScrollbarThumb {
  readonly start: number;
  readonly size: number;
}

export interface ScrollbarTrack {
  readonly bounds: Rect;
  readonly thumb: ScrollbarThumb;
}

export interface ScrollbarLayout {
  readonly contentBounds: Rect;
  readonly verticalTrack?: ScrollbarTrack;
  readonly horizontalTrack?: ScrollbarTrack;
}

export function scrollbarLayout(
  bounds: Rect,
  state: ScrollbarState,
  options: ScrollbarOptions = {}
): ScrollbarLayout {
  const normalizedBounds = normalizeRect(bounds);
  const axis = options.axis ?? 'vertical';
  const visible = options.visible ?? 'auto';
  const verticalAllowed = axis === 'vertical' || axis === 'both';
  const horizontalAllowed = axis === 'horizontal' || axis === 'both';
  let verticalVisible = scrollbarIsVisible(verticalAllowed, visible, state.contentRows, normalizedBounds.height);
  let horizontalVisible = scrollbarIsVisible(
    horizontalAllowed,
    visible,
    state.contentColumns,
    normalizedBounds.width - (verticalVisible ? 1 : 0)
  );
  verticalVisible = scrollbarIsVisible(
    verticalAllowed,
    visible,
    state.contentRows,
    normalizedBounds.height - (horizontalVisible ? 1 : 0)
  );
  horizontalVisible = scrollbarIsVisible(
    horizontalAllowed,
    visible,
    state.contentColumns,
    normalizedBounds.width - (verticalVisible ? 1 : 0)
  );
  const contentBounds = normalizeRect({
    row: normalizedBounds.row,
    column: normalizedBounds.column,
    width: normalizedBounds.width - (verticalVisible ? 1 : 0),
    height: normalizedBounds.height - (horizontalVisible ? 1 : 0)
  });
  return {
    contentBounds,
    ...(verticalVisible && contentBounds.height > 0
      ? {
          verticalTrack: {
            bounds: {
              row: contentBounds.row,
              column: contentBounds.column + contentBounds.width,
              width: 1,
              height: contentBounds.height
            },
            thumb: scrollbarThumb(contentBounds.height, state.contentRows, contentBounds.height, state.offsetRow)
          }
        }
      : {}),
    ...(horizontalVisible && contentBounds.width > 0
      ? {
          horizontalTrack: {
            bounds: {
              row: contentBounds.row + contentBounds.height,
              column: contentBounds.column,
              width: contentBounds.width,
              height: 1
            },
            thumb: scrollbarThumb(contentBounds.width, state.contentColumns, contentBounds.width, state.offsetColumn)
          }
        }
      : {})
  };
}

export function renderScrollbars(
  buffer: FrameBuffer,
  layout: ScrollbarLayout,
  theme: TerminalTheme
): void {
  if (layout.verticalTrack !== undefined) {
    renderVerticalScrollbar(buffer, layout.verticalTrack, theme);
  }
  if (layout.horizontalTrack !== undefined) {
    renderHorizontalScrollbar(buffer, layout.horizontalTrack, theme);
  }
}

function renderVerticalScrollbar(buffer: FrameBuffer, track: ScrollbarTrack, theme: TerminalTheme): void {
  for (let offset = 0; offset < track.bounds.height; offset += 1) {
    const thumb = offset >= track.thumb.start && offset < track.thumb.start + track.thumb.size;
    buffer.write(track.bounds.row + offset, track.bounds.column, [span(
      thumb ? theme.symbols.scrollbarVerticalThumb : theme.symbols.scrollbarVerticalTrack,
      { style: scrollbarStyle(thumb) }
    )]);
  }
}

function renderHorizontalScrollbar(buffer: FrameBuffer, track: ScrollbarTrack, theme: TerminalTheme): void {
  for (let offset = 0; offset < track.bounds.width; offset += 1) {
    const thumb = offset >= track.thumb.start && offset < track.thumb.start + track.thumb.size;
    buffer.write(track.bounds.row, track.bounds.column + offset, [span(
      thumb ? theme.symbols.scrollbarHorizontalThumb : theme.symbols.scrollbarHorizontalTrack,
      { style: scrollbarStyle(thumb) }
    )]);
  }
}

function scrollbarThumb(trackSize: number, contentSize: number, viewportSize: number, offset: number): ScrollbarThumb {
  const safeTrack = Math.max(0, Math.floor(trackSize));
  if (safeTrack === 0) return { start: 0, size: 0 };
  const safeContent = Math.max(0, Math.floor(contentSize));
  const safeViewport = Math.max(0, Math.floor(viewportSize));
  if (safeContent <= safeViewport || safeContent === 0) return { start: 0, size: safeTrack };
  const size = Math.max(1, Math.floor(safeTrack * safeViewport / safeContent));
  const maxOffset = Math.max(1, safeContent - safeViewport);
  const maxStart = Math.max(0, safeTrack - size);
  const start = Math.min(maxStart, Math.floor(maxStart * Math.max(0, Math.floor(offset)) / maxOffset));
  return { start, size };
}

function scrollbarIsVisible(
  allowed: boolean,
  visible: NonNullable<ScrollbarOptions['visible']>,
  contentSize: number,
  viewportSize: number
): boolean {
  if (!allowed || visible === 'never') return false;
  if (visible === 'always') return viewportSize > 0;
  return Math.max(0, Math.floor(contentSize)) > Math.max(0, Math.floor(viewportSize));
}

function scrollbarStyle(thumb: boolean): TerminalStyle {
  return {
    fg: { kind: 'theme', token: thumb ? 'scrollbar.thumb' : 'scrollbar.track' }
  };
}

function normalizeRect(bounds: Rect): Rect {
  return {
    row: Math.max(1, Math.floor(bounds.row)),
    column: Math.max(1, Math.floor(bounds.column)),
    width: Math.max(0, Math.floor(bounds.width)),
    height: Math.max(0, Math.floor(bounds.height))
  };
}
