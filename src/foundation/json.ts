export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

const maximumJsonDepth = 128;
const maximumJsonNodes = 1_000_000;
const maximumNormalizedJsonDepth = 124;
const maximumNormalizedJsonNodes = 100_000;
const maximumNormalizedJsonStringCodeUnits = 250_000;
const maximumNormalizedJsonTotalStringCodeUnits = 1_000_000;
const normalizedJsonTruncationMarker = '[Truncated]';

export interface JsonSnapshotLimits {
  readonly maxDepth?: number;
  readonly maxNodes?: number;
  readonly maxStringCodeUnits?: number;
}

interface NormalizedJsonSnapshotLimits {
  readonly maxDepth: number;
  readonly maxNodes: number;
  readonly maxStringCodeUnits: number;
}

const defaultJsonSnapshotLimits: NormalizedJsonSnapshotLimits = Object.freeze({
  maxDepth: maximumJsonDepth,
  maxNodes: maximumJsonNodes,
  maxStringCodeUnits: 1_000_000
});

interface JsonTraversalBudget {
  nodes: number;
  stringCodeUnits: number;
}

type JsonInspection =
  | { readonly status: 'valid'; readonly snapshot?: JsonValue }
  | { readonly status: 'invalid'; readonly issue: string };

export function jsonValueIssue(value: unknown): string | undefined {
  const result = inspectJsonValue(
    value,
    new Set(),
    0,
    { nodes: 0, stringCodeUnits: 0 },
    false,
    defaultJsonSnapshotLimits,
    false
  );
  return result.status === 'valid' ? undefined : result.issue;
}

export function snapshotJsonValue(
  value: unknown,
  subject: string,
  limits: JsonSnapshotLimits = {}
): JsonValue {
  const normalizedLimits = normalizeJsonSnapshotLimits(limits);
  const result = inspectJsonValue(
    value,
    new Set(),
    0,
    { nodes: 0, stringCodeUnits: 0 },
    true,
    normalizedLimits,
    false
  );
  if (result.status === 'invalid') throw new TypeError(`${subject} must be JSON-safe: ${result.issue}.`);
  return result.snapshot as JsonValue;
}

export function snapshotCanonicalJsonValue<T>(
  value: T,
  subject: string,
  limits: JsonSnapshotLimits = {}
): T & JsonValue {
  const normalizedLimits = normalizeJsonSnapshotLimits(limits);
  const result = inspectJsonValue(
    value,
    new Set(),
    0,
    { nodes: 0, stringCodeUnits: 0 },
    true,
    normalizedLimits,
    true
  );
  if (result.status === 'invalid') throw new TypeError(`${subject} must be JSON-safe: ${result.issue}.`);
  return result.snapshot as T & JsonValue;
}

export function snapshotUnknownJsonValue(value: unknown): JsonValue {
  return normalizeUnknownJsonValue(value, new Set(), 0, { nodes: 0, stringCodeUnits: 0 });
}

function inspectJsonValue(
  value: unknown,
  ancestors: Set<object>,
  depth: number,
  budget: JsonTraversalBudget,
  snapshot: boolean,
  limits: NormalizedJsonSnapshotLimits,
  canonical: boolean
): JsonInspection {
  const budgetIssue = jsonBudgetIssue(value, depth, budget, limits);
  if (budgetIssue !== undefined) return { status: 'invalid', issue: budgetIssue };
  const primitive = inspectJsonPrimitive(value, snapshot);
  if (primitive !== undefined) return primitive;
  if (value === null || typeof value !== 'object') {
    return { status: 'invalid', issue: `unsupported ${typeof value} value` };
  }
  if (ancestors.has(value)) {
    return { status: 'invalid', issue: 'cyclic references are not supported' };
  }

  let arrayValue: unknown[] | undefined;
  try {
    arrayValue = Array.isArray(value) ? value : undefined;
    if (arrayValue === undefined && !isPlainObject(value)) {
      return { status: 'invalid', issue: 'objects must use plain JSON object semantics' };
    }
  } catch {
    return { status: 'invalid', issue: 'object properties could not be read' };
  }

  ancestors.add(value);
  try {
    return arrayValue === undefined
      ? inspectJsonObject(value as Record<string, unknown>, ancestors, depth, budget, snapshot, limits, canonical)
      : inspectJsonArray(arrayValue, ancestors, depth, budget, snapshot, limits, canonical);
  } finally {
    ancestors.delete(value);
  }
}

function jsonBudgetIssue(
  value: unknown,
  depth: number,
  budget: JsonTraversalBudget,
  limits: NormalizedJsonSnapshotLimits,
): string | undefined {
  budget.nodes += 1;
  if (budget.nodes > limits.maxNodes) return `value exceeds the ${String(limits.maxNodes)}-node limit`;
  if (depth > limits.maxDepth) return `value exceeds the ${String(limits.maxDepth)}-level nesting limit`;
  return typeof value === 'string' ? addStringCodeUnits(value.length, budget, limits) : undefined;
}

