import { createInputAmbiguityDeadline, createInputPipeline, matchesInputTrigger } from '../input/index.ts';
import { diagnostic } from '../diagnostics.ts';
import { TerminalUiError, errorFromUnknown } from '../errors.ts';
import { createTuiContext } from './context.ts';
import { createSerializedDispatchQueue } from './dispatch-queue.ts';
import { createTuiEffectManager } from './effects.ts';
import { completedExitFromSnapshot } from './exit.ts';
import {
  findAnyLayoutFocusTarget,
  activeFocusScopeRestores,
  findRenderNodeFocusTarget,
  renderNodeKeyChainForFocus,
  nextFocusPath,
  previousFocusPath,
  resolveInitialFocusSelector
} from '../renderer/internal/focus.ts';
import { resolveTuiInputBinding } from './input-bindings.ts';
import { defaultTuiFinalizationPolicy } from './run-configuration.ts';
import { tuiSnapshot } from './lifecycle.ts';
import { recordTuiCommit } from './transcript.ts';
import { createPointerRouter } from '../renderer/internal/pointer-router.ts';
import {
  assertRuntimeCanStart,
  assertRuntimeOperational,
  assertRuntimeWaitable,
  runtimePhaseError
} from './runtime-lifecycle.ts';
import { commitFrame, dirtyRegionsForRenderCommit, renderCurrentFrame, resolveTuiTheme } from './runtime-frame.ts';
import { createTuiSubscriptionManager } from './subscriptions.ts';
import { createWheelInputCoordinator } from './wheel-input-coordinator.ts';
import { createResizeCoordinator } from './resize-coordinator.ts';
import type { InputEvent, MouseEvent as TerminalMouseEvent, MouseWheelEvent } from '../input/index.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { TerminalTheme } from '../theme/index.ts';
import { ignoreMessage, isIgnoredMessage } from '../interaction/message.ts';
import type { MessageResolution } from '../interaction/message.ts';
import type { RenderNode } from '../renderer/model/index.ts';
import type { DirtyRegionSet } from '../renderer/internal/dirty-regions.ts';
import type { Frame, RenderDiff } from '../renderer/internal/frame.ts';
import type { FocusPath } from '../interaction/focus.ts';
import type { RenderCommitCandidate } from './runtime-frame.ts';
import type { PointerRouteResult } from '../renderer/internal/pointer-router.ts';
import type { TuiRuntimePhase } from './runtime-lifecycle.ts';
import type {
  TuiContext,
  TuiEffect,
  TuiExit,
  TuiInputResult,
  TuiInputBatchResult,
  TuiMessageSource,
  TuiRuntime,
  TuiRuntimeChange,
  TuiRuntimeDisposeOptions,
  TuiRuntimeMetrics,
  TuiRuntimeOptions
} from './types.ts';
import type { WheelInputBatch } from './wheel-input-batch.ts';
import type { ProducerAdmissionLease } from './producer-admission.ts';

interface PendingTuiMessage<TMessage> {
  readonly message: TMessage;
  readonly source: TuiMessageSource;
}

interface RuntimeReduction<TState, TMessage> {
  readonly state: TState;
  readonly stateVersion: number;
  readonly stateUpdates: number;
  readonly messages: readonly PendingTuiMessage<TMessage>[];
  readonly effects: readonly TuiEffect<TMessage>[];
  readonly exitReason?: string;
}

interface RuntimeRenderResolution<TMessage> {
  readonly render: RenderCommitCandidate<TMessage>;
  readonly focusPath?: FocusPath;
  readonly focusReturnPaths: readonly FocusPath[];
  readonly diagnostics: readonly TerminalDiagnostic[];
}

interface ChangeWaiter<TState> {
  readonly resolve: (change: TuiRuntimeChange<TState>) => void;
  readonly reject: (cause: unknown) => void;
  readonly detach: () => void;
}

interface OwnedRuntimeTask<TResult> {
  completion: Promise<TResult>;
}

type MutableTuiRuntimeMetrics = {
  -readonly [TKey in Exclude<keyof TuiRuntimeMetrics, 'effects'>]: TuiRuntimeMetrics[TKey];
};

