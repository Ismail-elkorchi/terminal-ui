import type { TuiEventSource, TuiSubscriptionContext } from './types.ts';
import {
  advanceAnimationTimeline,
  createAnimationTimeline,
  nextAnimationDeadline
} from './animation-timeline.ts';
import type { AnimationFrame } from './animation-timeline.ts';
import { reliableSourceMessage, replaceableSourceMessage } from './source-channel.ts';

/** @beta */
export function intervalSource<TMessage extends NonNullable<unknown>>(
  id: string,
  ms: number,
  message: TMessage | ((tick: number) => TMessage)
): TuiEventSource<TMessage> {
  assertPositiveMilliseconds(ms, 'interval ms');
  return {
    id,
    generation: 0,
    source: 'timer',
    async run(context, sink) {
      let tick = 0;
      while (await sleepForTick(context, ms)) {
        await sink.emit(reliableSourceMessage(scheduledMessage(message, tick)));
        tick += 1;
      }
    }
  };
}

/** @beta */
export function timeoutSource<TMessage extends NonNullable<unknown>>(
  id: string,
  ms: number,
  message: TMessage
): TuiEventSource<TMessage> {
  assertNonNegativeMilliseconds(ms, 'timeout ms');
  return {
    id,
    generation: 0,
    source: 'timer',
    async run(context, sink) {
      const outcome = await context.clock.sleep(ms, context.signal);
      if (outcome === 'elapsed') await sink.emit(reliableSourceMessage(message));
    }
  };
}

/** @beta */
export function animationSource<TMessage extends NonNullable<unknown>>(
  id: string,
  fps: number,
  message: (frame: AnimationFrame) => TMessage
): TuiEventSource<TMessage> {
  assertPositiveNumber(fps, 'animation fps');
  return {
    id,
    generation: 0,
    source: 'timer',
    async run(context, sink) {
      let timeline = createAnimationTimeline(context.clock.monotonicNow(), fps);
      while (!context.signal.aborted) {
        const delay = Math.max(0, nextAnimationDeadline(timeline) - context.clock.monotonicNow());
        const outcome = await context.clock.sleep(delay, context.signal);
        if (outcome === 'aborted') return;
        const advanced = advanceAnimationTimeline(timeline, context.clock.monotonicNow());
        timeline = advanced.timeline;
        await sink.emit(replaceableSourceMessage('animation-frame', message(advanced.frame)));
      }
    }
  };
}

async function sleepForTick(
  context: TuiSubscriptionContext,
  ms: number
): Promise<boolean> {
  if (context.signal.aborted) return false;
  return await context.clock.sleep(ms, context.signal) === 'elapsed';
}

function scheduledMessage<TMessage extends NonNullable<unknown>>(
  message: TMessage | ((tick: number) => TMessage),
  tick: number
): TMessage {
  return typeof message === 'function'
    ? (message as (tick: number) => TMessage)(tick)
    : message;
}

function assertPositiveMilliseconds(value: number, label: string): void {
  assertPositiveNumber(value, label);
}

function assertNonNegativeMilliseconds(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative finite number.`);
  }
}

function assertPositiveNumber(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive finite number.`);
  }
}