function inspectJsonPrimitive(value: unknown, snapshot: boolean): JsonInspection | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return snapshot ? { status: 'valid', snapshot: value } : { status: 'valid' };
  }
  if (typeof value !== 'number') return undefined;
  if (!Number.isFinite(value)) return { status: 'invalid', issue: 'numbers must be finite' };
  return snapshot ? { status: 'valid', snapshot: value } : { status: 'valid' };
}

function inspectJsonArray(
  value: readonly unknown[],
  ancestors: Set<object>,
  depth: number,
  budget: JsonTraversalBudget,
  snapshot: boolean,
  limits: NormalizedJsonSnapshotLimits,
  canonical: boolean,
): JsonInspection {
  const owned: JsonValue[] | undefined = snapshot ? [] : undefined;
  try {
    for (const item of value) {
      const result = inspectJsonValue(item, ancestors, depth + 1, budget, snapshot, limits, canonical);
      if (result.status === 'invalid') return result;
      owned?.push(result.snapshot as JsonValue);
    }
  } catch {
    return { status: 'invalid', issue: 'object properties could not be read' };
  }
  if (!snapshot) return { status: 'valid' };
  const result = owned ?? [];
  return { status: 'valid', snapshot: canonical ? Object.freeze(result) : result };
}

function inspectJsonObject(
  value: Readonly<Record<string, unknown>>,
  ancestors: Set<object>,
  depth: number,
  budget: JsonTraversalBudget,
  snapshot: boolean,
  limits: NormalizedJsonSnapshotLimits,
  canonical: boolean,
): JsonInspection {
  const owned: [string, JsonValue][] | undefined = snapshot ? [] : undefined;
  try {
    for (const key in value) {
      if (!Object.hasOwn(value, key)) continue;
      const keyIssue = addStringCodeUnits(key.length, budget, limits);
      if (keyIssue !== undefined) return { status: 'invalid', issue: keyIssue };
      const result = inspectJsonValue(value[key], ancestors, depth + 1, budget, snapshot, limits, canonical);
      if (result.status === 'invalid') return result;
      owned?.push([key, result.snapshot as JsonValue]);
    }
  } catch {
    return { status: 'invalid', issue: 'object properties could not be read' };
  }
  if (!snapshot) return { status: 'valid' };
  if (canonical) owned?.sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  const result = Object.fromEntries(owned ?? []);
  return { status: 'valid', snapshot: canonical ? Object.freeze(result) : result };
}

function addStringCodeUnits(
  length: number,
  budget: JsonTraversalBudget,
  limits: NormalizedJsonSnapshotLimits
): string | undefined {
  budget.stringCodeUnits += length;
  return budget.stringCodeUnits > limits.maxStringCodeUnits
    ? `value exceeds the ${String(limits.maxStringCodeUnits)}-string-code-unit limit`
    : undefined;
}

function normalizeJsonSnapshotLimits(limits: JsonSnapshotLimits): NormalizedJsonSnapshotLimits {
  return Object.freeze({
    maxDepth: positiveIntegerLimit(limits.maxDepth, defaultJsonSnapshotLimits.maxDepth, 'JSON maxDepth'),
    maxNodes: positiveIntegerLimit(limits.maxNodes, defaultJsonSnapshotLimits.maxNodes, 'JSON maxNodes'),
    maxStringCodeUnits: positiveIntegerLimit(
      limits.maxStringCodeUnits,
      defaultJsonSnapshotLimits.maxStringCodeUnits,
      'JSON maxStringCodeUnits'
    )
  });
}

function positiveIntegerLimit(value: number | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }
  return value;
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeUnknownJsonValue(
  value: unknown,
  ancestors: Set<object>,
  depth: number,
  budget: JsonTraversalBudget
): JsonValue {
  budget.nodes += 1;
  if (budget.nodes > maximumNormalizedJsonNodes) return normalizedJsonTruncation(budget);
  if (typeof value !== 'object' || value === null) return normalizeUnknownJsonPrimitive(value, budget);
  if (value instanceof Error) return normalizeJsonError(value, budget);
  if (ancestors.has(value)) return normalizedJsonString('[Circular]', budget);
  if (depth >= maximumNormalizedJsonDepth) return jsonObjectTag(value, budget);

  let arrayValue: unknown[] | undefined;
  try {
    arrayValue = Array.isArray(value) ? value : undefined;
  } catch {
    return normalizedJsonString('[Unserializable]', budget);
  }

  ancestors.add(value);
  try {
    return arrayValue === undefined
      ? normalizeUnknownJsonObject(value as Record<string, unknown>, ancestors, depth, budget)
      : normalizeUnknownJsonArray(arrayValue, ancestors, depth, budget);
  } finally {
    ancestors.delete(value);
  }
}

function normalizeUnknownJsonPrimitive(value: unknown, budget: JsonTraversalBudget): JsonValue {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') return normalizedJsonString(value, budget);
  if (typeof value === 'number') return Number.isFinite(value) ? value : normalizedJsonString(String(value), budget);
  if (typeof value === 'bigint') return normalizedJsonString(value.toString(), budget);
  if (typeof value === 'symbol') return normalizedJsonString(value.description ?? 'symbol', budget);
  return jsonObjectTag(value, budget);
}

