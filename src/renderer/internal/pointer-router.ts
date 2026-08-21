import type { MouseEvent as TerminalMouseEvent, MouseWheelEvent } from '../../input/index.ts';
import type { PointerClickCount, PointerEventKind, RoutedPointerEvent } from '../../input/pointer.ts';
import { ignoreMessage, isIgnoredMessage } from '../../interaction/message.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import type { PointerVisualSnapshot } from '../../interaction/pointer-interaction.ts';
import { scrollRouteDescriptor } from '../../interaction/scroll-route.ts';
import type { ScrollState } from '../../interaction/scroll.ts';
import type { Rect } from '../contracts.ts';
import type { RenderRegion, RenderRegionHitTarget } from './render-regions.ts';

export interface PointerRouteResult<TMessage> {
  readonly event: RoutedPointerEvent;
  readonly hit?: RenderRegionHitTarget<TMessage>;
  readonly message: MessageResolution<TMessage>;
}

export interface PointerRouter<TMessage> {
  route(
    regions: readonly RenderRegion<TMessage>[],
    event: TerminalMouseEvent,
    occurredAt?: number
  ): readonly PointerRouteResult<TMessage>[];
  routeWheel(
    regions: readonly RenderRegion<TMessage>[],
    event: MouseWheelEvent,
    targetIdentity: string | undefined
  ): readonly PointerRouteResult<TMessage>[];
  wheelTargetId(regions: readonly RenderRegion<TMessage>[], event: MouseWheelEvent): string | undefined;
  cancel(regions: readonly RenderRegion<TMessage>[]): readonly PointerRouteResult<TMessage>[];
  visuals(): PointerVisualSnapshot;
  revision(): number;
  reset(): void;
}

export interface PointerRouterOptions {
  readonly now: () => number;
  readonly doubleClickIntervalMs?: number;
  readonly doubleClickMaxDistance?: number;
}

interface QualifiedHit<TMessage> {
  readonly identity: string;
  readonly target: RenderRegionHitTarget<TMessage>;
}

interface PointerPress {
  readonly identity: string;
  readonly ownerIdentity: string;
  readonly targetId: string;
  readonly button: TerminalMouseEvent['button'];
  readonly row: number;
  readonly column: number;
  readonly localRow: number;
  readonly localColumn: number;
  readonly dragging: boolean;
  readonly sourceEvent: TerminalMouseEvent;
}

interface CompletedPointerClick {
  readonly identity: string;
  readonly button: TerminalMouseEvent['button'];
  readonly row: number;
  readonly column: number;
  readonly completedAt: number;
}

interface PointerHover {
  readonly identity: string;
  readonly ownerIdentity: string;
  readonly targetId: string;
  readonly sourceEvent: TerminalMouseEvent;
}

