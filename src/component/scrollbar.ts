import { normalizeScrollState, scrollReducer } from '../behavior/scroll.ts';
import type { Rect } from '../geometry/types.ts';
import type { RoutedPointerEvent } from '../input/pointer.ts';
import { ignoreMessage, type MessageResolution } from '../interaction/message.ts';
import type {
  ScrollAction,
  ScrollEvent,
  ScrollEventSource,
  ScrollEventTarget,
  ScrollGeometry,
  ScrollPolicy,
  ScrollState
} from '../interaction/scroll.ts';
import type {
  ScrollbarOptions,
  ScrollbarState,
  ScrollbarVisualState
} from '../interaction/scrollbar.ts';
import type { HitTarget, RenderTarget } from '../renderer/contracts.ts';
import { oneCellGlyph } from '../text/index.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { FrameCellSource } from '../visual/source.ts';
import { assertOptionalEnum } from '../foundation/validation.ts';
import {
  scrollRouteDescriptor,
  type ScrollRoutable,
} from '../interaction/scroll-route.ts';

export function prepareComponentScrollState(
  value: ScrollState | undefined,
  subject: string,
): ScrollState | undefined {
  if (value === undefined) return undefined;
  return Object.freeze({
    offsetRow: nonNegativeInteger(value.offsetRow, `${subject}.offsetRow`),
    offsetColumn: nonNegativeInteger(value.offsetColumn, `${subject}.offsetColumn`),
    followTail: value.followTail,
  });
}

export function prepareComponentScrollbarOptions(
  value: ScrollbarOptions | undefined,
  subject: string,
): ScrollbarOptions | undefined {
  if (value === undefined) return undefined;
  assertOptionalEnum(value.visible, ['auto', 'always', 'never'], `${subject}.visible`);
  assertOptionalEnum(value.axis, ['vertical', 'horizontal', 'both'], `${subject}.axis`);
  assertOptionalEnum(
    value.visualState,
    ['idle', 'active', 'hover', 'disabled', 'inactive'],
    `${subject}.visualState`,
  );
  return Object.freeze({
    ...(value.visible === undefined ? {} : { visible: value.visible }),
    ...(value.axis === undefined ? {} : { axis: value.axis }),
    ...(value.visualState === undefined ? {} : { visualState: value.visualState })
  });
}

export function prepareComponentScrollPolicy(
  value: ScrollPolicy | undefined,
  subject: string,
): ScrollPolicy | undefined {
  if (value === undefined) return undefined;
  const wheel = value.wheel;
  if (wheel === undefined) return Object.freeze({});
  assertOptionalEnum(wheel.unit, ['line', 'page'], `${subject}.wheel.unit`);
  const optional = (field: 'rows' | 'columns'): number | undefined => wheel[field] === undefined ? undefined : nonNegativeInteger(wheel[field], `${subject}.wheel.${field}`);
  const rows = optional('rows');
  const columns = optional('columns');
  return Object.freeze({ wheel: Object.freeze({
    ...(wheel.unit === undefined ? {} : { unit: wheel.unit }),
    ...(rows === undefined ? {} : { rows }),
    ...(columns === undefined ? {} : { columns })
  }) });
}

function nonNegativeInteger(value: number, subject: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new RangeError(`${subject} must be a non-negative safe integer.`);
  return value;
}

export interface ComponentScrollbarThumb {
  readonly start: number;
  readonly size: number;
}

export interface ComponentScrollbarTrack {
  readonly axis: 'vertical' | 'horizontal';
  readonly bounds: Rect;
  readonly thumb: ComponentScrollbarThumb;
  readonly state: ScrollbarVisualState;
  readonly scrollable: boolean;
}

export interface ComponentScrollbarLayout {
  readonly contentBounds: Rect;
  readonly verticalTrack?: ComponentScrollbarTrack;
  readonly horizontalTrack?: ComponentScrollbarTrack;
}

export interface ComponentScrollbarPlan {
  readonly contentBounds: Rect;
  readonly layout?: ComponentScrollbarLayout;
  readonly scroll: ScrollState;
  readonly geometry: ScrollGeometry;
  readonly scrollbar: ScrollbarState;
}

