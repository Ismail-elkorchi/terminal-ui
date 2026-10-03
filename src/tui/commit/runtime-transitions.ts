import { assertRuntimeLimit } from '../lifecycle/runtime-policy.ts';
import type { ProducerAdmissionLease } from '../lifecycle/producer-admission.ts';
import { collectRenderNodeLayoutTargets, renderNodeLayoutAncestorsForFocus } from '../../renderer/internal/focus.ts';
import { layoutLifecycleMessages } from '../lifecycle/layout-lifecycle.ts';
import { diagnostic } from '../../diagnostics.ts';
import { TerminalUiError } from '../../errors.ts';
import type { TerminalSize } from '../../geometry/types.ts';
import type { FocusPath } from '../../interaction/focus.ts';
import { focusPathsEqual } from '../../interaction/focus.ts';
import type { Frame, RenderDiff } from '../../renderer/contracts.ts';
import { tuiDefinition } from '../definition.ts';
import type { TuiEffectManager } from '../lifecycle/effects.ts';
import { completedExitFromSnapshot } from '../exit.ts';
import type { FocusLifecycleMessage } from '../lifecycle/focus-lifecycle.ts';
import { focusLifecycleMessages } from '../lifecycle/focus-lifecycle.ts';
import { decodeTuiInitialResult } from '../hook-results.ts';
import { createRuntimeChangeChannel } from '../runtime-change-channel.ts';
import { createRuntimeCommitCoordinator } from './runtime-commit-coordinator.ts';
import { createRuntimeDiagnostics } from '../runtime-diagnostics.ts';
import { createRuntimeLifecycle } from '../lifecycle/runtime-lifecycle.ts';
import type { PendingTuiMessage, RuntimeReduction } from './runtime-reducer.ts';
import { createRuntimeReducer, normalizeRuntimeContributions } from './runtime-reducer.ts';
import type { TuiSubscriptionManager } from '../lifecycle/subscriptions.ts';
import { sameTerminalSize } from '../terminal-size.ts';
import { recordTuiCommit } from '../transcript.ts';
import type { TuiContext, TuiExit, TuiRuntimeOptions, TuiRuntimePolicy } from '../types.ts';

interface RuntimeTransitionInput<TMessage> {
  readonly messages: readonly PendingTuiMessage<TMessage>[];
  readonly completing?: ProducerAdmissionLease;
  readonly terminalSize: TerminalSize;
  readonly requestedFocusPath: FocusPath | undefined;
  readonly forceFrame?: boolean;
}

interface RuntimeTransitionsOptions<TState, TMessage> {
  readonly owner: string;
  readonly policy: TuiRuntimePolicy;
  readonly definition: ReturnType<typeof tuiDefinition<TState, TMessage>>;
  readonly initialFocus?: TuiRuntimeOptions<TState, TMessage>['initialFocus'];
  readonly transcript?: TuiRuntimeOptions<TState, TMessage>['transcript'];
  readonly lifecycle: ReturnType<typeof createRuntimeLifecycle<Frame>>;
  readonly commits: ReturnType<typeof createRuntimeCommitCoordinator<TState, TMessage>>;
  readonly subscriptions: TuiSubscriptionManager<TState, TMessage>;
  readonly effects: TuiEffectManager<TMessage>;
  readonly diagnostics: ReturnType<typeof createRuntimeDiagnostics>;
  readonly changes: ReturnType<typeof createRuntimeChangeChannel<TState>>;
  readonly context: (size?: TerminalSize) => Promise<TuiContext>;
  readonly recordMessage: () => void;
  readonly recordFrameCommit: () => void;
}

