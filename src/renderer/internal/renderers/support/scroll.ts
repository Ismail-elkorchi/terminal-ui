import { finiteNonNegativeIntegerOr, isNonArrayObject } from '../../../../foundation/validation.ts';
import type { TerminalTheme } from '../../../../theme/index.ts';
import type {
  RenderNodeKind,
  RenderNodeOfKind,
  RenderNodesOfKind
} from '../../../model/index.ts';
import { normalizeScrollState, scrollReducer } from '../../../../behavior/scroll.ts';
import { renderScrollbars, scrollbarLayout } from '../../scrollbar.ts';
import { viewportVisualState } from './viewport.ts';
import type { RenderTarget } from '../../../contracts.ts';
import type { LayoutNode, Rect } from '../../../contracts.ts';
import type { RoutedPointerEvent } from '../../../../input/pointer.ts';
import { ignoreMessage } from '../../../../interaction/message.ts';
import type { MessageResolution } from '../../../../interaction/message.ts';
import type {
  ScrollAction,
  ScrollState,
  ScrollEvent,
  ScrollEventSource,
  ScrollEventTarget
} from '../../../../interaction/scroll.ts';
import type {
  ScrollbarLayout,
  ScrollbarOptions,
  ScrollbarState,
  ScrollbarTrack,
  ScrollbarVisualState
} from '../../scrollbar.ts';
import type { HitTarget } from '../../../contracts.ts';

const WHEEL_SCROLL_LINES = 3;
const WHEEL_SCROLL_COLUMNS = 3;

type ScrollableRenderNodeKind = 'viewport';
type ScrollableNode<TMessage = unknown> = RenderNodesOfKind<TMessage, ScrollableRenderNodeKind>;
type ViewportNode = RenderNodeOfKind<unknown, 'viewport'>;

interface NormalizedScrollWheelPolicy {
  readonly unit: 'line' | 'page';
  readonly rows: number;
  readonly columns: number;
}

interface RenderNodeScrollbarPlan {
  readonly contentBounds: Rect;
  readonly layout?: ScrollbarLayout;
  readonly state: ScrollbarState;
}

type RenderNodeScrollbarStateFactory = (bounds: Rect) => ScrollbarState;

export function scrollbarsForRenderNode(
  renderNode: ScrollableNode,
  bounds: Rect,
  stateForBounds: RenderNodeScrollbarStateFactory,
  fallbackAxis: NonNullable<ScrollbarOptions['axis']>
): RenderNodeScrollbarPlan {
  const initialState = stateForBounds(bounds);
  const options = scrollbarOptionsProp(renderNode, fallbackAxis);
  if (options === undefined) {
    return {
      contentBounds: bounds,
      state: initialState
    };
  }
  const layout = reconciledScrollbarLayout(bounds, initialState, options, stateForBounds);
  return {
    contentBounds: layout.contentBounds,
    layout,
    state: stateForBounds(layout.contentBounds)
  };
}

export function drawScrollbars(
  buffer: RenderTarget,
  renderNode: { readonly id?: string; readonly kind: RenderNodeKind },
  plan: RenderNodeScrollbarPlan,
  theme: TerminalTheme
): void {
  if (plan.layout !== undefined) {
    renderScrollbars(buffer, plan.layout, theme, {
      ...(renderNode.id === undefined ? {} : { elementId: renderNode.id }),
      elementKind: renderNode.kind
    });
  }
}

export function scrollbarHitTargetsForRenderNode<TMessage>(
  renderNode: ScrollableNode<TMessage>,
  plan: RenderNodeScrollbarPlan,
  state: ScrollbarState
): readonly HitTarget<TMessage>[] {
  const factory = scrollMessageFactory(renderNode);
  if (factory === undefined) return [];
  const id = renderNode.id ?? renderNode.kind;
  const eventState = scrollStateForContentBounds(state, plan.contentBounds);
  const wheel = scrollWheelPolicyProp(renderNode);
  return [
    ...(plan.contentBounds.width > 0 && plan.contentBounds.height > 0
      ? [scrollContentHitTarget(id, plan.contentBounds, eventState, wheel, factory)]
      : []),
    ...(plan.layout?.verticalTrack === undefined
      ? []
      : scrollbarTrackHitTargets(id, 'vertical', plan.layout.verticalTrack, eventState, wheel, factory)),
    ...(plan.layout?.horizontalTrack === undefined
      ? []
      : scrollbarTrackHitTargets(id, 'horizontal', plan.layout.horizontalTrack, eventState, wheel, factory))
  ];
}