function normalizeJsonError(value: Error, budget: JsonTraversalBudget): JsonValue {
  const fieldCodeUnits = 'name'.length + 'message'.length;
  if (normalizedJsonRemainingCodeUnits(budget) - normalizedJsonTruncationMarker.length < fieldCodeUnits) {
    return normalizedJsonTruncation(budget);
  }
  budget.stringCodeUnits += fieldCodeUnits;
  return Object.freeze({
    name: normalizedJsonString(value.name, budget),
    message: normalizedJsonString(value.message, budget),
  });
}

function normalizeUnknownJsonArray(
  value: readonly unknown[],
  ancestors: Set<object>,
  depth: number,
  budget: JsonTraversalBudget,
): JsonValue {
  const normalized: JsonValue[] = [];
  try {
    for (const item of value) {
      if (!normalizedJsonHasValueCapacity(budget)) {
        normalized.push(normalizedJsonTruncation(budget));
        break;
      }
      normalized.push(normalizeUnknownJsonValue(item, ancestors, depth + 1, budget));
      if (budget.nodes > maximumNormalizedJsonNodes) break;
    }
  } catch {
    return normalizedJsonString('[Unserializable]', budget);
  }
  return Object.freeze(normalized);
}

function normalizeUnknownJsonObject(
  objectValue: Readonly<Record<string, unknown>>,
  ancestors: Set<object>,
  depth: number,
  budget: JsonTraversalBudget,
): JsonValue {
  const normalizedEntries: [string, JsonValue][] = [];
  const normalizedKeys = new Set<string>();
  const nextKeySuffix = new Map<string, number>();
  try {
    for (const key in objectValue) {
      if (!Object.hasOwn(objectValue, key)) continue;
      if (!normalizedJsonHasValueCapacity(budget)) break;
      const normalizedKey = uniqueNormalizedJsonKey(key, normalizedKeys, nextKeySuffix, budget);
      if (normalizedKey === undefined) break;
      normalizedEntries.push([
        normalizedKey,
        normalizeUnknownJsonValue(objectValue[key], ancestors, depth + 1, budget)
      ]);
      if (budget.nodes > maximumNormalizedJsonNodes) break;
    }
  } catch {
    return normalizedJsonString('[Unserializable]', budget);
  }
  return Object.freeze(Object.fromEntries(normalizedEntries));
}

function normalizedJsonString(value: string, budget: JsonTraversalBudget): string {
  const available = normalizedJsonRemainingCodeUnits(budget) - normalizedJsonTruncationMarker.length;
  if (available <= 0) return '';
  const maximum = Math.min(maximumNormalizedJsonStringCodeUnits, available);
  const normalized = truncateNormalizedJsonString(value, maximum);
  budget.stringCodeUnits += normalized.length;
  return normalized;
}

function truncateNormalizedJsonString(value: string, maximum: number): string {
  if (value.length <= maximum) return value;
  const suffix = normalizedJsonTruncationMarker;
  if (maximum <= suffix.length) return suffix.slice(0, maximum);
  return `${value.slice(0, maximum - suffix.length)}${suffix}`;
}

function uniqueNormalizedJsonKey(
  key: string,
  used: Set<string>,
  nextSuffix: Map<string, number>,
  budget: JsonTraversalBudget
): string | undefined {
  const available = normalizedJsonRemainingCodeUnits(budget) - normalizedJsonTruncationMarker.length;
  if (available <= 0) return undefined;
  const maximum = Math.min(maximumNormalizedJsonStringCodeUnits, available);
  const initial = truncateNormalizedJsonString(key, maximum);
  if (!used.has(initial)) {
    used.add(initial);
    nextSuffix.set(initial, 1);
    budget.stringCodeUnits += initial.length;
    return initial;
  }
  let sequence = nextSuffix.get(initial) ?? 1;
  let candidate: string;
  do {
    const suffix = `#${String(sequence)}`;
    if (suffix.length > maximum) return undefined;
    candidate = `${initial.slice(0, maximum - suffix.length)}${suffix}`;
    sequence += 1;
  } while (used.has(candidate));
  nextSuffix.set(initial, sequence);
  used.add(candidate);
  budget.stringCodeUnits += candidate.length;
  return candidate;
}

function normalizedJsonRemainingCodeUnits(budget: JsonTraversalBudget): number {
  return maximumNormalizedJsonTotalStringCodeUnits - budget.stringCodeUnits;
}

function normalizedJsonHasValueCapacity(budget: JsonTraversalBudget): boolean {
  return normalizedJsonRemainingCodeUnits(budget) > normalizedJsonTruncationMarker.length;
}

function normalizedJsonTruncation(budget: JsonTraversalBudget): string {
  const remaining = normalizedJsonRemainingCodeUnits(budget);
  const marker = normalizedJsonTruncationMarker.slice(0, remaining);
  budget.stringCodeUnits += marker.length;
  return marker;
}

function jsonObjectTag(value: unknown, budget: JsonTraversalBudget): string {
  try {
    return normalizedJsonString(Object.prototype.toString.call(value), budget);
  } catch {
    return normalizedJsonString('[Unserializable]', budget);
  }
}
