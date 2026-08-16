import type {
  ComponentInspectionRecord,
  ComponentInspectionValue,
  ComponentSemanticInspection,
} from './inspection.ts';

const semanticFields = new Set([
  'value',
  'active',
  'selection',
  'validation',
  'collection',
  'redacted',
  'details',
]);
const validationFields = new Set(['required', 'invalid', 'message']);
const collectionFields = new Set(['startIndex', 'totalCount', 'visibleCount']);
const maximumDepth = 8;
const maximumNodes = 512;
export const maximumComponentInspectionArrayLength = 256;
const maximumRecordFields = 64;
export const maximumComponentInspectionStringLength = 4096;

interface AdoptionBudget {
  nodes: number;
  readonly ancestors: Set<object>;
}

export function adoptComponentSemanticInspection(value: unknown): ComponentSemanticInspection {
  if (!isNonArrayObject(value)) {
    throw new TypeError('Component inspection() must return an object.');
  }
  const unsupported = findUnsupportedField(value, semanticFields);
  if (unsupported !== undefined) {
    throw new TypeError(`Component inspection() returned unsupported field "${unsupported}".`);
  }
  const budget: AdoptionBudget = { nodes: 0, ancestors: new Set() };
  return Object.freeze({
    ...adoptOptionalInspectionValue(value, 'value', budget),
    ...adoptOptionalInspectionValue(value, 'active', budget),
    ...adoptOptionalInspectionValue(value, 'selection', budget),
    ...adoptValidation(value['validation']),
    ...adoptCollection(value['collection']),
    ...(value['redacted'] === undefined
      ? {}
      : value['redacted'] === true
        ? { redacted: true as const }
        : invalid('Component inspection() redacted must be true when present.')),
    ...(value['details'] === undefined
      ? {}
      : { details: adoptInspectionRecord(value['details'], budget, 0, 'details') }),
  });
}

function isNonArrayObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function findUnsupportedField(
  value: Readonly<Record<string, unknown>>,
  allowed: ReadonlySet<string>,
): string | undefined {
  return Object.keys(value).find((field) => !allowed.has(field));
}

function adoptOptionalInspectionValue(
  source: Readonly<Record<string, unknown>>,
  field: 'value' | 'active' | 'selection',
  budget: AdoptionBudget,
): Partial<Record<typeof field, ComponentInspectionValue>> {
  if (source[field] === undefined) return {};
  return { [field]: adoptInspectionValue(source[field], budget, 0, field) };
}

function adoptValidation(value: unknown): Pick<ComponentSemanticInspection, 'validation'> | object {
  if (value === undefined) return {};
  if (!isNonArrayObject(value)) {
    throw new TypeError('Component inspection() validation must be an object.');
  }
  const unsupported = findUnsupportedField(value, validationFields);
  if (unsupported !== undefined) {
    throw new TypeError(`Component inspection() validation returned unsupported field "${unsupported}".`);
  }
  if (typeof value['invalid'] !== 'boolean') {
    throw new TypeError('Component inspection() validation.invalid must be a boolean.');
  }
  if (value['required'] !== undefined && typeof value['required'] !== 'boolean') {
    throw new TypeError('Component inspection() validation.required must be a boolean.');
  }
  if (value['message'] !== undefined) assertInspectionString(value['message'], 'validation.message');
  return {
    validation: Object.freeze({
      ...(value['required'] === undefined ? {} : { required: value['required'] }),
      invalid: value['invalid'],
      ...(value['message'] === undefined ? {} : { message: value['message'] }),
    }),
  };
}

function adoptCollection(value: unknown): Pick<ComponentSemanticInspection, 'collection'> | object {
  if (value === undefined) return {};
  if (!isNonArrayObject(value)) {
    throw new TypeError('Component inspection() collection must be an object.');
  }
  const unsupported = findUnsupportedField(value, collectionFields);
  if (unsupported !== undefined) {
    throw new TypeError(`Component inspection() collection returned unsupported field "${unsupported}".`);
  }
  const collection = Object.fromEntries(Object.entries(value).map(([field, fieldValue]) => {
    if (typeof fieldValue !== 'number' || !Number.isSafeInteger(fieldValue) || fieldValue < 0) {
      throw new TypeError(`Component inspection() collection.${field} must be a non-negative safe integer.`);
    }
    return [field, fieldValue];
  }));
  return { collection: Object.freeze(collection) };
}

function adoptInspectionValue(
  value: unknown,
  budget: AdoptionBudget,
  depth: number,
  path: string,
): ComponentInspectionValue {
  budget.nodes += 1;
  if (budget.nodes > maximumNodes) {
    throw new RangeError(`Component inspection() exceeds ${String(maximumNodes)} values.`);
  }
  if (depth > maximumDepth) {
    throw new RangeError(`Component inspection() ${path} exceeds ${String(maximumDepth)} levels.`);
  }
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    assertInspectionString(value, path);
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(`Component inspection() ${path} must contain only finite numbers.`);
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > maximumComponentInspectionArrayLength) {
      throw new RangeError(`Component inspection() ${path} exceeds ${String(maximumComponentInspectionArrayLength)} entries.`);
    }
    return withAncestor(value, budget, path, () => Object.freeze(value.map((entry, index) =>
      adoptInspectionValue(entry, budget, depth + 1, `${path}[${String(index)}]`)
    )));
  }
  return adoptInspectionRecord(value, budget, depth, path);
}

function adoptInspectionRecord(
  value: unknown,
  budget: AdoptionBudget,
  depth: number,
  path: string,
): ComponentInspectionRecord {
  if (!isNonArrayObject(value) || !isPlainRecord(value)) {
    throw new TypeError(`Component inspection() ${path} must contain only JSON-safe records.`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const fields = Object.keys(descriptors);
  if (fields.length > maximumRecordFields) {
    throw new RangeError(`Component inspection() ${path} exceeds ${String(maximumRecordFields)} fields.`);
  }
  return withAncestor(value, budget, path, () => Object.freeze(Object.fromEntries(fields.map((field) => {
    const descriptor = descriptors[field];
    if (descriptor === undefined || !('value' in descriptor)) {
      throw new TypeError(`Component inspection() ${path}.${field} must be a data property.`);
    }
    if (descriptor.value === undefined) {
      throw new TypeError(`Component inspection() ${path}.${field} cannot be undefined.`);
    }
    return [field, adoptInspectionValue(descriptor.value, budget, depth + 1, `${path}.${field}`)];
  }))));
}

function withAncestor<TValue>(
  value: object,
  budget: AdoptionBudget,
  path: string,
  operation: () => TValue,
): TValue {
  if (budget.ancestors.has(value)) {
    throw new TypeError(`Component inspection() ${path} must not contain cycles.`);
  }
  budget.ancestors.add(value);
  try {
    return operation();
  } finally {
    budget.ancestors.delete(value);
  }
}

function isPlainRecord(value: object): boolean {
  const prototype = Reflect.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertInspectionString(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string') {
    throw new TypeError(`Component inspection() ${path} must be a string.`);
  }
  if (value.length > maximumComponentInspectionStringLength) {
    throw new RangeError(`Component inspection() ${path} exceeds ${String(maximumComponentInspectionStringLength)} code units.`);
  }
}

function invalid(message: string): never {
  throw new TypeError(message);
}