export function prepareComponentScrollbar(input: {
  readonly bounds: Rect;
  readonly scroll: ScrollState;
  readonly contentRows: number;
  readonly contentColumns: number;
  readonly options?: ScrollbarOptions;
  readonly defaultAxis?: NonNullable<ScrollbarOptions['axis']>;
}): ComponentScrollbarPlan {
  const contentRows = nonNegativeInteger(input.contentRows, 'scrollbar contentRows');
  const contentColumns = nonNegativeInteger(input.contentColumns, 'scrollbar contentColumns');
  const initial = scrollForBounds(input.scroll, input.bounds, contentRows, contentColumns);
  if (input.options === undefined) {
    return componentScrollbarPlan(normalizeLocalRect(input.bounds), undefined, initial);
  }
  const options = Object.freeze({
    ...input.options,
    axis: input.options.axis ?? input.defaultAxis ?? 'vertical'
  });
  let layout = componentScrollbarLayout(input.bounds, initial, options);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const next = componentScrollbarLayout(
      input.bounds,
      scrollForBounds(input.scroll, layout.contentBounds, contentRows, contentColumns),
      options
    );
    if (sameRect(next.contentBounds, layout.contentBounds)) {
      layout = next;
      break;
    }
    layout = next;
  }
  return componentScrollbarPlan(
    layout.contentBounds,
    layout,
    scrollForBounds(input.scroll, layout.contentBounds, contentRows, contentColumns),
  );
}

function componentScrollbarPlan(
  contentBounds: Rect,
  layout: ComponentScrollbarLayout | undefined,
  scrollbar: ScrollbarState,
): ComponentScrollbarPlan {
  return Object.freeze({
    contentBounds,
    ...(layout === undefined ? {} : { layout }),
    scroll: Object.freeze({
      offsetRow: scrollbar.offsetRow,
      offsetColumn: scrollbar.offsetColumn,
      followTail: scrollbar.followTail,
    }),
    geometry: Object.freeze({
      contentRows: scrollbar.contentRows,
      contentColumns: scrollbar.contentColumns,
      viewportRows: scrollbar.viewportRows,
      viewportColumns: scrollbar.viewportColumns,
    }),
    scrollbar,
  });
}

export function paintComponentScrollbar(input: {
  readonly target: RenderTarget;
  readonly plan: ComponentScrollbarPlan;
  readonly theme: TerminalTheme;
  readonly style?: (
    part: 'scrollbarTrack' | 'scrollbarThumb',
    state: 'hovered' | 'disabled' | 'active' | undefined,
    base: import('../visual/render.ts').TerminalStyle,
  ) => import('../visual/render.ts').TerminalStyle | undefined;
  readonly source: (input: {
    readonly cellRole: 'scrollbar';
    readonly partName: string;
    readonly partType: 'track' | 'thumb';
    readonly interactionState?: 'hovered' | 'disabled' | 'active';
    readonly description: string;
  }) => FrameCellSource;
}): void {
  if (input.plan.layout?.verticalTrack !== undefined) {
    paintTrack(input.target, input.plan.layout.verticalTrack, input.theme, input.source, input.style);
  }
  if (input.plan.layout?.horizontalTrack !== undefined) {
    paintTrack(input.target, input.plan.layout.horizontalTrack, input.theme, input.source, input.style);
  }
}

export function componentScrollbarHitTargets<TAction>(input: {
  readonly id: string;
  readonly plan: ComponentScrollbarPlan;
  readonly policy?: ScrollPolicy;
  readonly onScroll: (event: ScrollEvent) => MessageResolution<TAction>;
}): readonly HitTarget<TAction>[] {
  const wheel = normalizedWheelPolicy(input.policy);
  const targets: (HitTarget<TAction> & ScrollRoutable<TAction>)[] = [];
  if (input.plan.contentBounds.width > 0 && input.plan.contentBounds.height > 0) {
    targets.push({
      id: `${input.id}:scroll:content`,
      bounds: input.plan.contentBounds,
      accepts: ['scroll'],
      message: (pointer) => emitScroll(pointer, input.plan.scrollbar, 'content', wheel, input.onScroll),
      [scrollRouteDescriptor]: wheelRoute(
        input.plan.scroll,
        input.plan.scrollbar,
        'content',
        wheel,
        input.onScroll,
      ),
    });
  }
  for (const track of [input.plan.layout?.verticalTrack, input.plan.layout?.horizontalTrack]) {
    if (track === undefined) continue;
    targets.push(...componentScrollbarTrackTargets(input.id, track, input.plan.scrollbar, wheel, input.onScroll));
  }
  return Object.freeze(targets);
}

