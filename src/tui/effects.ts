import { diagnostic } from '../diagnostics.ts';
import { createTuiContext } from './context.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { TerminalHost } from '../host/index.ts';
import type { TuiEffect, TuiEffectContext } from './types.ts';

interface ActiveEffect {
  readonly controller: AbortController;
}

export interface TuiEffectManager<TMessage> {
  start(effects: readonly TuiEffect<TMessage>[]): void;
  dispose(): Promise<void>;
}

export interface TuiEffectManagerOptions<TMessage> {
  readonly host: TerminalHost;
  readonly diagnostics: () => readonly TerminalDiagnostic[];
  readonly dispatch: (message: TMessage) => Promise<void>;
  readonly reportDiagnostic: (item: TerminalDiagnostic) => void;
}

export function createTuiEffectManager<TMessage>(
  options: TuiEffectManagerOptions<TMessage>
): TuiEffectManager<TMessage> {
  const active = new Map<string, ActiveEffect>();

  return {
    start(effects) {
      for (const effect of effects) {
        if (active.has(effect.id)) continue;
        const controller = new AbortController();
        active.set(effect.id, { controller });
        void runEffect(effect, controller, options).finally(() => {
          const current = active.get(effect.id);
          if (current?.controller === controller) active.delete(effect.id);
        });
      }
    },
    async dispose() {
      for (const item of active.values()) item.controller.abort();
      active.clear();
      await Promise.resolve();
    }
  };
}

async function runEffect<TMessage>(
  effect: TuiEffect<TMessage>,
  controller: AbortController,
  options: TuiEffectManagerOptions<TMessage>
): Promise<void> {
  const base = await createTuiContext(options.host, options.diagnostics());
  const context: TuiEffectContext = { ...base, signal: controller.signal };
  try {
    const output = await effect.run(context);
    if (controller.signal.aborted || output === undefined) return;
    const messages = isMessageArray<TMessage>(output) ? output : [output];
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
    const message = effect.onError?.({ id: effect.id, diagnostic: item });
    if (message !== undefined) await options.dispatch(message);
  }
}

function isMessageArray<TMessage>(
  value: TMessage | readonly TMessage[]
): value is readonly TMessage[] {
  return Array.isArray(value);
}

function abortRequested(signal: AbortSignal): boolean {
  return signal.aborted;
}
