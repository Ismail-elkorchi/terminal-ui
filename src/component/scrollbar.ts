import { normalizeScrollState } from '../behavior/scroll.ts';
import type { Rect } from '../geometry/types.ts';
import type { RoutedPointerEvent } from '../input/pointer.ts';
import { ignoreMessage, type MessageResolution } from '../interaction/message.ts';
import type {
  ScrollAction,
  ScrollEvent,
  ScrollEventSource,
  ScrollEventTarget,
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
import { isNonArrayObject } from '../foundation/validation.ts';

export function prepareComponentScrollState(value: unknown, subject: string): ScrollState | undefined {
  if (value === undefined) return undefined;
  if (!isNonArrayObject(value)) throw new TypeError(`${subject} must be an object.`);
  const allowed = new Set(['offsetRow', 'offsetColumn', 'contentRows', 'contentColumns', 'viewportRows', 'viewportColumns', 'followTail', 'selectedIndex']);
  const unknown = Object.keys(value).find((field) => !allowed.has(field));
  if (unknown !== undefined) throw new TypeError(`${subject} contains unknown field "${unknown}".`);
  const number = (field: string): number => nonNegativeInteger(value[field], `${subject}.${field}`);
  if (typeof value['followTail'] !== 'boolean') throw new TypeError(`${subject}.followTail must be a boolean.`);
  return Object.freeze({
    offsetRow: number('offsetRow'), offsetColumn: number('offsetColumn'),
    contentRows: number('contentRows'), contentColumns: number('contentColumns'),
    viewportRows: number('viewportRows'), viewportColumns: number('viewportColumns'),
    followTail: value['followTail'],
    ...(value['selectedIndex'] === undefined ? {} : { selectedIndex: number('selectedIndex') })
  });
}

export function prepareComponentScrollbarOptions(value: unknown, subject: string): ScrollbarOptions | undefined {
  if (value === undefined) return undefined;
  if (!isNonArrayObject(value)) throw new TypeError(`${subject} must be an object.`);
  const unknown = Object.keys(value).find((field) => field !== 'visible' && field !== 'axis' && field !== 'visualState');
  if (unknown !== undefined) throw new TypeError(`${subject} contains unknown field "${unknown}".`);
  if (value['visible'] !== undefined && value['visible'] !== 'auto' && value['visible'] !== 'always' && value['visible'] !== 'never') throw new TypeError(`${subject}.visible is invalid.`);
  if (value['axis'] !== undefined && value['axis'] !== 'vertical' && value['axis'] !== 'horizontal' && value['axis'] !== 'both') throw new TypeError(`${subject}.axis is invalid.`);
  if (value['visualState'] !== undefined && value['visualState'] !== 'idle' && value['visualState'] !== 'active' && value['visualState'] !== 'hover' && value['visualState'] !== 'disabled' && value['visualState'] !== 'inactive') throw new TypeError(`${subject}.visualState is invalid.`);
  return Object.freeze({
    ...(value['visible'] === undefined ? {} : { visible: value['visible'] }),
    ...(value['axis'] === undefined ? {} : { axis: value['axis'] }),
    ...(value['visualState'] === undefined ? {} : { visualState: value['visualState'] })
  });
}

export function prepareComponentScrollPolicy(value: unknown, subject: string): ScrollPolicy | undefined {
  if (value === undefined) return undefined;
  if (!isNonArrayObject(value) || Object.keys(value).some((field) => field !== 'wheel')) throw new TypeError(`${subject} must contain only wheel.`);
  const wheel = value['wheel'];
  if (wheel === undefined) return Object.freeze({});
  if (!isNonArrayObject(wheel) || Object.keys(wheel).some((field) => field !== 'unit' && field !== 'rows' && field !== 'columns')) throw new TypeError(`${subject}.wheel is invalid.`);
  if (wheel['unit'] !== undefined && wheel['unit'] !== 'line' && wheel['unit'] !== 'page') throw new TypeError(`${subject}.wheel.unit is invalid.`);
  const optional = (field: 'rows' | 'columns'): number | undefined => wheel[field] === undefined ? undefined : nonNegativeInteger(wheel[field], `${subject}.wheel.${field}`);
  const rows = optional('rows');
  const columns = optional('columns');
  return Object.freeze({ wheel: Object.freeze({
    ...(wheel['unit'] === undefined ? {} : { unit: wheel['unit'] }),
    ...(rows === undefined ? {} : { rows }),
    ...(columns === undefined ? {} : { columns })
  }) });
}

function nonNegativeInteger(value: unknown, subject: string): number {
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
}

export function prepareComponentScrollbar(input: {
  readonly bounds: Rect;
  readonly scroll: ScrollState;
  readonly options?: ScrollbarOptions;
  readonly defaultAxis?: NonNullable<ScrollbarOptions['axis']>;
}): ComponentScrollbarPlan {
  const initial = scrollForBounds(input.scroll, input.bounds);
  if (input.options === undefined) {
    return Object.freeze({ contentBounds: normalizeLocalRect(input.bounds), scroll: initial });
  }
  const options = Object.freeze({
    ...input.options,
    axis: input.options.axis ?? input.defaultAxis ?? 'vertical'
  });
  let layout = componentScrollbarLayout(input.bounds, initial, options);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const next = componentScrollbarLayout(
      input.bounds,
      scrollForBounds(input.scroll, layout.contentBounds),
      options
    );
    if (sameRect(next.contentBounds, layout.contentBounds)) {
      layout = next;
      break;
    }
    layout = next;
  }
  return Object.freeze({
    contentBounds: layout.contentBounds,
    layout,
    scroll: scrollForBounds(input.scroll, layout.contentBounds)
  });
}

