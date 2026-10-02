import { findUnsupportedField, isNonArrayObject } from '../foundation/validation.ts';
import type { ElementVisualState } from '../visual/frame-source.ts';
import { maximumModelDependencySlots, ownModelDependencies } from '../visual/model-dependencies.ts';
import type { TerminalStyle } from '../visual/render-content.ts';
import { decodeTerminalStyle, mergeTerminalStyles } from '../visual/terminal-style.ts';
import type { ElementStyles } from './metadata.ts';

const stylesPaintDescriptor = Symbol('element styles');
const statesPaintDescriptor = Symbol('element states');
const statePaintDescriptor = Symbol('element state');

const allVisualStates = new Set<Exclude<ElementVisualState, 'default'>>([
  'focused',
  'hovered',
  'pressed',
  'selected',
  'disabled',
  'active',
  'busy',
  'readOnly',
]);

export interface ElementStyleContract {
  readonly subject: string;
  readonly parts: ReadonlySet<string>;
  readonly states?: ReadonlySet<Exclude<ElementVisualState, 'default'>>;
}

export function decodeElementStyles(
  value: unknown,
  contract: ElementStyleContract,
): ElementStyles<string, Exclude<ElementVisualState, 'default'>> {
  if (!isNonArrayObject(value)) throw new TypeError(`${contract.subject} must be an object.`);
  const unsupported = findUnsupportedField(value, new Set(['root', 'parts', 'states']));
  if (unsupported !== undefined) {
    throw new TypeError(`${contract.subject} contains unknown field "${unsupported}".`);
  }
  const root = optionalStyle(value['root'], `${contract.subject}.root`);
  const parts = styleMap(value['parts'], contract.parts, `${contract.subject}.parts`);
  const states = stateStyleMap(
    value['states'],
    contract.states ?? allVisualStates,
    contract.parts,
    `${contract.subject}.states`,
  );
  const model = {
    ...(root === undefined ? {} : { root }),
    ...(parts === undefined ? {} : { parts }),
    ...(states === undefined ? {} : { states }),
  };
  const slots = elementStylePaintSlots(model);
  return slots === undefined ? Object.freeze(model) : ownModelDependencies(model, { paint: slots });
}

// Styles are already validated and owned. Snapshot only a bounded number of
// canonical style identities, with no second traversal of a large style matrix.
function elementStylePaintSlots(
  value: ElementStyles<string, Exclude<ElementVisualState, 'default'>>,
): readonly unknown[] | undefined {
  const slots: unknown[] = [stylesPaintDescriptor, value.root];
  const appendParts = (parts: Readonly<Record<string, TerminalStyle | undefined>> | undefined): boolean => {
    for (const name in parts) {
      if (slots.length + 2 > maximumModelDependencySlots) return false;
      slots.push(name, parts[name]);
    }
    return true;
  };
  if (!appendParts(value.parts)) return undefined;
  slots.push(statesPaintDescriptor);
  for (const state in value.states) {
    if (slots.length + 3 > maximumModelDependencySlots) return undefined;
    const style = value.states[state as Exclude<ElementVisualState, 'default'>];
    slots.push(statePaintDescriptor, state, style?.root);
    if (!appendParts(style?.parts)) return undefined;
  }
  return slots.length > maximumModelDependencySlots ? undefined : slots;
}

/** Returns an owned, immutable, right-biased composition of component style matrices. */
export function mergeElementStyles<
  TPart extends string,
  TState extends Exclude<ElementVisualState, 'default'>,
>(
  ...values: readonly (ElementStyles<TPart, TState> | undefined)[]
): ElementStyles<TPart, TState> | undefined {
  const defined = values.filter((value): value is ElementStyles<TPart, TState> => value !== undefined);
  if (defined.length === 0) return undefined;
  const parts = mergeStyleRecords(defined.map((value) => value.parts));
  const stateNames = new Set<TState>(defined.flatMap((value) =>
    Object.keys(value.states ?? {}) as TState[]
  ));
  const states = Object.fromEntries([...stateNames].map((state) => {
    const stateValues = defined.map((value) => value.states?.[state]);
    const stateParts = mergeStyleRecords(stateValues.map((value) => value?.parts));
    const stateRoot = mergeTerminalStyles(...stateValues.map((value) => value?.root));
    return [state, Object.freeze({
      ...(stateRoot === undefined ? {} : { root: stateRoot }),
      ...(stateParts === undefined ? {} : { parts: stateParts }),
    })];
  })) as Partial<Record<TState, NonNullable<ElementStyles<TPart, TState>['states']>[TState]>>;
  const root = mergeTerminalStyles(...defined.map((value) => value.root));
  return Object.freeze({
    ...(root === undefined ? {} : { root }),
    ...(parts === undefined ? {} : { parts }),
    ...(Object.keys(states).length === 0 ? {} : { states: Object.freeze(states) }),
  }) as ElementStyles<TPart, TState>;
}

function mergeStyleRecords<TPart extends string>(
  records: readonly (Partial<Record<TPart, TerminalStyle>> | undefined)[],
): Readonly<Partial<Record<TPart, TerminalStyle>>> | undefined {
  const names = new Set<TPart>(records.flatMap((record) =>
    Object.keys(record ?? {}) as TPart[]
  ));
  if (names.size === 0) return undefined;
  return Object.freeze(Object.fromEntries([...names].flatMap((name) => {
    const style = mergeTerminalStyles(...records.map((record) => record?.[name]));
    return style === undefined ? [] : [[name, style]];
  }))) as Readonly<Partial<Record<TPart, TerminalStyle>>>;
}

function optionalStyle(value: unknown, subject: string): TerminalStyle | undefined {
  return value === undefined ? undefined : decodeTerminalStyle(value, subject);
}

function styleMap(
  value: unknown,
  allowed: ReadonlySet<string>,
  subject: string,
): Readonly<Record<string, TerminalStyle>> | undefined {
  if (value === undefined) return undefined;
  if (!isNonArrayObject(value)) throw new TypeError(`${subject} must be an object.`);
  const unsupported = findUnsupportedField(value, allowed);
  if (unsupported !== undefined) throw new TypeError(`${subject} contains unknown field "${unsupported}".`);
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([name, style]) => [
    name,
    decodeTerminalStyle(style, `${subject}.${name}`),
  ])));
}

function stateStyleMap(
  value: unknown,
  allowedStates: ReadonlySet<string>,
  allowedParts: ReadonlySet<string>,
  subject: string,
): ElementStyles<string, Exclude<ElementVisualState, 'default'>>['states'] | undefined {
  if (value === undefined) return undefined;
  if (!isNonArrayObject(value)) throw new TypeError(`${subject} must be an object.`);
  const unsupported = findUnsupportedField(value, allowedStates);
  if (unsupported !== undefined) throw new TypeError(`${subject} contains unknown field "${unsupported}".`);
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([state, stateValue]) => {
    if (!isNonArrayObject(stateValue)) throw new TypeError(`${subject}.${state} must be an object.`);
    const stateUnsupported = findUnsupportedField(stateValue, new Set(['root', 'parts']));
    if (stateUnsupported !== undefined) {
      throw new TypeError(`${subject}.${state} contains unknown field "${stateUnsupported}".`);
    }
    const root = optionalStyle(stateValue['root'], `${subject}.${state}.root`);
    const parts = styleMap(stateValue['parts'], allowedParts, `${subject}.${state}.parts`);
    return [state, Object.freeze({
      ...(root === undefined ? {} : { root }),
      ...(parts === undefined ? {} : { parts }),
    })];
  })));
}