export function createPointerRouter<TMessage>(options: PointerRouterOptions): PointerRouter<TMessage> {
  const doubleClickIntervalMs = options.doubleClickIntervalMs ?? 500;
  const doubleClickMaxDistance = options.doubleClickMaxDistance ?? 0;
  let press: PointerPress | undefined;
  let hover: PointerHover | undefined;
  let previousClick: CompletedPointerClick | undefined;
  let visualRevision = 0;

  return {
    route(regions, event, occurredAt = options.now()) {
      const pointerHit = topHitAt(
        regions,
        event.row,
        event.column,
        event.action === 'move' ? [...acceptedKindsForEvent(event), 'click'] : acceptedKindsForEvent(event),
      );
      if (event.action === 'press') {
        if (event.button !== 'left' || pointerHit?.identity !== previousClick?.identity) previousClick = undefined;
        const nextPress = pointerHit === undefined ? undefined : pointerPress(event, pointerHit);
        if (press?.identity !== nextPress?.identity) visualRevision += 1;
        press = nextPress;
        return pressResults(event, pointerHit, press);
      }
      if (event.action === 'drag' && press !== undefined) {
        const captured = hitByIdentity(regions, press.identity);
        if (captured === undefined) {
          press = undefined;
          visualRevision += 1;
          previousClick = undefined;
          return [];
        }
        const kind = press.dragging ? 'drag' : 'dragStart';
        press = { ...press, dragging: true };
        return [routeResult(event, captured, kind, press)];
      }
      if (event.action === 'release') {
        const activePress = press;
        press = undefined;
        if (activePress !== undefined) visualRevision += 1;
        const captured = activePress === undefined ? undefined : hitByIdentity(regions, activePress.identity);
        if (activePress?.dragging === true) previousClick = undefined;
        const clickCount = completedClickCount(
          event,
          pointerHit,
          captured,
          activePress,
          previousClick,
          occurredAt,
          doubleClickIntervalMs,
          doubleClickMaxDistance
        );
        if (clickCount === 1 && activePress !== undefined) {
          previousClick = {
            identity: activePress.identity,
            button: activePress.button,
            row: event.row,
            column: event.column,
            completedAt: occurredAt
          };
        } else if (clickCount !== 1) {
          previousClick = undefined;
        }
        return releaseResults(event, pointerHit, captured, activePress, clickCount);
      }
      if (event.action === 'move') {
        const previous = hover === undefined ? undefined : hitByIdentity(regions, hover.identity);
        const results = hoverResults(event, previous, pointerHit);
        const nextHover = pointerHit === undefined ? undefined : {
          identity: pointerHit.identity,
          ownerIdentity: pointerHit.target.ownerIdentity,
          targetId: pointerHit.target.id,
          sourceEvent: event,
        };
        if (hover?.identity !== nextHover?.identity) visualRevision += 1;
        hover = nextHover;
        return results;
      }
      if (event.action === 'wheel') return [routeResult(event, pointerHit, 'scroll', press)];
      return [];
    },
    routeWheel(regions, event, targetIdentity) {
      return routeWheelThroughAncestors(regions, event, targetIdentity, press);
    },
    wheelTargetId(regions, event) {
      return topHitAt(regions, event.row, event.column, ['scroll'])?.identity;
    },
    cancel(regions) {
      const activePress = press;
      const activeHover = hover;
      press = undefined;
      hover = undefined;
      previousClick = undefined;
      if (activePress !== undefined || activeHover !== undefined) visualRevision += 1;
      const captured = activePress === undefined ? undefined : hitByIdentity(regions, activePress.identity);
      const hovered = activeHover === undefined ? undefined : hitByIdentity(regions, activeHover.identity);
      return [
        ...(captured === undefined || activePress === undefined
          ? []
          : [routeResult(activePress.sourceEvent, captured, 'pointerCancel', activePress)]),
        ...(hovered === undefined || activeHover === undefined
          ? []
          : [routeResult(activeHover.sourceEvent, hovered, 'leave')])
      ];
    },
    visuals() {
      return Object.freeze({
        ...(hover === undefined ? {} : {
          hovered: Object.freeze({
            ownerIdentity: hover.ownerIdentity,
            targetId: hover.targetId,
          }),
        }),
        ...(press === undefined ? {} : {
          pressed: Object.freeze({
            ownerIdentity: press.ownerIdentity,
            targetId: press.targetId,
          }),
        }),
      });
    },
    revision: () => visualRevision,
    reset() {
      if (press !== undefined || hover !== undefined) visualRevision += 1;
      press = undefined;
      hover = undefined;
      previousClick = undefined;
    }
  };
}

function pointerPress<TMessage>(event: TerminalMouseEvent, hit: QualifiedHit<TMessage>): PointerPress {
  const local = localPoint(hit.target.bounds, event.row, event.column);
  return {
    identity: hit.identity,
    ownerIdentity: hit.target.ownerIdentity,
    targetId: hit.target.id,
    button: event.button,
    row: event.row,
    column: event.column,
    localRow: local.row,
    localColumn: local.column,
    dragging: false,
    sourceEvent: event
  };
}

function pressResults<TMessage>(
  event: TerminalMouseEvent,
  hit: QualifiedHit<TMessage> | undefined,
  activePress: PointerPress | undefined
): readonly PointerRouteResult<TMessage>[] {
  if (hit === undefined) return [routeResult(event, undefined, 'pointerDown', activePress)];
  const results = [routeResult(event, hit, 'pointerDown', activePress)];
  return event.button === 'right'
    ? [...results, routeResult(event, hit, 'contextMenu', activePress)]
    : results;
}

function releaseResults<TMessage>(
  event: TerminalMouseEvent,
  pointerHit: QualifiedHit<TMessage> | undefined,
  captured: QualifiedHit<TMessage> | undefined,
  activePress: PointerPress | undefined,
  clickCount: PointerClickCount
): readonly PointerRouteResult<TMessage>[] {
  if (activePress === undefined) return [routeResult(event, pointerHit, 'pointerUp', undefined)];
  if (captured === undefined) return [];
  if (activePress.dragging) return [routeResult(event, captured, 'dragEnd', activePress)];
  const released = routeResult(event, captured, 'pointerUp', activePress);
  return activePress.button === 'left' && sameTarget(captured, pointerHit)
    ? [released, routeResult(event, captured, 'click', activePress, clickCount)]
    : [released];
}