export function createTuiRuntime<TState, TMessage>(
  options: TuiRuntimeOptions<TState, TMessage>
): TuiRuntime<TState, TMessage> {
  let currentState: RuntimeStateSlot<TState> = { kind: 'empty' };
  let currentViewport = options.host.getViewport();
  let currentRender: RenderCommitCandidate<TMessage> | undefined;
  let stateVersion = 0;
  let nextCommitSequence = 1;
  let currentFocusPath: FocusPath | undefined = options.initialFocus?.kind === 'path'
    ? options.initialFocus.path
    : undefined;
  let pendingInitialFocus = options.initialFocus;
  let focusReturnPaths: FocusPath[] = [];
  let terminalExit: TuiExit<TState> | undefined;
  let phase: TuiRuntimePhase = 'created';
  let startup: Promise<Frame> | undefined;
  let disposal: Promise<void> | undefined;
  const lifetimeController = new AbortController();
  const runtimeDiagnostics: TerminalDiagnostic[] = [];
  const runtimeDiagnosticIds = new Set<string>();
  for (const item of options.diagnostics ?? []) {
    if (runtimeDiagnosticIds.has(item.id)) continue;
    runtimeDiagnosticIds.add(item.id);
    runtimeDiagnostics.push(item);
    options.transcript?.recordDiagnostic(item);
  }
  let diagnosticRefreshQueued = false;
  const backgroundTasks = new Set<OwnedRuntimeTask<void>>();
  let pendingFrameChange: Extract<TuiRuntimeChange<TState>, { readonly kind: 'frame' }> | undefined;
  let pendingExitChange: Extract<TuiRuntimeChange<TState>, { readonly kind: 'exit' }> | undefined;
  const changeWaiters: ChangeWaiter<TState>[] = [];
  const inputPipeline = createInputPipeline(options.input);
  const inputAmbiguity = createInputAmbiguityDeadline<readonly TuiInputResult<TState>[]>(
    options.host.clock,
    inputPipeline.profile.escapeDelayMs
  );
  const pointerRouter = createPointerRouter<TMessage>({ now: () => options.host.clock.monotonicNow() });
  const metrics: MutableTuiRuntimeMetrics = {
    decodedInputEvents: 0,
    wheelPackets: 0,
    dispatchedMessages: 0,
    stateUpdates: 0,
    frameCommits: 0
  };
  const dispatchQueue = createSerializedDispatchQueue();
  const wheelInput = createWheelInputCoordinator<TuiInputResult<TState>>({
    clock: options.host.clock,
    execute: (batch) => dispatchQueue.run(() => handleWheelInputBatch(batch)),
    reportFailure(cause) {
      if (phase !== 'disposing' && phase !== 'disposed') {
        recordDiagnostic(diagnostic('TUI_RUNTIME_TASK_FAILED', 'TUI wheel input flush failed.', {
          target: options.app.id,
          cause,
          data: { owner: 'wheel_flush' }
        }));
      }
    }
  });
  const resizeCoordinator = createResizeCoordinator(async (viewport: typeof currentViewport) => {
    await wheelInput.flush();
    return dispatchQueue.run(() => resizeInternal(viewport));
  });
  const subscriptions = createTuiSubscriptionManager<TState, TMessage>({
    ...(options.app.definition.subscriptions === undefined
      ? {}
      : { subscriptions: options.app.definition.subscriptions }),
    context: createRuntimeContext,
    reportDiagnostic,
    dispatch(message, source, lease) {
      return dispatchQueue.run(() => dispatchAdmitted(message, source, lease)).then(() => undefined);
    }
  });
  const effects = createTuiEffectManager<TMessage>({
    clock: options.host.clock,
    context: createRuntimeContext,
    reportDiagnostic,
    dispatch(messages, lease) {
      return dispatchQueue.run(() => dispatchManyAdmitted(messages, 'effect', lease)).then(() => undefined);
    },
    ...(options.effectPolicy === undefined ? {} : { policy: options.effectPolicy })
  });

  const runtime: TuiRuntime<TState, TMessage> = {
    app: options.app,
    host: options.host,
    start() {
      if (phase === 'created' || phase === 'starting') {
        startup ??= dispatchQueue.run(startInternal);
        return startup;
      }
      if (phase === 'active') return startup ?? Promise.reject(runtimePhaseError(phase));
      return Promise.reject(runtimePhaseError(phase));
    },
    dispatch(message) {
      return dispatchQueue.run(() => dispatchInternal(message, 'external'));
    },
    resize(viewport) {
      return resizeCoordinator.request(viewport);
    },
    async handleInput(event) {
      await wheelInput.flush();
      metrics.decodedInputEvents += 1;
      return handleInputImmediately(event);
    },
    async handleInputChunk(chunk, decodeOptions) {
      inputAmbiguity.cancel();
      const batch = inputPipeline.decode(chunk, decodeOptions);
      metrics.decodedInputEvents += batch.events.length;
      const decoded = await processInputEvents(batch.events);
      if (batch.pending.kind !== 'escape') return decoded;
      const pendingEscape = inputAmbiguity.schedule(async () => {
        const expired = inputPipeline.flush();
        metrics.decodedInputEvents += expired.events.length;
        const result = await processInputEvents(expired.events);
        const pendingWheel = result.pending === undefined ? [] : await result.pending;
        return [...result.results, ...pendingWheel];
      }).then((results) => results ?? []);
      return {
        results: decoded.results,
        pending: combinePendingInput(decoded.pending, pendingEscape)
      };
    },
    async flushInput() {
      inputAmbiguity.cancel();
      const batch = inputPipeline.flush();
      metrics.decodedInputEvents += batch.events.length;
      const decoded = await processInputEvents(batch.events);
      const pending = await wheelInput.flush();
      return [...decoded.results, ...pending];
    },
    resetInput() {
      assertRuntimeOperational(phase);
      inputAmbiguity.cancel();
      inputPipeline.reset();
      wheelInput.reset();
      pointerRouter.reset();
    },
    nextChange(signal) {
      assertRuntimeWaitable(phase);
      const next = consumePendingChange();
      if (next !== undefined) return Promise.resolve(next);
      return waitForChange(signal);
    },
    dispose(disposeOptions) {
      return disposeRuntime(disposeOptions);
    },
    state() {
      return ensureState();
    },
    frame() {
      return currentRender?.frame;
    },
    exit() {
      return terminalExit;
    },
    diagnostics() {
      return [...runtimeDiagnostics];
    },
    metrics() {
      return { ...metrics, effects: effects.metrics() };
    }
  };
  return runtime;

  async function dispatchAdmitted(
    message: TMessage,
    source: TuiMessageSource,
    lease: ProducerAdmissionLease
  ): Promise<TState> {
    return lease.authorized() ? dispatchInternal(message, source) : ensureState();
  }

  async function dispatchManyAdmitted(
    messages: readonly TMessage[],
    source: TuiMessageSource,
    lease: ProducerAdmissionLease
  ): Promise<TState> {
    return lease.authorized() ? dispatchManyInternal(messages, source) : ensureState();
  }

  async function handleInputImmediately(event: InputEvent): Promise<TuiInputResult<TState>> {
    if (event.kind !== 'resize') options.transcript?.record({ kind: 'input', event });
    if (event.kind === 'mouse') {
      return dispatchQueue.run(() => handleMouseInputInternal(event));
    }
    const state = await ensureStarted();
    const frame = ensureFrame();
    if (event.kind === 'resize') {
      const resized = await runtime.resize(event.viewport);
      return { handled: true, state: ensureState(), frame: resized };
    }
    const message = messageForInput(state, event);
    if (isIgnoredMessage(message)) {
      if (event.kind === 'key' && event.key === 'tab') {
        const next = await moveFocus(state, event.modifiers.shift ? 'previous' : 'next');
        return { handled: true, state, frame: next };
      }
      return { handled: false, state, frame };
    }
    const nextState = await dispatchQueue.run(() => dispatchInternal(message, 'input'));
    const nextFrame = ensureFrame();
    return terminalExit === undefined
      ? { handled: true, state: nextState, frame: nextFrame }
      : { handled: true, state: nextState, frame: nextFrame, exit: terminalExit };
  }

  async function startInternal(): Promise<Frame> {
    assertRuntimeCanStart(phase);
    if (phase === 'active' && currentRender !== undefined) return currentRender.frame;
    phase = 'starting';
    try {
      const context = await createRuntimeContext();
      const state = options.app.definition.init(context);
      const preparedSubscriptions = await subscriptions.prepare(state, context);
      const theme = resolveTuiTheme(options.theme, state);
      const resolution = resolveRenderCandidate(
        state,
        context,
        currentFocusPath,
        focusReturnPaths,
        pendingInitialFocus,
        stateVersion,
        candidateCommitId()
      );
      const diff = await commitFrame(options.host, undefined, resolution.render.frame, theme, {
        signal: lifetimeController.signal
      });
      metrics.frameCommits += 1;
      currentState = { kind: 'ready', value: state };
      currentRender = resolution.render;
      currentFocusPath = resolution.focusPath;
      focusReturnPaths = [...resolution.focusReturnPaths];
      pendingInitialFocus = undefined;
      phase = 'active';
      nextCommitSequence += 1;
      recordCommittedRender(resolution.render, diff);
      subscriptions.activate(preparedSubscriptions);
      for (const item of resolution.diagnostics) recordDiagnostic(item);
      publishChange({
        kind: 'frame',
        commitId: resolution.render.commitId,
        stateVersion: resolution.render.stateVersion,
        frame: resolution.render.frame
      });
      if (terminalExit !== undefined) publishChange({ kind: 'exit', exit: terminalExit });
      return resolution.render.frame;
    } catch (cause) {
      phase = 'failed';
      subscriptions.cancel();
      effects.cancel();
      throw cause;
    }
  }

  async function dispatchInternal(message: TMessage, source: TuiMessageSource): Promise<TState> {
    return dispatchManyInternal([message], source);
  }

  async function dispatchManyInternal(messages: readonly TMessage[], source: TuiMessageSource): Promise<TState> {
    await ensureStarted();
    assertRuntimeOperational(phase);
    return commitRuntimeTransition({
      messages: messages.map((message) => ({ message, source })),
      viewport: currentViewport,
      requestedFocusPath: currentFocusPath
    });
  }

  async function resizeInternal(viewport: Parameters<TuiRuntime<TState, TMessage>['resize']>[0]): Promise<Frame> {
    await ensureStarted();
    assertRuntimeOperational(phase);
    options.transcript?.record({ kind: 'input', event: { kind: 'resize', viewport } });
    await commitRuntimeTransition({ messages: [], viewport, requestedFocusPath: currentFocusPath });
    return ensureFrame();
  }

  async function createRuntimeContext(viewport: typeof currentViewport = currentViewport): Promise<TuiContext> {
    const context = await createTuiContext(options.host, runtimeDiagnostics);
    return { ...context, viewport };
  }

  async function commitRuntimeTransition(input: {
    readonly messages: readonly PendingTuiMessage<TMessage>[];
    readonly viewport: typeof currentViewport;
    readonly requestedFocusPath: FocusPath | undefined;
    readonly forceFrame?: boolean;
  }): Promise<TState> {
    const context = await createRuntimeContext(input.viewport);
    assertRuntimeOperational(phase);
    const reduction = reduceMessages(input.messages, context);
    const viewportChanged = input.viewport.columns !== currentViewport.columns
      || input.viewport.rows !== currentViewport.rows;
    const focusChanged = !sameFocusPath(input.requestedFocusPath, currentFocusPath);
    const requiresFrame = input.forceFrame === true || reduction.stateUpdates > 0 || viewportChanged || focusChanged;
    if (!requiresFrame) {
      recordReductionMessages(reduction);
      const exitChange = completeReduction(reduction, currentRender?.frame);
      if (exitChange !== undefined) publishChange(exitChange);
      if (reduction.exitReason === undefined) effects.start(reduction.effects);
      return reduction.state;
    }

    const preparedSubscriptions = reduction.exitReason === undefined
      ? await subscriptions.prepare(reduction.state, context)
      : undefined;
    assertRuntimeOperational(phase);
    const theme = resolveTuiTheme(options.theme, reduction.state);
    const previousFrame = frameDiffBase(theme);
    const resolution = resolveRenderCandidate(
      reduction.state,
      context,
      input.requestedFocusPath,
      focusReturnPaths,
      undefined,
      reduction.stateVersion,
      candidateCommitId()
    );
    const diff = await commitFrame(
      options.host,
      previousFrame,
      resolution.render.frame,
      theme,
      dirtyCommitOptions(previousFrame, resolution.render)
    );

    currentState = { kind: 'ready', value: reduction.state };
    stateVersion = reduction.stateVersion;
    currentViewport = input.viewport;
    currentRender = resolution.render;
    currentFocusPath = resolution.focusPath;
    focusReturnPaths = [...resolution.focusReturnPaths];
    metrics.stateUpdates += reduction.stateUpdates;
    metrics.frameCommits += 1;
    nextCommitSequence += 1;
    recordReductionMessages(reduction);
    recordCommittedRender(resolution.render, diff);
    for (const item of resolution.diagnostics) recordDiagnostic(item);
    const exitChange = completeReduction(reduction, resolution.render.frame);
    publishChange({
      kind: 'frame',
      commitId: resolution.render.commitId,
      stateVersion: resolution.render.stateVersion,
      frame: resolution.render.frame
    });
    if (exitChange !== undefined) publishChange(exitChange);
    if (preparedSubscriptions !== undefined) subscriptions.activate(preparedSubscriptions);
    if (reduction.exitReason === undefined) effects.start(reduction.effects);
    return reduction.state;
  }

  function reduceMessages(
    messages: readonly PendingTuiMessage<TMessage>[],
    context: TuiContext
  ): RuntimeReduction<TState, TMessage> {
    let state = ensureState();
    let nextStateVersion = stateVersion;
    let stateUpdates = 0;
    let exitReason: string | undefined;
    const applied: PendingTuiMessage<TMessage>[] = [];
    const pendingEffects: TuiEffect<TMessage>[] = [];
    for (const item of messages) {
      if (exitReason !== undefined) break;
      metrics.dispatchedMessages += 1;
      const result = options.app.definition.update(state, item.message, context);
      applied.push(item);
      pendingEffects.push(...(result.effects ?? []));
      if (result.state !== state) {
        nextStateVersion += 1;
        stateUpdates += 1;
      }
      state = result.state;
      if (result.exit !== undefined) exitReason = result.exit.reason ?? '';
    }
    return {
      state,
      stateVersion: nextStateVersion,
      stateUpdates,
      messages: applied,
      effects: pendingEffects,
      ...(exitReason === undefined ? {} : { exitReason })
    };
  }

  function recordReductionMessages(reduction: RuntimeReduction<TState, TMessage>): void {
    for (const item of reduction.messages) {
      options.transcript?.record({ kind: 'message', source: item.source, message: item.message });
    }
  }

  function completeReduction(
    reduction: RuntimeReduction<TState, TMessage>,
    frame: Frame | undefined
  ): Extract<TuiRuntimeChange<TState>, { readonly kind: 'exit' }> | undefined {
    if (reduction.exitReason === undefined) return undefined;
    phase = 'exiting';
    subscriptions.cancel();
    effects.cancel();
    terminalExit = {
      ...completedExitFromSnapshot(
        reduction.state,
        frame?.accessibility ?? currentRender?.frame.accessibility ?? tuiSnapshot(options.app.id),
        reduction.exitReason === '' ? undefined : reduction.exitReason
      ),
      diagnostics: [...runtimeDiagnostics]
    };
    return { kind: 'exit', exit: terminalExit };
  }

  function reportDiagnostic(item: TerminalDiagnostic): void {
    recordDiagnostic(item);
    if (phase !== 'active' || currentState.kind === 'empty' || currentRender === undefined || diagnosticRefreshQueued) return;
    diagnosticRefreshQueued = true;
    ownBackgroundTask(dispatchQueue.run(refreshAfterDiagnostic), 'diagnostic_refresh', () => {
      diagnosticRefreshQueued = false;
    });
  }

  function recordDiagnostic(item: TerminalDiagnostic): void {
    if (runtimeDiagnosticIds.has(item.id)) return;
    runtimeDiagnosticIds.add(item.id);
    runtimeDiagnostics.push(item);
    options.transcript?.recordDiagnostic(item);
  }

  function ownBackgroundTask(task: Promise<unknown>, owner: string, settled?: () => void): void {
    const owned: OwnedRuntimeTask<void> = { completion: Promise.resolve() };
    owned.completion = (async () => {
      try {
        await task;
      } catch (cause) {
        if (phase !== 'disposing' && phase !== 'disposed') {
          recordDiagnostic(diagnostic('TUI_RUNTIME_TASK_FAILED', `TUI runtime task ${owner} failed.`, {
            target: options.app.id,
            cause,
            data: { owner }
          }));
        }
      } finally {
        settled?.();
        backgroundTasks.delete(owned);
      }
    })();
    backgroundTasks.add(owned);
  }

  async function refreshAfterDiagnostic(): Promise<void> {
    if (!runtimeIsActive() || currentState.kind === 'empty' || currentRender === undefined) return;
    await commitRuntimeTransition({
      messages: [],
      viewport: currentViewport,
      requestedFocusPath: currentFocusPath,
      forceFrame: true
    });
  }

  function runtimeIsActive(): boolean {
    return phase === 'active';
  }

  function publishChange(change: TuiRuntimeChange<TState>): void {
    const waiter = changeWaiters.shift();
    if (waiter !== undefined) {
      waiter.detach();
      waiter.resolve(change);
      return;
    }
    if (change.kind === 'frame') {
      pendingFrameChange = change;
      return;
    }
    pendingExitChange = change;
  }

  function consumePendingChange(): TuiRuntimeChange<TState> | undefined {
    if (pendingFrameChange !== undefined) {
      const change = pendingFrameChange;
      pendingFrameChange = undefined;
      return change;
    }
    if (pendingExitChange !== undefined) {
      const change = pendingExitChange;
      pendingExitChange = undefined;
      return change;
    }
    return undefined;
  }

  async function processInputEvents(events: readonly InputEvent[]): Promise<TuiInputBatchResult<TState>> {
    assertRuntimeOperational(phase);
    const results: TuiInputResult<TState>[] = [];
    for (const event of events) {
      if (isWheelInputEvent(event)) {
        results.push(...await enqueueWheelInput(event));
        if (results.at(-1)?.exit !== undefined) break;
        continue;
      }
      results.push(...await wheelInput.flush());
      const result = await handleInputImmediately(event);
      results.push(result);
      if (result.exit !== undefined) break;
    }
    const pending = wheelInput.pending();
    return {
      results,
      ...(pending === undefined ? {} : { pending })
    };
  }

  async function enqueueWheelInput(event: MouseWheelEvent): Promise<readonly TuiInputResult<TState>[]> {
    await ensureStarted();
    metrics.wheelPackets += 1;
    options.transcript?.record({ kind: 'input', event });
    const targetId = pointerRouter.wheelTargetId(ensureRender().regions, event);
    return wheelInput.enqueue(event, targetId);
  }

  async function handleWheelInputBatch(batch: WheelInputBatch): Promise<readonly TuiInputResult<TState>[]> {
    const state = await ensureStarted();
    const frame = ensureFrame();
    const messages = messagesForMouse(state, batch.event);
    if (messages.length === 0) {
      return [{ handled: false, state, frame }];
    }
    const nextState = await dispatchManyInternal(messages, 'input');
    const nextFrame = ensureFrame();
    return [terminalExit === undefined
      ? { handled: true, state: nextState, frame: nextFrame }
      : { handled: true, state: nextState, frame: nextFrame, exit: terminalExit }];
  }

  async function handleMouseInputInternal(event: TerminalMouseEvent): Promise<TuiInputResult<TState>> {
    await ensureStarted();
    const routed = pointerRouter.route(ensureRender().regions, event);
    const requestedFocusPath = pointerFocusPath(event, routed);
    const focusChanged = !sameFocusPath(requestedFocusPath, currentFocusPath);
    const messages = routed.flatMap((result) => isIgnoredMessage(result.message) ? [] : [result.message]);
    if (messages.length > 0 || focusChanged) {
      await commitRuntimeTransition({
        messages: messages.map((message) => ({ message, source: 'input' })),
        viewport: currentViewport,
        requestedFocusPath
      });
    }
    const nextState = ensureState();
    const nextFrame = ensureFrame();
    const handled = focusChanged || messages.length > 0;
    return terminalExit === undefined
      ? { handled, state: nextState, frame: nextFrame }
      : { handled, state: nextState, frame: nextFrame, exit: terminalExit };
  }

  function pointerFocusPath(
    event: TerminalMouseEvent,
    routed: readonly PointerRouteResult<TMessage>[]
  ): FocusPath | undefined {
    if (event.action !== 'press') return currentFocusPath;
    const intent = routed.find((result) => result.event.kind === 'pointerDown')?.hit?.focus;
    if (intent === undefined || intent.kind === 'preserve') return currentFocusPath;
    return [...intent.path];
  }

  async function ensureStarted(): Promise<TState> {
    assertRuntimeOperational(phase);
    if (phase === 'created') await runtime.start();
    return ensureState();
  }

  function waitForChange(signal: AbortSignal | undefined): Promise<TuiRuntimeChange<TState>> {
    return new Promise((resolve, reject) => {
      let abort = (): void => undefined;
      const waiter: ChangeWaiter<TState> = {
        resolve,
        reject,
        detach: () => signal?.removeEventListener('abort', abort)
      };
      abort = (): void => {
        const index = changeWaiters.indexOf(waiter);
        if (index >= 0) changeWaiters.splice(index, 1);
        waiter.detach();
        reject(new TerminalUiError('TUI runtime change wait was cancelled.'));
      };
      if (signal?.aborted === true) {
        abort();
        return;
      }
      signal?.addEventListener('abort', abort, { once: true });
      changeWaiters.push(waiter);
    });
  }

  function disposeRuntime(disposeOptions: TuiRuntimeDisposeOptions = {}): Promise<void> {
    if (disposal !== undefined) return disposal;
    let timeoutMs: number;
    try {
      timeoutMs = runtimeDisposalTimeout(disposeOptions.timeoutMs);
    } catch (cause) {
      return Promise.reject(errorFromUnknown(cause));
    }
    wheelInput.reset();
    inputAmbiguity.cancel();
    lifetimeController.abort();
    phase = 'disposing';
    const unavailable = runtimePhaseError('disposed');
    resizeCoordinator.dispose(unavailable);
    for (const waiter of changeWaiters.splice(0)) {
      waiter.detach();
      waiter.reject(unavailable);
    }
    pendingFrameChange = undefined;
    pendingExitChange = undefined;
    subscriptions.cancel();
    effects.cancel();
    const cleanup = (async () => {
      const failures: unknown[] = [];
      try {
        await dispatchQueue.drain();
      } catch (cause) {
        failures.push(cause);
      }
      await Promise.allSettled([
        ...[...backgroundTasks].map((task) => task.completion),
        wheelInput.settle()
      ]);
      const cleanups = await Promise.allSettled([subscriptions.dispose(), effects.dispose()]);
      for (const cleanup of cleanups) {
        if (cleanup.status === 'rejected') failures.push(cleanup.reason);
      }
      if (failures.length > 0) throw new AggregateError(failures, 'TUI runtime disposal failed.');
    })();
    phase = 'disposed';
    disposal = boundedRuntimeDisposal(cleanup, disposeOptions, timeoutMs);
    return disposal;
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

  function ensureState(): TState {
    if (currentState.kind === 'empty') {
      throw new Error('TUI runtime does not have state.');
    }
    return currentState.value;
  }

  function ensureFrame(): Frame {
    if (currentRender === undefined) {
      throw new Error('TUI runtime does not have a frame.');
    }
    return currentRender.frame;
  }

  function ensureRender(): RenderCommitCandidate<TMessage> {
    if (currentRender === undefined) {
      throw new Error('TUI runtime does not have a committed render.');
    }
    return currentRender;
  }

  function resolveRenderCandidate(
    state: TState,
    context: TuiContext,
    requestedFocusPath: FocusPath | undefined,
    previousReturnPaths: readonly FocusPath[],
    initialFocus: TuiRuntimeOptions<TState, TMessage>['initialFocus'],
    candidateStateVersion: number,
    commitId: string
  ): RuntimeRenderResolution<TMessage> {
    const diagnostics: TerminalDiagnostic[] = [];
    let desiredFocusPath = requestedFocusPath;
    let render = renderCurrentFrame(options.app, state, context, desiredFocusPath, options, candidateStateVersion, commitId);
    if (initialFocus !== undefined) {
      const resolution = resolveInitialFocusSelector(render.layout, initialFocus);
      if (resolution.kind === 'matched' && !sameFocusPath(resolution.path, render.frame.focusPath)) {
        desiredFocusPath = resolution.path;
        render = renderCurrentFrame(options.app, state, context, desiredFocusPath, options, candidateStateVersion, commitId);
      } else if (resolution.kind !== 'matched') {
        diagnostics.push(diagnostic(
          'TUI_FOCUS_SELECTION_INVALID',
          resolution.kind === 'missing'
            ? 'Initial focus selector did not match an active focus target.'
            : 'Initial focus selector matched multiple active focus targets.',
          {
            severity: 'warning',
            target: options.app.id,
            data: {
              reason: resolution.kind,
              ...(resolution.kind === 'ambiguous' ? { paths: resolution.paths.map((path) => path.join('/')) } : {})
            }
          }
        ));
      }
    }
    let nextReturnPaths = previousReturnPaths
      .filter((path) => findAnyLayoutFocusTarget(render.layout, path) !== undefined)
      .map((path) => [...path]);
    const focusReturnPath = nextReturnPaths.at(-1);
    if (
      focusReturnPath !== undefined
      && desiredFocusPath !== undefined
      && !sameFocusPath(render.frame.focusPath, desiredFocusPath)
    ) {
      const recovered = renderCurrentFrame(
        options.app,
        state,
        context,
        focusReturnPath,
        options,
        candidateStateVersion,
        commitId
      );
      if (sameFocusPath(recovered.frame.focusPath, focusReturnPath)) render = recovered;
    }
    if (
      desiredFocusPath !== undefined
      && render.frame.focusPath !== undefined
      && !sameFocusPath(render.frame.focusPath, desiredFocusPath)
      && findAnyLayoutFocusTarget(render.layout, desiredFocusPath) !== undefined
      && activeFocusScopeRestores(render.layout)
      && !nextReturnPaths.some((path) => sameFocusPath(path, desiredFocusPath))
    ) {
      nextReturnPaths.push([...desiredFocusPath]);
    }
    if (
      nextReturnPaths.length > 0
      && sameFocusPath(render.frame.focusPath, nextReturnPaths.at(-1))
    ) {
      nextReturnPaths = nextReturnPaths.slice(0, -1);
    }
    return {
      render,
      ...(render.frame.focusPath === undefined ? {} : { focusPath: render.frame.focusPath }),
      focusReturnPaths: nextReturnPaths,
      diagnostics
    };
  }

  async function moveFocus(_state: TState, direction: 'next' | 'previous'): Promise<Frame> {
    const current = ensureRender();
    const requestedFocusPath = direction === 'next'
      ? nextFocusPath(current.layout, currentFocusPath)
      : previousFocusPath(current.layout, currentFocusPath);
    await commitRuntimeTransition({ messages: [], viewport: currentViewport, requestedFocusPath });
    return ensureFrame();
  }

  function messageForInput(_state: TState, event: InputEvent): MessageResolution<TMessage> {
    const committedText = committedTextInputEvent(event);
    const appBinding = (
      phase: 'beforeFocus' | 'afterFocus',
      input: InputEvent
    ): MessageResolution<TMessage> => resolveTuiInputBinding({
      bindings: options.app.definition.inputBindings,
      phase,
      state: _state,
      event: input,
      focusPath: currentFocusPath
    });
    const beforeFocus = appBinding('beforeFocus', event);
    if (!isIgnoredMessage(beforeFocus)) return beforeFocus;
    if (committedText !== undefined) {
      const beforeFocusText = appBinding('beforeFocus', committedText);
      if (!isIgnoredMessage(beforeFocusText)) return beforeFocusText;
    }
    const current = ensureRender();
    const focused = findRenderNodeFocusTarget(current.node, current.layout, currentFocusPath);
    const focusedTextMessage = (input: Extract<InputEvent, { readonly kind: 'text' }>): MessageResolution<TMessage> => {
      const handler = focused?.renderNode.inputMap?.text;
      if (handler !== undefined) return handler(input.text);
      for (const renderNode of renderNodeKeyChainForFocus(current.node, current.layout, currentFocusPath)) {
        const message = componentKeyMessage(renderNode.keyMap, input, currentFocusPath);
        if (!isIgnoredMessage(message)) return message;
      }
      return ignoreMessage();
    };
    if (event.kind === 'text') {
      const message = focusedTextMessage(event);
      if (!isIgnoredMessage(message)) return message;
    }
    if (event.kind === 'paste') {
      const handler = focused?.renderNode.inputMap?.paste;
      if (handler !== undefined) return handler(event.text);
    }
    for (const renderNode of renderNodeKeyChainForFocus(current.node, current.layout, currentFocusPath)) {
      const focusedMessage = componentKeyMessage(renderNode.keyMap, event, currentFocusPath);
      if (!isIgnoredMessage(focusedMessage)) return focusedMessage;
    }
    if (committedText !== undefined) {
      const message = focusedTextMessage(committedText);
      if (!isIgnoredMessage(message)) return message;
    }
    const afterFocus = appBinding('afterFocus', event);
    if (!isIgnoredMessage(afterFocus)) return afterFocus;
    if (committedText !== undefined) {
      const afterFocusText = appBinding('afterFocus', committedText);
      if (!isIgnoredMessage(afterFocusText)) return afterFocusText;
    }
    return ignoreMessage();
  }

  function messagesForMouse(_state: TState, event: TerminalMouseEvent): readonly TMessage[] {
    const current = ensureRender();
    return pointerRouter.route(current.regions, event)
      .flatMap((result) => isIgnoredMessage(result.message) ? [] : [result.message]);
  }

  function frameDiffBase(theme: TerminalTheme): Frame | undefined {
    return currentRender?.themeFingerprint === theme.fingerprint ? currentRender.frame : undefined;
  }

  function dirtyCommitOptions(
    previousFrame: Frame | undefined,
    render: RenderCommitCandidate<TMessage>
  ): { readonly dirtyRegions?: DirtyRegionSet; readonly signal: AbortSignal } {
    if (previousFrame === undefined) return { signal: lifetimeController.signal };
    const dirtyRegions = dirtyRegionsForRenderCommit(currentRender, render);
    return dirtyRegions === undefined
      ? { signal: lifetimeController.signal }
      : { dirtyRegions, signal: lifetimeController.signal };
  }

  function candidateCommitId(): string {
    return `${options.app.id}:commit:${String(nextCommitSequence)}`;
  }

  function recordCommittedRender(render: RenderCommitCandidate<TMessage>, diff: RenderDiff): void {
    recordTuiCommit(options.transcript, {
      id: render.commitId,
      stateVersion: render.stateVersion,
      viewport: render.viewport,
      ...(render.frame.focusPath === undefined ? {} : { focusPath: render.frame.focusPath }),
      frame: render.frame,
      diff
    });
  }
}

function committedTextInputEvent(
  event: InputEvent
): Extract<InputEvent, { readonly kind: 'text' }> | undefined {
  return event.kind === 'key'
    && event.eventType !== 'release'
    && event.committedText !== undefined
    ? { kind: 'text', text: event.committedText, paste: false }
    : undefined;
}

function runtimeDisposalTimeout(value: number | undefined): number {
  const timeoutMs = value ?? defaultTuiFinalizationPolicy.timeoutMs;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
    throw new RangeError('TUI runtime disposal timeoutMs must be a non-negative finite number.');
  }
  return timeoutMs;
}

