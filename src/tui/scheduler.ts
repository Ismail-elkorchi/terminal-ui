import type { TuiEventSource, TuiSubscriptionContext } from './types.ts';
import {
  advanceAnimationTimeline,
  createAnimationTimeline,
  nextAnimationDeadline
} from './animation-timeline.ts';
import type { AnimationFrame } from './animation-timeline.ts';
import { reliableSourceMessage, replaceableSourceMessage } from './source-channel.ts';

export function intervalSource<TMessage>(
  id: string,
  ms: number,
  message: TMessage | ((tick: number) => TMessage)
): TuiEventSource<TMessage> {
  assertPositiveMilliseconds(ms, 'interval ms');
  return {
    id,
    generation: 0,
    source: 'timer',
    async *messages(context) {
      let tick = 0;
      while (await sleepForTick(context, ms)) {
        yield reliableSourceMessage(scheduledMessage(message, tick));
        tick += 1;
      }
    }
  };
}

export function timeoutSource<TMessage>(
  id: string,
  ms: number,
  message: TMessage
): TuiEventSource<TMessage> {
  assertNonNegativeMilliseconds(ms, 'timeout ms');
  return {
    id,
    generation: 0,
    source: 'timer',
    async *messages(context) {
      await context.clock.sleep(ms, context.signal);
      if (!context.signal.aborted) yield reliableSourceMessage(message);
    }
  };
}

export function animationSource<TMessage>(
  id: string,
  fps: number,
  message: (frame: AnimationFrame) => TMessage
): TuiEventSource<TMessage> {
  assertPositiveNumber(fps, 'animation fps');
  return {
    id,
    generation: 0,
    source: 'timer',
    async *messages(context) {
      let timeline = createAnimationTimeline(context.clock.monotonicNow(), fps);
      while (!context.signal.aborted) {
        const delay = Math.max(0, nextAnimationDeadline(timeline) - context.clock.monotonicNow());
        await context.clock.sleep(delay, context.signal);
        if (signalAborted(context.signal)) return;
        const advanced = advanceAnimationTimeline(timeline, context.clock.monotonicNow());
        timeline = advanced.timeline;
        yield replaceableSourceMessage('animation-frame', message(advanced.frame));
      }
    }
  };
}

function signalAborted(signal: AbortSignal): boolean {
  return signal.aborted;
}

async function sleepForTick(
  context: TuiSubscriptionContext,
  ms: number
): Promise<boolean> {
  if (context.signal.aborted) return false;
  await context.clock.sleep(ms, context.signal);
  return !context.signal.aborted;
}

function scheduledMessage<TMessage>(
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
