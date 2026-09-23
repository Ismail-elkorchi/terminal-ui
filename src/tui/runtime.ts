import {
  createInputAmbiguityDeadline,
  createInputPipeline,
  decodeInputEvent,
  InputDecodeError,
} from '../input/index.ts';
import { diagnostic } from '../diagnostics.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import { TerminalUiError, errorFromUnknown } from '../errors.ts';
import { createSerializedDispatchQueue } from './dispatch-queue.ts';
import { createTuiEffectManager } from './effects.ts';
import { completedExitFromSnapshot } from './exit.ts';
import {
  findRenderNodeFocusTarget,
  renderNodeKeyChainForFocus,
  renderNodeLayoutKeyChainForFocus,
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
  resolveRuntimeInputMessage,
  resolvedRenderNodeKeyMap,
} from './runtime-input.ts';
import { inputEventContainsSensitiveText, redactSensitiveInputEvent } from '../input/sensitive.ts';
import { createRuntimeReducer } from './runtime-reducer.ts';
import { createTuiSubscriptionManager } from './subscriptions.ts';
import { createWheelInputCoordinator } from './wheel-input-coordinator.ts';
import { createResizeCoordinator } from './resize-coordinator.ts';
import { createPointerMotionCoordinator } from './pointer-motion-coordinator.ts';
import type { PointerMotionEvent } from './pointer-motion-coordinator.ts';
import type { TerminalCapabilityProfile, TerminalInputChunk, TerminalSize } from '../host/index.ts';
import type { InputPipelineOptions } from '../input/index.ts';
import { decodeTerminalGraphicsMode, resolveGraphicsBudgetLimits } from '../graphics/index.ts';
import type { GraphicsBudgetLimits, TerminalGraphicsMode } from '../graphics/index.ts';
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
import type { PendingTuiMessage, RuntimeReduction } from './runtime-reducer.ts';
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
import { focusRevealMessages } from './focus-reveal.ts';
import { focusLifecycleMessages } from './focus-lifecycle.ts';
import type { FocusLifecycleMessage } from './focus-lifecycle.ts';
import { focusNavigationPath } from '../renderer/internal/focus.ts';
import { assertTuiApp, tuiDefinition } from './definition.ts';
import { decodeMessageResolution, decodeTuiInitialResult } from './hook-results.ts';
import { decodeCopySelectedTextInput } from './selection.ts';
import { decodeTuiTerminalSize } from './terminal-size.ts';

type MutableTuiRuntimeMetrics = {
  -readonly [TKey in Exclude<keyof TuiRuntimeMetrics, 'diagnostics' | 'effects' | 'sources'>]: TuiRuntimeMetrics[TKey];
};

