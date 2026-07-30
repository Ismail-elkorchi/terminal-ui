import { span } from './frame.ts';
import { frameCellSource } from '../../visual/source.ts';
import type { TerminalTheme } from '../../theme/index.ts';
import type { RenderTarget } from '../contracts.ts';
import type { Rect } from '../contracts.ts';
import type { FrameCellSource } from '../../visual/render.ts';
import type { TerminalStyle } from '../../visual/render.ts';
import type {
  ScrollbarInteractionAction,
  ScrollbarInteractionState,
  ScrollbarOptions,
  ScrollbarState,
  ScrollbarVisualState
} from '../../interaction/scrollbar.ts';
import { oneCellGlyph } from '../../text/index.ts';

export type {
  ScrollbarInteractionAction,
  ScrollbarInteractionState,
  ScrollbarOptions,
  ScrollbarState,
  ScrollbarVisualState
} from '../../interaction/scrollbar.ts';

export interface ScrollbarThumb {
  readonly start: number;
  readonly size: number;
}

export interface ScrollbarTrack {
  readonly axis: 'vertical' | 'horizontal';
  readonly bounds: Rect;
  readonly thumb: ScrollbarThumb;
  readonly state: ScrollbarVisualState;
  readonly scrollable: boolean;
}

export interface ScrollbarLayout {
  readonly contentBounds: Rect;
  readonly verticalTrack?: ScrollbarTrack;
  readonly horizontalTrack?: ScrollbarTrack;
}

export interface ScrollbarRenderOptions {
  readonly elementId?: string;
  readonly elementKind?: string;
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
  const verticalScrollable = Math.max(0, Math.floor(state.contentRows)) > contentBounds.height;
  const horizontalScrollable = Math.max(0, Math.floor(state.contentColumns)) > contentBounds.width;
  return {
    contentBounds,
    ...(verticalVisible && contentBounds.height > 0
      ? {
          verticalTrack: {
            axis: 'vertical',
            bounds: {
              row: contentBounds.row,
              column: contentBounds.column + contentBounds.width,
              width: 1,
              height: contentBounds.height
            },
            thumb: scrollbarThumb(contentBounds.height, state.contentRows, contentBounds.height, state.offsetRow),
            state: scrollbarTrackState(options, verticalScrollable),
            scrollable: verticalScrollable
          }
        }
      : {}),
    ...(horizontalVisible && contentBounds.width > 0
      ? {
          horizontalTrack: {
            axis: 'horizontal',
            bounds: {
              row: contentBounds.row + contentBounds.height,
              column: contentBounds.column,
              width: contentBounds.width,
              height: 1
            },
            thumb: scrollbarThumb(contentBounds.width, state.contentColumns, contentBounds.width, state.offsetColumn),
            state: scrollbarTrackState(options, horizontalScrollable),
            scrollable: horizontalScrollable
          }
        }
      : {})
  };
}

export function renderScrollbars(
  buffer: RenderTarget,
  layout: ScrollbarLayout,
  theme: TerminalTheme,
  options: ScrollbarRenderOptions = {}
): void {
  if (layout.verticalTrack !== undefined) {
    renderVerticalScrollbar(buffer, layout.verticalTrack, theme, options);
  }
  if (layout.horizontalTrack !== undefined) {
    renderHorizontalScrollbar(buffer, layout.horizontalTrack, theme, options);
  }
}

export function scrollbarInteractionReducer(
  state: ScrollbarInteractionState,
  action: ScrollbarInteractionAction
): ScrollbarInteractionState {
  if (action.kind === 'reset') return {};
  const event = action.event;
  switch (event.kind) {
    case 'enter':
    case 'hover':
      return event.targetId === undefined ? state : preserveScrollbarInteractionState(state, { ...state, hoveredTargetId: event.targetId });
    case 'leave':
      return event.targetId !== undefined && state.hoveredTargetId === event.targetId
        ? preserveScrollbarInteractionState(state, removeInteractionField(state, 'hoveredTargetId'))
        : state;
    case 'pointerDown':
    case 'dragStart':
    case 'drag': {
      const activeTargetId = event.capturedTargetId ?? event.targetId;
      return activeTargetId === undefined
        ? state
        : preserveScrollbarInteractionState(state, { ...state, activeTargetId });
    }
    case 'pointerUp':
    case 'dragEnd':
      return preserveScrollbarInteractionState(state, removeInteractionField(state, 'activeTargetId'));
    default:
      return state;
  }
}

export function scrollbarVisualStateForTarget(
  state: ScrollbarInteractionState,
  targetId: string
): ScrollbarVisualState | undefined {
  if (state.activeTargetId === targetId) return 'active';
  if (state.hoveredTargetId === targetId) return 'hover';
  return undefined;
}