function componentScrollbarLayout(
  bounds: Rect,
  state: ScrollbarState,
  options: ScrollbarOptions
): ComponentScrollbarLayout {
  const normalized = normalizeLocalRect(bounds);
  const axis = options.axis ?? 'vertical';
  const visibility = options.visible ?? 'auto';
  const verticalAllowed = axis === 'vertical' || axis === 'both';
  const horizontalAllowed = axis === 'horizontal' || axis === 'both';
  let verticalVisible = scrollbarVisible(verticalAllowed, visibility, state.contentRows, normalized.height);
  let horizontalVisible = scrollbarVisible(
    horizontalAllowed,
    visibility,
    state.contentColumns,
    normalized.width - (verticalVisible ? 1 : 0)
  );
  verticalVisible = scrollbarVisible(
    verticalAllowed,
    visibility,
    state.contentRows,
    normalized.height - (horizontalVisible ? 1 : 0)
  );
  horizontalVisible = scrollbarVisible(
    horizontalAllowed,
    visibility,
    state.contentColumns,
    normalized.width - (verticalVisible ? 1 : 0)
  );
  const contentBounds = normalizeLocalRect({
    row: normalized.row,
    column: normalized.column,
    width: normalized.width - (verticalVisible ? 1 : 0),
    height: normalized.height - (horizontalVisible ? 1 : 0)
  });
  const verticalScrollable = state.contentRows > contentBounds.height;
  const horizontalScrollable = state.contentColumns > contentBounds.width;
  return Object.freeze({
    contentBounds,
    ...(verticalVisible && contentBounds.height > 0
      ? {
          verticalTrack: Object.freeze({
            axis: 'vertical' as const,
            bounds: Object.freeze({
              row: contentBounds.row,
              column: contentBounds.column + contentBounds.width,
              width: 1,
              height: contentBounds.height
            }),
            thumb: scrollbarThumb(
              contentBounds.height,
              state.contentRows,
              contentBounds.height,
              state.offsetRow
            ),
            state: options.visualState ?? (verticalScrollable ? 'idle' : 'inactive'),
            scrollable: verticalScrollable
          })
        }
      : {}),
    ...(horizontalVisible && contentBounds.width > 0
      ? {
          horizontalTrack: Object.freeze({
            axis: 'horizontal' as const,
            bounds: Object.freeze({
              row: contentBounds.row + contentBounds.height,
              column: contentBounds.column,
              width: contentBounds.width,
              height: 1
            }),
            thumb: scrollbarThumb(
              contentBounds.width,
              state.contentColumns,
              contentBounds.width,
              state.offsetColumn
            ),
            state: options.visualState ?? (horizontalScrollable ? 'idle' : 'inactive'),
            scrollable: horizontalScrollable
          })
        }
      : {})
  });
}

