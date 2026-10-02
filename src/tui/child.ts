import type { Element } from '../element/types.ts';
import { renderNodeId } from '../foundation/identity.ts';
import type { InitialFocusSelector } from '../interaction/focus.ts';
import { isIgnoredMessage } from '../interaction/message.ts';
import { scopeElement } from '../renderer/internal/render-tree/element.ts';
import { scopeWork } from './lifecycle/work-ownership.ts';
import type {
  TuiUpdateContribution, TuiCancellation, TuiContext, TuiEffect, TuiEffectOutput, TuiEventSource, TuiSubscriptions,
} from './types.ts';

/** A parent-owned identity. Use a fresh generation whenever a removed child is mounted again. */
export interface TuiChildIdentity {
  readonly id: string;
  readonly generation: string | number;
}

/** Explicit child state stored in the parent's ordinary aggregate state. */
export interface TuiChildState<TState> extends TuiChildIdentity {
  readonly state: TState;
}

export interface TuiChildMessage<TMessage> extends TuiChildIdentity {
  readonly message: TMessage;
}

/** Domain outputs are returned to the parent, never implicitly dispatched or interpreted. */
export interface TuiChildResult<TState, TMessage, TOutput = never> extends TuiUpdateContribution<TState, TMessage, Exclude<InitialFocusSelector, { readonly kind: 'path' }>> {
  readonly outputs?: readonly TOutput[];
}

export interface TuiChildDefinition<TState, TMessage, TOutput = never> {
  readonly init: (context: TuiContext) => TuiChildResult<TState, TMessage, TOutput>;
  readonly update: (state: TState, message: TMessage, context: TuiContext) => TuiChildResult<TState, TMessage, TOutput>;
  readonly view: (state: TState, context: TuiContext) => Element<TMessage>;
  readonly subscriptions?: TuiSubscriptions<TState, TMessage>;
}

/** Stateless composition into one parent's existing update, render and work lifecycle. */
export interface TuiChild<TState, TMessage, TParentMessage, TOutput = never> {
  readonly init: (identity: TuiChildIdentity, context: TuiContext) => TuiChildResult<TuiChildState<TState>, TParentMessage, TOutput>;
  readonly update: (child: TuiChildState<TState>, message: TuiChildMessage<TMessage>, context: TuiContext) => TuiChildResult<TuiChildState<TState>, TParentMessage, TOutput>;
  readonly view: (child: TuiChildState<TState>, context: TuiContext) => Element<TParentMessage>;
  readonly subscriptions: (child: TuiChildState<TState>, context: TuiContext) => readonly TuiEventSource<TParentMessage>[];
  /** Cancel this lifetime and remove its state and subscriptions in the same update. */
  readonly remove: (child: TuiChildState<TState>) => TuiCancellation;
  /** Resolve a local element identity when the parent intentionally requests child focus. */
  readonly elementId: (child: TuiChildIdentity, localId: string) => string;
}

