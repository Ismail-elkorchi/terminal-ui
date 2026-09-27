import type { TerminalDiagnostic } from '../diagnostics.ts';
import { diagnostic } from '../diagnostics.ts';
import { errorFromUnknown } from '../errors.ts';
import type { TerminalSize } from '../geometry/types.ts';
import type { GraphicsBudgetLimits } from '../graphics/budget.ts';
import { resolveGraphicsBudgetLimits } from '../graphics/budget.ts';
import { decodeTerminalGraphicsMode } from '../graphics/mode.ts';
import type { TerminalGraphicsMode } from '../graphics/types.ts';
import type { TerminalCapabilityProfile } from '../host/capability-types.ts';
import type { InputPipelineOptions } from '../input/pipeline.ts';
import { inputEventContainsSensitiveText, redactSensitiveInputEvent } from '../input/sensitive.ts';
import type {
  InputEvent,
  MouseWheelEvent,
  MouseEvent as TerminalMouseEvent,
} from '../input/types.ts';
import type { FocusPath } from '../interaction/focus.ts';
import { focusPathsEqual } from '../interaction/focus.ts';
import type { TuiMessageSource } from '../interaction/message.ts';
import { isIgnoredMessage } from '../interaction/message.ts';
import type { Frame } from '../renderer/contracts.ts';
import {
  findRenderNodeFocusTarget,
  focusNavigationPath,
  renderNodeKeyChainForFocus,
  renderNodeLayoutKeyChainForFocus,
} from '../renderer/internal/focus.ts';
import type { PointerRouteResult } from '../renderer/internal/pointer-router.ts';
import { createPointerRouter } from '../renderer/internal/pointer-router.ts';
import { assertTuiApp, tuiDefinition } from './definition.ts';
import { createSerializedDispatchQueue } from './dispatch-queue.ts';
import { createTuiEffectManager } from './lifecycle/effects.ts';
import { focusRevealMessages } from './lifecycle/focus-reveal.ts';
import { decodeMessageResolution } from './hook-results.ts';
import { createRuntimeInputSession } from './input/input-session.ts';
import type { PointerMotionEvent } from './input/pointer-motion-coordinator.ts';
import { createPointerMotionCoordinator } from './input/pointer-motion-coordinator.ts';
import type { ProducerAdmissionLease } from './lifecycle/producer-admission.ts';
import { createResizeCoordinator } from './input/resize-coordinator.ts';
import { createRuntimeChangeChannel } from './runtime-change-channel.ts';
import { createRuntimeCommitCoordinator } from './commit/runtime-commit-coordinator.ts';
import { createRuntimeContextFactory } from './runtime-context.ts';
import { createRuntimeDiagnostics } from './runtime-diagnostics.ts';
import { createRuntimeDisposal } from './lifecycle/runtime-disposal.ts';
import { resolveRuntimeInputMessage, resolvedRenderNodeKeyMap } from './input/runtime-input.ts';
import { createRuntimeLifecycle } from './lifecycle/runtime-lifecycle.ts';
import type { PendingTuiMessage } from './commit/runtime-reducer.ts';
import { createRuntimeTransitions } from './commit/runtime-transitions.ts';
import { decodeCopySelectedTextInput } from './selection.ts';
import { createTuiSubscriptionManager } from './lifecycle/subscriptions.ts';
import { decodeTuiTerminalSize, sameTerminalSize } from './terminal-size.ts';
import type {
  TuiContext,
  TuiInputResult,
  TuiRuntime,
  TuiRuntimeMetrics,
  TuiRuntimeOptions,
} from './types.ts';
import type { WheelInputBatch } from './input/wheel-input-batch.ts';
import { createWheelInputCoordinator } from './input/wheel-input-coordinator.ts';

type MutableTuiRuntimeMetrics = {
  -readonly [TKey in Exclude<keyof TuiRuntimeMetrics, 'diagnostics' | 'effects' | 'sources'>]: TuiRuntimeMetrics[TKey];
};

const inputRetirement = new WeakMap<object, () => void>();
const terminalFailure = new WeakMap<object, (cause: unknown) => void>();
const runtimeRunners = new WeakMap<object, TuiRuntimeRunner>();

export interface TuiRuntimeRunner {
  replaceTerminalProfile(options: InputPipelineOptions & { readonly capabilities: TerminalCapabilityProfile }): Promise<void>;
  resetInput(): Promise<void>;
  suspendOutput(): Promise<void>;
  resumeOutput(): Promise<void>;
}