function paintTrack(
  target: RenderTarget,
  track: ComponentScrollbarTrack,
  theme: TerminalTheme,
  source: (input: {
    readonly cellRole: 'scrollbar';
    readonly partName: string;
    readonly partType: 'track' | 'thumb';
    readonly interactionState?: 'hovered' | 'disabled' | 'active';
    readonly description: string;
  }) => FrameCellSource,
  resolveStyle?: (
    part: 'scrollbarTrack' | 'scrollbarThumb',
    state: 'hovered' | 'disabled' | 'active' | undefined,
    base: import('../visual/render.ts').TerminalStyle,
  ) => import('../visual/render.ts').TerminalStyle | undefined,
): void {
  const size = track.axis === 'vertical' ? track.bounds.height : track.bounds.width;
  for (let offset = 0; offset < size; offset += 1) {
    const thumb = offset >= track.thumb.start && offset < track.thumb.start + track.thumb.size;
    const partType = thumb ? 'thumb' as const : 'track' as const;
    const interactionState = scrollbarInteractionState(track.state);
    target.write(
      track.bounds.row + (track.axis === 'vertical' ? offset : 0),
      track.bounds.column + (track.axis === 'horizontal' ? offset : 0),
      [{
        text: oneCellGlyph(
          track.axis === 'vertical'
            ? thumb ? theme.tokens.symbols.scrollbarVerticalThumb : theme.tokens.symbols.scrollbarVerticalTrack
            : thumb ? theme.tokens.symbols.scrollbarHorizontalThumb : theme.tokens.symbols.scrollbarHorizontalTrack,
          track.axis === 'vertical' ? '|' : '-',
          { widthProfile: target.widthProfile }
        ),
        style: resolveStyle?.(
          thumb ? 'scrollbarThumb' : 'scrollbarTrack',
          interactionState,
          scrollbarStyle(thumb, track.state),
        ) ?? scrollbarStyle(thumb, track.state),
        source: source({
          cellRole: 'scrollbar',
          partName: `scrollbar.${track.axis}.${partType}`,
          partType,
          ...(interactionState === undefined ? {} : { interactionState }),
          description: `${track.axis} scrollbar ${partType}`
        })
      }]
    );
  }
}

function scrollbarInteractionState(
  state: ScrollbarVisualState
): 'hovered' | 'disabled' | 'active' | undefined {
  if (state === 'hover') return 'hovered';
  if (state === 'disabled') return 'disabled';
  return state === 'active' ? 'active' : undefined;
}

function componentScrollbarTrackTargets<TAction>(
  id: string,
  track: ComponentScrollbarTrack,
  state: ScrollbarState,
  wheel: NormalizedWheelPolicy,
  onScroll: (event: ScrollEvent) => MessageResolution<TAction>
): readonly HitTarget<TAction>[] {
  const trackTarget: HitTarget<TAction> & ScrollRoutable<TAction> = {
    id: `${id}:scrollbar:${track.axis}:track`,
    bounds: track.bounds,
    accepts: ['scroll', 'pointerDown', 'dragStart', 'drag'],
    cursor: 'pointer',
    message: (pointer) => pointer.kind === 'scroll'
      ? emitScroll(
          pointer,
          state,
          track.axis === 'vertical' ? 'verticalScrollbarTrack' : 'horizontalScrollbarTrack',
          wheel,
          onScroll
        )
      : emitScrollAction(
          pointer,
          state,
          track.axis === 'vertical' ? 'verticalScrollbarTrack' : 'horizontalScrollbarTrack',
          trackAction(track, state, pointer),
          onScroll
        ),
    [scrollRouteDescriptor]: wheelRoute(
      scrollPosition(state),
      state,
      track.axis === 'vertical' ? 'verticalScrollbarTrack' : 'horizontalScrollbarTrack',
      wheel,
      onScroll,
    ),
  };
  const thumbBounds = componentScrollbarThumbBounds(track);
  if (thumbBounds === undefined) return [trackTarget];
  return [
    trackTarget,
    {
      id: `${id}:scrollbar:${track.axis}:thumb`,
      bounds: thumbBounds,
      accepts: ['pointerDown', 'dragStart', 'drag'],
      cursor: 'pointer',
      message: (pointer) => emitScrollAction(
        pointer,
        state,
        track.axis === 'vertical' ? 'verticalScrollbarThumb' : 'horizontalScrollbarThumb',
        thumbAction(track, state, pointer),
        onScroll
      )
    }
  ];
}

interface NormalizedWheelPolicy {
  readonly unit: 'line' | 'page';
  readonly rows: number;
  readonly columns: number;
}

function normalizedWheelPolicy(policy: ScrollPolicy | undefined): NormalizedWheelPolicy {
  return {
    unit: policy?.wheel?.unit ?? 'line',
    rows: normalizeWheelAmount(policy?.wheel?.rows, 3),
    columns: normalizeWheelAmount(policy?.wheel?.columns, 3)
  };
}

function normalizeWheelAmount(value: number | undefined, fallback: number): number {
  return value === undefined ? fallback : Math.max(0, Math.floor(value));
}