function completedClickCount<TMessage>(
  event: TerminalMouseEvent,
  pointerHit: QualifiedHit<TMessage> | undefined,
  captured: QualifiedHit<TMessage> | undefined,
  activePress: PointerPress | undefined,
  previous: CompletedPointerClick | undefined,
  now: number,
  intervalMs: number,
  maxDistance: number
): PointerClickCount {
  if (
    activePress === undefined
    || captured === undefined
    || activePress.dragging
    || activePress.button !== 'left'
    || !sameTarget(captured, pointerHit)
  ) return 0;
  if (
    previous?.identity === activePress.identity
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
  previous: QualifiedHit<TMessage> | undefined,
  next: QualifiedHit<TMessage> | undefined
): readonly PointerRouteResult<TMessage>[] {
  const results: PointerRouteResult<TMessage>[] = [];
  if (previous !== undefined && !sameTarget(previous, next)) results.push(routeResult(event, previous, 'leave'));
  if (next !== undefined && !sameTarget(previous, next)) results.push(routeResult(event, next, 'enter'));
  if (next !== undefined) results.push(routeResult(event, next, 'hover'));
  return results;
}

function routeResult<TMessage>(
  event: TerminalMouseEvent,
  hit: QualifiedHit<TMessage> | undefined,
  kind: PointerEventKind,
  press?: PointerPress,
  clickCount: PointerClickCount = 0
): PointerRouteResult<TMessage> {
  const target = hit?.target;
  const routed = routedPointerEvent(event, target, kind, press, clickCount);
  return {
    event: routed,
    ...(target === undefined ? {} : { hit: target }),
    message: messageForTarget(target, routed)
  };
}

function routedPointerEvent<TMessage>(
  event: TerminalMouseEvent,
  hit: RenderRegionHitTarget<TMessage> | undefined,
  kind: PointerEventKind,
  press: PointerPress | undefined,
  clickCount: PointerClickCount
): RoutedPointerEvent {
  const local = hit === undefined ? undefined : localPoint(hit.bounds, event.row, event.column);
  return {
    kind,
    source: 'mouse',
    row: event.row,
    column: event.column,
    ...(local === undefined ? {} : { localRow: local.row, localColumn: local.column }),
    ...(press === undefined ? {} : {
      pressRow: press.row,
      pressColumn: press.column,
      pressLocalRow: press.localRow,
      pressLocalColumn: press.localColumn
    }),
    button: event.action === 'release' && press !== undefined ? press.button : event.button,
    modifiers: event.modifiers,
    deltaRows: event.action === 'wheel' ? event.deltaRows : 0,
    deltaColumns: event.action === 'wheel' ? event.deltaColumns : 0,
    clickCount,
    ...(hit === undefined ? {} : { targetId: hit.id }),
    ...(press === undefined ? {} : { capturedTargetId: press.targetId }),
    raw: event
  };
}

function messageForTarget<TMessage>(
  hit: RenderRegionHitTarget<TMessage> | undefined,
  event: RoutedPointerEvent
): MessageResolution<TMessage> {
  if (hit === undefined || !targetAccepts(hit, event.kind)) return ignoreMessage();
  return hit.message(event);
}

function targetAccepts<TMessage>(hit: RenderRegionHitTarget<TMessage>, kind: PointerEventKind): boolean {
  if (kind === 'pointerCancel') {
    return hit.accepts?.some((accepted) =>
      accepted === 'pointerDown' || accepted === 'dragStart' || accepted === 'drag') ?? false;
  }
  return hit.accepts?.includes(kind) ?? kind === 'click';
}

function sameTarget<TMessage>(left: QualifiedHit<TMessage> | undefined, right: QualifiedHit<TMessage> | undefined): boolean {
  return left !== undefined && left.identity === right?.identity;
}

function acceptedKindsForEvent(event: TerminalMouseEvent): readonly PointerEventKind[] {
  switch (event.action) {
    case 'wheel': return ['scroll'];
    case 'press':
      return event.button === 'right'
        ? ['pointerDown', 'contextMenu', 'dragStart', 'drag']
        : ['pointerDown', 'click', 'dragStart', 'drag'];
    case 'release':
      return event.button === 'right'
        ? ['pointerUp', 'contextMenu']
        : ['pointerUp', 'click', 'dragEnd', 'drag'];
    case 'drag': return ['dragStart', 'drag'];
    case 'move': return ['enter', 'leave', 'hover'];
  }
}

function topHitAt<TMessage>(
  regions: readonly RenderRegion<TMessage>[],
  row: number,
  column: number,
  acceptedKinds: readonly PointerEventKind[]
): QualifiedHit<TMessage> | undefined {
  return hitsAt(regions, row, column, acceptedKinds).at(0);
}

function hitsAt<TMessage>(
  regions: readonly RenderRegion<TMessage>[],
  row: number,
  column: number,
  acceptedKinds: readonly PointerEventKind[],
): readonly QualifiedHit<TMessage>[] {
  return regions.flatMap((region) => region.hitTargets
    .filter((target) => containsPoint(target.bounds, row, column))
    .filter((target) => acceptedKinds.some((kind) => targetAccepts(target, kind)))
    .map((target, index) => ({
      identity: qualifiedTargetIdentity(region.id, target.ownerIdentity, target.id),
      target,
      region,
      index,
      zIndex: target.zIndex ?? region.zIndex
    })))
    .toSorted((left, right) => right.zIndex - left.zIndex
      || right.region.zIndex - left.region.zIndex
      || right.region.order - left.region.order
      || right.index - left.index)
    ;
}

function routeWheelThroughAncestors<TMessage>(
  regions: readonly RenderRegion<TMessage>[],
  event: MouseWheelEvent,
  targetIdentity: string | undefined,
  press: PointerPress | undefined,
): readonly PointerRouteResult<TMessage>[] {
  const candidates = hitsAt(regions, event.row, event.column, ['scroll']);
  const deepest = targetIdentity === undefined
    ? candidates[0]
    : candidates.find((candidate) => candidate.identity === targetIdentity);
  if (deepest === undefined) return [routeResult(event, undefined, 'scroll', press)];
  const chain = candidates.filter((candidate) =>
    deepest.target.ownerIdentity.startsWith(candidate.target.ownerIdentity)
  ).filter((candidate, index, values) =>
    values.findIndex((other) => other.target.ownerIdentity === candidate.target.ownerIdentity) === index
  ).toSorted((left, right) => right.target.ownerIdentity.length - left.target.ownerIdentity.length);
  const stateByIdentity = new Map<string, ScrollState>();
  const resultByIdentity = new Map<string, PointerRouteResult<TMessage>>();
  const orderedIdentities: string[] = [];
  for (const delta of wheelUnits(event)) {
    for (const hit of chain) {
      const descriptor = hit.target[scrollRouteDescriptor];
      if (descriptor === undefined) {
        const result = routeResult({ ...event, ...delta }, hit, 'scroll', press);
        if (!isIgnoredMessage(result.message)) {
          rememberWheelResult(hit.identity, result, orderedIdentities, resultByIdentity);
          break;
        }
        continue;
      }
      const current = stateByIdentity.get(hit.identity) ?? descriptor.state;
      const routedEvent = routedPointerEvent({ ...event, ...delta }, hit.target, 'scroll', press, 0);
      const step = descriptor.route(routedEvent, current);
      if (sameScrollState(step.nextState, current) || isIgnoredMessage(step.message)) continue;
      stateByIdentity.set(hit.identity, step.nextState);
      rememberWheelResult(hit.identity, {
        event: routedEvent,
        hit: hit.target,
        message: step.message,
      }, orderedIdentities, resultByIdentity);
      break;
    }
  }
  return orderedIdentities.flatMap((identity) => {
    const result = resultByIdentity.get(identity);
    return result === undefined ? [] : [result];
  });
}

function wheelUnits(event: MouseWheelEvent): readonly {
  readonly deltaRows: number;
  readonly deltaColumns: number;
}[] {
  const units: { deltaRows: number; deltaColumns: number }[] = [];
  for (let count = 0; count < Math.abs(event.deltaRows); count += 1) {
    units.push({ deltaRows: Math.sign(event.deltaRows), deltaColumns: 0 });
  }
  for (let count = 0; count < Math.abs(event.deltaColumns); count += 1) {
    units.push({ deltaRows: 0, deltaColumns: Math.sign(event.deltaColumns) });
  }
  return units;
}

function rememberWheelResult<TMessage>(
  identity: string,
  result: PointerRouteResult<TMessage>,
  order: string[],
  results: Map<string, PointerRouteResult<TMessage>>,
): void {
  if (!results.has(identity)) order.push(identity);
  results.set(identity, result);
}

function sameScrollState(left: ScrollState, right: ScrollState): boolean {
  return left.offsetRow === right.offsetRow
    && left.offsetColumn === right.offsetColumn
    && left.followTail === right.followTail;
}

function hitByIdentity<TMessage>(
  regions: readonly RenderRegion<TMessage>[],
  identity: string
): QualifiedHit<TMessage> | undefined {
  for (const region of regions) {
    for (const target of region.hitTargets) {
      if (qualifiedTargetIdentity(region.id, target.ownerIdentity, target.id) === identity) {
        return { identity, target };
      }
    }
  }
  return undefined;
}

function qualifiedTargetIdentity(regionId: string, ownerIdentity: string, targetId: string): string {
  return `${String(regionId.length)}:${regionId}${String(ownerIdentity.length)}:${ownerIdentity}${targetId}`;
}

function containsPoint(bounds: Rect, row: number, column: number): boolean {
  return row >= bounds.row
    && row < bounds.row + bounds.height
    && column >= bounds.column
    && column < bounds.column + bounds.width;
}

function localPoint(bounds: Rect, row: number, column: number): { readonly row: number; readonly column: number } {
  return { row: row - bounds.row + 1, column: column - bounds.column + 1 };
}
