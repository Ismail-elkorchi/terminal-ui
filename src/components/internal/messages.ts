import type { BindableKeyName } from '../../input/index.ts';
import type { ElementKeyEvent } from '../../element/metadata.ts';
import type { IgnoredMessage } from '../../interaction/message.ts';

type InferredKeyHandler = (event: ElementKeyEvent) => unknown;

export type InferredElementKeyBindings =
  & Readonly<Partial<Record<BindableKeyName, InferredKeyHandler>>>
  & {
    readonly triggers?: readonly {
      readonly trigger: Readonly<Record<string, unknown>>;
      readonly onKey: InferredKeyHandler;
    }[];
    readonly text?: Readonly<Record<string, InferredKeyHandler>>;
  };

type MessageFromKeyHandler<THandler> =
  THandler extends (...arguments_: infer _TArguments) => infer TResult
    ? Exclude<TResult, IgnoredMessage>
    : never;

type NamedKeyBindingMessages<TBindings> = TBindings extends object
  ? {
      [TKey in Exclude<keyof TBindings, 'triggers' | 'text'>]: MessageFromKeyHandler<TBindings[TKey]>;
    }[Exclude<keyof TBindings, 'triggers' | 'text'>]
  : never;

type TriggerKeyBindingMessages<TBindings> = TBindings extends {
  readonly triggers?: infer TTriggers;
}
  ? TTriggers extends readonly (infer TBinding)[]
    ? TBinding extends { readonly onKey: infer THandler }
      ? MessageFromKeyHandler<THandler>
      : never
    : never
  : never;

type TextKeyBindingMessages<TBindings> = TBindings extends {
  readonly text?: infer TText;
}
  ? TText extends object
    ? MessageFromKeyHandler<TText[keyof TText]>
    : never
  : never;

export type ComponentKeyBindingMessages<TBindings> =
  | NamedKeyBindingMessages<TBindings>
  | TriggerKeyBindingMessages<TBindings>
  | TextKeyBindingMessages<TBindings>;

type CallbackWithResult<TCallback, TResult> =
  Exclude<TCallback, undefined> extends (...arguments_: infer TArguments) => unknown
    ? (...arguments_: TArguments) => TResult
    : never;

type OptionalKeys<TValue> = {
  [TKey in keyof TValue]-?: Readonly<Record<never, never>> extends Pick<TValue, TKey> ? TKey : never;
}[keyof TValue];

type CallbackMessageKeys<
  TOptions,
  TMessages extends Partial<Record<keyof TOptions, unknown>>
> = keyof TMessages & keyof TOptions;

type CallbackOverrides<
  TOptions,
  TMessages extends Partial<Record<keyof TOptions, unknown>>
> =
  & {
    readonly [TKey in Exclude<CallbackMessageKeys<TOptions, TMessages>, OptionalKeys<TOptions>>]:
      CallbackWithResult<TOptions[TKey], TMessages[TKey]>;
  }
  & {
    readonly [TKey in Extract<CallbackMessageKeys<TOptions, TMessages>, OptionalKeys<TOptions>>]?:
      CallbackWithResult<TOptions[TKey], TMessages[TKey]>;
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
  TKeyBindings extends InferredElementKeyBindings | undefined = undefined,
  TPointerMessage = never
> = TOptions extends unknown
  ? & Omit<TOptions, keyof TCallbackMessages | 'keys' | 'pointer'>
    & CallbackOverrides<TOptions, TCallbackMessages>
    & PointerOverride<TOptions, TPointerMessage>
    & { readonly keys?: TKeyBindings }
  : never;
