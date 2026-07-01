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
  ): PointerRouteResult<TMessage>;
  reset(): void;
}

interface PointerPress<TMessage> {
  readonly target: RenderRegionHitTarget<TMessage>;
  readonly dragging: boolean;
}

export function createPointerRouter<TMessage>(): PointerRouter<TMessage> {
  let press: PointerPress<TMessage> | undefined;

  return {
    route(regions, event) {
      const hit = event.action === 'drag' || (event.action === 'release' && press?.dragging === true)
        ? press?.target
        : topHitAt(regions, event.row, event.column);
      const routed = routedPointerEvent(event, hit, press);
      if (event.action === 'press') {
        press = hit === undefined ? undefined : { target: hit, dragging: false };
        return {
          event: routed,
          ...(hit === undefined ? {} : { hit }),
          ...messageForTarget(hit, routed)
        };
      }
      if (event.action === 'drag' && press !== undefined) {
        const dragged = routed;
        press = { ...press, dragging: true };
        return {
          event: dragged,
          ...(hit === undefined ? {} : { hit }),
          ...messageForTarget(hit, dragged)
        };
      }
      if (event.action === 'release') {
        press = undefined;
      }
      return {
        event: routed,
        ...(hit === undefined ? {} : { hit }),
        ...messageForTarget(hit, routed)
      };
    },
    reset() {
      press = undefined;
    }
  };
}

function routedPointerEvent<TMessage>(
  event: TerminalMouseEvent,
  hit: RenderRegionHitTarget<TMessage> | undefined,
  press: PointerPress<TMessage> | undefined
): RoutedPointerEvent {
  const local = hit === undefined ? undefined : localPoint(hit.bounds, event.row, event.column);
  return {
    kind: pointerKind(event, press),
    source: 'mouse',
    row: event.row,
    column: event.column,
    ...(local === undefined ? {} : { localRow: local.row, localColumn: local.column }),
    button: event.button,
    modifiers: event.modifiers,
    deltaRows: pointerDeltaRows(event),
    deltaColumns: pointerDeltaColumns(event),
    ...(hit === undefined ? {} : { targetId: hit.id }),
    ...(press?.target.id === undefined ? {} : { capturedTargetId: press.target.id }),
    raw: event
  };
}

function pointerKind(event: TerminalMouseEvent, press: PointerPress<unknown> | undefined): PointerEventKind {
  if (event.action === 'wheel') return 'scroll';
  if (event.action === 'release') return press?.dragging === true ? 'dragEnd' : 'pointerUp';
  if (event.action === 'drag') return press?.dragging === true ? 'drag' : 'dragStart';
  if (event.action === 'move') return 'hover';
  if (event.button === 'right') return 'contextMenu';
  return 'click';
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

function topHitAt<TMessage>(
  regions: readonly RenderRegion<TMessage>[],
  row: number,
  column: number
): RenderRegionHitTarget<TMessage> | undefined {
  return regions.flatMap((region) =>
    region.hitTargets
      .filter((hitTarget) => containsPoint(hitTarget.bounds, row, column))
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
