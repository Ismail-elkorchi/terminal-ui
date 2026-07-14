import type { BindableKeyName } from '../../input/index.ts';
import type { ElementKeyEvent } from '../../element/metadata.ts';

type InferredKeyHandler = (event: ElementKeyEvent) => unknown;

export type InferredElementKeyBindings =
  & Readonly<Partial<Record<BindableKeyName, InferredKeyHandler>>>
  & { readonly text?: Readonly<Record<string, InferredKeyHandler>> };

type MessageFromBinding<TBinding> =
  TBinding extends (...arguments_: infer _TArguments) => infer TResult
    ? Exclude<TResult, undefined>
    : TBinding extends Readonly<Record<PropertyKey, infer TValue>>
      ? MessageFromBinding<TValue>
      : never;

export type ComponentKeyBindingMessages<TBindings> = MessageFromBinding<TBindings>;

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

type PointerOverride<TOptions, TPointerMessage> =
  TOptions extends { readonly pointer?: infer TPointer }
    ? {
        readonly pointer?: Exclude<TPointer, undefined> extends infer TDefinedPointer
          ? TDefinedPointer extends { readonly onAction?: infer TOnAction }
            ? Omit<TDefinedPointer, 'onAction'> & {
                readonly onAction?: CallbackWithResult<TOnAction, TPointerMessage>;
              }
            : TDefinedPointer
          : never;
      }
    : Readonly<Record<never, never>>;

/**
 * Rebinds independent interaction channels without coupling their message
 * results to one inference variable. Domain options and callback parameters
 * remain those of the component's canonical options contract.
 */
export type IndependentInteractionOptions<
  TOptions,
  TCallbackMessages extends Partial<Record<keyof TOptions, unknown>> = Record<never, never>,
  TDirectMessages extends Partial<Record<keyof TOptions, unknown>> = Record<never, never>,
  TKeyBindings extends InferredElementKeyBindings | undefined = undefined,
  TPointerMessage = never
> =
  & Omit<TOptions, keyof TCallbackMessages | keyof TDirectMessages | 'keys' | 'pointer'>
  & CallbackOverrides<TOptions, TCallbackMessages>
  & DirectMessageOverrides<TOptions, TDirectMessages>
  & PointerOverride<TOptions, TPointerMessage>
  & { readonly keys?: TKeyBindings };