export function tuiRuntimeRunner(runtime: object): TuiRuntimeRunner {
  const runner = runtimeRunners.get(runtime);
  if (runner === undefined) throw new Error('Expected a terminal-ui TUI runtime.');
  return runner;
}

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
  assertTuiApp(options.app);
  return createRuntime(
    options,
    undefined,
    decodeTerminalGraphicsMode(options.graphics),
    resolveGraphicsBudgetLimits(options.graphicsBudget),
  );
}

export function createTuiRuntimeWithCapabilitySnapshot<TState, TMessage>(
  options: TuiRuntimeOptions<TState, TMessage>,
  capabilities: TerminalCapabilityProfile
): TuiRuntime<TState, TMessage> {
  return createRuntime(
    options,
    capabilities,
    options.graphics ?? 'none',
    resolveGraphicsBudgetLimits(options.graphicsBudget),
  );
}

function createRuntime<TState, TMessage>(
  options: TuiRuntimeOptions<TState, TMessage>,
  capabilities: TerminalCapabilityProfile | undefined,
  graphics: TerminalGraphicsMode,
  graphicsBudget: GraphicsBudgetLimits,
): TuiRuntime<TState, TMessage> {
  const definition = tuiDefinition(options.app);
  const pointerRouter = createPointerRouter<TMessage>({ now: () => options.host.clock.monotonicNow() });
  const metrics: MutableTuiRuntimeMetrics = {
    decodedInputEvents: 0,
    wheelPackets: 0,
    dispatchedMessages: 0,
    frameCommits: 0
  };
  const dispatchQueue = createSerializedDispatchQueue();
  const lifecycle = createRuntimeLifecycle<Frame>();
  let recordGraphicsDiagnostic: (item: TerminalDiagnostic) => void = ignoreTerminalDiagnostic;
  const commits = createRuntimeCommitCoordinator({
    ...options,
    initialTerminalSize: decodeTuiTerminalSize(options.host.getTerminalSize()),
    graphics,
    graphicsBudget,
    reportDiagnostic: (item) => { recordGraphicsDiagnostic(item); },
    pointerVisuals: () => pointerRouter.visuals(),
  }, lifecycle.signal);
  const runtimeContext = createRuntimeContextFactory(options.host, capabilities);
  const changes = createRuntimeChangeChannel<TState>();
  const diagnostics = createRuntimeDiagnostics({
    owner: options.app.id,
    initial: options.diagnostics ?? [],
    ...(options.transcript === undefined ? {} : { transcript: options.transcript }),
    active: () => lifecycle.active(),
    canRefresh: () => commits.hasState() && commits.renderOrUndefined() !== undefined,
    refresh: () => enqueueTransition(refreshAfterDiagnostic)
  });
  recordGraphicsDiagnostic = (item) => { diagnostics.record(item); };
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
  const inputSession = createRuntimeInputSession<TState>({
    clock: options.host.clock,
    ...(options.input === undefined ? {} : { pipeline: options.input }),
    transaction: dispatchQueue,
    assertOperational: () => { lifecycle.assertOperational(); },
    dispatch: handleInputInTransaction,
    bindingState: () => ({ render: commits.renderOrUndefined(), focus: commits.focusPath() }),
    characterBindings: characterTextBindings,
    recordDecoded: (count) => { metrics.decodedInputEvents += count; },
    wheel: wheelInput,
    pointer: pointerMotion,
    enqueueWheel: enqueueWheelInput,
    enqueueMotion: enqueuePointerMotion,
  });
  for (const item of inputSession.diagnostics()) diagnostics.record(item);
  const resizeInputBarriers = new WeakMap<TerminalSize, Promise<void>>();
  const resizeCoordinator = createResizeCoordinator(async (terminalSize: TerminalSize) => {
    await resizeInputBarriers.get(terminalSize);
    await wheelInput.flush();
    await pointerMotion.flush();
    return dispatchQueue.run(() => resizeInternal(terminalSize));
  });
  const subscriptions = createTuiSubscriptionManager<TState, TMessage>({
    ...(definition.subscriptions === undefined
      ? {}
      : { subscriptions: definition.subscriptions }),
    context: createRuntimeContext,
    reportDiagnostic: (item) => diagnostics.report(item),
    dispatchMany(messages, source, lease) {
      return enqueueTransition(() => dispatchManyAdmitted(messages, source, lease)).then(() => undefined);
    }
  });
  const effects = createTuiEffectManager<TMessage>({
    clock: options.host.clock,
    context: createRuntimeContext,
    reportDiagnostic: (item) => diagnostics.report(item),
    copySelectedText(input, signal) {
      return dispatchQueue.run(async () => {
        const context = await createRuntimeContext();
        return commits.copySelectedText(input, context.capabilities, signal);
      });
    },
    dispatch(messages, lease, redacted) {
      return enqueueTransition(() => dispatchManyAdmitted(
        messages, 'effect', lease, redacted
      )).then(() => undefined);
    },
    ...(options.withTerminalSuspended === undefined
      ? {}
      : { withTerminalSuspended: options.withTerminalSuspended }),
    ...(options.effectPolicy === undefined ? {} : { policy: options.effectPolicy })
  });

  const transitions = createRuntimeTransitions({
    owner: options.app.id,
    definition,
    ...(options.initialFocus === undefined ? {} : { initialFocus: options.initialFocus }),
    ...(options.transcript === undefined ? {} : { transcript: options.transcript }),
    lifecycle, commits, subscriptions, effects, diagnostics, changes,
    context: createRuntimeContext,
    recordMessage: () => { metrics.dispatchedMessages += 1; },
    recordFrameCommit: () => { metrics.frameCommits += 1; },
  });
  const {
    start: startInternal,
    commit: commitRuntimeTransition,
    commitInContext: commitRuntimeTransitionInContext,
    instrument: runInstrumentation,
  } = transitions;

  const disposeRuntime = createRuntimeDisposal({
    clock: options.host.clock,
    lifecycle,
    stop(unavailable) {
      wheelInput.reset();
      inputSession.cancel();
      pointerMotion.dispose(unavailable);
      resizeCoordinator.dispose(unavailable);
      changes.close(unavailable);
      subscriptions.cancel();
      effects.cancel();
    },
    async drain() {
      await inputSession.drain();
      await dispatchQueue.drain();
    },
    settle: [() => diagnostics.settle(), () => wheelInput.settle(), () => pointerMotion.settle()],
    resources: [() => subscriptions.dispose(), () => effects.dispose(), () => commits.dispose()],
  });

  const runtime: TuiRuntime<TState, TMessage> = {
    start() {
      return lifecycle.start(() => dispatchQueue.run(startInternal));
    },
    dispatch(message) {
      if (message === null || message === undefined) {
        return Promise.reject(new TypeError('TUI runtime dispatch() message cannot be null or undefined.'));
      }
      return enqueueTransition(() => dispatchInternal(message, 'external'));
    },
    dispatchMany(messages) {
      const suppliedMessages: readonly TMessage[] = messages;
      const candidate: unknown = suppliedMessages;
      if (!Array.isArray(candidate)) {
        return Promise.reject(new TypeError('TUI runtime dispatchMany() messages must be an array.'));
      }
      if (suppliedMessages.some((message) => message === null || message === undefined)) {
        return Promise.reject(new TypeError('TUI runtime dispatchMany() messages cannot contain null or undefined.'));
      }
      const ownedMessages = Object.freeze([...suppliedMessages]);
      return enqueueTransition(() => ownedMessages.length === 0
        ? operationalState()
        : dispatchManyInternal(ownedMessages, 'external'));
    },
    copySelectedText(input) {
      let request: ReturnType<typeof decodeCopySelectedTextInput>;
      try {
        request = decodeCopySelectedTextInput(input);
      } catch (cause) {
        return Promise.reject(errorFromUnknown(cause));
      }
      return enqueueTransition(async () => {
        lifecycle.assertOperational();
        const context = await createRuntimeContext();
        return commits.copySelectedText(request, context.capabilities);
      });
    },
    resize(terminalSize) {
      try {
        const ownedSize = decodeTuiTerminalSize(terminalSize);
        resizeInputBarriers.set(ownedSize, inputSession.drain());
        return resizeCoordinator.request(ownedSize);
      } catch (cause) {
        return Promise.reject(errorFromUnknown(cause));
      }
    },
    handleInput: inputSession.handleInput,
    handleInputChunk: inputSession.handleInputChunk,
    flushInput: inputSession.flush,
    redraw() {
      return enqueueTransition(async () => {
        const terminalSize = decodeTuiTerminalSize(options.host.getTerminalSize());
        if (!sameTerminalSize(terminalSize, commits.terminalSize())) {
          return resizeInternal(terminalSize);
        }
        await commitRuntimeTransition({
          messages: [],
          terminalSize,
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
      return commits.state();
    },
    frame() {
      return commits.renderOrUndefined()?.frame;
    },
    exit() {
      return transitions.exit();
    },
    diagnostics() {
      return diagnostics.values();
    },
    reportDiagnostic(item) {
      return diagnostics.report(item);
    },
    metrics() {
      return {
        ...metrics,
        diagnostics: { retained: diagnostics.values().length, omitted: diagnostics.omitted() },
        effects: effects.metrics(),
        sources: subscriptions.metrics()
      };
    }
  };
  runtimeRunners.set(runtime, {
    async replaceTerminalProfile(nextOptions) {
      await inputSession.drain();
      return dispatchQueue.run(() => {
        lifecycle.assertOperational();
        inputSession.replaceProfile(nextOptions);
        runtimeContext.replace(nextOptions.capabilities);
        for (const item of inputSession.diagnostics()) diagnostics.report(item);
      });
    },
    async resetInput() {
      await inputSession.drain();
      return dispatchQueue.run(() => {
        lifecycle.assertOperational();
        inputSession.reset();
        wheelInput.reset();
        pointerMotion.reset();
        pointerRouter.reset();
      });
    },
    async suspendOutput() {
      await inputSession.drain();
      await wheelInput.flush();
      await pointerMotion.flush();
      return dispatchQueue.run(async () => {
        lifecycle.assertOperational();
        await commits.suspendOutput();
      });
    },
    resumeOutput() {
      return dispatchQueue.run(() => {
        lifecycle.assertOperational();
        commits.resumeOutput();
      });
    }
  });
  terminalFailure.set(runtime, (cause) => {
    lifecycle.fail();
    subscriptions.cancel();
    effects.cancel();
    void dispatchQueue.run(() => {
      transitions.failTerminalOwnership(cause);
    }).catch((failure: unknown) => { changes.close(errorFromUnknown(failure)); });
  });
  inputRetirement.set(runtime, () => {
    inputSession.reset();
    wheelInput.reset();
    pointerMotion.reset();
    pointerRouter.reset();
    lifecycle.retire();
  });
  return runtime;

  async function enqueueTransition<TValue>(operation: () => Promise<TValue>): Promise<TValue> {
    await inputSession.drain();
    await wheelInput.flush();
    await pointerMotion.flush();
    return dispatchQueue.run(operation);
  }

  async function dispatchManyAdmitted(
    messages: readonly TMessage[],
    source: TuiMessageSource,
    lease: ProducerAdmissionLease,
    redacted = false,
  ): Promise<TState> {
    return lease.authorized() ? dispatchManyInternal(messages, source, redacted) : commits.state();
  }

  async function handleInputInTransaction(
    event: InputEvent,
    occurredAt: number
  ): Promise<TuiInputResult<TState>> {
    if (event.kind === 'mouse') {
      runInstrumentation('transcript_input', () => options.transcript?.record({ kind: 'input', event }));
      return handleMouseInputInternal(event, occurredAt);
    }
    lifecycle.assertOperational();
    const sensitiveOrigin = focusedInputIsSensitive();
    const redactInput = sensitiveOrigin && inputEventContainsSensitiveText(event);
    runInstrumentation('transcript_input', () => options.transcript?.record({
      kind: 'input',
      event: redactInput ? redactSensitiveInputEvent(event) : event
    }));
    if (event.kind === 'focus' && !event.focused) {
      const pointerSnapshot = pointerRouter.snapshot();
      try {
        const cancelled = pendingPointerMessages(pointerRouter.cancel(commits.render().regions));
        const pointerChanged = pointerRouter.revision() !== pointerSnapshot.visualRevision;
        if (cancelled.length > 0 || pointerChanged) {
          await commitRuntimeTransition({
            messages: cancelled,
            terminalSize: commits.terminalSize(),
            requestedFocusPath: commits.focusPath(),
            forceFrame: pointerChanged,
          });
        }
      } catch (cause) {
        pointerRouter.restore(pointerSnapshot);
        throw cause;
      }
    }
    return handleResolvedInput(event, messageForInput(commits.state(), event), sensitiveOrigin);
  }

  async function handleResolvedInput(
    event: InputEvent,
    message: ReturnType<typeof messageForInput>,
    sensitiveOrigin: boolean,
  ): Promise<TuiInputResult<TState>> {
    const state = commits.state();
    const frame = commits.frame();
    if (isIgnoredMessage(message)) {
      if (event.kind === 'key' && event.eventType === 'press') {
        const key = event.key;
        if (key === 'arrowLeft' || key === 'arrowRight' || key === 'arrowUp'
          || key === 'arrowDown' || key === 'home' || key === 'end') {
          const current = commits.render();
          const requested = focusNavigationPath(current.layout, commits.focusPath(), key);
          if (requested !== undefined) {
            const next = await moveFocusTo(requested);
            return { handled: true, state: commits.state(), frame: next };
          }
        }
      }
      if (event.kind === 'key' && event.key === 'tab' && event.eventType === 'press') {
        const next = await moveFocus(event.modifiers.shift ? 'previous' : 'next');
        return { handled: true, state: commits.state(), frame: next };
      }
      return { handled: false, state, frame };
    }
    const nextState = await dispatchInternal(message, 'input', sensitiveOrigin);
    const nextFrame = commits.frame();
    const terminalExit = transitions.exit();
    return terminalExit === undefined
      ? { handled: true, state: nextState, frame: nextFrame }
      : { handled: true, state: nextState, frame: nextFrame, exit: terminalExit };
  }

  async function dispatchInternal(
    message: TMessage,
    source: TuiMessageSource,
    redacted = false
  ): Promise<TState> {
    return dispatchManyInternal([message], source, redacted);
  }

  function operationalState(): Promise<TState> {
    lifecycle.assertOperational();
    return Promise.resolve(commits.state());
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

  async function resizeInternal(terminalSize: TerminalSize): Promise<Frame> {
    lifecycle.assertOperational();
    const previousTerminalSize = commits.terminalSize();
    runInstrumentation('transcript_input', () => options.transcript?.record({
      kind: 'input',
      event: { kind: 'resize', terminalSize }
    }));
    if (sameTerminalSize(terminalSize, previousTerminalSize)) return commits.frame();
    const context = await createRuntimeContext(terminalSize);
    lifecycle.assertOperational();
    const resolution = definition.resizeMessage === undefined
      ? undefined
      : decodeMessageResolution<TMessage>(
          definition.resizeMessage(commits.state(), Object.freeze({
            ...context,
            previousTerminalSize
          })),
          'TUI resizeMessage'
        );
    const messages: readonly PendingTuiMessage<TMessage>[] = resolution === undefined || isIgnoredMessage(resolution)
      ? Object.freeze([])
      : Object.freeze([{ message: resolution, source: 'signal' }]);
    await commitRuntimeTransitionInContext(
      { messages, terminalSize, requestedFocusPath: commits.focusPath() },
      context
    );
    return commits.frame();
  }

  async function createRuntimeContext(
    terminalSize: TerminalSize = commits.terminalSize()
  ): Promise<TuiContext> {
    return runtimeContext.create(terminalSize, diagnostics.values());
  }

  function focusedInputIsSensitive(): boolean {
    const current = commits.renderOrUndefined();
    if (current === undefined) return false;
    return renderNodeKeyChainForFocus(current.node, current.layout, commits.focusPath())
      .some((node) => node.kind === 'component' && node.definition.sensitiveInput);
  }

  async function refreshAfterDiagnostic(): Promise<void> {
    if (!lifecycle.active() || !commits.hasState() || commits.renderOrUndefined() === undefined) return;
    await commitRuntimeTransition({
      messages: [],
      terminalSize: commits.terminalSize(),
      requestedFocusPath: commits.focusPath(),
      forceFrame: true
    });
  }

  function characterTextBindings(): ReadonlySet<string> {
    const bound = new Set<string>();
    for (const binding of definition.inputBindings ?? []) {
      for (const trigger of binding.triggers) {
        if (trigger.kind === 'text') bound.add(trigger.text);
      }
    }
    const current = commits.renderOrUndefined();
    if (current === undefined) return bound;
    const focused = findRenderNodeFocusTarget(current.node, current.layout, commits.focusPath());
    const focusedLayout = focused === undefined
      ? undefined
      : renderNodeLayoutKeyChainForFocus(current.node, current.layout, commits.focusPath())
          .find((target) => target.renderNode === focused.renderNode);
    const keyMap = focusedLayout === undefined
      ? undefined
      : resolvedRenderNodeKeyMap(
          focusedLayout.renderNode,
          focusedLayout.layoutNode,
          focusedLayout.path,
          commits.focusPath(),
          current.theme,
          current.frame.widthProfile,
        );
    if (keyMap?.space !== undefined) bound.add(' ');
    for (const text of Object.keys(keyMap?.text ?? {})) bound.add(text);
    return bound;
  }

  function enqueuePointerMotion(event: PointerMotionEvent, occurredAt: number): void {
    runInstrumentation('transcript_input', () => options.transcript?.record({ kind: 'input', event }));
    pointerMotion.enqueue({ event, occurredAt });
  }

  async function enqueueWheelInput(event: MouseWheelEvent): Promise<readonly TuiInputResult<TState>[]> {
    const targetId = await dispatchQueue.run(() => {
      lifecycle.assertOperational();
      metrics.wheelPackets += 1;
      runInstrumentation('transcript_input', () => options.transcript?.record({ kind: 'input', event }));
      return pointerRouter.wheelTargetId(commits.render().regions, event);
    });
    return wheelInput.enqueue(event, targetId);
  }

  async function handleWheelInputBatch(batch: WheelInputBatch): Promise<readonly TuiInputResult<TState>[]> {
    lifecycle.assertOperational();
    const state = commits.state();
    const frame = commits.frame();
    const messages = pendingPointerMessages(pointerRouter.routeWheel(commits.render().regions, batch.event, batch.targetId));
    if (messages.length === 0) {
      return [{ handled: false, state, frame }];
    }
    const nextState = await commitRuntimeTransition({
      messages,
      terminalSize: commits.terminalSize(),
      requestedFocusPath: commits.focusPath(),
    });
    const nextFrame = commits.frame();
    const terminalExit = transitions.exit();
    return [terminalExit === undefined
      ? { handled: true, state: nextState, frame: nextFrame }
      : { handled: true, state: nextState, frame: nextFrame, exit: terminalExit }];
  }

  async function handleMouseInputInternal(
    event: TerminalMouseEvent,
    occurredAt = options.host.clock.monotonicNow()
  ): Promise<TuiInputResult<TState>> {
    lifecycle.assertOperational();
    const pointerSnapshot = pointerRouter.snapshot();
    try {
      const routed = pointerRouter.route(commits.render().regions, event, occurredAt);
      const pointerChanged = pointerRouter.revision() !== pointerSnapshot.visualRevision;
      const requestedFocusPath = pointerFocusPath(event, routed);
      const focusChanged = !focusPathsEqual(requestedFocusPath, commits.focusPath());
      const messages = pendingPointerMessages(routed);
      if (messages.length > 0 || focusChanged || pointerChanged) {
        await commitRuntimeTransition({
          messages,
          terminalSize: commits.terminalSize(),
          requestedFocusPath,
          forceFrame: pointerChanged,
        });
      }
      const nextState = commits.state();
      const nextFrame = commits.frame();
      const handled = focusChanged || pointerChanged || messages.length > 0;
      const terminalExit = transitions.exit();
    return terminalExit === undefined
        ? { handled, state: nextState, frame: nextFrame }
        : { handled, state: nextState, frame: nextFrame, exit: terminalExit };
    } catch (cause) {
      pointerRouter.restore(pointerSnapshot);
      throw cause;
    }
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

  function pendingPointerMessages(routed: readonly PointerRouteResult<TMessage>[]): readonly PendingTuiMessage<TMessage>[] {
    return routed.flatMap((result) => isIgnoredMessage(result.message)
      ? []
      : [{
        message: result.message,
        source: 'input' as const,
        ...(result.hit?.sensitiveOrigin === true ? { redacted: true } : {}),
      }]);
  }

  async function moveFocus(direction: 'next' | 'previous'): Promise<Frame> {
    const requestedFocusPath = commits.adjacentFocusPath(direction);
    return moveFocusTo(requestedFocusPath);
  }

  async function moveFocusTo(requestedFocusPath: FocusPath | undefined): Promise<Frame> {
    const current = commits.render();
    const messages = focusRevealMessages(current.node, current.layout, requestedFocusPath);
    const sensitiveOrigin = focusedInputIsSensitive();
    await commitRuntimeTransition({
      messages: messages.map((message) => ({ message, source: 'input', ...(sensitiveOrigin ? { redacted: true } : {}) })),
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
      bindings: definition.inputBindings,
      focusPath: commits.focusPath(),
      renderNode: current.node,
      layout: current.layout,
      theme: current.theme,
      widthProfile: current.frame.widthProfile,
    });
  }
}

function ignoreTerminalDiagnostic(item: TerminalDiagnostic): void {
  void item;
}
