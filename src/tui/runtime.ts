import {
  createInputAmbiguityDeadline,
  createInputPipeline,
  InputDecodeError,
  snapshotInputEvent
} from '../input/index.ts';
import { diagnostic } from '../diagnostics.ts';
import { TerminalUiError, errorFromUnknown } from '../errors.ts';
import { createSerializedDispatchQueue } from './dispatch-queue.ts';
import { createTuiEffectManager } from './effects.ts';
import { completedExitFromSnapshot } from './exit.ts';
import {
  findRenderNodeFocusTarget,
  renderNodeKeyChainForFocus
} from '../renderer/internal/focus.ts';
import { defaultTuiLifecyclePolicy } from './run-configuration.ts';
import { recordTuiCommit } from './transcript.ts';
import { createPointerRouter } from '../renderer/internal/pointer-router.ts';
import {
  createRuntimeLifecycle,
  runtimePhaseError
} from './runtime-lifecycle.ts';
import { createRuntimeChangeChannel } from './runtime-change-channel.ts';
import { createRuntimeCommitCoordinator } from './runtime-commit-coordinator.ts';
import { createRuntimeDiagnostics } from './runtime-diagnostics.ts';
import { createRuntimeContextFactory } from './runtime-context.ts';
import {
  inputEventContainsSensitiveText,
  redactSensitiveInputEvent,
  resolveRuntimeInputMessage
} from './runtime-input.ts';
import { createRuntimeStore } from './runtime-store.ts';
import { createTuiSubscriptionManager } from './subscriptions.ts';
import { createWheelInputCoordinator } from './wheel-input-coordinator.ts';
import { createResizeCoordinator } from './resize-coordinator.ts';
import { createPointerMotionCoordinator } from './pointer-motion-coordinator.ts';
import type { PointerMotionEvent } from './pointer-motion-coordinator.ts';
import type { TerminalCapabilityProfile, TerminalInputChunk } from '../host/index.ts';
import type {
  InputEvent,
  InputPendingState,
  MouseEvent as TerminalMouseEvent,
  MouseWheelEvent
} from '../input/index.ts';
import { isIgnoredMessage } from '../interaction/message.ts';
import { focusPathsEqual } from '../interaction/focus.ts';
import type { FocusPath } from '../interaction/focus.ts';
import type { Frame, RenderDiff } from '../renderer/contracts.ts';
import type { PointerRouteResult } from '../renderer/internal/pointer-router.ts';
import type { PendingTuiMessage, RuntimeReduction } from './runtime-store.ts';
import type {
  TuiContext,
  TuiExit,
  TuiInputResult,
  TuiInputBatchResult,
  TuiMessageSource,
  TuiRuntime,
  TuiRuntimeDisposeOptions,
  TuiRuntimeMetrics,
  TuiRuntimeOptions
} from './types.ts';
import type { WheelInputBatch } from './wheel-input-batch.ts';
import type { ProducerAdmissionLease } from './producer-admission.ts';
import { segmentGraphemes } from '../text/index.ts';

type MutableTuiRuntimeMetrics = {
  -readonly [TKey in Exclude<keyof TuiRuntimeMetrics, 'effects'>]: TuiRuntimeMetrics[TKey];
};

const inputRetirement = new WeakMap<object, () => void>();
const terminalFailure = new WeakMap<object, (cause: unknown) => void>();

export function retireTuiRuntimeInput(runtime: object): void {
  const retire = inputRetirement.get(runtime);
  if (retire === undefined) throw new Error('Expected a terminal-ui TUI runtime.');
  retire();
}

export function failTuiRuntimeTerminalOwnership(runtime: object, cause: unknown): void {
  const fail = terminalFailure.get(runtime);
  if (fail === undefined) throw new Error('Expected a terminal-ui TUI runtime.');
  fail(cause);
}

export function createTuiRuntime<TState, TMessage>(
  options: TuiRuntimeOptions<TState, TMessage>
): TuiRuntime<TState, TMessage> {
  return createRuntime(options);
}

export function createTuiRuntimeWithCapabilitySnapshot<TState, TMessage>(
  options: TuiRuntimeOptions<TState, TMessage>,
  capabilities: TerminalCapabilityProfile
): TuiRuntime<TState, TMessage> {
  return createRuntime(options, capabilities);
}

