import { findUnsupportedField, isNonArrayObject } from '../foundation/validation.ts';

export type ComponentCallbackRequirement = 'required' | 'optional' | 'forbidden';

type KeysOfUnion<T> = T extends unknown ? keyof T : never;
export type ComponentOptionKey<T extends object> = Extract<KeysOfUnion<T>, string>;
export type CompleteComponentOptionFields<
  TOptions extends object,
  TFields extends readonly string[],
> = Exclude<ComponentOptionKey<TOptions>, TFields[number]> extends never
    ? unknown
    : { readonly missingOptionFields: Exclude<ComponentOptionKey<TOptions>, TFields[number]> };

export interface ComponentOptionsSchema<
  TOptions extends object,
  TFields extends readonly ComponentOptionKey<TOptions>[],
> {
  readonly fields: TFields & CompleteComponentOptionFields<TOptions, TFields>;
  readonly callbacks?: Readonly<Record<string, ComponentCallbackRequirement>>;
  readonly forbiddenFields?: readonly ComponentOptionKey<TOptions>[];
}

/** Validate the exact JavaScript option surface before a public factory transforms it. */
export function assertComponentOptions<
  TOptions extends object,
  const TFields extends readonly ComponentOptionKey<TOptions>[],
>(
  value: TOptions,
  component: string,
  schema: ComponentOptionsSchema<TOptions, TFields>,
): void {
  if (!isNonArrayObject(value)) throw new TypeError(`${component} options must be an object.`);
  const unsupported = findUnsupportedField(value, new Set(schema.fields));
  if (unsupported !== undefined) {
    throw new TypeError(`${component} options contain unknown field "${unsupported}".`);
  }
  for (const field of schema.forbiddenFields ?? []) {
    if (value[field] !== undefined) {
      throw new TypeError(`${component} cannot accept ${field} in its unavailable state.`);
    }
  }
  for (const [field, requirement] of Object.entries(schema.callbacks ?? {})) {
    const callback = value[field];
    if (requirement === 'forbidden') {
      if (callback !== undefined) {
        throw new TypeError(`${component} cannot accept ${field} in its unavailable state.`);
      }
      continue;
    }
    if (callback === undefined) {
      if (requirement === 'required') throw new TypeError(`${component} ${field} must be a function.`);
      continue;
    }
    if (typeof callback !== 'function') {
      throw new TypeError(`${component} ${field} must be a function when provided.`);
    }
  }
}
