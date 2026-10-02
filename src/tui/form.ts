import type { TuiChildResult } from './child.ts';
import { createTuiPreparedQuery } from './prepared-query.ts';
import type { TuiPreparedQueryMessage, TuiPreparedQueryState } from './prepared-query.ts';
import type { TuiEffectContext } from './types.ts';

export type TuiFormErrors<TValues> = Readonly<Partial<Record<keyof TValues, string>>>;
export interface TuiFormState<TValues, TResult> {
  readonly values: TValues;
  readonly baseline: TValues;
  readonly touched: Readonly<Partial<Record<keyof TValues, boolean>>>;
  readonly errors: TuiFormErrors<TValues>;
  readonly validation: TuiPreparedQueryState<TuiFormErrors<TValues>>;
  readonly submission: TuiPreparedQueryState<TResult>;
  readonly submitRequested: boolean;
}
export type TuiFormMessage<TValues, TResult> =
  | { readonly kind: 'validation'; readonly completion: TuiPreparedQueryMessage<TuiFormErrors<TValues>> }
  | { readonly kind: 'submission'; readonly completion: TuiPreparedQueryMessage<TResult> };

export interface TuiForm<TValues extends object, TResult, TMessage> {
  readonly init: (values: TValues) => TuiFormState<TValues, TResult>;
  readonly dirty: (state: TuiFormState<TValues, TResult>) => boolean;
  readonly touch: (state: TuiFormState<TValues, TResult>, field: keyof TValues) => TuiChildResult<TuiFormState<TValues, TResult>, TMessage>;
  readonly change: (state: TuiFormState<TValues, TResult>, values: TValues) => TuiChildResult<TuiFormState<TValues, TResult>, TMessage>;
  readonly validate: (state: TuiFormState<TValues, TResult>) => TuiChildResult<TuiFormState<TValues, TResult>, TMessage>;
  readonly submit: (state: TuiFormState<TValues, TResult>) => TuiChildResult<TuiFormState<TValues, TResult>, TMessage>;
  readonly update: (state: TuiFormState<TValues, TResult>, message: TuiFormMessage<TValues, TResult>) => TuiChildResult<TuiFormState<TValues, TResult>, TMessage>;
}

/** Values are immutable application-owned snapshots. Validation rules and submission stay application code. */
export function createTuiForm<TValues extends object, TResult, TMessage>(options: {
  readonly id: string;
  readonly validate: (values: TValues) => TuiFormErrors<TValues>;
  readonly validateAsync?: (values: TValues, context: TuiEffectContext) => Promise<TuiFormErrors<TValues>>;
  readonly submit: (values: TValues, context: TuiEffectContext) => Promise<TResult>;
  readonly toMessage: (message: TuiFormMessage<TValues, TResult>) => TMessage;
}): TuiForm<TValues, TResult, TMessage> {
  const validation = createTuiPreparedQuery({ id: `${options.id}:validation`,
    prepare: async (values: TValues, context) => options.validateAsync?.(values, context) ?? ({} as TuiFormErrors<TValues>),
    toMessage: (completion: TuiPreparedQueryMessage<TuiFormErrors<TValues>>) => options.toMessage({ kind: 'validation', completion }) });
  const submission = createTuiPreparedQuery({ id: `${options.id}:submission`, prepare: options.submit,
    toMessage: (completion: TuiPreparedQueryMessage<TResult>) => options.toMessage({ kind: 'submission', completion }) });
  type State = TuiFormState<TValues, TResult>;
  type Result = TuiChildResult<State, TMessage>;
  const valid = (errors: TuiFormErrors<TValues>) => Object.values(errors).every((error) => error === undefined);
  function startSubmission(state: State): Result {
    const result = submission.request(state.submission, state.values);
    return { ...result, state: { ...state, submitRequested: false, submission: result.state } };
  }
  return Object.freeze({
    init(values: TValues): State {
      return { values, baseline: values, touched: {} as State['touched'], errors: {} as TuiFormErrors<TValues>, validation: validation.init(), submission: submission.init(), submitRequested: false };
    },
    dirty(state: State): boolean {
      const keys = new Set([...Object.keys(state.values), ...Object.keys(state.baseline)] as (keyof TValues)[]);
      for (const key of keys) if (!Object.is(state.values[key], state.baseline[key])) return true;
      return false;
    },
    touch(state: State, field: keyof TValues): Result {
      return { state: state.touched[field] ? state : { ...state, touched: { ...state.touched, [field]: true } } };
    },
    change(state: State, values: TValues): Result {
      if (Object.is(values, state.values)) return { state };
      const checked = validation.cancel(state.validation);
      const submitted = submission.cancel(state.submission);
      return { state: { ...state, values, errors: options.validate(values), validation: { ...checked.state, result: null },
        submission: { ...submitted.state, result: null }, submitRequested: false }, cancel: [...(checked.cancel ?? []), ...(submitted.cancel ?? [])] };
    },
    validate(state: State): Result {
      if (state.submitRequested || state.submission.pending) return { state };
      const errors = options.validate(state.values);
      if (!valid(errors) || options.validateAsync === undefined) return { state: { ...state, errors } };
      const result = validation.request(state.validation, state.values);
      return { ...result, state: { ...state, errors, validation: result.state } };
    },
    submit(state: State): Result {
      if (state.submitRequested || state.submission.pending) return { state };
      const errors = options.validate(state.values);
      const touched = Object.fromEntries(Object.keys(state.values).map((key) => [key, true])) as State['touched'];
      const checked = { ...state, errors, touched };
      if (!valid(errors)) return { state: checked };
      if (options.validateAsync === undefined) return startSubmission(checked);
      const result = validation.request(state.validation, state.values);
      return { ...result, state: { ...checked, validation: result.state, submitRequested: true } };
    },
    update(state: State, message: TuiFormMessage<TValues, TResult>): Result {
      if (message.kind === 'submission') {
        const result = submission.update(state.submission, message.completion);
        if (result.state === state.submission) return { state };
        return { state: { ...state, submission: result.state,
          ...(message.completion.kind === 'ready' ? { baseline: state.values } : {}) } };
      }
      const result = validation.update(state.validation, message.completion);
      if (result.state === state.validation) return { state };
      const errors = message.completion.kind === 'ready' ? message.completion.result : state.errors;
      const next = { ...state, validation: result.state, errors, submitRequested: false };
      return state.submitRequested && message.completion.kind === 'ready' && valid(errors) ? startSubmission(next) : { state: next };
    },
  });
}