/** The single reducer/commit path, including startup and post-commit activation. */
export function createRuntimeTransitions<TState, TMessage>(options: RuntimeTransitionsOptions<TState, TMessage>) {
  const { definition, lifecycle, commits, subscriptions, effects, diagnostics, changes, context: createRuntimeContext } = options;
  const reducer = createRuntimeReducer(definition.update, options.recordMessage, options.policy.maxContributionsPerTransaction);
  let terminalExit: TuiExit<TState> | undefined;
  let continuationMessages: FocusLifecycleMessage<TMessage>[] = [];
  let acceptedContinuations = 0;
  let continuationMessageCount = 0;
  return {
    start: startInternal,
    commit: commitRuntimeTransition,
    commitInContext: commitInContextWithContinuations,
    fail: failRuntime,
    instrument: runInstrumentation,
    exit: () => terminalExit,
    failTerminalOwnership: (cause: unknown) => { failRuntime(cause, 'TUI_TERMINAL_OWNERSHIP_FAILED'); },
  };

  function failRuntime(cause: unknown, code: 'TUI_RUNTIME_TASK_FAILED' | 'TUI_TERMINAL_OWNERSHIP_FAILED' = 'TUI_RUNTIME_TASK_FAILED'): void {
    if (terminalExit !== undefined) return;
    lifecycle.fail();
    subscriptions.cancel(); effects.cancel();
    diagnostics.record(diagnostic(code, 'TUI runtime could not settle its owned work.', {
      severity: 'fatal', target: options.owner, cause,
    }));
    const render = commits.renderOrUndefined();
    if (commits.hasState() && render !== undefined) {
      terminalExit = { status: 'error', state: commits.state(), diagnostics: diagnostics.values(), snapshot: render.frame.accessibility };
      changes.publish({ kind: 'exit', exit: terminalExit });
    } else changes.close(new TerminalUiError('TUI runtime failed.', { code: 'TUI_RUNTIME_FAULT', cause }));
  }

  async function startInternal(): Promise<Frame> {
    resetContinuations();
    let releaseWork: (() => void) | undefined;
    try {
      const context = await createRuntimeContext();
      const initial = decodeTuiInitialResult<TState, TMessage>(definition.init(context), options.policy.maxContributionsPerTransaction);
      const intent = normalizeRuntimeContributions(initial.contributions.map((entry) => ({ ...entry, redacted: false })));
      const effectPlan = effects.prepare(initial.exit === undefined ? intent.effects : []);
      let subscriptionPlan;
      try {
        subscriptionPlan = initial.exit === undefined ? await subscriptions.plan(initial.state, context, intent.cancel) : undefined;
      } catch (cause) { effectPlan.release(); throw cause; }
      releaseWork = () => { effectPlan.release(); subscriptionPlan?.release(); };
      const result = await commits.initial(initial.state, context, commits.version(), initial.focus ?? options.initialFocus, initial.exit === undefined ? validateNotifications : undefined);
      commits.publish(result, initial.state, 0);
      if (lifecycle.phase() === 'starting') lifecycle.activate();
      options.recordFrameCommit();
      recordCommittedRender(result.render, result.diff);
      if (initial.exit === undefined && lifecycle.active()) {
        subscriptionPlan?.activate();
        effectPlan.activate();
      } else releaseWork();
      releaseWork = undefined;
      for (const item of result.diagnostics) diagnostics.report(item);
      changes.publish({
        kind: 'frame',
        commitId: result.render.commitId,
        stateVersion: result.render.stateVersion,
        frame: result.render.frame
      });
      if (initial.exit === undefined) {
        const layoutMessages = resolvePostCommitMessages('layout_lifecycle_mapping', () => layoutLifecycleMessages(result.render));
        const focusMessages = resolvePostCommitMessages('focus_lifecycle_mapping', () => focusLifecycleMessages<TMessage>({
          next: {
            node: result.render.node,
            layout: result.render.layout,
            ...(result.render.frame.focusPath === undefined
              ? {}
              : { focusPath: result.render.frame.focusPath }),
          },
        }));
        const postCommitMessages = [...layoutMessages, ...focusMessages];
        if (postCommitMessages.length > 0 && lifecycle.active()) {
          appendContinuations(postCommitMessages);
          await drainContinuations();
        }
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
      }
      return commits.frame();
    } catch (cause) {
      releaseWork?.();
      lifecycle.fail();
      subscriptions.cancel();
      effects.cancel();
      throw cause;
    }
  }

  async function commitRuntimeTransition(input: RuntimeTransitionInput<TMessage>): Promise<TState> {
    const context = await createRuntimeContext(input.terminalSize);
    return commitInContextWithContinuations(input, context);
  }

  async function commitInContextWithContinuations(input: RuntimeTransitionInput<TMessage>, context: TuiContext): Promise<TState> {
    resetContinuations();
    await commitRuntimeTransitionInContext(input, context);
    await drainContinuations(input.completing);
    return commits.state();
  }

  async function commitRuntimeTransitionInContext(
    input: RuntimeTransitionInput<TMessage>,
    context: TuiContext
  ): Promise<TState> {
    lifecycle.assertOperational();
    assertRuntimeLimit('transaction_messages', input.messages.length, options.policy.maxMessagesPerTransaction);
    const reduction = reducer.reduce(commits.state(), commits.version(), input.messages, context);
    const intent = normalizeRuntimeContributions(reduction.contributions);
    const effectPlan = effects.prepare(reduction.exitReason === undefined ? intent.effects : [], input.completing);
    let subscriptionPlan;
    try {
      subscriptionPlan = reduction.exitReason === undefined
        ? await subscriptions.plan(reduction.state, context, intent.cancel, input.completing) : undefined;
    } catch (cause) { effectPlan.release(); throw cause; }
    const activation = { completed: false };
    const activate = (): void => {
      if (reduction.exitReason !== undefined || !lifecycle.active()) return;
      effects.cancelRequests(intent.cancel);
      subscriptions.cancelRequests(intent.cancel);
      subscriptionPlan?.activate();
      effectPlan.activate();
      activation.completed = true;
    };
    try {
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
        activate();
      }
      return commits.state();
    }

    const previousRender = commits.render();
    lifecycle.assertOperational();
    const result = await commits.transition(
      reduction.state,
      context,
      input.terminalSize,
      input.requestedFocusPath,
      reduction.stateVersion,
      reduction.focus,
      reduction.exitReason === undefined ? validateNotifications : undefined,
    );
    commits.publish(result, reduction.state, reduction.stateVersion);
    options.recordFrameCommit();
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
    activate();
    if (reduction.exitReason === undefined && lifecycle.active()) {
      const layoutMessages = resolvePostCommitMessages('layout_lifecycle_mapping', () => layoutLifecycleMessages(result.render, previousRender));
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
      const postCommitMessages = [...layoutMessages, ...focusMessages];
      appendContinuations(postCommitMessages);
    }
    return commits.state();
    } finally {
      if (!activation.completed) { effectPlan.release(); subscriptionPlan?.release(); }
    }
  }

  function recordReductionMessages(reduction: RuntimeReduction<TState, TMessage>): void {
    for (const item of reduction.messages) {
      runInstrumentation('transcript_message', () => options.transcript?.recordNormalizedMessage(
        item.source,
        item.redacted === true ? '[redacted]' : item.message
      ));
    }
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

  function resetContinuations(): void {
    continuationMessages = [];
    acceptedContinuations = 0;
    continuationMessageCount = 0;
  }

  function validateNotifications(render: ReturnType<typeof commits.render>): void {
    const previous = commits.renderOrUndefined();
    let count = collectRenderNodeLayoutTargets(render.node, render.layout)
      .filter((target) => target.renderNode.kind === 'component' && target.renderNode.definition.renderer.onLayout !== undefined).length;
    if (!focusPathsEqual(previous?.frame.focusPath, render.frame.focusPath)) {
      for (const target of [previous, render]) {
        if (target?.frame.focusPath === undefined) continue;
        for (const ancestor of renderNodeLayoutAncestorsForFocus(target.node, target.layout, target.frame.focusPath)) {
          if (ancestor.renderNode.kind !== 'component') continue;
          count += Number(ancestor.renderNode.focusLifecycle !== undefined) + Number(ancestor.renderNode.focusTargetLifecycle !== undefined);
        }
      }
    }
    assertRuntimeLimit('continuation_messages', continuationMessageCount + count, options.policy.maxContinuationMessages);
  }

  function appendContinuations(messages: readonly FocusLifecycleMessage<TMessage>[]): void {
    continuationMessageCount += messages.length;
    assertRuntimeLimit('continuation_messages', continuationMessageCount, options.policy.maxContinuationMessages);
    continuationMessages.push(...messages);
  }

  async function drainContinuations(completing?: ProducerAdmissionLease): Promise<void> {
    try {
      while (continuationMessages.length > 0 && lifecycle.active()) {
        acceptedContinuations += 1;
        assertRuntimeLimit('continuation_turns', acceptedContinuations, options.policy.maxContinuationTurns);
        const messages = continuationMessages.splice(0, options.policy.maxMessagesPerTransaction);
        await commitRuntimeTransitionInContext({
          messages: messages.map(({ message, sensitiveOrigin }) => ({ message, source: 'input', ...(sensitiveOrigin ? { redacted: true } : {}) })),
          terminalSize: commits.terminalSize(), requestedFocusPath: commits.focusPath(),
          ...(completing === undefined ? {} : { completing }),
        }, await createRuntimeContext());
      }
    } catch (cause) {
      continuationMessages = [];
      failRuntime(cause);
      throw cause;
    }
  }

  function resolvePostCommitMessages<TValue>(taskName: string, operation: () => readonly TValue[]): readonly TValue[] {
    try {
      return operation();
    } catch (cause) {
      failRuntime(new TerminalUiError(`TUI runtime task ${taskName} failed.`, { code: 'TUI_RUNTIME_FAULT', cause }));
      return [];
    }
  }

  function runInstrumentation(taskName: string, operation: () => void): void {
    try {
      operation();
    } catch (cause) {
      diagnostics.record(diagnostic('TUI_RUNTIME_TASK_FAILED', `TUI instrumentation ${taskName} failed.`, {
        severity: 'warning',
        target: options.owner,
        cause,
        data: { taskName }
      }));
    }
  }
}
