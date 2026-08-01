export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

const maximumJsonDepth = 128;
const maximumJsonNodes = 1_000_000;
const maximumNormalizedJsonDepth = 124;
const maximumNormalizedJsonNodes = 100_000;

interface JsonTraversalBudget {
  nodes: number;
}

type JsonInspection =
  | { readonly ok: true; readonly snapshot?: JsonValue }
  | { readonly ok: false; readonly issue: string };

export function jsonValueIssue(value: unknown): string | undefined {
  const result = inspectJsonValue(value, new Set(), 0, { nodes: 0 }, false);
  return result.ok ? undefined : result.issue;
}

export function snapshotJsonValue(value: unknown, subject: string): JsonValue {
  const result = inspectJsonValue(value, new Set(), 0, { nodes: 0 }, true);
  if (!result.ok) throw new TypeError(`${subject} must be JSON-safe: ${result.issue}.`);
  return result.snapshot as JsonValue;
}

export function snapshotUnknownJsonValue(value: unknown): JsonValue {
  return normalizeUnknownJsonValue(value, new Set(), 0, { nodes: 0 });
}

function inspectJsonValue(
  value: unknown,
  ancestors: Set<object>,
  depth: number,
  budget: JsonTraversalBudget,
  snapshot: boolean
): JsonInspection {
  budget.nodes += 1;
  if (budget.nodes > maximumJsonNodes) {
    return { ok: false, issue: `value exceeds the ${String(maximumJsonNodes)}-node limit` };
  }
  if (depth > maximumJsonDepth) {
    return { ok: false, issue: `value exceeds the ${String(maximumJsonDepth)}-level nesting limit` };
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
      const result = inspectJsonValue(item, ancestors, depth + 1, budget, snapshot);
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
      const result = inspectJsonValue(objectValue[key], ancestors, depth + 1, budget, snapshot);
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
  if (budget.nodes > maximumNormalizedJsonNodes) return '[Truncated]';
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'symbol') return value.description ?? 'symbol';
  if (typeof value === 'function' || value === undefined) return jsonObjectTag(value);
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (ancestors.has(value)) return '[Circular]';
  if (depth >= maximumNormalizedJsonDepth) return jsonObjectTag(value);

  let arrayValue: unknown[] | undefined;
  try {
    arrayValue = Array.isArray(value) ? value : undefined;
  } catch {
    return '[Unserializable]';
  }

  ancestors.add(value);
  if (arrayValue !== undefined) {
    const normalized: JsonValue[] = [];
    try {
      const length = arrayValue.length;
      for (let index = 0; index < length; index += 1) {
        normalized.push(normalizeUnknownJsonValue(arrayValue[index], ancestors, depth + 1, budget));
        if (budget.nodes > maximumNormalizedJsonNodes) break;
      }
    } catch {
      ancestors.delete(value);
      return '[Unserializable]';
    }
    ancestors.delete(value);
    return normalized;
  }

  const objectValue = value as Record<string, unknown>;
  const normalizedEntries: [string, JsonValue][] = [];
  try {
    for (const key in objectValue) {
      if (!Object.hasOwn(objectValue, key)) continue;
      normalizedEntries.push([
        key,
        normalizeUnknownJsonValue(objectValue[key], ancestors, depth + 1, budget)
      ]);
      if (budget.nodes > maximumNormalizedJsonNodes) break;
    }
  } catch {
    ancestors.delete(value);
    return '[Unserializable]';
  }
  ancestors.delete(value);
  return Object.fromEntries(normalizedEntries);
}

function jsonObjectTag(value: unknown): string {
  try {
    return Object.prototype.toString.call(value);
  } catch {
    return '[Unserializable]';
  }
}
