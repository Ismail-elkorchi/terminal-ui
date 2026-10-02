/** Ordinary component reducers, keyed by the string state field they control. */
export type TuiControlReducers<TState> = {
  readonly [TKey in keyof TState & string]?: (state: TState[TKey], transition: never, parent: TState) => TState[TKey];
};

/** A discriminated field/transition pair accepted by a configured control handle. */
export type TuiControlTransitionMessage<TState, TReducers extends TuiControlReducers<TState>> = {
  [TKey in keyof TReducers & keyof TState & string]: {
    readonly kind: 'control';
    readonly control: TKey;
    readonly transition: Parameters<NonNullable<TReducers[TKey]>>[1];
  }
}[keyof TReducers & keyof TState & string];

/** Stateless bindings for an application's existing controlled fields. */
export interface TuiControls<TState, TReducers extends TuiControlReducers<TState>> {
  /** Reduce against current parent state, never the state captured by a rendered callback. */
  readonly update: (state: TState, message: TuiControlTransitionMessage<TState, TReducers>) => { readonly state: TState };
  readonly onTransition: <TKey extends keyof TReducers & keyof TState & string>(key: TKey) =>
    (transition: Parameters<NonNullable<TReducers[TKey]>>[1]) => TuiControlTransitionMessage<TState, TReducers>;
  readonly bind: <TKey extends keyof TReducers & keyof TState & string>(key: TKey, state: TState) => {
    readonly state: TState[TKey];
    readonly onTransition: (transition: Parameters<NonNullable<TReducers[TKey]>>[1]) => TuiControlTransitionMessage<TState, TReducers>;
  };
}

/** The plain component-transition branch of an application's message union. */
export type TuiControlMessage<TControls> = TControls extends { update(state: never, message: infer TMessage): unknown }
  ? TMessage : never;

/** Wire ordinary state fields once. Domain transitions remain in the application reducer. */
export function createTuiControls<TState>(): <TReducers extends TuiControlReducers<TState> & Record<Exclude<keyof TReducers, keyof TState & string>, never>>(
  reducers: TReducers,
) => TuiControls<TState, TReducers> {
  return <TReducers extends TuiControlReducers<TState> & Record<Exclude<keyof TReducers, keyof TState & string>, never>>(
    reducers: TReducers,
  ): TuiControls<TState, TReducers> => {
    const ownedReducers = Object.freeze({ ...reducers });
    // One immutable binding per declared field. Callbacks carry no captured parent state.
    const messages = new Map(Object.keys(ownedReducers).map(control => [control,
      (transition: unknown) => ({ kind: 'control' as const, control, transition }),
    ] as const));
    const onTransition = <TKey extends keyof TReducers & keyof TState & string>(control: TKey) => {
      const callback = messages.get(control);
      if (callback === undefined) throw new TypeError(`Unknown controlled field: ${control}`);
      return callback as (transition: Parameters<NonNullable<TReducers[TKey]>>[1]) => TuiControlTransitionMessage<TState, TReducers>;
    };
    return Object.freeze({
      update(state: TState, message: TuiControlTransitionMessage<TState, TReducers>) {
        const key = message.control;
        // The message's discriminated key/transition pair selects the matching reducer.
        const reduce = ownedReducers[key] as unknown as (value: TState[typeof key], transition: unknown, parent: TState) => TState[typeof key];
        const next = reduce(state[key], message.transition, state);
        return { state: Object.is(next, state[key]) ? state : { ...state, [key]: next } };
      },
      onTransition,
      bind: <TKey extends keyof TReducers & keyof TState & string>(key: TKey, state: TState) => ({ state: state[key], onTransition: onTransition(key) }),
    });
  };
}
