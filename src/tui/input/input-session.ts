import type { TerminalClock, TerminalInputChunk } from '../../host/types.ts';
import { createInputAmbiguityDeadline } from '../../input/ambiguity-deadline.ts';
import { InputDecodeError } from '../../input/decode-error.ts';
import type { InputPipelineOptions } from '../../input/pipeline.ts';
import { createInputPipeline } from '../../input/pipeline.ts';
import { decodeInputEvent } from '../../input/snapshot.ts';
import type { InputEvent, InputPendingState, MouseWheelEvent } from '../../input/types.ts';
import type { FocusPath } from '../../interaction/focus.ts';
import type { SerializedDispatchQueue } from '../dispatch-queue.ts';
import { createSerializedDispatchQueue } from '../dispatch-queue.ts';
import type { PointerMotionEvent } from './pointer-motion-coordinator.ts';
import { createPointerMotionCoordinator } from './pointer-motion-coordinator.ts';
import type { TuiInputBatchResult, TuiInputResult } from '../types.ts';
import { createWheelInputCoordinator } from './wheel-input-coordinator.ts';

interface RuntimeInputSessionOptions<TState> {
  readonly clock: TerminalClock;
  readonly pipeline?: InputPipelineOptions;
  readonly transaction: SerializedDispatchQueue;
  readonly assertOperational: () => void;
  readonly dispatch: (event: InputEvent, occurredAt: number) => Promise<TuiInputResult<TState>>;
  readonly bindingState: () => { readonly render: object | undefined; readonly focus: FocusPath | undefined };
  readonly characterBindings: () => ReadonlySet<string>;
  readonly recordDecoded: (count: number) => void;
  readonly wheel: ReturnType<typeof createWheelInputCoordinator<TuiInputResult<TState>>>;
  readonly pointer: ReturnType<typeof createPointerMotionCoordinator<TuiInputResult<TState>>>;
  readonly enqueueWheel: (event: MouseWheelEvent) => Promise<readonly TuiInputResult<TState>[]>;
  readonly enqueueMotion: (event: PointerMotionEvent, occurredAt: number) => void;
}