/** Compose a reusable child without a registry, a second store or a second runtime. */
export function createTuiChild<TState, TMessage, TParentMessage, TOutput = never>(
  definition: TuiChildDefinition<TState, TMessage, TOutput>,
  toParentMessage: (message: TuiChildMessage<TMessage>) => TParentMessage,
): TuiChild<TState, TMessage, TParentMessage, TOutput> {
  const mapMessage = (identity: TuiChildIdentity, message: TMessage): TParentMessage =>
    toParentMessage({ id: identity.id, generation: identity.generation, message });
  const scopeId = (identity: TuiChildIdentity, id: string): string =>
    JSON.stringify([identity.id, identity.generation, renderNodeId(id, 'TUI child local')]);

  function result(
    identity: TuiChildIdentity,
    previous: TuiChildState<TState> | undefined,
    local: TuiChildResult<TState, TMessage, TOutput>,
  ): TuiChildResult<TuiChildState<TState>, TParentMessage, TOutput> {
    const effects = local.effects?.map((effect): TuiEffect<TParentMessage> => {
      const onError = effect.onError?.bind(effect);
      return scopeWork(identity, effect, {
        id: scopeId(identity, effect.id),
        concurrency: effect.concurrency,
        run: async (context) => mapOutput(await effect.run(context), (message) => mapMessage(identity, message)),
        ...(onError === undefined ? {} : {
          onError: (failure) => mapOutput(onError({ ...failure, id: effect.id }), (message) => mapMessage(identity, message)),
        }),
      });
    });
    return {
      state: previous !== undefined && Object.is(previous.state, local.state) ? previous : Object.freeze({
        id: identity.id,
        generation: identity.generation,
        state: local.state,
      }),
      ...(effects === undefined ? {} : { effects }),
      ...(local.cancel === undefined ? {} : { cancel: local.cancel.map((request) => request.kind === 'effect'
        ? { kind: 'effect' as const, id: scopeId(identity, request.id) }
        : scopeWork(identity, request, { ...request })) }),
      ...(local.focus === undefined ? {} : { focus: scopeFocus(local.focus, (id) => scopeId(identity, id)) }),
      ...(local.outputs === undefined ? {} : { outputs: local.outputs }),
    };
  }

  return Object.freeze({
    init(identity: TuiChildIdentity, context: TuiContext) {
      renderNodeId(identity.id, 'TUI child');
      if (typeof identity.generation !== 'string' && !(typeof identity.generation === 'number' && Number.isFinite(identity.generation))) {
        throw new TypeError('TUI child generation must be a string or finite number.');
      }
      return result(identity, undefined, definition.init(context));
    },
    update(child: TuiChildState<TState>, envelope: TuiChildMessage<TMessage>, context: TuiContext) {
      if (child.id !== envelope.id || child.generation !== envelope.generation) return { state: child };
      return result(child, child, definition.update(child.state, envelope.message, context));
    },
    view(child: TuiChildState<TState>, context: TuiContext) {
      return scopeElement(definition.view(child.state, context), (message) => mapMessage(child, message as TMessage), (id) => scopeId(child, id)) as Element<TParentMessage>;
    },
    subscriptions(child: TuiChildState<TState>, context: TuiContext) {
      return (definition.subscriptions?.(child.state, context) ?? []).map((source): TuiEventSource<TParentMessage> => {
        const onLifecycle = source.onLifecycle?.bind(source);
        const dispose = source.dispose?.bind(source);
        return scopeWork(child, source, {
          id: scopeId(child, source.id),
          generation: source.generation,
          ...(source.source === undefined ? {} : { source: source.source }),
          ...(source.channel === undefined ? {} : { channel: source.channel }),
          run: (sourceContext, sink) => source.run(sourceContext, {
            emit: (emission) => sink.emit({ ...emission, message: mapMessage(child, emission.message) }),
          }),
          ...(onLifecycle === undefined ? {} : {
            onLifecycle: (event) => {
              const message = onLifecycle({ ...event, id: source.id });
              return isIgnoredMessage(message) ? message : mapMessage(child, message);
            },
          }),
          ...(dispose === undefined ? {} : { dispose: () => dispose() }),
        });
      });
    },
    remove: (child: TuiChildState<TState>): TuiCancellation => Object.freeze({ kind: 'child', id: child.id, generation: child.generation }),
    elementId: scopeId,
  });
}

function mapOutput<TMessage, TParentMessage>(
  output: TuiEffectOutput<TMessage>,
  map: (message: TMessage) => TParentMessage,
): TuiEffectOutput<TParentMessage> {
  if (output.kind === 'none') return output;
  return output.kind === 'message'
    ? { kind: 'message', message: map(output.message) }
    : { kind: 'messages', messages: output.messages.map(map) };
}

function scopeFocus(selector: Exclude<InitialFocusSelector, { readonly kind: 'path' }>, map: (id: string) => string): Exclude<InitialFocusSelector, { readonly kind: 'path' }> {
  return { ...selector, elementId: map(selector.elementId) };
}