function scrollStateForContentBounds(state: ScrollbarState, bounds: Rect): ScrollbarState {
  const geometry = {
    contentRows: state.contentRows,
    contentColumns: state.contentColumns,
    viewportRows: bounds.height,
    viewportColumns: bounds.width,
  };
  return { ...normalizeScrollState(scrollPosition(state), geometry), ...geometry };
}

function reconciledScrollbarLayout(
  bounds: Rect,
  initialState: ScrollbarState,
  options: ScrollbarOptions,
  stateForBounds: RenderNodeScrollbarStateFactory
): ScrollbarLayout {
  let layout = scrollbarLayout(bounds, initialState, options);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const next = scrollbarLayout(bounds, stateForBounds(layout.contentBounds), options);
    if (rectsEqual(next.contentBounds, layout.contentBounds)) return next;
    layout = next;
  }
  return layout;
}

function rectsEqual(left: Rect, right: Rect): boolean {
  return left.row === right.row
    && left.column === right.column
    && left.width === right.width
    && left.height === right.height;
}

function scrollMessageFactory<TMessage>(
  renderNode: ScrollableNode<TMessage>
): ((event: ScrollEvent) => MessageResolution<TMessage>) | undefined {
  const raw = renderNode.props.toScrollMessage;
  return typeof raw === 'function'
    ? (event) => (raw)(event)
    : undefined;
}

function scrollContentHitTarget<TMessage>(
  id: string,
  bounds: Rect,
  state: ScrollbarState,
  wheel: NormalizedScrollWheelPolicy,
  factory: (event: ScrollEvent) => MessageResolution<TMessage>
): HitTarget<TMessage> {
  return {
    id: `${id}:scroll:content`,
    bounds,
    accepts: ['scroll'],
    message: (event) => {
      const action = scrollActionForWheel(event, wheel);
      return action === undefined ? ignoreMessage() : factory(scrollEvent(action, state, event, 'content'));
    }
  };
}

function scrollbarTrackHitTargets<TMessage>(
  id: string,
  axis: 'vertical' | 'horizontal',
  track: ScrollbarTrack,
  state: ScrollbarState,
  wheel: NormalizedScrollWheelPolicy,
  factory: (event: ScrollEvent) => MessageResolution<TMessage>
): readonly HitTarget<TMessage>[] {
  const trackTarget: HitTarget<TMessage> = {
    id: `${id}:scrollbar:${axis}:track`,
    bounds: track.bounds,
    accepts: ['scroll', 'pointerDown', 'dragStart', 'drag'],
    cursor: 'pointer',
    message: (event) => {
      const action = event.kind === 'scroll'
        ? scrollActionForWheel(event, wheel)
        : scrollActionForTrack(axis, track, state, event);
      return action === undefined ? ignoreMessage() : factory(scrollEvent(
        action,
        state,
        event,
        axis === 'vertical' ? 'verticalScrollbarTrack' : 'horizontalScrollbarTrack'
      ));
    }
  };
  const thumbBounds = scrollbarThumbBounds(track);
  return thumbBounds === undefined
    ? [trackTarget]
    : [
        trackTarget,
        {
          id: `${id}:scrollbar:${axis}:thumb`,
          bounds: thumbBounds,
          accepts: ['pointerDown', 'dragStart', 'drag'],
          cursor: 'pointer',
          message: (event) => {
            const action = scrollActionForThumb(axis, track, state, event);
            return action === undefined ? ignoreMessage() : factory(scrollEvent(
              action,
              state,
              event,
              axis === 'vertical' ? 'verticalScrollbarThumb' : 'horizontalScrollbarThumb'
            ));
          }
        }
      ];
}