/** Owns raw input, ambiguity deadlines, character prefixes, and arrival ordering. */
export function createRuntimeInputSession<TState>(options: RuntimeInputSessionOptions<TState>) {
  const { clock, transaction: dispatchQueue, wheel: wheelInput, pointer: pointerMotion } = options;
  let inputOptions = options.pipeline ?? {};
  let inputPipeline = createInputPipeline(inputOptions);
  let inputAmbiguity = createInputAmbiguityDeadline<readonly TuiInputResult<TState>[]>(
    clock, inputPipeline.profile.escapeDelayMs,
  );
  let pendingCharacterText = '';
  const inputQueue = createSerializedDispatchQueue();
  const handleInputImmediately = (event: InputEvent, occurredAt: number) =>
    dispatchQueue.run(() => options.dispatch(event, occurredAt));
  return {
    diagnostics: () => inputPipeline.profile.diagnostics,
    drain: () => inputQueue.drain(),
    handleInput: async (rawEvent: InputEvent) => {
      const decoded = decodeInputEvent(rawEvent);
      if (decoded.kind === 'resize' || decoded.kind === 'signal' || decoded.kind === 'end') {
        throw new TypeError(`TUI runtime handleInput() does not accept ${decoded.kind} events.`);
      }
      const occurredAt = clock.monotonicNow();
      return inputQueue.run(() => handleDecodedInput(decoded, occurredAt));
    },
    handleInputChunk: async (chunk: TerminalInputChunk) => {
      const owned = snapshotInputChunk(chunk);
      const occurredAt = clock.monotonicNow();
      return inputQueue.run(() => handleInputChunkInternal(owned, occurredAt));
    },
    flush: () => inputQueue.run(flushInputInternal),
    cancel: () => { inputAmbiguity.cancel(); },
    reset() {
      inputAmbiguity.cancel();
      inputPipeline.reset();
      pendingCharacterText = '';
    },
    replaceProfile(nextOptions: InputPipelineOptions) {
      if (inputPipeline.pending().kind !== 'none' || pendingCharacterText.length > 0) {
        throw new Error('Cannot replace the input profile while an input token is incomplete.');
      }
      inputAmbiguity.cancel();
      const limits = nextOptions.limits ?? inputOptions.limits;
      inputOptions = {
        ...nextOptions,
        escapeDelayMs: nextOptions.escapeDelayMs ?? inputPipeline.profile.escapeDelayMs,
        ...(limits === undefined ? {} : { limits }),
      };
      inputPipeline = createInputPipeline(inputOptions);
      inputAmbiguity = createInputAmbiguityDeadline(clock, inputPipeline.profile.escapeDelayMs);
    },
  };

  async function handleDecodedInput(
    event: InputEvent,
    occurredAt: number
  ): Promise<TuiInputResult<TState>> {
    inputAmbiguity.cancel();
    const earlierRawInput = inputPipeline.flush();
    options.recordDecoded(earlierRawInput.events.length);
    const earlier = await processInputEvents(earlierRawInput.events, occurredAt, true);
    const pendingEarlier = earlier.pending === undefined ? [] : await earlier.pending;
    const exit = [...earlier.results, ...pendingEarlier]
      .findLast((result) => result.exit !== undefined);
    if (exit !== undefined) return exit;
    await wheelInput.flush();
    await pointerMotion.flush();
    options.recordDecoded(1);
    return handleInputImmediately(event, occurredAt);
  }

  async function handleInputChunkInternal(
    chunk: TerminalInputChunk,
    occurredAt: number
  ): Promise<TuiInputBatchResult<TState>> {
    inputAmbiguity.cancel();
    const batch = inputPipeline.decode(chunk);
    options.recordDecoded(batch.events.length);
    const decoded = await processInputEvents(batch.events, occurredAt);
    const terminalAmbiguous = isAmbiguousInput(batch.pending.kind);
    if (!terminalAmbiguous && pendingCharacterText.length === 0) return decoded;
    const pendingAmbiguity = inputAmbiguity.schedule(() => inputQueue.run(async () => {
      const expired = terminalAmbiguous
        ? inputPipeline.flush()
        : { events: [], pending: { kind: 'none' as const } };
      options.recordDecoded(expired.events.length);
      const result = await processInputEvents(
        expired.events,
        clock.monotonicNow(),
        true
      );
      const pendingInput = result.pending === undefined ? [] : await result.pending;
      return [...result.results, ...pendingInput];
    })).then((results) => results ?? []);
    return {
      results: decoded.results,
      pending: combinePendingInput(decoded.pending, pendingAmbiguity) ?? pendingAmbiguity
    };
  }

  async function flushInputInternal(): Promise<readonly TuiInputResult<TState>[]> {
    inputAmbiguity.cancel();
    const batch = inputPipeline.flush();
    options.recordDecoded(batch.events.length);
    const decoded = await processInputEvents(batch.events, clock.monotonicNow(), true);
    const pending = [
      ...await wheelInput.flush(),
      ...await pointerMotion.flush()
    ];
    return [...decoded.results, ...pending];
  }

  async function processInputEvents(
    events: readonly InputEvent[],
    occurredAt = clock.monotonicNow(),
    flushCharacterText = false
  ): Promise<TuiInputBatchResult<TState>> {
    options.assertOperational();
    const results: TuiInputResult<TState>[] = [];
    for (const event of events) {
      if (event.kind !== 'mouse') {
        const flushed = await flushInputCoordinators(true, true);
        results.push(...flushed);
        if (inputResultsExit(results)) break;
        results.push(...await dispatchQueue.run(() => executeRoutedInput([event], false, occurredAt)));
      } else {
        if (pendingCharacterText.length > 0) {
          const flushed = await flushInputCoordinators(true, true);
          results.push(...flushed);
          if (inputResultsExit(results)) break;
          results.push(...await dispatchQueue.run(() => executeRoutedInput([], true, occurredAt)));
          if (inputResultsExit(results)) break;
        }
        const chunk = await processInputChunk([event], 0, occurredAt);
        results.push(...chunk.results);
      }
      if (inputResultsExit(results)) break;
    }
    if (flushCharacterText && !inputResultsExit(results)) {
      const flushed = await flushInputCoordinators(true, true);
      results.push(...flushed);
      if (!inputResultsExit(results)) {
        results.push(...await dispatchQueue.run(() => executeRoutedInput([], true, occurredAt)));
      }
    }
    const pending = combinePendingInput(wheelInput.pending(), pointerMotion.pending());
    return {
      results,
      ...(pending === undefined ? {} : { pending })
    };
  }

  async function executeRoutedInput(
    events: readonly InputEvent[],
    flushCharacterText: boolean,
    occurredAt: number,
  ): Promise<readonly TuiInputResult<TState>[]> {
    const results: TuiInputResult<TState>[] = [];
    const limit = inputPipeline.profile.limits.maxEventsPerBatch;
    let bindingRender = options.bindingState().render;
    let bindingFocus = options.bindingState().focus;
    let cachedBindings: ReadonlySet<string> | undefined;
    const currentBindings = (): ReadonlySet<string> => {
      const render = options.bindingState().render;
      const focus = options.bindingState().focus;
      if (cachedBindings === undefined || render !== bindingRender || focus !== bindingFocus) {
        cachedBindings = options.characterBindings();
        bindingRender = render;
        bindingFocus = focus;
      }
      return cachedBindings;
    };
    const routeText = async (text: string, retainPrefix: boolean): Promise<void> => {
      const combined = pendingCharacterText + text;
      pendingCharacterText = '';
      // Code-point messages are stable across host chunks, including chunks
      // that split a combining sequence. Multi-code-point bindings still win
      // as a single semantic event when they match.
      const segments: { text: string; startOffset: number; endOffsetExclusive: number }[] = [];
      let offset = 0;
      for (const point of combined) {
        segments.push({ text: point, startOffset: offset, endOffsetExclusive: offset + point.length });
        offset += point.length;
      }
      // Reject an oversized expansion before applying any of its messages.
      if (segments.length > limit) {
        throw new InputDecodeError('event_batch_limit_exceeded', limit, segments.length);
      }
      const boundaryToIndex = new Map(segments.map((segment, index) => [segment.endOffsetExclusive, index + 1]));
      let index = 0;
      while (index < segments.length && !inputResultsExit(results)) {
        const segment = segments[index];
        if (segment === undefined) break;
        const remaining = combined.slice(segment.startOffset);
        const bindings = currentBindings();
        if (retainPrefix && [...bindings].some((binding) =>
          suffixIsStrictBindingPrefix(remaining, 0, binding))) {
          pendingCharacterText = remaining;
          break;
        }
        // A text binding may span more than one grapheme. Consume its whole
        // trigger, then resolve the next trigger against the resulting focus.
        let match = '';
        let nextIndex = index + 1;
        for (const binding of bindings) {
          if (binding.length <= match.length || !remaining.startsWith(binding)) continue;
          const boundary = boundaryToIndex.get(segment.startOffset + binding.length);
          if (boundary === undefined) continue;
          match = binding;
          nextIndex = boundary;
        }
        const value = match || segment.text;
        results.push(await options.dispatch({ kind: 'text', text: value, paste: false }, occurredAt));
        index = match ? nextIndex : index + 1;
      }
    };
    for (const event of events) {
      if (event.kind === 'text') await routeText(event.text, true);
      else {
        if (pendingCharacterText.length > 0) await routeText('', false);
        if (!inputResultsExit(results)) results.push(await options.dispatch(event, occurredAt));
      }
      if (inputResultsExit(results)) break;
    }
    if (flushCharacterText && !inputResultsExit(results) && pendingCharacterText.length > 0) {
      await routeText('', false);
    }
    return results;
  }

  async function processInputChunk(
    events: readonly InputEvent[],
    index: number,
    occurredAt: number,
  ): Promise<{
    readonly results: readonly TuiInputResult<TState>[];
    readonly consumed: number;
    readonly exit: boolean;
  }> {
    const event = events[index];
    if (event === undefined) return { results: [], consumed: 1, exit: false };
    if (isWheelInputEvent(event)) {
      const flushed = await flushInputCoordinators(false, true);
      if (inputResultsExit(flushed)) return { results: flushed, consumed: 1, exit: true };
      const results = [...flushed, ...await options.enqueueWheel(event)];
      return { results, consumed: 1, exit: inputResultsExit(results) };
    }
    if (isPointerMotionEvent(event)) {
      const results = await flushInputCoordinators(true, false);
      if (!inputResultsExit(results)) options.enqueueMotion(event, occurredAt);
      return { results, consumed: 1, exit: inputResultsExit(results) };
    }
    const flushed = await flushInputCoordinators(true, true);
    if (inputResultsExit(flushed)) return { results: flushed, consumed: 1, exit: true };
    const result = await handleInputImmediately(event, occurredAt);
    return { results: [...flushed, result], consumed: 1, exit: result.exit !== undefined };
  }

  async function flushInputCoordinators(
    wheel: boolean,
    pointer: boolean,
  ): Promise<readonly TuiInputResult<TState>[]> {
    const results: TuiInputResult<TState>[] = [];
    if (wheel) results.push(...await wheelInput.flush());
    if (!inputResultsExit(results) && pointer) results.push(...await pointerMotion.flush());
    return results;
  }

  function inputResultsExit(results: readonly TuiInputResult<TState>[]): boolean {
    return results.at(-1)?.exit !== undefined;
  }

  function suffixIsStrictBindingPrefix(value: string, start: number, binding: string): boolean {
    const suffixLength = value.length - start;
    if (suffixLength >= binding.length) return false;
    for (let offset = 0; offset < suffixLength; offset += 1) {
      if (value.charCodeAt(start + offset) !== binding.charCodeAt(offset)) return false;
    }
    return true;
  }
}

function snapshotInputChunk(chunk: TerminalInputChunk): TerminalInputChunk {
  return {
    data: typeof chunk.data === 'string' ? chunk.data : chunk.data.slice()
  };
}

function isWheelInputEvent(event: InputEvent): event is MouseWheelEvent {
  return event.kind === 'mouse' && event.action === 'wheel';
}

function isPointerMotionEvent(event: InputEvent): event is PointerMotionEvent {
  return event.kind === 'mouse' && (event.action === 'drag' || event.action === 'move');
}

function isAmbiguousInput(kind: InputPendingState['kind']): boolean {
  return kind === 'escape' || kind === 'sequence';
}

function combinePendingInput<TState>(
  first: Promise<readonly TuiInputResult<TState>[]> | undefined,
  second: Promise<readonly TuiInputResult<TState>[]> | undefined
): Promise<readonly TuiInputResult<TState>[]> | undefined {
  if (second === undefined) return first;
  if (first === undefined) return second;
  return Promise.all([first, second]).then(([left, right]) => [...left, ...right]);
}
