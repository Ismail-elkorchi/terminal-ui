import type { ComponentKeyBindings } from '../options/base.ts';

type CallbackWithResult<TCallback, TResult> =
  Exclude<TCallback, undefined> extends (...arguments_: infer TArguments) => unknown
    ? (...arguments_: TArguments) => TResult
    : never;

type CallbackOverrides<
  TOptions,
  TMessages extends Partial<Record<keyof TOptions, unknown>>
> = {
  readonly [TKey in keyof TMessages]?:
    TKey extends keyof TOptions
      ? CallbackWithResult<TOptions[TKey], TMessages[TKey]>
      : never;
};

type DirectMessageOverrides<
  TOptions,
  TMessages extends Partial<Record<keyof TOptions, unknown>>
> = {
  readonly [TKey in keyof TMessages]?:
    TKey extends keyof TOptions ? TMessages[TKey] : never;
};

/**
 * Rebinds independent interaction channels without coupling their message
 * results to one inference variable. Domain options and callback parameters
 * remain those of the component's canonical options contract.
 */
export type IndependentInteractionOptions<
  TOptions,
  TCallbackMessages extends Partial<Record<keyof TOptions, unknown>> = Record<never, never>,
  TDirectMessages extends Partial<Record<keyof TOptions, unknown>> = Record<never, never>,
  TKeyMessage = never
> =
  & Omit<TOptions, keyof TCallbackMessages | keyof TDirectMessages | 'keys'>
  & CallbackOverrides<TOptions, TCallbackMessages>
  & DirectMessageOverrides<TOptions, TDirectMessages>
  & { readonly keys?: ComponentKeyBindings<TKeyMessage> };