function renderVerticalScrollbar(
  buffer: RenderTarget,
  track: ScrollbarTrack,
  theme: TerminalTheme,
  options: ScrollbarRenderOptions
): void {
  for (let offset = 0; offset < track.bounds.height; offset += 1) {
    const thumb = offset >= track.thumb.start && offset < track.thumb.start + track.thumb.size;
    buffer.write(track.bounds.row + offset, track.bounds.column, [span(
      oneCellGlyph(
        thumb ? theme.tokens.symbols.scrollbarVerticalThumb : theme.tokens.symbols.scrollbarVerticalTrack,
        '|',
        { widthProfile: buffer.widthProfile }
      ),
      {
        style: scrollbarStyle(thumb, track.state),
        source: scrollbarSource(track.axis, thumb ? 'thumb' : 'track', track.state, options)
      }
    )]);
  }
}

function renderHorizontalScrollbar(
  buffer: RenderTarget,
  track: ScrollbarTrack,
  theme: TerminalTheme,
  options: ScrollbarRenderOptions
): void {
  for (let offset = 0; offset < track.bounds.width; offset += 1) {
    const thumb = offset >= track.thumb.start && offset < track.thumb.start + track.thumb.size;
    buffer.write(track.bounds.row, track.bounds.column + offset, [span(
      oneCellGlyph(
        thumb ? theme.tokens.symbols.scrollbarHorizontalThumb : theme.tokens.symbols.scrollbarHorizontalTrack,
        '-',
        { widthProfile: buffer.widthProfile }
      ),
      {
        style: scrollbarStyle(thumb, track.state),
        source: scrollbarSource(track.axis, thumb ? 'thumb' : 'track', track.state, options)
      }
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

function scrollbarTrackState(options: ScrollbarOptions, scrollable: boolean): ScrollbarVisualState {
  return options.visualState ?? (scrollable ? 'idle' : 'inactive');
}

function scrollbarStyle(thumb: boolean, state: ScrollbarVisualState): TerminalStyle {
  if (!thumb) {
    return {
      fg: { kind: 'theme', token: 'scrollbar.track' },
      dim: true
    };
  }
  if (state === 'disabled' || state === 'inactive') {
    return {
      fg: { kind: 'theme', token: 'scrollbar.track' },
      dim: true
    };
  }
  if (state === 'active') {
    return {
      fg: { kind: 'theme', token: 'focus.border' },
      bold: true
    };
  }
  return {
    fg: { kind: 'theme', token: 'scrollbar.thumb' },
    ...(state === 'hover' ? { bold: true } : {})
  };
}

function scrollbarSource(
  axis: ScrollbarTrack['axis'],
  partType: 'track' | 'thumb',
  state: ScrollbarVisualState,
  options: ScrollbarRenderOptions
): FrameCellSource {
  return frameCellSource({
    ...(options.elementId === undefined ? {} : { elementId: options.elementId }),
    elementKind: options.elementKind ?? 'scrollbar',
    rendererFamily: 'scroll',
    cellRole: 'scrollbar',
    partName: `${axis}.${partType}`,
    partType,
    ...scrollbarSourceState(state),
    description: `${axis} scrollbar ${partType}`
  });
}

function scrollbarSourceState(
  state: ScrollbarVisualState
): { readonly interactionState?: NonNullable<FrameCellSource['interactionState']> } {
  switch (state) {
    case 'active': return { interactionState: 'active' };
    case 'hover': return { interactionState: 'hovered' };
    case 'disabled':
    case 'inactive': return { interactionState: 'disabled' };
    case 'idle': return {};
  }
}

function normalizeRect(bounds: Rect): Rect {
  return {
    row: Math.max(1, Math.floor(bounds.row)),
    column: Math.max(1, Math.floor(bounds.column)),
    width: Math.max(0, Math.floor(bounds.width)),
    height: Math.max(0, Math.floor(bounds.height))
  };
}

function preserveScrollbarInteractionState(
  previous: ScrollbarInteractionState,
  next: ScrollbarInteractionState
): ScrollbarInteractionState {
  return previous.hoveredTargetId === next.hoveredTargetId
    && previous.activeTargetId === next.activeTargetId
    ? previous
    : next;
}

function removeInteractionField(
  state: ScrollbarInteractionState,
  field: keyof ScrollbarInteractionState
): ScrollbarInteractionState {
  return {
    ...(field === 'hoveredTargetId' ? {} : state.hoveredTargetId === undefined ? {} : { hoveredTargetId: state.hoveredTargetId }),
    ...(field === 'activeTargetId' ? {} : state.activeTargetId === undefined ? {} : { activeTargetId: state.activeTargetId })
  };
}