interface RuntimeTransitionInput<TMessage> {
  readonly messages: readonly PendingTuiMessage<TMessage>[];
  readonly terminalSize: TerminalSize;
  readonly requestedFocusPath: FocusPath | undefined;
  readonly forceFrame?: boolean;
}

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
  const reducer = createRuntimeReducer(definition.update, () => {
    metrics.dispatchedMessages += 1;
  });
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
    initial: [...(options.diagnostics ?? []), ...inputPipeline.profile.diagnostics],
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
        resizeInputBarriers.set(ownedSize, inputQueue.drain());
        return resizeCoordinator.request(ownedSize);
      } catch (cause) {
        return Promise.reject(errorFromUnknown(cause));
      }
    },
    async handleInput(rawEvent) {
      const decoded = decodeInputEvent(rawEvent);
      if (decoded.kind === 'resize' || decoded.kind === 'signal' || decoded.kind === 'end') {
        throw new TypeError(`TUI runtime handleInput() does not accept ${decoded.kind} events.`);
      }
      const occurredAt = options.host.clock.monotonicNow();
      return inputQueue.run(() => handleDecodedInput(decoded, occurredAt));
    },
    async handleInputChunk(chunk) {
      const ownedChunk = snapshotInputChunk(chunk);
      const occurredAt = options.host.clock.monotonicNow();
      return inputQueue.run(() => handleInputChunkInternal(ownedChunk, occurredAt));
    },
    async flushInput() {
      return inputQueue.run(flushInputInternal);
    },
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
      return terminalExit;
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
      await inputQueue.drain();
      return dispatchQueue.run(() => {
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
      });
    },
    async resetInput() {
      await inputQueue.drain();
      return dispatchQueue.run(() => {
        lifecycle.assertOperational();
        inputAmbiguity.cancel();
        inputPipeline.reset();
        pendingCharacterText = '';
        wheelInput.reset();
        pointerMotion.reset();
        pointerRouter.reset();
      });
    },
    async suspendOutput() {
      await inputQueue.drain();
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
      diagnostics.record(diagnostic(
        'TUI_TERMINAL_OWNERSHIP_FAILED',
        'Terminal ownership could not be re-established.',
        { severity: 'fatal', target: options.app.id, cause }
      ));
      const render = commits.renderOrUndefined();
      if (commits.hasState() && render !== undefined) {
        terminalExit = {
          status: 'error',
          state: commits.state(),
          diagnostics: diagnostics.values(),
          snapshot: render.frame.accessibility
        };
        changes.publish({ kind: 'exit', exit: terminalExit });
      } else {
        changes.close(new TerminalUiError('Terminal ownership could not be re-established.'));
      }
    }).catch((failure: unknown) => { changes.close(errorFromUnknown(failure)); });
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

  async function enqueueTransition<TValue>(operation: () => Promise<TValue>): Promise<TValue> {
    await inputQueue.drain();
    await wheelInput.flush();
    await pointerMotion.flush();
    return dispatchQueue.run(operation);
  }

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

  async function dispatchManyAdmitted(
    messages: readonly TMessage[],
    source: TuiMessageSource,
    lease: ProducerAdmissionLease,
    redacted = false,
  ): Promise<TState> {
    return lease.authorized() ? dispatchManyInternal(messages, source, redacted) : commits.state();
  }

  async function handleInputImmediately(
    event: InputEvent,
    occurredAt = options.host.clock.monotonicNow()
  ): Promise<TuiInputResult<TState>> {
    return dispatchQueue.run(() => handleInputInTransaction(event, occurredAt));
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
    return terminalExit === undefined
      ? { handled: true, state: nextState, frame: nextFrame }
      : { handled: true, state: nextState, frame: nextFrame, exit: terminalExit };
  }

  async function startInternal(): Promise<Frame> {
    try {
      const context = await createRuntimeContext();
      const initial = decodeTuiInitialResult<TState, TMessage>(definition.init(context));
      const subscriptionPlan = await subscriptions.plan(initial.state, context);
      const result = await commits.initial(initial.state, context, commits.version(), initial.focus ?? options.initialFocus);
      commits.publish(result, initial.state, 0);
      if (lifecycle.phase() === 'starting') lifecycle.activate();
      metrics.frameCommits += 1;
      recordCommittedRender(result.render, result.diff);
      if (lifecycle.active()) runPostCommit('subscription_activation', () => {
        subscriptions.activate(subscriptionPlan);
      });
      for (const item of result.diagnostics) diagnostics.report(item);
      changes.publish({
        kind: 'frame',
        commitId: result.render.commitId,
        stateVersion: result.render.stateVersion,
        frame: result.render.frame
      });
      const focusMessages = resolvePostCommitMessages('focus_lifecycle_mapping', () => focusLifecycleMessages<TMessage>({
        next: {
          node: result.render.node,
          layout: result.render.layout,
          ...(result.render.frame.focusPath === undefined
            ? {}
            : { focusPath: result.render.frame.focusPath }),
        },
      }));
      if (focusMessages.length > 0 && lifecycle.active()) {
        await dispatchPostCommitMessages(focusMessages, 'focus_lifecycle');
      }
      if (initial.exit !== undefined) {
        lifecycle.beginExit();
        subscriptions.cancel();
        effects.cancel();
        terminalExit = {
          ...completedExitFromSnapshot(
            initial.state,
            result.render.frame.accessibility,
            initial.exit.reason,
          ),
          diagnostics: diagnostics.values(),
        };
        changes.publish({ kind: 'exit', exit: terminalExit });
      } else if (initial.effects !== undefined && lifecycle.active()) {
        const initialEffects = initial.effects;
        runPostCommit('effect_start', () => {
          effects.start(initialEffects);
        });
      }
      return commits.frame();
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

  async function commitRuntimeTransition(input: RuntimeTransitionInput<TMessage>): Promise<TState> {
    const context = await createRuntimeContext(input.terminalSize);
    return commitRuntimeTransitionInContext(input, context);
  }

  async function commitRuntimeTransitionInContext(
    input: RuntimeTransitionInput<TMessage>,
    context: TuiContext
  ): Promise<TState> {
    lifecycle.assertOperational();
    const reduction = reducer.reduce(commits.state(), commits.version(), input.messages, context);
    const terminalSize = commits.terminalSize();
    const terminalSizeChanged = !sameTerminalSize(input.terminalSize, terminalSize);
    const focusChanged = !focusPathsEqual(input.requestedFocusPath, commits.focusPath());
    const requiresFrame = input.forceFrame === true
      || reduction.stateVersion !== commits.version()
      || terminalSizeChanged
      || focusChanged
      || reduction.focus !== undefined;
    if (!requiresFrame) {
      commits.publishWithoutFrame(reduction.state, reduction.stateVersion);
      recordReductionMessages(reduction);
      const exit = completeReduction(reduction, commits.frame());
      if (exit !== undefined) changes.publish({ kind: 'exit', exit });
      if (reduction.exitReason === undefined && lifecycle.active()) {
        runPostCommit('effect_cancellation', () => { effects.cancelIds(reduction.cancelEffects); });
        runPostCommit('effect_start', () => { startReductionEffects(reduction); });
      }
      return commits.state();
    }

    const previousRender = commits.render();
    const subscriptionPlan = reduction.exitReason === undefined
      ? await subscriptions.plan(reduction.state, context)
      : undefined;
    lifecycle.assertOperational();
    const result = await commits.transition(
      reduction.state,
      context,
      input.terminalSize,
      input.requestedFocusPath,
      reduction.stateVersion,
      reduction.focus,
    );
    commits.publish(result, reduction.state, reduction.stateVersion);
    metrics.frameCommits += 1;
    recordReductionMessages(reduction);
    recordCommittedRender(result.render, result.diff);
    for (const item of result.diagnostics) diagnostics.report(item);
    const exit = completeReduction(reduction, result.render.frame);
    changes.publish({
      kind: 'frame',
      commitId: result.render.commitId,
      stateVersion: result.render.stateVersion,
      frame: result.render.frame
    });
    if (exit !== undefined) changes.publish({ kind: 'exit', exit });
    if (subscriptionPlan !== undefined && lifecycle.active()) {
      runPostCommit('subscription_activation', () => { subscriptions.activate(subscriptionPlan); });
    }
    if (reduction.exitReason === undefined && lifecycle.active()) {
      runPostCommit('effect_cancellation', () => { effects.cancelIds(reduction.cancelEffects); });
      const focusMessages = resolvePostCommitMessages('focus_lifecycle_mapping', () => focusLifecycleMessages<TMessage>({
        previous: {
          node: previousRender.node,
          layout: previousRender.layout,
          ...(previousRender.frame.focusPath === undefined
            ? {}
            : { focusPath: previousRender.frame.focusPath }),
        },
        next: {
          node: result.render.node,
          layout: result.render.layout,
          ...(result.render.frame.focusPath === undefined
            ? {}
            : { focusPath: result.render.frame.focusPath }),
        },
      }));
      if (focusMessages.length > 0) await dispatchPostCommitMessages(focusMessages, 'focus_lifecycle');
      if (terminalExit === undefined && lifecycle.active()) {
        runPostCommit('effect_start', () => { startReductionEffects(reduction); });
      }
    }
    return commits.state();
  }

  function sameTerminalSize(
    left: TerminalSize,
    right: TerminalSize
  ): boolean {
    return left.columns === right.columns && left.rows === right.rows;
  }

  function recordReductionMessages(reduction: RuntimeReduction<TState, TMessage>): void {
    for (const item of reduction.messages) {
      runInstrumentation('transcript_message', () => options.transcript?.recordNormalizedMessage(
        item.source,
        item.redacted === true ? '[redacted]' : item.message
      ));
    }
  }

  function startReductionEffects(reduction: RuntimeReduction<TState, TMessage>): void {
    reduction.effects.forEach((effect, index) => {
      effects.start([effect], reduction.effectOrigins[index] === true);
    });
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
    if (lifecycle.phase() === 'failed') return undefined;
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
    if (!lifecycle.active() || !commits.hasState() || commits.renderOrUndefined() === undefined) return;
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
    let bindingRender = commits.renderOrUndefined();
    let bindingFocus = commits.focusPath();
    let cachedBindings: ReadonlySet<string> | undefined;
    const currentBindings = (): ReadonlySet<string> => {
      const render = commits.renderOrUndefined();
      const focus = commits.focusPath();
      if (cachedBindings === undefined || render !== bindingRender || focus !== bindingFocus) {
        cachedBindings = characterTextBindings();
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
        results.push(await handleInputInTransaction({ kind: 'text', text: value, paste: false }, occurredAt));
        index = match ? nextIndex : index + 1;
      }
    };
    for (const event of events) {
      if (event.kind === 'text') await routeText(event.text, true);
      else {
        if (pendingCharacterText.length > 0) await routeText('', false);
        if (!inputResultsExit(results)) results.push(await handleInputInTransaction(event, occurredAt));
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
      const results = [...flushed, ...await enqueueWheelInput(event)];
      return { results, consumed: 1, exit: inputResultsExit(results) };
    }
    if (isPointerMotionEvent(event)) {
      const results = await flushInputCoordinators(true, false);
      if (!inputResultsExit(results)) enqueuePointerMotion(event, occurredAt);
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

  function suffixIsStrictBindingPrefix(value: string, start: number, binding: string): boolean {
    const suffixLength = value.length - start;
    if (suffixLength >= binding.length) return false;
    for (let offset = 0; offset < suffixLength; offset += 1) {
      if (value.charCodeAt(start + offset) !== binding.charCodeAt(offset)) return false;
    }
    return true;
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
        const cleanups = await Promise.allSettled([subscriptions.dispose(), effects.dispose(), commits.dispose()]);
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
      .then((outcome) => {
        if (outcome === 'elapsed') controller.abort(RUNTIME_DISPOSAL_TIMEOUT);
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

  function recordCommittedRender(render: ReturnType<typeof commits.render>, diff: RenderDiff): void {
    runInstrumentation('transcript_commit', () => {
      recordTuiCommit(options.transcript, {
        id: render.commitId,
        stateVersion: render.stateVersion,
        terminalSize: render.terminalSize,
        ...(render.frame.focusPath === undefined ? {} : { focusPath: render.frame.focusPath }),
        frame: render.frame,
        diff
      });
    });
  }

  async function dispatchPostCommitMessages(
    messages: readonly FocusLifecycleMessage<TMessage>[], taskName: string
  ): Promise<void> {
    try {
      await commitRuntimeTransition({
        messages: messages.map(({ message, sensitiveOrigin }) => ({
          message,
          source: 'input',
          ...(sensitiveOrigin ? { redacted: true } : {}),
        })),
        terminalSize: commits.terminalSize(),
        requestedFocusPath: commits.focusPath(),
      });
    } catch (cause) {
      diagnostics.record(diagnostic('TUI_RUNTIME_TASK_FAILED', `TUI runtime task ${taskName} failed.`, {
        target: options.app.id,
        cause,
        data: { taskName }
      }));
    }
  }

  function runPostCommit(taskName: string, operation: () => void): void {
    try {
      operation();
    } catch (cause) {
      diagnostics.record(diagnostic('TUI_RUNTIME_TASK_FAILED', `TUI runtime task ${taskName} failed.`, {
        target: options.app.id,
        cause,
        data: { taskName }
      }));
    }
  }

  function resolvePostCommitMessages<TValue>(taskName: string, operation: () => readonly TValue[]): readonly TValue[] {
    try {
      return operation();
    } catch (cause) {
      diagnostics.record(diagnostic('TUI_RUNTIME_TASK_FAILED', `TUI runtime task ${taskName} failed.`, {
        target: options.app.id,
        cause,
        data: { taskName }
      }));
      return [];
    }
  }

  function runInstrumentation(taskName: string, operation: () => void): void {
    try {
      operation();
    } catch (cause) {
      diagnostics.record(diagnostic('TUI_RUNTIME_TASK_FAILED', `TUI instrumentation ${taskName} failed.`, {
        severity: 'warning',
        target: options.app.id,
        cause,
        data: { taskName }
      }));
    }
  }
}

function ignoreTerminalDiagnostic(item: TerminalDiagnostic): void {
  void item;
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