function createRuntime<TState, TMessage>(
  options: TuiRuntimeOptions<TState, TMessage>,
  capabilities?: TerminalCapabilityProfile
): TuiRuntime<TState, TMessage> {
  let terminalExit: TuiExit<TState> | undefined;
  let inputOptions = options.input ?? {};
  let inputPipeline = createInputPipeline(inputOptions);
  let inputAmbiguity = createInputAmbiguityDeadline<readonly TuiInputResult<TState>[]>(
    options.host.clock,
    inputPipeline.profile.escapeDelayMs
  );
  let pendingCharacterText = '';
  const pointerRouter = createPointerRouter<TMessage>({ now: () => options.host.clock.monotonicNow() });
  const metrics: MutableTuiRuntimeMetrics = {
    decodedInputEvents: 0,
    wheelPackets: 0,
    dispatchedMessages: 0,
    frameCommits: 0
  };
  const inputQueue = createSerializedDispatchQueue();
  const dispatchQueue = createSerializedDispatchQueue();
  const lifecycle = createRuntimeLifecycle<Frame>();
  const store = createRuntimeStore(options.app.definition.update, () => {
    metrics.dispatchedMessages += 1;
  });
  const commits = createRuntimeCommitCoordinator(options, lifecycle.signal);
  const runtimeContext = createRuntimeContextFactory(options.host, capabilities);
  const changes = createRuntimeChangeChannel<TState>();
  const diagnostics = createRuntimeDiagnostics({
    owner: options.app.id,
    initial: [...(options.diagnostics ?? []), ...inputPipeline.profile.diagnostics],
    ...(options.transcript === undefined ? {} : { transcript: options.transcript }),
    active: () => lifecycle.active(),
    canRefresh: () => store.hasState() && commits.renderOrUndefined() !== undefined,
    refresh: () => dispatchQueue.run(refreshAfterDiagnostic)
  });
  const wheelInput = createWheelInputCoordinator<TuiInputResult<TState>>({
    clock: options.host.clock,
    execute: (batch) => dispatchQueue.run(() => handleWheelInputBatch(batch)),
    reportFailure(cause) {
      if (lifecycle.phase() !== 'disposing' && lifecycle.phase() !== 'disposed') {
        diagnostics.record(diagnostic('TUI_RUNTIME_TASK_FAILED', 'TUI wheel input flush failed.', {
          target: options.app.id,
          cause,
          data: { taskName: 'wheel_input_flush' }
        }));
      }
    }
  });
  const pointerMotion = createPointerMotionCoordinator<TuiInputResult<TState>>({
    execute: (sample) => dispatchQueue.run(() =>
      handleMouseInputInternal(sample.event, sample.occurredAt)),
    stop: (result) => result.exit !== undefined,
    reportFailure(cause) {
      if (lifecycle.phase() !== 'disposing' && lifecycle.phase() !== 'disposed') {
        diagnostics.record(diagnostic('TUI_RUNTIME_TASK_FAILED', 'TUI pointer motion dispatch failed.', {
          target: options.app.id,
          cause,
          data: { taskName: 'pointer_motion_dispatch' }
        }));
      }
    }
  });
  const resizeCoordinator = createResizeCoordinator(async (terminalSize: ReturnType<typeof commits.terminalSize>) => {
    await wheelInput.flush();
    await pointerMotion.flush();
    return dispatchQueue.run(() => resizeInternal(terminalSize));
  });
  const subscriptions = createTuiSubscriptionManager<TState, TMessage>({
    ...(options.app.definition.subscriptions === undefined
      ? {}
      : { subscriptions: options.app.definition.subscriptions }),
    context: createRuntimeContext,
    reportDiagnostic: (item) => diagnostics.report(item),
    dispatch(message, source, lease) {
      return dispatchQueue.run(() => dispatchAdmitted(message, source, lease)).then(() => undefined);
    }
  });
  const effects = createTuiEffectManager<TMessage>({
    clock: options.host.clock,
    context: createRuntimeContext,
    reportDiagnostic: (item) => diagnostics.report(item),
    dispatch(messages, lease) {
      return dispatchQueue.run(() => dispatchManyAdmitted(messages, 'effect', lease)).then(() => undefined);
    },
    ...(options.withTerminalSuspended === undefined
      ? {}
      : { withTerminalSuspended: options.withTerminalSuspended }),
    ...(options.effectPolicy === undefined ? {} : { policy: options.effectPolicy })
  });

  const runtime: TuiRuntime<TState, TMessage> = {
    start() {
      return lifecycle.start(() => dispatchQueue.run(startInternal));
    },
    dispatch(message) {
      return dispatchQueue.run(() => dispatchInternal(message, 'external'));
    },
    resize(terminalSize) {
      return resizeCoordinator.request(terminalSize);
    },
    async handleInput(rawEvent) {
      const event = snapshotInputEvent(rawEvent);
      const occurredAt = options.host.clock.monotonicNow();
      return inputQueue.run(() => handleDecodedInput(event, occurredAt));
    },
    async handleInputChunk(chunk) {
      const ownedChunk = snapshotInputChunk(chunk);
      const occurredAt = options.host.clock.monotonicNow();
      return inputQueue.run(() => handleInputChunkInternal(ownedChunk, occurredAt));
    },
    async flushInput() {
      return inputQueue.run(flushInputInternal);
    },
    replaceTerminalProfile(nextOptions) {
      lifecycle.assertOperational();
      if (inputPipeline.pending().kind !== 'none' || pendingCharacterText.length > 0) {
        throw new Error('Cannot replace the input profile while an input token is incomplete.');
      }
      inputAmbiguity.cancel();
      const limits = nextOptions.limits ?? inputOptions.limits;
      inputOptions = {
        ...nextOptions,
        escapeDelayMs: nextOptions.escapeDelayMs ?? inputPipeline.profile.escapeDelayMs,
        ...(limits === undefined ? {} : { limits })
      };
      inputPipeline = createInputPipeline(inputOptions);
      runtimeContext.replace(nextOptions.capabilities);
      inputAmbiguity = createInputAmbiguityDeadline<readonly TuiInputResult<TState>[]>(
        options.host.clock,
        inputPipeline.profile.escapeDelayMs
      );
      for (const item of inputPipeline.profile.diagnostics) diagnostics.report(item);
    },
    resetInput() {
      lifecycle.assertOperational();
      inputAmbiguity.cancel();
      inputPipeline.reset();
      pendingCharacterText = '';
      wheelInput.reset();
      pointerMotion.reset();
      pointerRouter.reset();
    },
    suspendOutput() {
      lifecycle.assertOperational();
      commits.suspendOutput();
    },
    resumeOutput() {
      lifecycle.assertOperational();
      commits.resumeOutput();
    },
    redraw() {
      return dispatchQueue.run(async () => {
        await commitRuntimeTransition({
          messages: [],
          terminalSize: options.host.getTerminalSize(),
          requestedFocusPath: commits.focusPath(),
          forceFrame: true
        });
        return commits.frame();
      });
    },
    nextChange(signal) {
      lifecycle.assertWaitable();
      return changes.next(signal);
    },
    dispose(disposeOptions) {
      return disposeRuntime(disposeOptions);
    },
    state() {
      return store.state();
    },
    frame() {
      return commits.renderOrUndefined()?.frame;
    },
    exit() {
      return terminalExit;
    },
    diagnostics() {
      return diagnostics.values();
    },
    reportDiagnostic(item) {
      return diagnostics.report(item);
    },
    metrics() {
      return { ...metrics, effects: effects.metrics() };
    }
  };
  terminalFailure.set(runtime, (cause) => {
    diagnostics.record(diagnostic(
      'TUI_TERMINAL_OWNERSHIP_FAILED',
      'Terminal ownership could not be re-established.',
      { severity: 'fatal', target: options.app.id, cause }
    ));
    lifecycle.fail();
    subscriptions.cancel();
    effects.cancel();
    const render = commits.renderOrUndefined();
    if (store.hasState() && render !== undefined) {
      terminalExit = {
        status: 'error',
        state: store.state(),
        diagnostics: diagnostics.values(),
        snapshot: render.frame.accessibility
      };
      changes.publish({ kind: 'exit', exit: terminalExit });
    } else {
      changes.close(new TerminalUiError('Terminal ownership could not be re-established.'));
    }
  });
  inputRetirement.set(runtime, () => {
    inputAmbiguity.cancel();
    inputPipeline.reset();
    pendingCharacterText = '';
    wheelInput.reset();
    pointerMotion.reset();
    pointerRouter.reset();
    lifecycle.retire();
  });
  return runtime;

  async function handleDecodedInput(
    event: InputEvent,
    occurredAt: number
  ): Promise<TuiInputResult<TState>> {
    inputAmbiguity.cancel();
    const earlierRawInput = inputPipeline.flush();
    metrics.decodedInputEvents += earlierRawInput.events.length;
    const earlier = await processInputEvents(earlierRawInput.events, occurredAt, true);
    const pendingEarlier = earlier.pending === undefined ? [] : await earlier.pending;
    const exit = [...earlier.results, ...pendingEarlier]
      .findLast((result) => result.exit !== undefined);
    if (exit !== undefined) return exit;
    await wheelInput.flush();
    await pointerMotion.flush();
    metrics.decodedInputEvents += 1;
    return handleInputImmediately(event, occurredAt);
  }

  async function handleInputChunkInternal(
    chunk: Parameters<TuiRuntime<TState, TMessage>['handleInputChunk']>[0],
    occurredAt: number
  ): Promise<TuiInputBatchResult<TState>> {
    inputAmbiguity.cancel();
    const batch = inputPipeline.decode(chunk);
    metrics.decodedInputEvents += batch.events.length;
    const decoded = await processInputEvents(batch.events, occurredAt);
    const terminalAmbiguous = isAmbiguousInput(batch.pending.kind);
    if (!terminalAmbiguous && pendingCharacterText.length === 0) return decoded;
    const pendingAmbiguity = inputAmbiguity.schedule(() => inputQueue.run(async () => {
      const expired = terminalAmbiguous
        ? inputPipeline.flush()
        : { events: [], pending: { kind: 'none' as const } };
      metrics.decodedInputEvents += expired.events.length;
      const result = await processInputEvents(
        expired.events,
        options.host.clock.monotonicNow(),
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
    metrics.decodedInputEvents += batch.events.length;
    const decoded = await processInputEvents(batch.events, options.host.clock.monotonicNow(), true);
    const pending = [
      ...await wheelInput.flush(),
      ...await pointerMotion.flush()
    ];
    return [...decoded.results, ...pending];
  }

  async function dispatchAdmitted(
    message: TMessage,
    source: TuiMessageSource,
    lease: ProducerAdmissionLease
  ): Promise<TState> {
    return lease.authorized() ? dispatchInternal(message, source) : store.state();
  }

  async function dispatchManyAdmitted(
    messages: readonly TMessage[],
    source: TuiMessageSource,
    lease: ProducerAdmissionLease
  ): Promise<TState> {
    return lease.authorized() ? dispatchManyInternal(messages, source) : store.state();
  }

  async function handleInputImmediately(
    event: InputEvent,
    occurredAt = options.host.clock.monotonicNow()
  ): Promise<TuiInputResult<TState>> {
    if (event.kind === 'mouse') {
      options.transcript?.record({ kind: 'input', event });
      return dispatchQueue.run(() => handleMouseInputInternal(event, occurredAt));
    }
    lifecycle.assertOperational();
    const redactInput = focusedInputIsSensitive() && inputEventContainsSensitiveText(event);
    options.transcript?.record({
      kind: 'input',
      event: redactInput ? redactSensitiveInputEvent(event) : event
    });
    if (event.kind === 'focus' && !event.focused) {
      const cancelled = pointerRouter.cancel(commits.render().regions)
        .flatMap((result) => isIgnoredMessage(result.message) ? [] : [result.message]);
      if (cancelled.length > 0) await dispatchManyInternal(cancelled, 'input');
    }
    const state = store.state();
    const frame = commits.frame();
    const message = messageForInput(state, event);
    if (isIgnoredMessage(message)) {
      if (event.kind === 'key' && event.key === 'tab' && event.eventType === 'press') {
        const next = await moveFocus(event.modifiers.shift ? 'previous' : 'next');
        return { handled: true, state, frame: next };
      }
      return { handled: false, state, frame };
    }
    const nextState = await dispatchQueue.run(() => dispatchInternal(message, 'input', redactInput));
    const nextFrame = commits.frame();
    return terminalExit === undefined
      ? { handled: true, state: nextState, frame: nextFrame }
      : { handled: true, state: nextState, frame: nextFrame, exit: terminalExit };
  }

  async function startInternal(): Promise<Frame> {
    try {
      const context = await createRuntimeContext();
      const state = options.app.definition.init(context);
      const preparedSubscriptions = await subscriptions.prepare(state, context);
      const result = await commits.initial(state, context, store.version());
      store.initialize(state);
      metrics.frameCommits += 1;
      lifecycle.activate();
      recordCommittedRender(result.render, result.diff);
      subscriptions.activate(preparedSubscriptions);
      for (const item of result.diagnostics) diagnostics.record(item);
      changes.publish({
        kind: 'frame',
        commitId: result.render.commitId,
        stateVersion: result.render.stateVersion,
        frame: result.render.frame
      });
      return result.render.frame;
    } catch (cause) {
      lifecycle.fail();
      subscriptions.cancel();
      effects.cancel();
      throw cause;
    }
  }

  async function dispatchInternal(
    message: TMessage,
    source: TuiMessageSource,
    redacted = false
  ): Promise<TState> {
    return dispatchManyInternal([message], source, redacted);
  }

  async function dispatchManyInternal(
    messages: readonly TMessage[],
    source: TuiMessageSource,
    redacted = false
  ): Promise<TState> {
    lifecycle.assertOperational();
    return commitRuntimeTransition({
      messages: messages.map((message) => ({
        message,
        source,
        ...(redacted ? { redacted: true } : {})
      })),
      terminalSize: commits.terminalSize(),
      requestedFocusPath: commits.focusPath()
    });
  }

  async function resizeInternal(terminalSize: Parameters<TuiRuntime<TState, TMessage>['resize']>[0]): Promise<Frame> {
    lifecycle.assertOperational();
    options.transcript?.record({ kind: 'input', event: { kind: 'resize', terminalSize } });
    await commitRuntimeTransition({ messages: [], terminalSize, requestedFocusPath: commits.focusPath() });
    return commits.frame();
  }

  async function createRuntimeContext(
    terminalSize: ReturnType<typeof commits.terminalSize> = commits.terminalSize()
  ): Promise<TuiContext> {
    return runtimeContext.create(terminalSize, diagnostics.values());
  }

  async function commitRuntimeTransition(input: {
    readonly messages: readonly PendingTuiMessage<TMessage>[];
    readonly terminalSize: ReturnType<typeof commits.terminalSize>;
    readonly requestedFocusPath: FocusPath | undefined;
    readonly forceFrame?: boolean;
  }): Promise<TState> {
    const context = await createRuntimeContext(input.terminalSize);
    lifecycle.assertOperational();
    const reduction = store.reduce(input.messages, context);
    const terminalSize = commits.terminalSize();
    const terminalSizeChanged = input.terminalSize.columns !== terminalSize.columns
      || input.terminalSize.rows !== terminalSize.rows;
    const focusChanged = !focusPathsEqual(input.requestedFocusPath, commits.focusPath());
    const requiresFrame = input.forceFrame === true
      || reduction.stateVersion !== store.version()
      || terminalSizeChanged
      || focusChanged
      || reduction.focus !== undefined;
    if (!requiresFrame) {
      recordReductionMessages(reduction);
      const exit = completeReduction(reduction, commits.frame());
      if (exit !== undefined) changes.publish({ kind: 'exit', exit });
      if (reduction.exitReason === undefined) {
        effects.cancelIds(reduction.cancelEffects);
        effects.start(reduction.effects);
      }
      return reduction.state;
    }

    const preparedSubscriptions = reduction.exitReason === undefined
      ? await subscriptions.prepare(reduction.state, context)
      : undefined;
    lifecycle.assertOperational();
    const result = await commits.transition(
      reduction.state,
      context,
      input.terminalSize,
      input.requestedFocusPath,
      reduction.stateVersion,
      reduction.focus
    );
    lifecycle.assertOperational();
    store.commit(reduction);
    metrics.frameCommits += 1;
    recordReductionMessages(reduction);
    recordCommittedRender(result.render, result.diff);
    for (const item of result.diagnostics) diagnostics.record(item);
    const exit = completeReduction(reduction, result.render.frame);
    changes.publish({
      kind: 'frame',
      commitId: result.render.commitId,
      stateVersion: result.render.stateVersion,
      frame: result.render.frame
    });
    if (exit !== undefined) changes.publish({ kind: 'exit', exit });
    if (preparedSubscriptions !== undefined) subscriptions.activate(preparedSubscriptions);
    if (reduction.exitReason === undefined) {
      effects.cancelIds(reduction.cancelEffects);
      effects.start(reduction.effects);
    }
    return reduction.state;
  }

  function recordReductionMessages(reduction: RuntimeReduction<TState, TMessage>): void {
    for (const item of reduction.messages) {
      options.transcript?.recordNormalizedMessage(
        item.source,
        item.redacted === true ? '[redacted]' : item.message
      );
    }
  }

  function focusedInputIsSensitive(): boolean {
    const current = commits.renderOrUndefined();
    if (current === undefined) return false;
    return renderNodeKeyChainForFocus(current.node, current.layout, commits.focusPath())
      .some((node) => node.kind === 'component' && node.definition.sensitiveInput);
  }

  function completeReduction(
    reduction: RuntimeReduction<TState, TMessage>,
    frame: Frame
  ): TuiExit<TState> | undefined {
    if (reduction.exitReason === undefined) return undefined;
    lifecycle.beginExit();
    subscriptions.cancel();
    effects.cancel();
    terminalExit = {
      ...completedExitFromSnapshot(
        reduction.state,
        frame.accessibility,
        reduction.exitReason === '' ? undefined : reduction.exitReason
      ),
      diagnostics: diagnostics.values()
    };
    return terminalExit;
  }

  async function refreshAfterDiagnostic(): Promise<void> {
    if (!lifecycle.active() || !store.hasState() || commits.renderOrUndefined() === undefined) return;
    await commitRuntimeTransition({
      messages: [],
      terminalSize: commits.terminalSize(),
      requestedFocusPath: commits.focusPath(),
      forceFrame: true
    });
  }

  async function processInputEvents(
    events: readonly InputEvent[],
    occurredAt = options.host.clock.monotonicNow(),
    flushCharacterText = false
  ): Promise<TuiInputBatchResult<TState>> {
    lifecycle.assertOperational();
    const results: TuiInputResult<TState>[] = [];
    const routedEvents = routingInputEvents(events, flushCharacterText);
    for (const routedEvent of routedEvents) {
      const event = snapshotInputEvent(routedEvent);
      if (isWheelInputEvent(event)) {
        results.push(...await pointerMotion.flush());
        if (results.at(-1)?.exit !== undefined) break;
        results.push(...await enqueueWheelInput(event));
        if (results.at(-1)?.exit !== undefined) break;
        continue;
      }
      if (isPointerMotionEvent(event)) {
        results.push(...await wheelInput.flush());
        if (results.at(-1)?.exit !== undefined) break;
        enqueuePointerMotion(event, occurredAt);
        continue;
      }
      results.push(...await wheelInput.flush());
      if (results.at(-1)?.exit !== undefined) break;
      results.push(...await pointerMotion.flush());
      if (results.at(-1)?.exit !== undefined) break;
      const result = await handleInputImmediately(
        event,
        occurredAt
      );
      results.push(result);
      if (result.exit !== undefined) break;
    }
    const pending = combinePendingInput(wheelInput.pending(), pointerMotion.pending());
    return {
      results,
      ...(pending === undefined ? {} : { pending })
    };
  }

  function routingInputEvents(
    events: readonly InputEvent[],
    flushCharacterText: boolean
  ): readonly InputEvent[] {
    const boundText = characterTextBindings();
    const routed: InputEvent[] = [];
    const limit = inputPipeline.profile.limits.maxEventsPerBatch;
    let retainedText = pendingCharacterText;
    const push = (event: InputEvent): void => {
      if (routed.length >= limit) {
        throw new InputDecodeError('event_batch_limit_exceeded', limit, routed.length + 1);
      }
      routed.push(event);
    };
    const routeText = (text: string, retainBindingPrefix: boolean): void => {
      const combined = retainedText + text;
      retainedText = '';
      const retainedFrom = retainBindingPrefix
        ? bindingPrefixStart(combined, boundText)
        : undefined;
      const ready = retainedFrom === undefined ? combined : combined.slice(0, retainedFrom);
      if (retainedFrom !== undefined) retainedText = combined.slice(retainedFrom);
      let unmatched = '';
      const flushUnmatched = (): void => {
        if (unmatched.length === 0) return;
        push({ kind: 'text', text: unmatched, paste: false });
        unmatched = '';
      };
      for (const segment of segmentGraphemes(ready)) {
        if (!boundText.has(segment.text)) {
          unmatched += segment.text;
          continue;
        }
        flushUnmatched();
        push({ kind: 'text', text: segment.text, paste: false });
      }
      flushUnmatched();
    };
    try {
      for (const event of events) {
        if (event.kind !== 'text') {
          routeText('', false);
          push(event);
          continue;
        }
        routeText(event.text, true);
      }
      if (flushCharacterText) routeText('', false);
      pendingCharacterText = retainedText;
      return routed;
    } catch (cause) {
      pendingCharacterText = '';
      throw cause;
    }
  }

  function characterTextBindings(): ReadonlySet<string> {
    const bound = new Set<string>();
    for (const binding of options.app.definition.inputBindings ?? []) {
      for (const trigger of binding.triggers) {
        if (trigger.kind === 'text') bound.add(trigger.text);
      }
    }
    const current = commits.renderOrUndefined();
    if (current === undefined) return bound;
    const focused = findRenderNodeFocusTarget(current.node, current.layout, commits.focusPath());
    const keyMap = focused?.renderNode.keyMap;
    if (keyMap?.space !== undefined) bound.add(' ');
    for (const text of Object.keys(keyMap?.text ?? {})) bound.add(text);
    return bound;
  }

  function bindingPrefixStart(value: string, bindings: ReadonlySet<string>): number | undefined {
    let maximumPrefixLength = 0;
    for (const binding of bindings) {
      maximumPrefixLength = Math.max(maximumPrefixLength, binding.length - 1);
    }
    const firstCandidate = Math.max(0, value.length - maximumPrefixLength);
    for (let start = firstCandidate; start < value.length; start += 1) {
      for (const binding of bindings) {
        if (suffixIsStrictBindingPrefix(value, start, binding)) return start;
      }
    }
    return undefined;
  }

  function suffixIsStrictBindingPrefix(value: string, start: number, binding: string): boolean {
    const suffixLength = value.length - start;
    if (suffixLength >= binding.length) return false;
    for (let offset = 0; offset < suffixLength; offset += 1) {
      if (value.charCodeAt(start + offset) !== binding.charCodeAt(offset)) return false;
    }
    return true;
  }

  function enqueuePointerMotion(event: PointerMotionEvent, occurredAt: number): void {
    options.transcript?.record({ kind: 'input', event });
    pointerMotion.enqueue({ event, occurredAt });
  }

  async function enqueueWheelInput(event: MouseWheelEvent): Promise<readonly TuiInputResult<TState>[]> {
    lifecycle.assertOperational();
    metrics.wheelPackets += 1;
    options.transcript?.record({ kind: 'input', event });
    const targetId = pointerRouter.wheelTargetId(commits.render().regions, event);
    return wheelInput.enqueue(event, targetId);
  }

  async function handleWheelInputBatch(batch: WheelInputBatch): Promise<readonly TuiInputResult<TState>[]> {
    lifecycle.assertOperational();
    const state = store.state();
    const frame = commits.frame();
    const messages = pointerRouter.routeWheel(commits.render().regions, batch.event, batch.targetId)
      .flatMap((result) => isIgnoredMessage(result.message) ? [] : [result.message]);
    if (messages.length === 0) {
      return [{ handled: false, state, frame }];
    }
    const nextState = await dispatchManyInternal(messages, 'input');
    const nextFrame = commits.frame();
    return [terminalExit === undefined
      ? { handled: true, state: nextState, frame: nextFrame }
      : { handled: true, state: nextState, frame: nextFrame, exit: terminalExit }];
  }

  async function handleMouseInputInternal(
    event: TerminalMouseEvent,
    occurredAt = options.host.clock.monotonicNow()
  ): Promise<TuiInputResult<TState>> {
    lifecycle.assertOperational();
    const routed = pointerRouter.route(commits.render().regions, event, occurredAt);
    const requestedFocusPath = pointerFocusPath(event, routed);
    const focusChanged = !focusPathsEqual(requestedFocusPath, commits.focusPath());
    const messages = routed.flatMap((result) => isIgnoredMessage(result.message) ? [] : [result.message]);
    if (messages.length > 0 || focusChanged) {
      await commitRuntimeTransition({
        messages: messages.map((message) => ({ message, source: 'input' })),
        terminalSize: commits.terminalSize(),
        requestedFocusPath
      });
    }
    const nextState = store.state();
    const nextFrame = commits.frame();
    const handled = focusChanged || messages.length > 0;
    return terminalExit === undefined
      ? { handled, state: nextState, frame: nextFrame }
      : { handled, state: nextState, frame: nextFrame, exit: terminalExit };
  }

  function pointerFocusPath(
    event: TerminalMouseEvent,
    routed: readonly PointerRouteResult<TMessage>[]
  ): FocusPath | undefined {
    if (event.action !== 'press') return commits.focusPath();
    const intent = routed.find((result) => result.event.kind === 'pointerDown')?.hit?.focus;
    if (intent === undefined || intent.kind === 'preserve') return commits.focusPath();
    return [...intent.path];
  }

  function disposeRuntime(disposeOptions: TuiRuntimeDisposeOptions = {}): Promise<void> {
    let timeoutMs: number;
    try {
      timeoutMs = runtimeDisposalTimeout(disposeOptions.timeoutMs);
    } catch (cause) {
      return Promise.reject(errorFromUnknown(cause));
    }
    return lifecycle.dispose(() => {
      wheelInput.reset();
      inputAmbiguity.cancel();
      const unavailable = runtimePhaseError('disposed');
      pointerMotion.dispose(unavailable);
      resizeCoordinator.dispose(unavailable);
      changes.close(unavailable);
      subscriptions.cancel();
      effects.cancel();
      const cleanup = (async () => {
        const failures: unknown[] = [];
        try {
          await inputQueue.drain();
          await dispatchQueue.drain();
        } catch (cause) {
          failures.push(cause);
        }
        await Promise.allSettled([
          diagnostics.settle(),
          wheelInput.settle(),
          pointerMotion.settle()
        ]);
        const cleanups = await Promise.allSettled([subscriptions.dispose(), effects.dispose()]);
        for (const result of cleanups) {
          if (result.status === 'rejected') failures.push(result.reason);
        }
        if (failures.length > 0) throw new AggregateError(failures, 'TUI runtime disposal failed.');
      })();
      return boundedRuntimeDisposal(cleanup, disposeOptions, timeoutMs);
    });
  }

  function boundedRuntimeDisposal(
    cleanup: Promise<void>,
    disposeOptions: TuiRuntimeDisposeOptions,
    timeoutMs: number
  ): Promise<void> {
    const controller = new AbortController();
    const callerSignal = disposeOptions.signal;
    const abortFromCaller = (): void => {
      if (!controller.signal.aborted) controller.abort(callerSignal?.reason);
    };
    if (callerSignal?.aborted === true) abortFromCaller();
    else callerSignal?.addEventListener('abort', abortFromCaller, { once: true });
    void Promise.resolve()
      .then(() => options.host.clock.sleep(timeoutMs, controller.signal))
      .then(() => {
        if (!controller.signal.aborted) controller.abort(RUNTIME_DISPOSAL_TIMEOUT);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          controller.abort(new TerminalUiError('TUI runtime disposal clock failed.', {
            cause: errorFromUnknown(cause)
          }));
        }
      });
    return raceRuntimeDisposal(cleanup, controller.signal).finally(() => {
      callerSignal?.removeEventListener('abort', abortFromCaller);
      if (!controller.signal.aborted) controller.abort(RUNTIME_DISPOSAL_SETTLED);
    });
  }

  async function moveFocus(direction: 'next' | 'previous'): Promise<Frame> {
    const requestedFocusPath = commits.adjacentFocusPath(direction);
    await commitRuntimeTransition({
      messages: [],
      terminalSize: commits.terminalSize(),
      requestedFocusPath
    });
    return commits.frame();
  }

  function messageForInput(state: TState, event: InputEvent) {
    const current = commits.render();
    return resolveRuntimeInputMessage({
      state,
      event,
      bindings: options.app.definition.inputBindings,
      focusPath: commits.focusPath(),
      renderNode: current.node,
      layout: current.layout
    });
  }

  function recordCommittedRender(render: ReturnType<typeof commits.render>, diff: RenderDiff): void {
    recordTuiCommit(options.transcript, {
      id: render.commitId,
      stateVersion: render.stateVersion,
      terminalSize: render.terminalSize,
      ...(render.frame.focusPath === undefined ? {} : { focusPath: render.frame.focusPath }),
      frame: render.frame,
      diff
    });
  }
}

function runtimeDisposalTimeout(value: number | undefined): number {
  const timeoutMs = value ?? defaultTuiLifecyclePolicy.runtimeDisposalTimeoutMs;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
    throw new RangeError('TUI runtime disposal timeoutMs must be a non-negative finite number.');
  }
  return timeoutMs;
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

function raceRuntimeDisposal(cleanup: Promise<void>, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const aborted = (): void => {
      settle(() => {
        reject(runtimeDisposalAbort(signal));
      });
    };
    const settle = (complete: () => void): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', aborted);
      complete();
    };
    signal.addEventListener('abort', aborted, { once: true });
    cleanup.then(
      () => {
        settle(() => {
          resolve();
        });
      },
      (cause: unknown) => {
        settle(() => {
          reject(errorFromUnknown(cause));
        });
      }
    );
    if (signal.aborted) aborted();
  });
}

function runtimeDisposalAbort(signal: AbortSignal): TerminalUiError {
  if (signal.reason instanceof TerminalUiError) return signal.reason;
  if (signal.reason === RUNTIME_DISPOSAL_TIMEOUT) {
    return new TerminalUiError('TUI runtime disposal timed out.');
  }
  return new TerminalUiError('TUI runtime disposal was cancelled.', {
    cause: signal.reason
  });
}

const RUNTIME_DISPOSAL_TIMEOUT = Symbol('terminal-ui.runtime-disposal-timeout');
const RUNTIME_DISPOSAL_SETTLED = Symbol('terminal-ui.runtime-disposal-settled');
