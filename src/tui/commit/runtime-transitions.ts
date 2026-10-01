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
import { createRuntimeReducer } from './runtime-reducer.ts';
import type { TuiSubscriptionManager } from '../lifecycle/subscriptions.ts';
import { sameTerminalSize } from '../terminal-size.ts';
import { recordTuiCommit } from '../transcript.ts';
import type { TuiContext, TuiExit, TuiRuntimeOptions } from '../types.ts';

interface RuntimeTransitionInput<TMessage> {
  readonly messages: readonly PendingTuiMessage<TMessage>[];
  readonly terminalSize: TerminalSize;
  readonly requestedFocusPath: FocusPath | undefined;
  readonly forceFrame?: boolean;
}

interface RuntimeTransitionsOptions<TState, TMessage> {
  readonly owner: string;
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
  const reducer = createRuntimeReducer(definition.update, options.recordMessage);
  let terminalExit: TuiExit<TState> | undefined;
  return {
    start: startInternal,
    commit: commitRuntimeTransition,
    commitInContext: commitRuntimeTransitionInContext,
    instrument: runInstrumentation,
    exit: () => terminalExit,
    failTerminalOwnership(cause: unknown) {
      diagnostics.record(diagnostic(
        'TUI_TERMINAL_OWNERSHIP_FAILED',
        'Terminal ownership could not be re-established.',
        { severity: 'fatal', target: options.owner, cause },
      ));
      const render = commits.renderOrUndefined();
      if (commits.hasState() && render !== undefined) {
        terminalExit = {
          status: 'error',
          state: commits.state(),
          diagnostics: diagnostics.values(),
          snapshot: render.frame.accessibility,
        };
        changes.publish({ kind: 'exit', exit: terminalExit });
      } else {
        changes.close(new TerminalUiError('Terminal ownership could not be re-established.'));
      }
    },
  };

  async function startInternal(): Promise<Frame> {
    try {
      const context = await createRuntimeContext();
      const initial = decodeTuiInitialResult<TState, TMessage>(definition.init(context));
      const subscriptionPlan = await subscriptions.plan(initial.state, context);
      const result = await commits.initial(initial.state, context, commits.version(), initial.focus ?? options.initialFocus);
      commits.publish(result, initial.state, 0);
      if (lifecycle.phase() === 'starting') lifecycle.activate();
      options.recordFrameCommit();
      recordCommittedRender(result.render, result.diff);
      if (initial.exit === undefined && lifecycle.active()) runPostCommit('subscription_activation', () => {
        subscriptions.activate(subscriptionPlan);
      });
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
        if (initial.effects !== undefined && lifecycle.active()) {
          const initialEffects = initial.effects;
          runPostCommit('effect_start', () => { effects.start(initialEffects); });
        }
        const postCommitMessages = [...layoutMessages, ...focusMessages];
        if (postCommitMessages.length > 0 && lifecycle.active()) {
          await dispatchPostCommitMessages(postCommitMessages, 'layout_and_focus_lifecycle');
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
      lifecycle.fail();
      subscriptions.cancel();
      effects.cancel();
      throw cause;
    }
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
    if (subscriptionPlan !== undefined && lifecycle.active()) {
      runPostCommit('subscription_activation', () => { subscriptions.activate(subscriptionPlan); });
    }
    if (reduction.exitReason === undefined && lifecycle.active()) {
      runPostCommit('effect_cancellation', () => { effects.cancelIds(reduction.cancelEffects); });
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
      if (terminalExit === undefined && lifecycle.active()) {
        runPostCommit('effect_start', () => { startReductionEffects(reduction); });
      }
      const postCommitMessages = [...layoutMessages, ...focusMessages];
      if (postCommitMessages.length > 0) await dispatchPostCommitMessages(postCommitMessages, 'layout_and_focus_lifecycle');
    }
    return commits.state();
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
        target: options.owner,
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
        target: options.owner,
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
        target: options.owner,
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
        target: options.owner,
        cause,
        data: { taskName }
      }));
    }
  }
}