export function paintComponentScrollbar(input: {
  readonly target: RenderTarget;
  readonly plan: ComponentScrollbarPlan;
  readonly theme: TerminalTheme;
  readonly source: (input: {
    readonly cellRole: 'scrollbar';
    readonly partName: string;
    readonly partType: 'track' | 'thumb';
    readonly interactionState?: 'hovered' | 'disabled' | 'active';
    readonly description: string;
  }) => FrameCellSource;
}): void {
  if (input.plan.layout?.verticalTrack !== undefined) {
    paintTrack(input.target, input.plan.layout.verticalTrack, input.theme, input.source);
  }
  if (input.plan.layout?.horizontalTrack !== undefined) {
    paintTrack(input.target, input.plan.layout.horizontalTrack, input.theme, input.source);
  }
}

export function componentScrollbarHitTargets<TAction>(input: {
  readonly id: string;
  readonly plan: ComponentScrollbarPlan;
  readonly policy?: ScrollPolicy;
  readonly onScroll: (event: ScrollEvent) => MessageResolution<TAction>;
}): readonly HitTarget<TAction>[] {
  const wheel = normalizedWheelPolicy(input.policy);
  const targets: HitTarget<TAction>[] = [];
  if (input.plan.contentBounds.width > 0 && input.plan.contentBounds.height > 0) {
    targets.push({
      id: `${input.id}:scroll:content`,
      bounds: input.plan.contentBounds,
      accepts: ['scroll'],
      message: (pointer) => emitScroll(pointer, input.plan.scroll, 'content', wheel, input.onScroll)
    });
  }
  for (const track of [input.plan.layout?.verticalTrack, input.plan.layout?.horizontalTrack]) {
    if (track === undefined) continue;
    targets.push(...componentScrollbarTrackTargets(input.id, track, input.plan.scroll, wheel, input.onScroll));
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
  }) => FrameCellSource
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
        style: scrollbarStyle(thumb, track.state),
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
  state: ScrollState,
  wheel: NormalizedWheelPolicy,
  onScroll: (event: ScrollEvent) => MessageResolution<TAction>
): readonly HitTarget<TAction>[] {
  const trackTarget: HitTarget<TAction> = {
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
        )
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
  scroll: ScrollState,
  target: ScrollEventTarget,
  policy: NormalizedWheelPolicy,
  onScroll: (event: ScrollEvent) => MessageResolution<TAction>
): MessageResolution<TAction> {
  const action = wheelAction(pointer, policy);
  return emitScrollAction(pointer, scroll, target, action, onScroll);
}

function emitScrollAction<TAction>(
  pointer: RoutedPointerEvent,
  scroll: ScrollState,
  target: ScrollEventTarget,
  action: ScrollAction | undefined,
  onScroll: (event: ScrollEvent) => MessageResolution<TAction>
): MessageResolution<TAction> {
  return action === undefined
    ? ignoreMessage()
    : onScroll({ action, scroll, source: scrollEventSource(pointer), target, pointer });
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
  state: ScrollState,
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
  state: ScrollState,
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

function scrollForBounds(scroll: ScrollState, bounds: Rect): ScrollState {
  return normalizeScrollState({
    ...scroll,
    viewportRows: Math.max(0, Math.floor(bounds.height)),
    viewportColumns: Math.max(0, Math.floor(bounds.width))
  });
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
