import { diagnostic } from '../diagnostics.ts';
import { createTuiContext } from './context.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { TerminalHost } from '../host/index.ts';
import type {
  TuiContext,
  TuiEventSource,
  TuiMessageSource,
  TuiSourceLifecycle,
  TuiSubscriptionContext,
  TuiSubscriptions
} from './types.ts';

interface ActiveTuiEventSource<TMessage> {
  readonly id: string;
  readonly controller: AbortController;
  readonly source: TuiEventSource<TMessage>;
  settled: boolean;
}

export interface TuiSubscriptionManager<TState> {
  reconcile(state: TState): Promise<void>;
  dispose(): Promise<void>;
}

export interface TuiSubscriptionManagerOptions<TState, TMessage> {
  readonly host: TerminalHost;
  readonly subscriptions?: TuiSubscriptions<TState, TMessage>;
  readonly dispatch: (message: TMessage, source: TuiMessageSource) => Promise<void>;
  readonly diagnostics: () => readonly TerminalDiagnostic[];
  readonly reportDiagnostic: (item: TerminalDiagnostic) => void;
}

export function createTuiSubscriptionManager<TState, TMessage>(
  options: TuiSubscriptionManagerOptions<TState, TMessage>
): TuiSubscriptionManager<TState> {
  const active = new Map<string, ActiveTuiEventSource<TMessage>>();

  return {
    async reconcile(state) {
      if (options.subscriptions === undefined) {
        await stopAll(active);
        return;
      }
      const context = await createTuiContext(options.host, options.diagnostics());
      const requested = options.subscriptions(state, context);
      const requestedIds = new Set(requested.map((source) => source.id));
      for (const [id, activeSource] of active) {
        if (!requestedIds.has(id)) {
          active.delete(id);
          await stopSource(activeSource);
        }
      }
      for (const source of requested) {
        if (active.has(source.id)) continue;
        const activeSource = startSource(source, context, options);
        active.set(source.id, activeSource);
      }
    },
    async dispose() {
      await stopAll(active);
    }
  };
}

function startSource<TState, TMessage>(
  source: TuiEventSource<TMessage>,
  baseContext: TuiContext,
  options: TuiSubscriptionManagerOptions<TState, TMessage>
): ActiveTuiEventSource<TMessage> {
  const controller = new AbortController();
  const active: ActiveTuiEventSource<TMessage> = { id: source.id, controller, source, settled: false };
  const context: TuiSubscriptionContext = { ...baseContext, signal: controller.signal };
  void pumpSource(active, context, options).finally(() => {
    active.settled = true;
  });
  return active;
}

async function pumpSource<TState, TMessage>(
  active: ActiveTuiEventSource<TMessage>,
  context: TuiSubscriptionContext,
  options: TuiSubscriptionManagerOptions<TState, TMessage>
): Promise<void> {
  const sourceName = active.source.source ?? 'external';
  try {
    const messages = active.source.messages(context);
    if (active.source.delivery === 'latest') {
      await pumpLatest(messages, context.signal, (message) => options.dispatch(message, sourceName));
    } else {
      for await (const message of messages) {
        if (context.signal.aborted) break;
        await options.dispatch(message, sourceName);
      }
    }
    if (!context.signal.aborted) await dispatchLifecycle(active.source, { kind: 'completed', id: active.id }, sourceName, options);
  } catch (cause) {
    if (context.signal.aborted) return;
    const item = diagnostic('TUI_SOURCE_FAILED', `TUI event source ${active.id} failed.`, {
      target: active.id,
      cause,
      data: { delivery: active.source.delivery }
    });
    options.reportDiagnostic(item);
    await dispatchLifecycle(active.source, { kind: 'failed', id: active.id, diagnostic: item }, sourceName, options);
  }
}

async function pumpLatest<TMessage>(
  messages: AsyncIterable<TMessage>,
  signal: AbortSignal,
  dispatch: (message: TMessage) => Promise<void>
): Promise<void> {
  let pending: { readonly message: TMessage } | undefined;
  let drain: Promise<void> | undefined;
  const ensureDrain = (): void => {
    if (drain !== undefined) return;
    drain = (async () => {
      while (!signal.aborted && pending !== undefined) {
        const next = pending;
        pending = undefined;
        await dispatch(next.message);
      }
    })().finally(() => {
      drain = undefined;
      if (!signal.aborted && pending !== undefined) ensureDrain();
    });
  };

  for await (const message of messages) {
    if (signal.aborted) break;
    pending = { message };
    ensureDrain();
  }
  while (drain !== undefined) await drain;
}

async function dispatchLifecycle<TState, TMessage>(
  source: TuiEventSource<TMessage>,
  event: TuiSourceLifecycle,
  sourceName: TuiMessageSource,
  options: TuiSubscriptionManagerOptions<TState, TMessage>
): Promise<void> {
  const message = source.onLifecycle?.(event);
  if (message !== undefined) await options.dispatch(message, sourceName);
}

async function stopAll<TMessage>(active: Map<string, ActiveTuiEventSource<TMessage>>): Promise<void> {
  const sources = [...active.values()];
  active.clear();
  await Promise.all(sources.map(stopSource));
}

async function stopSource<TMessage>(active: ActiveTuiEventSource<TMessage>): Promise<void> {
  active.controller.abort();
  await active.source.dispose?.();
}
