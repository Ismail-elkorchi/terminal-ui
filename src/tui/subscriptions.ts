import { createTuiContext } from './context.ts';
import type { TerminalHost } from '../host/index.ts';
import type {
  TuiContext,
  TuiEventSource,
  TuiMessageSource,
  TuiSubscriptionContext,
  TuiSubscriptions
} from './types.ts';

interface ActiveTuiEventSource<TMessage> {
  readonly id: string;
  readonly controller: AbortController;
  readonly source: TuiEventSource<TMessage>;
}

export interface TuiSubscriptionManager<TState> {
  reconcile(state: TState): Promise<void>;
  dispose(): Promise<void>;
}

export interface TuiSubscriptionManagerOptions<TState, TMessage> {
  readonly host: TerminalHost;
  readonly subscriptions?: TuiSubscriptions<TState, TMessage>;
  readonly dispatch: (message: TMessage, source: TuiMessageSource) => void;
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
      const context = await createTuiContext<TMessage>(
        options.host,
        (message) => {
          options.dispatch(message, 'internal');
        }
      );
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
        const activeSource = startSource(source, context, options.dispatch);
        active.set(source.id, activeSource);
      }
    },
    async dispose() {
      await stopAll(active);
    }
  };
}

function startSource<TMessage>(
  source: TuiEventSource<TMessage>,
  baseContext: TuiContext<TMessage>,
  dispatch: (message: TMessage, source: TuiMessageSource) => void
): ActiveTuiEventSource<TMessage> {
  const controller = new AbortController();
  const sourceName = source.source ?? 'external';
  const context: TuiSubscriptionContext<TMessage> = {
    ...baseContext,
    signal: controller.signal,
    dispatch(message) {
      dispatch(message, sourceName);
    }
  };
  void pumpSource(source, context);
  return { id: source.id, controller, source };
}

async function pumpSource<TMessage>(
  source: TuiEventSource<TMessage>,
  context: TuiSubscriptionContext<TMessage>
): Promise<void> {
  try {
    for await (const message of source.messages(context)) {
      if (context.signal.aborted) break;
      context.dispatch(message);
    }
  } catch {
    // Runtime diagnostics for failed async sources need a broader diagnostic
    // channel. For now cancellation and explicit app messages remain the
    // supported source lifecycle surface.
  }
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
