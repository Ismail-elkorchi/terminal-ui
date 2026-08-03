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
  | { readonly ok: true; readonly snapshot?: JsonValue }
  | { readonly ok: false; readonly issue: string };

export function jsonValueIssue(value: unknown): string | undefined {
  const result = inspectJsonValue(
    value,
    new Set(),
    0,
    { nodes: 0, stringCodeUnits: 0 },
    false,
    defaultJsonSnapshotLimits
  );
  return result.ok ? undefined : result.issue;
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
    normalizedLimits
  );
  if (!result.ok) throw new TypeError(`${subject} must be JSON-safe: ${result.issue}.`);
  return result.snapshot as JsonValue;
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
  limits: NormalizedJsonSnapshotLimits
): JsonInspection {
  budget.nodes += 1;
  if (budget.nodes > limits.maxNodes) {
    return { ok: false, issue: `value exceeds the ${String(limits.maxNodes)}-node limit` };
  }
  if (depth > limits.maxDepth) {
    return { ok: false, issue: `value exceeds the ${String(limits.maxDepth)}-level nesting limit` };
  }
  if (typeof value === 'string') {
    const issue = addStringCodeUnits(value.length, budget, limits);
    if (issue !== undefined) return { ok: false, issue };
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return snapshot ? { ok: true, snapshot: value } : { ok: true };
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return { ok: false, issue: 'numbers must be finite' };
    return snapshot ? { ok: true, snapshot: value } : { ok: true };
  }
  if (typeof value !== 'object') return { ok: false, issue: `unsupported ${typeof value} value` };
  if (ancestors.has(value)) return { ok: false, issue: 'cyclic references are not supported' };

  let arrayValue: unknown[] | undefined;
  try {
    arrayValue = Array.isArray(value) ? value : undefined;
    if (arrayValue === undefined && !isPlainObject(value)) {
      return { ok: false, issue: 'objects must use plain JSON object semantics' };
    }
  } catch {
    return { ok: false, issue: 'object properties could not be read' };
  }

  ancestors.add(value);
  if (arrayValue !== undefined) {
    const arraySnapshot: JsonValue[] | undefined = snapshot ? [] : undefined;
    let length: number;
    try {
      length = arrayValue.length;
    } catch {
      ancestors.delete(value);
      return { ok: false, issue: 'object properties could not be read' };
    }
    for (let index = 0; index < length; index += 1) {
      let item: unknown;
      try {
        item = arrayValue[index];
      } catch {
        ancestors.delete(value);
        return { ok: false, issue: 'object properties could not be read' };
      }
      const result = inspectJsonValue(item, ancestors, depth + 1, budget, snapshot, limits);
      if (!result.ok) {
        ancestors.delete(value);
        return result;
      }
      arraySnapshot?.push(result.snapshot as JsonValue);
    }
    ancestors.delete(value);
    return snapshot ? { ok: true, snapshot: arraySnapshot ?? [] } : { ok: true };
  }

  const objectValue = value as Record<string, unknown>;
  const objectSnapshot: [string, JsonValue][] | undefined = snapshot ? [] : undefined;
  try {
    for (const key in objectValue) {
      if (!Object.hasOwn(objectValue, key)) continue;
      const keyIssue = addStringCodeUnits(key.length, budget, limits);
      if (keyIssue !== undefined) {
        ancestors.delete(value);
        return { ok: false, issue: keyIssue };
      }
      const result = inspectJsonValue(objectValue[key], ancestors, depth + 1, budget, snapshot, limits);
      if (!result.ok) {
        ancestors.delete(value);
        return result;
      }
      objectSnapshot?.push([key, result.snapshot as JsonValue]);
    }
  } catch {
    ancestors.delete(value);
    return { ok: false, issue: 'object properties could not be read' };
  }
  ancestors.delete(value);
  return snapshot
    ? { ok: true, snapshot: Object.fromEntries(objectSnapshot ?? []) }
    : { ok: true };
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
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') return normalizedJsonString(value, budget);
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : normalizedJsonString(String(value), budget);
  }
  if (typeof value === 'bigint') return normalizedJsonString(value.toString(), budget);
  if (typeof value === 'symbol') return normalizedJsonString(value.description ?? 'symbol', budget);
  if (typeof value === 'function' || value === undefined) return jsonObjectTag(value, budget);
  if (value instanceof Error) {
    const fieldCodeUnits = 'name'.length + 'message'.length;
    if (
      normalizedJsonRemainingCodeUnits(budget) - normalizedJsonTruncationMarker.length
      < fieldCodeUnits
    ) {
      return normalizedJsonTruncation(budget);
    }
    budget.stringCodeUnits += fieldCodeUnits;
    return {
      name: normalizedJsonString(value.name, budget),
      message: normalizedJsonString(value.message, budget)
    };
  }
  if (ancestors.has(value)) return normalizedJsonString('[Circular]', budget);
  if (depth >= maximumNormalizedJsonDepth) return jsonObjectTag(value, budget);

  let arrayValue: unknown[] | undefined;
  try {
    arrayValue = Array.isArray(value) ? value : undefined;
  } catch {
    return normalizedJsonString('[Unserializable]', budget);
  }

  ancestors.add(value);
  if (arrayValue !== undefined) {
    const normalized: JsonValue[] = [];
    try {
      const length = arrayValue.length;
      for (let index = 0; index < length; index += 1) {
        if (!normalizedJsonHasValueCapacity(budget)) {
          normalized.push(normalizedJsonTruncation(budget));
          break;
        }
        normalized.push(normalizeUnknownJsonValue(arrayValue[index], ancestors, depth + 1, budget));
        if (budget.nodes > maximumNormalizedJsonNodes) break;
      }
    } catch {
      ancestors.delete(value);
      return normalizedJsonString('[Unserializable]', budget);
    }
    ancestors.delete(value);
    return normalized;
  }

  const objectValue = value as Record<string, unknown>;
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
    ancestors.delete(value);
    return normalizedJsonString('[Unserializable]', budget);
  }
  ancestors.delete(value);
  return Object.fromEntries(normalizedEntries);
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
