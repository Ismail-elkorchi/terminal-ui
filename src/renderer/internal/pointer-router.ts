import type { MouseEvent as TerminalMouseEvent, MouseWheelEvent } from '../../input/index.ts';
import type { Rect } from '../model/layout.ts';
import type { PointerEventKind, RoutedPointerEvent } from '../../input/pointer.ts';
import type { PointerClickCount } from '../../input/pointer.ts';
import type { RenderRegion, RenderRegionHitTarget } from './render-regions.ts';
import { ignoreMessage } from '../../interaction/message.ts';
import type { MessageResolution } from '../../interaction/message.ts';

export interface PointerRouteResult<TMessage> {
  readonly event: RoutedPointerEvent;
  readonly hit?: RenderRegionHitTarget<TMessage>;
  readonly message: MessageResolution<TMessage>;
}

export interface PointerRouter<TMessage> {
  route(
    regions: readonly RenderRegion<TMessage>[],
    event: TerminalMouseEvent
  ): readonly PointerRouteResult<TMessage>[];
  wheelTargetId(regions: readonly RenderRegion<TMessage>[], event: MouseWheelEvent): string | undefined;
  reset(): void;
}

export interface PointerRouterOptions {
  readonly now: () => number;
  readonly doubleClickIntervalMs?: number;
  readonly doubleClickMaxDistance?: number;
}

interface PointerPress<TMessage> {
  readonly target: RenderRegionHitTarget<TMessage>;
  readonly button: TerminalMouseEvent['button'];
  readonly row: number;
  readonly column: number;
  readonly localRow?: number;
  readonly localColumn?: number;
  readonly dragging: boolean;
}

interface CompletedPointerClick {
  readonly targetId: string;
  readonly button: TerminalMouseEvent['button'];
  readonly row: number;
  readonly column: number;
  readonly completedAt: number;
}

export function createPointerRouter<TMessage>(options: PointerRouterOptions): PointerRouter<TMessage> {
  const doubleClickIntervalMs = options.doubleClickIntervalMs ?? 500;
  const doubleClickMaxDistance = options.doubleClickMaxDistance ?? 0;
  let press: PointerPress<TMessage> | undefined;
  let hover: RenderRegionHitTarget<TMessage> | undefined;
  let previousClick: CompletedPointerClick | undefined;

  return {
    route(regions, event) {
      const pointerHit = topHitAt(regions, event.row, event.column, acceptedKindsForEvent(event));
      if (event.action === 'press') {
        if (event.button !== 'left' || pointerHit?.id !== previousClick?.targetId) previousClick = undefined;
        press = pointerHit === undefined ? undefined : pointerPress(event, pointerHit);
        return pressResults(event, pointerHit, press);
      }
      if (event.action === 'drag' && press !== undefined) {
        const kind = press.dragging ? 'drag' : 'dragStart';
        const dragging = { ...press, dragging: true };
        press = dragging;
        return [routeResult(event, press.target, kind, dragging)];
      }
      if (event.action === 'release') {
        const activePress = press;
        press = undefined;
        if (activePress?.dragging === true) previousClick = undefined;
        const completedAt = options.now();
        const clickCount = completedClickCount(
          event,
          pointerHit,
          activePress,
          previousClick,
          completedAt,
          doubleClickIntervalMs,
          doubleClickMaxDistance
        );
        if (clickCount === 1 && activePress !== undefined) {
          previousClick = {
            targetId: activePress.target.id,
            button: activePress.button,
            row: event.row,
            column: event.column,
            completedAt
          };
        } else if (clickCount === 2) {
          previousClick = undefined;
        }
        return releaseResults(event, pointerHit, activePress, clickCount);
      }
      if (event.action === 'move') {
        const results = hoverResults(event, hover, pointerHit);
        hover = pointerHit;
        return results;
      }
      if (event.action === 'wheel') return [routeResult(event, pointerHit, 'scroll', press)];
      return [];
    },
    wheelTargetId(regions, event) {
      return topHitAt(regions, event.row, event.column, ['scroll'])?.id;
    },
    reset() {
      press = undefined;
      hover = undefined;
      previousClick = undefined;
    }
  };
}

