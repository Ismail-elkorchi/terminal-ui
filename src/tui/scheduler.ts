import type { TuiEventSource, TuiSubscriptionContext } from './types.ts';

export function intervalSource<TMessage>(
  id: string,
  ms: number,
  message: TMessage | ((tick: number) => TMessage)
): TuiEventSource<TMessage> {
  assertPositiveMilliseconds(ms, 'interval ms');
  return {
    id,
    source: 'timer',
    async *messages(context) {
      let tick = 0;
      while (await sleepForTick(context, ms)) {
        yield scheduledMessage(message, tick);
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
    source: 'timer',
    async *messages(context) {
      await context.clock.sleep(ms, context.signal);
      if (!context.signal.aborted) yield message;
    }
  };
}

export function animationSource<TMessage>(
  id: string,
  fps: number,
  message: (frame: number) => TMessage
): TuiEventSource<TMessage> {
  assertPositiveNumber(fps, 'animation fps');
  return intervalSource(id, Math.max(1, Math.round(1000 / fps)), message);
}

async function sleepForTick<TMessage>(
  context: TuiSubscriptionContext<TMessage>,
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