function scrollEvent(
  action: ScrollAction,
  scroll: ScrollbarState,
  pointer: RoutedPointerEvent,
  target: ScrollEventTarget
): ScrollEvent {
  return {
    action,
    state: scrollReducer(scrollPosition(scroll), action, scrollGeometry(scroll)),
    source: scrollEventSource(pointer),
    target,
  };
}

function scrollEventSource(event: RoutedPointerEvent): ScrollEventSource {
  switch (event.kind) {
    case 'scroll':
      return 'wheel';
    case 'pointerDown':
    case 'dragStart':
    case 'drag':
      return event.kind;
    default:
      return 'wheel';
  }
}

function scrollActionForWheel(
  event: RoutedPointerEvent,
  policy: NormalizedScrollWheelPolicy
): ScrollAction | undefined {
  if (event.deltaRows === 0 && event.deltaColumns === 0) return undefined;
  const rows = event.deltaRows === 0 ? undefined : event.deltaRows * policy.rows;
  const columns = event.deltaColumns === 0 ? undefined : event.deltaColumns * policy.columns;
  if ((rows ?? 0) === 0 && (columns ?? 0) === 0) return undefined;
  return {
    kind: policy.unit === 'page' ? 'scrollPages' : 'scrollLines',
    ...(rows === undefined ? {} : { rows }),
    ...(columns === undefined ? {} : { columns })
  };
}

function scrollActionForTrack(
  axis: 'vertical' | 'horizontal',
  track: ScrollbarTrack,
  state: ScrollbarState,
  event: RoutedPointerEvent
): ScrollAction | undefined {
  if (axis === 'vertical') {
    const local = event.localRow;
    if (local === undefined) return undefined;
    return {
      kind: 'setOffset',
      rows: offsetForTrack(local - 1, track.bounds.height, state.contentRows, track.bounds.height)
    };
  }
  const local = event.localColumn;
  if (local === undefined) return undefined;
  return {
    kind: 'setOffset',
    columns: offsetForTrack(local - 1, track.bounds.width, state.contentColumns, track.bounds.width)
  };
}

function scrollActionForThumb(
  axis: 'vertical' | 'horizontal',
  track: ScrollbarTrack,
  state: ScrollbarState,
  event: RoutedPointerEvent
): ScrollAction | undefined {
  if (axis === 'vertical') {
    const anchor = Math.max(0, (event.pressLocalRow ?? event.localRow ?? 1) - 1);
    return {
      kind: 'setOffset',
      rows: offsetForThumbStart(event.row - track.bounds.row - anchor, track.bounds.height, track.thumb.size, state.contentRows, state.viewportRows)
    };
  }
  const anchor = Math.max(0, (event.pressLocalColumn ?? event.localColumn ?? 1) - 1);
  return {
    kind: 'setOffset',
    columns: offsetForThumbStart(event.column - track.bounds.column - anchor, track.bounds.width, track.thumb.size, state.contentColumns, state.viewportColumns)
  };
}

function offsetForTrack(position: number, trackSize: number, contentSize: number, viewportSize: number): number {
  const maxOffset = Math.max(0, Math.floor(contentSize) - Math.max(0, Math.floor(viewportSize)));
  if (maxOffset === 0) return 0;
  const maxPosition = Math.max(1, Math.max(0, Math.floor(trackSize)) - 1);
  const clamped = Math.max(0, Math.min(maxPosition, Math.floor(position)));
  return Math.round(maxOffset * clamped / maxPosition);
}