function pointerPress<TMessage>(
  event: TerminalMouseEvent,
  target: RenderRegionHitTarget<TMessage>
): PointerPress<TMessage> {
  const local = localPoint(target.bounds, event.row, event.column);
  return {
    target,
    button: event.button,
    row: event.row,
    column: event.column,
    localRow: local.row,
    localColumn: local.column,
    dragging: false
  };
}

function pressResults<TMessage>(
  event: TerminalMouseEvent,
  hit: RenderRegionHitTarget<TMessage> | undefined,
  activePress: PointerPress<TMessage> | undefined
): readonly PointerRouteResult<TMessage>[] {
  if (hit === undefined) return [routeResult(event, undefined, 'pointerDown', activePress)];
  const results = [routeResult(event, hit, 'pointerDown', activePress)];
  return event.button === 'right'
    ? [...results, routeResult(event, hit, 'contextMenu', activePress)]
    : results;
}

function releaseResults<TMessage>(
  event: TerminalMouseEvent,
  pointerHit: RenderRegionHitTarget<TMessage> | undefined,
  activePress: PointerPress<TMessage> | undefined,
  clickCount: PointerClickCount
): readonly PointerRouteResult<TMessage>[] {
  if (activePress === undefined) return [routeResult(event, pointerHit, 'pointerUp', undefined)];
  if (activePress.dragging) return [routeResult(event, activePress.target, 'dragEnd', activePress)];

  const released = routeResult(event, activePress.target, 'pointerUp', activePress);
  if (activePress.button !== 'left' || !sameTarget(activePress.target, pointerHit)) return [released];
  return [released, routeResult(event, activePress.target, 'click', activePress, clickCount)];
}

function completedClickCount<TMessage>(
  event: TerminalMouseEvent,
  pointerHit: RenderRegionHitTarget<TMessage> | undefined,
  activePress: PointerPress<TMessage> | undefined,
  previous: CompletedPointerClick | undefined,
  now: number,
  intervalMs: number,
  maxDistance: number
): PointerClickCount {
  if (
    activePress === undefined
    || activePress.dragging
    || activePress.button !== 'left'
    || !sameTarget(activePress.target, pointerHit)
  ) return 0;
  if (
    previous?.targetId === activePress.target.id
    && previous.button === activePress.button
    && now - previous.completedAt >= 0
    && now - previous.completedAt <= intervalMs
    && Math.abs(event.row - previous.row) <= maxDistance
    && Math.abs(event.column - previous.column) <= maxDistance
  ) return 2;
  return 1;
}

function hoverResults<TMessage>(
  event: TerminalMouseEvent,
  previous: RenderRegionHitTarget<TMessage> | undefined,
  next: RenderRegionHitTarget<TMessage> | undefined
): readonly PointerRouteResult<TMessage>[] {
  const results: PointerRouteResult<TMessage>[] = [];
  if (previous !== undefined && !sameTarget(previous, next)) {
    results.push(routeResult(event, previous, 'leave', undefined));
  }
  if (next !== undefined && !sameTarget(previous, next)) {
    results.push(routeResult(event, next, 'enter', undefined));
  }
  if (next !== undefined) {
    results.push(routeResult(event, next, 'hover', undefined));
  }
  return results;
}

function routeResult<TMessage>(
  event: TerminalMouseEvent,
  hit: RenderRegionHitTarget<TMessage> | undefined,
  kind: PointerEventKind,
  press: PointerPress<TMessage> | undefined,
  clickCount: PointerClickCount = 0
): PointerRouteResult<TMessage> {
  const routed = routedPointerEvent(event, hit, kind, press, clickCount);
  return {
    event: routed,
    ...(hit === undefined ? {} : { hit }),
    message: messageForTarget(hit, routed)
  };
}