function emitScroll<TAction>(
  pointer: RoutedPointerEvent,
  scroll: ScrollbarState,
  target: ScrollEventTarget,
  policy: NormalizedWheelPolicy,
  onScroll: (event: ScrollEvent) => MessageResolution<TAction>
): MessageResolution<TAction> {
  const action = wheelAction(pointer, policy);
  return emitScrollAction(pointer, scroll, target, action, onScroll);
}

function wheelRoute<TAction>(
  initial: ScrollState,
  geometry: ScrollbarState,
  target: ScrollEventTarget,
  policy: NormalizedWheelPolicy,
  onScroll: (event: ScrollEvent) => MessageResolution<TAction>,
) {
  return Object.freeze({
    state: initial,
    route(pointer: RoutedPointerEvent, state: ScrollState) {
      const action = wheelAction(pointer, policy);
      const nextState = action === undefined
        ? state
        : scrollReducer(state, action, scrollGeometry(geometry));
      return Object.freeze({
        nextState,
        message: action === undefined
          ? ignoreMessage()
          : onScroll({
              nextState,
              source: scrollEventSource(pointer),
              target,
            }),
      });
    },
  });
}

function emitScrollAction<TAction>(
  pointer: RoutedPointerEvent,
  scroll: ScrollbarState,
  target: ScrollEventTarget,
  action: ScrollAction | undefined,
  onScroll: (event: ScrollEvent) => MessageResolution<TAction>
): MessageResolution<TAction> {
  return action === undefined
    ? ignoreMessage()
    : onScroll({
      nextState: scrollReducer(scrollPosition(scroll), action, scrollGeometry(scroll)),
      source: scrollEventSource(pointer),
      target,
    });
}

function wheelAction(
  event: RoutedPointerEvent,
  policy: NormalizedWheelPolicy
): ScrollAction | undefined {
  if (event.deltaRows === 0 && event.deltaColumns === 0) return undefined;
  const rows = event.deltaRows === 0 ? undefined : event.deltaRows * policy.rows;
  const columns = event.deltaColumns === 0 ? undefined : event.deltaColumns * policy.columns;
  return {
    kind: policy.unit === 'page' ? 'scrollPages' : 'scrollLines',
    ...(rows === undefined ? {} : { rows }),
    ...(columns === undefined ? {} : { columns })
  };
}

function trackAction(
  track: ComponentScrollbarTrack,
  state: ScrollbarState,
  event: RoutedPointerEvent
): ScrollAction | undefined {
  const position = track.axis === 'vertical' ? event.localRow : event.localColumn;
  if (position === undefined) return undefined;
  const trackSize = track.axis === 'vertical' ? track.bounds.height : track.bounds.width;
  const contentSize = track.axis === 'vertical' ? state.contentRows : state.contentColumns;
  const viewportSize = track.axis === 'vertical' ? state.viewportRows : state.viewportColumns;
  const offset = offsetForTrack(position, trackSize, contentSize, viewportSize);
  return track.axis === 'vertical'
    ? { kind: 'setOffset', rows: offset }
    : { kind: 'setOffset', columns: offset };
}

function thumbAction(
  track: ComponentScrollbarTrack,
  state: ScrollbarState,
  event: RoutedPointerEvent
): ScrollAction | undefined {
  const position = track.axis === 'vertical' ? event.localRow : event.localColumn;
  if (position === undefined) return undefined;
  const trackSize = track.axis === 'vertical' ? track.bounds.height : track.bounds.width;
  const contentSize = track.axis === 'vertical' ? state.contentRows : state.contentColumns;
  const viewportSize = track.axis === 'vertical' ? state.viewportRows : state.viewportColumns;
  const offset = offsetForThumb(position, trackSize, track.thumb.size, contentSize, viewportSize);
  return track.axis === 'vertical'
    ? { kind: 'setOffset', rows: offset }
    : { kind: 'setOffset', columns: offset };
}

function componentScrollbarThumbBounds(track: ComponentScrollbarTrack): Rect | undefined {
  if (!track.scrollable || track.thumb.size <= 0) return undefined;
  return track.axis === 'vertical'
    ? {
        row: track.bounds.row + track.thumb.start,
        column: track.bounds.column,
        width: 1,
        height: track.thumb.size
      }
    : {
        row: track.bounds.row,
        column: track.bounds.column + track.thumb.start,
        width: track.thumb.size,
        height: 1
      };
}