function offsetForThumbStart(
  position: number,
  trackSize: number,
  thumbSize: number,
  contentSize: number,
  viewportSize: number
): number {
  const maxOffset = Math.max(0, Math.floor(contentSize) - Math.max(0, Math.floor(viewportSize)));
  if (maxOffset === 0) return 0;
  const maxPosition = Math.max(1, Math.max(0, Math.floor(trackSize)) - Math.max(1, Math.floor(thumbSize)));
  const clamped = Math.max(0, Math.min(maxPosition, Math.floor(position)));
  return Math.round(maxOffset * clamped / maxPosition);
}

function scrollbarThumbBounds(track: ScrollbarTrack): Rect | undefined {
  if (!track.scrollable || track.thumb.size <= 0) return undefined;
  if (track.axis === 'vertical') {
    return {
      row: track.bounds.row + track.thumb.start,
      column: track.bounds.column,
      width: track.bounds.width,
      height: track.thumb.size
    };
  }
  return {
    row: track.bounds.row,
    column: track.bounds.column + track.thumb.start,
    width: track.thumb.size,
    height: track.bounds.height
  };
}

function scrollbarOptionsProp(
  renderNode: ScrollableNode,
  fallbackAxis: NonNullable<ScrollbarOptions['axis']>
): ScrollbarOptions | undefined {
  const raw = renderNode.props.scrollbar;
  if (!isNonArrayObject(raw)) return undefined;
  const visible = raw['visible'];
  const axis = raw['axis'];
  const visualState = raw['visualState'];
  return {
    axis: isScrollbarAxis(axis) ? axis : fallbackAxis,
    visible: isScrollbarVisibility(visible) ? visible : 'auto',
    ...(isScrollbarVisualState(visualState) ? { visualState } : {})
  };
}

function scrollWheelPolicyProp(renderNode: ScrollableNode): NormalizedScrollWheelPolicy {
  const raw = renderNode.props.scrollPolicy;
  if (!isNonArrayObject(raw)) return defaultWheelPolicy();
  const wheel = raw['wheel'];
  if (!isNonArrayObject(wheel)) return defaultWheelPolicy();
  return {
    unit: wheel['unit'] === 'page' ? 'page' : 'line',
    rows: finiteNonNegativeIntegerOr(wheel['rows'], WHEEL_SCROLL_LINES),
    columns: finiteNonNegativeIntegerOr(wheel['columns'], WHEEL_SCROLL_COLUMNS)
  };
}

function defaultWheelPolicy(): NormalizedScrollWheelPolicy {
  return {
    unit: 'line',
    rows: WHEEL_SCROLL_LINES,
    columns: WHEEL_SCROLL_COLUMNS
  };
}

function isScrollbarAxis(value: unknown): value is NonNullable<ScrollbarOptions['axis']> {
  return value === 'vertical' || value === 'horizontal' || value === 'both';
}

function isScrollbarVisibility(value: unknown): value is NonNullable<ScrollbarOptions['visible']> {
  return value === 'auto' || value === 'always' || value === 'never';
}

function isScrollbarVisualState(value: unknown): value is ScrollbarVisualState {
  return value === 'idle'
    || value === 'active'
    || value === 'hover'
    || value === 'disabled'
    || value === 'inactive';
}

export function viewportScrollbarState(
  renderNode: ViewportNode,
  bounds: Rect,
  node: Pick<LayoutNode, 'children'>
): ScrollbarState {
  const state = viewportVisualState(renderNode, bounds, node);
  const geometry = {
    contentRows: state.contentRows,
    contentColumns: state.contentColumns,
    viewportRows: bounds.height,
    viewportColumns: bounds.width,
  };
  return {
    ...normalizeScrollState({
    offsetRow: state.offsetRow,
    offsetColumn: state.offsetColumn,
    followTail: false
    }, geometry),
    ...geometry,
  };
}

function scrollPosition(state: ScrollbarState): ScrollState {
  return { offsetRow: state.offsetRow, offsetColumn: state.offsetColumn, followTail: state.followTail };
}

function scrollGeometry(state: ScrollbarState) {
  return {
    contentRows: state.contentRows,
    contentColumns: state.contentColumns,
    viewportRows: state.viewportRows,
    viewportColumns: state.viewportColumns,
  };
}
