import type { MouseEvent as TerminalMouseEvent } from '../input/index.ts';
import type { Rect } from './layout.ts';
import type { PointerEventKind, RoutedPointerEvent } from './pointer-types.ts';
import type { RenderRegion, RenderRegionHitTarget } from './render-regions.ts';

export interface PointerRouteResult<TMessage> {
  readonly event: RoutedPointerEvent;
  readonly hit?: RenderRegionHitTarget<TMessage>;
  readonly message?: TMessage;
}

export interface PointerRouter<TMessage> {
  route(
    regions: readonly RenderRegion<TMessage>[],
    event: TerminalMouseEvent
  ): readonly PointerRouteResult<TMessage>[];
  reset(): void;
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

export function createPointerRouter<TMessage>(): PointerRouter<TMessage> {
  let press: PointerPress<TMessage> | undefined;
  let hover: RenderRegionHitTarget<TMessage> | undefined;

  return {
    route(regions, event) {
      const pointerHit = topHitAt(regions, event.row, event.column, acceptedKindsForEvent(event));
      if (event.action === 'press') {
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
        return releaseResults(event, pointerHit, activePress);
      }
      if (event.action === 'move') {
        const results = hoverResults(event, hover, pointerHit);
        hover = pointerHit;
        return results;
      }
      if (event.action === 'wheel') return [routeResult(event, pointerHit, 'scroll', press)];
      return [];
    },
    reset() {
      press = undefined;
      hover = undefined;
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
  activePress: PointerPress<TMessage> | undefined
): readonly PointerRouteResult<TMessage>[] {
  if (activePress === undefined) return [routeResult(event, pointerHit, 'pointerUp', undefined)];
  if (activePress.dragging) return [routeResult(event, activePress.target, 'dragEnd', activePress)];

  const released = routeResult(event, activePress.target, 'pointerUp', activePress);
  if (activePress.button !== 'left' || !sameTarget(activePress.target, pointerHit)) return [released];
  return [released, routeResult(event, activePress.target, 'click', activePress)];
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
  press: PointerPress<TMessage> | undefined
): PointerRouteResult<TMessage> {
  const routed = routedPointerEvent(event, hit, kind, press);
  return {
    event: routed,
    ...(hit === undefined ? {} : { hit }),
    ...messageForTarget(hit, routed)
  };
}

function routedPointerEvent<TMessage>(
  event: TerminalMouseEvent,
  hit: RenderRegionHitTarget<TMessage> | undefined,
  kind: PointerEventKind,
  press: PointerPress<TMessage> | undefined
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
    deltaRows: pointerDeltaRows(event),
    deltaColumns: pointerDeltaColumns(event),
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

function pointerDeltaRows(event: TerminalMouseEvent): number {
  if (event.action !== 'wheel') return 0;
  if (event.button === 'wheelUp') return -1;
  if (event.button === 'wheelDown') return 1;
  return 0;
}

function pointerDeltaColumns(event: TerminalMouseEvent): number {
  if (event.action !== 'wheel') return 0;
  if (event.button === 'wheelLeft') return -1;
  if (event.button === 'wheelRight') return 1;
  return 0;
}

function messageForTarget<TMessage>(
  hit: RenderRegionHitTarget<TMessage> | undefined,
  event: RoutedPointerEvent
): { readonly message?: TMessage } {
  if (hit === undefined || !targetAccepts(hit, event.kind)) return {};
  const message = hit.message(event);
  return message === undefined ? {} : { message };
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