function scrollbarThumb(
  trackSize: number,
  contentSize: number,
  viewportSize: number,
  offset: number
): ComponentScrollbarThumb {
  if (trackSize <= 0) return Object.freeze({ start: 0, size: 0 });
  if (contentSize <= viewportSize || contentSize === 0) {
    return Object.freeze({ start: 0, size: trackSize });
  }
  const size = Math.max(1, Math.floor(trackSize * viewportSize / contentSize));
  const maximumOffset = Math.max(1, contentSize - viewportSize);
  const maximumStart = Math.max(0, trackSize - size);
  return Object.freeze({
    start: Math.min(maximumStart, Math.floor(maximumStart * offset / maximumOffset)),
    size
  });
}

function scrollbarVisible(
  allowed: boolean,
  visibility: NonNullable<ScrollbarOptions['visible']>,
  contentSize: number,
  viewportSize: number
): boolean {
  if (!allowed || visibility === 'never') return false;
  return visibility === 'always' ? viewportSize > 0 : contentSize > Math.max(0, viewportSize);
}

function scrollbarStyle(thumb: boolean, state: ScrollbarVisualState) {
  if (!thumb || state === 'disabled' || state === 'inactive') {
    return { fg: { kind: 'theme' as const, token: 'scrollbar.track' as const }, dim: true };
  }
  return state === 'active'
    ? { fg: { kind: 'theme' as const, token: 'focus.border' as const }, bold: true }
    : {
        fg: { kind: 'theme' as const, token: 'scrollbar.thumb' as const },
        ...(state === 'hover' ? { bold: true } : {})
      };
}

function scrollForBounds(
  scroll: ScrollState,
  bounds: Rect,
  contentRows: number,
  contentColumns: number,
): ScrollbarState {
  const geometry: ScrollGeometry = {
    contentRows,
    contentColumns,
    viewportRows: Math.max(0, Math.floor(bounds.height)),
    viewportColumns: Math.max(0, Math.floor(bounds.width)),
  };
  return Object.freeze({ ...normalizeScrollState(scroll, geometry), ...geometry });
}

function scrollPosition(scroll: ScrollbarState): ScrollState {
  return {
    offsetRow: scroll.offsetRow,
    offsetColumn: scroll.offsetColumn,
    followTail: scroll.followTail,
  };
}

function scrollGeometry(scroll: ScrollbarState): ScrollGeometry {
  return {
    contentRows: scroll.contentRows,
    contentColumns: scroll.contentColumns,
    viewportRows: scroll.viewportRows,
    viewportColumns: scroll.viewportColumns,
  };
}

function scrollEventSource(event: RoutedPointerEvent): ScrollEventSource {
  return event.kind === 'pointerDown' || event.kind === 'dragStart' || event.kind === 'drag'
    ? event.kind
    : 'wheel';
}

function offsetForTrack(position: number, track: number, content: number, viewport: number): number {
  const maximumOffset = Math.max(0, content - viewport);
  const maximumPosition = Math.max(1, track - 1);
  return Math.round(maximumOffset * Math.max(0, Math.min(maximumPosition, position)) / maximumPosition);
}

function offsetForThumb(
  position: number,
  track: number,
  thumb: number,
  content: number,
  viewport: number
): number {
  const maximumOffset = Math.max(0, content - viewport);
  const maximumPosition = Math.max(1, track - Math.max(1, thumb));
  return Math.round(maximumOffset * Math.max(0, Math.min(maximumPosition, position)) / maximumPosition);
}

function normalizeLocalRect(bounds: Rect): Rect {
  return Object.freeze({
    row: Math.max(0, Math.floor(bounds.row)),
    column: Math.max(0, Math.floor(bounds.column)),
    width: Math.max(0, Math.floor(bounds.width)),
    height: Math.max(0, Math.floor(bounds.height))
  });
}

function sameRect(left: Rect, right: Rect): boolean {
  return left.row === right.row
    && left.column === right.column
    && left.width === right.width
    && left.height === right.height;
}
