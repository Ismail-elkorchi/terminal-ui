import { diagnostic } from '../diagnostics.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { TuiContext, TuiEffect, TuiEffectContext } from './types.ts';
import { effectExecutionId } from '../foundation/identity.ts';
import type { EffectExecutionId } from '../foundation/identity.ts';

interface ActiveEffect {
  readonly id: EffectExecutionId;
  readonly controller: AbortController;
  readonly completion: Promise<void>;
}

export interface TuiEffectManager<TMessage> {
  start(effects: readonly TuiEffect<TMessage>[]): void;
  cancel(): void;
  dispose(): Promise<void>;
}

export interface TuiEffectManagerOptions<TMessage> {
  readonly context: () => Promise<TuiContext>;
  readonly dispatch: (message: TMessage) => Promise<void>;
  readonly reportDiagnostic: (item: TerminalDiagnostic) => void;
}

export function createTuiEffectManager<TMessage>(
  options: TuiEffectManagerOptions<TMessage>
): TuiEffectManager<TMessage> {
  const active = new Set<ActiveEffect>();
  const activeById = new Map<EffectExecutionId, Set<ActiveEffect>>();
  const queues = new Map<EffectExecutionId, TuiEffect<TMessage>[]>();
  let disposed = false;

  function launch(effect: TuiEffect<TMessage>): void {
    const id = effectExecutionId(effect.id);
    const controller = new AbortController();
    const execution: ActiveEffect = {
      id,
      controller,
      completion: runEffect(effect, controller, options).finally(() => {
        active.delete(execution);
        const group = activeById.get(id);
        group?.delete(execution);
        if (group?.size === 0) activeById.delete(id);
        launchNextQueued(id);
      })
    };
    active.add(execution);
    const group = activeById.get(id) ?? new Set<ActiveEffect>();
    group.add(execution);
    activeById.set(id, group);
  }

  function launchNextQueued(id: EffectExecutionId): void {
    if (disposed || activeById.has(id)) return;
    const queue = queues.get(id);
    const next = queue?.shift();
    if (queue?.length === 0) queues.delete(id);
    if (next !== undefined) launch(next);
  }

  function abortGroup(id: EffectExecutionId): void {
    for (const execution of activeById.get(id) ?? []) execution.controller.abort();
    queues.delete(id);
  }

  function schedule(effect: TuiEffect<TMessage>): void {
    const id = effectExecutionId(effect.id);
    const hasActive = activeById.has(id);
    if (effect.concurrency === 'parallel') {
      launch(effect);
      return;
    }
    if (effect.concurrency === 'keep-first') {
      if (!hasActive && (queues.get(id)?.length ?? 0) === 0) launch(effect);
      return;
    }
    if (effect.concurrency === 'replace') {
      abortGroup(id);
      launch(effect);
      return;
    }
    if (hasActive) {
      const queue = queues.get(id) ?? [];
      queue.push(effect);
      queues.set(id, queue);
      return;
    }
    launch(effect);
  }

  return {
    start(effects) {
      if (disposed) return;
      for (const effect of effects) schedule(effect);
    },
    cancel() {
      cancelAll();
    },
    async dispose() {
      cancelAll();
      const completions = [...active].map((item) => {
        return item.completion;
      });
      await Promise.allSettled(completions);
      active.clear();
      activeById.clear();
    }
  };

  function cancelAll(): void {
    disposed = true;
    queues.clear();
    for (const execution of active) execution.controller.abort();
  }
}

async function runEffect<TMessage>(
  effect: TuiEffect<TMessage>,
  controller: AbortController,
  options: TuiEffectManagerOptions<TMessage>
): Promise<void> {
  const base = await options.context();
  const context: TuiEffectContext = { ...base, signal: controller.signal };
  try {
    const output = await effect.run(context);
    if (controller.signal.aborted || output.kind === 'none') return;
    const messages = output.kind === 'message' ? [output.message] : output.messages;
    for (const message of messages) {
      await options.dispatch(message);
      if (abortRequested(controller.signal)) break;
    }
  } catch (cause) {
    if (controller.signal.aborted) return;
    const item = diagnostic('TUI_EFFECT_FAILED', `TUI effect ${effect.id} failed.`, {
      target: effect.id,
      cause
    });
    options.reportDiagnostic(item);
    const output = effect.onError?.({ id: effect.id, diagnostic: item });
    if (output === undefined || output.kind === 'none') return;
    const messages = output.kind === 'message' ? [output.message] : output.messages;
    for (const message of messages) await options.dispatch(message);
  }
}

function abortRequested(signal: AbortSignal): boolean {
  return signal.aborted;
}