function routedPointerEvent<TMessage>(
  event: TerminalMouseEvent,
  hit: RenderRegionHitTarget<TMessage> | undefined,
  kind: PointerEventKind,
  press: PointerPress<TMessage> | undefined,
  clickCount: PointerClickCount
): RoutedPointerEvent {
  const local = hit === undefined ? undefined : localPoint(hit.bounds, event.row, event.column);
  return {
    kind,
    source: 'mouse',
    row: event.row,
    column: event.column,
    ...(local === undefined ? {} : { localRow: local.row, localColumn: local.column }),
    ...(press === undefined
      ? {}
      : {
          pressRow: press.row,
          pressColumn: press.column,
          ...(press.localRow === undefined ? {} : { pressLocalRow: press.localRow }),
          ...(press.localColumn === undefined ? {} : { pressLocalColumn: press.localColumn })
        }),
    button: releaseButton(event, press),
    modifiers: event.modifiers,
    deltaRows: event.action === 'wheel' ? event.deltaRows : 0,
    deltaColumns: event.action === 'wheel' ? event.deltaColumns : 0,
    clickCount,
    ...(hit === undefined ? {} : { targetId: hit.id }),
    ...(press?.target.id === undefined ? {} : { capturedTargetId: press.target.id }),
    raw: event
  };
}

function releaseButton<TMessage>(
  event: TerminalMouseEvent,
  press: PointerPress<TMessage> | undefined
): TerminalMouseEvent['button'] {
  return event.action === 'release' && press !== undefined ? press.button : event.button;
}

function messageForTarget<TMessage>(
  hit: RenderRegionHitTarget<TMessage> | undefined,
  event: RoutedPointerEvent
): MessageResolution<TMessage> {
  if (hit === undefined || !targetAccepts(hit, event.kind)) return ignoreMessage();
  return hit.message(event);
}

function targetAccepts<TMessage>(hit: RenderRegionHitTarget<TMessage>, kind: PointerEventKind): boolean {
  return hit.accepts?.includes(kind) ?? kind === 'click';
}

function sameTarget<TMessage>(
  left: RenderRegionHitTarget<TMessage> | undefined,
  right: RenderRegionHitTarget<TMessage> | undefined
): boolean {
  return left !== undefined && left.id === right?.id;
}

function acceptedKindsForEvent(event: TerminalMouseEvent): readonly PointerEventKind[] {
  switch (event.action) {
    case 'wheel':
      return ['scroll'];
    case 'press':
      return event.button === 'right'
        ? ['pointerDown', 'contextMenu', 'dragStart', 'drag']
        : ['pointerDown', 'click', 'dragStart', 'drag'];
    case 'release':
      return event.button === 'right'
        ? ['pointerUp', 'contextMenu']
        : ['pointerUp', 'click', 'dragEnd', 'drag'];
    case 'drag':
      return ['dragStart', 'drag'];
    case 'move':
      return ['enter', 'leave', 'hover'];
    default:
      return [];
  }
}

function topHitAt<TMessage>(
  regions: readonly RenderRegion<TMessage>[],
  row: number,
  column: number,
  acceptedKinds: readonly PointerEventKind[]
): RenderRegionHitTarget<TMessage> | undefined {
  return regions.flatMap((region) =>
    region.hitTargets
      .filter((hitTarget) => containsPoint(hitTarget.bounds, row, column))
      .filter((hitTarget) => targetAcceptsAny(hitTarget, acceptedKinds))
      .map((hitTarget, index) => ({
        hitTarget,
        region,
        index,
        zIndex: hitTarget.zIndex ?? region.zIndex
      }))
  )
    .toSorted((left, right) =>
      right.zIndex - left.zIndex
      || right.region.zIndex - left.region.zIndex
      || right.region.order - left.region.order
      || right.index - left.index
    )
    .at(0)?.hitTarget;
}

function targetAcceptsAny<TMessage>(
  hit: RenderRegionHitTarget<TMessage>,
  kinds: readonly PointerEventKind[]
): boolean {
  return kinds.some((kind) => targetAccepts(hit, kind));
}

function containsPoint(bounds: Rect, row: number, column: number): boolean {
  return row >= bounds.row
    && row < bounds.row + bounds.height
    && column >= bounds.column
    && column < bounds.column + bounds.width;
}

function localPoint(bounds: Rect, row: number, column: number): { readonly row: number; readonly column: number } {
  return {
    row: row - bounds.row + 1,
    column: column - bounds.column + 1
  };
}