type RuntimeStateSlot<TState> =
  | { readonly kind: 'empty' }
  | { readonly kind: 'ready'; readonly value: TState };

function componentKeyMessage<TMessage>(
  keyMap: RenderNode<TMessage>['keyMap'] | undefined,
  event: InputEvent,
  focusPath: FocusPath | undefined
): MessageResolution<TMessage> {
  const handler = event.kind === 'key' && event.key !== 'unknown'
    ? keyMap?.modified?.find((binding) => matchesInputTrigger(binding.trigger, event))?.onKey
      ?? (hasNoKeyModifiers(event) ? keyMap?.[event.key] : undefined)
    : event.kind === 'text'
      ? keyMap?.text?.[event.text]
      : undefined;
  return handler === undefined
    ? ignoreMessage()
    : handler({ input: event, focusPath: focusPath ?? [] });
}

function hasNoKeyModifiers(event: Extract<InputEvent, { readonly kind: 'key' }>): boolean {
  return !event.modifiers.ctrl
    && !event.modifiers.alt
    && !event.modifiers.shift
    && !event.modifiers.meta;
}

function isWheelInputEvent(event: InputEvent | undefined): event is MouseWheelEvent {
  return event?.kind === 'mouse' && event.action === 'wheel';
}

function sameFocusPath(left: FocusPath | undefined, right: FocusPath | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.length === right.length && left.every((segment, index) => segment === right[index]);
}

function combinePendingInput<TState>(
  first: Promise<readonly TuiInputResult<TState>[]> | undefined,
  second: Promise<readonly TuiInputResult<TState>[]>
): Promise<readonly TuiInputResult<TState>[]> {
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
