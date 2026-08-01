import { redactSecretLikeText } from './text/secrets.ts';
import { sha256Hex } from './diagnostic-identity.ts';
import { jsonValueIssue } from './foundation/json.ts';
import {
  findUnsupportedField,
  isNonArrayObject,
  isStringMember
} from './foundation/validation.ts';
import type { JsonValue } from './foundation/json.ts';

export type TerminalDiagnosticValue = JsonValue;

export const terminalDiagnosticCodes = [
  'HOST_CAPABILITY_UNAVAILABLE',
  'HOST_CAPABILITY_UNSUPPORTED',
  'HOST_CAPABILITY_UNKNOWN',
  'HOST_STREAM_CLOSED',
  'HOST_RESTORE_FAILED',
  'HOST_PROTOCOL_SKIPPED',
  'HOST_PROTOCOL_UNSUPPORTED',
  'HOST_PROTOCOL_LEASE_INACTIVE',
  'HOST_OPERATION_CANCELLED',
  'HOST_OUTPUT_INDETERMINATE',
  'INPUT_CANCELLED',
  'INPUT_INTERRUPTED',
  'INPUT_TIMEOUT',
  'INPUT_PROFILE_UNSUPPORTED',
  'PROMPT_VALIDATION_FAILED',
  'PROMPT_NON_TTY_DENIED',
  'PROMPT_EDITOR_UNAVAILABLE',
  'PROMPT_DATA_SOURCE_FAILED',
  'SELECTION_UNAVAILABLE',
  'TUI_RUN_FAILED',
  'TUI_INITIALIZATION_FAILED',
  'TUI_OUTPUT_FAILED',
  'TUI_EXIT_HOOK_FAILED',
  'TUI_RENDER_FAILED',
  'TUI_FOCUS_SELECTION_INVALID',
  'TUI_CLEANUP_FAILED',
  'TUI_CLEANUP_TIMEOUT',
  'TUI_STARTUP_FAILED',
  'TUI_STARTUP_TIMEOUT',
  'TUI_SOURCE_FAILED',
  'TUI_SOURCE_DUPLICATE_ID',
  'TUI_EFFECT_FAILED',
  'TUI_EFFECT_REJECTED',
  'TUI_RUNTIME_TASK_FAILED',
  'TRANSCRIPT_REPLAY_FAILED',
  'INTERACTION_SCRIPT_FAILED',
  'ACCESSIBLE_SNAPSHOT_INVALID'
] as const;

export type TerminalDiagnosticCode = typeof terminalDiagnosticCodes[number];

export const terminalSeverities = [
  'debug',
  'info',
  'warning',
  'error',
  'fatal'
] as const;

export type TerminalSeverity = typeof terminalSeverities[number];

export interface TerminalDiagnostic {
  readonly fingerprint: string;
  readonly code: TerminalDiagnosticCode;
  readonly severity: TerminalSeverity;
  readonly message: string;
  readonly target?: string;
  readonly cause?: TerminalDiagnosticValue;
  readonly hint?: string;
  readonly data?: Readonly<Record<string, TerminalDiagnosticValue>>;
}

export interface DiagnosticOccurrence {
  readonly id: string;
  readonly owner: string;
  readonly sequence: number;
  readonly diagnostic: TerminalDiagnostic;
}

export interface DiagnosticOccurrenceReporter {
  readonly owner: string;
  report(diagnostic: TerminalDiagnostic): DiagnosticOccurrence;
}

const terminalDiagnosticFields = new Set([
  'fingerprint',
  'code',
  'severity',
  'message',
  'target',
  'cause',
  'hint',
  'data'
]);
const diagnosticOccurrenceFields = new Set([
  'id',
  'owner',
  'sequence',
  'diagnostic'
]);

export function diagnostic(
  code: TerminalDiagnosticCode,
  message: string,
  options: {
    readonly severity?: TerminalSeverity;
    readonly target?: string;
    readonly cause?: unknown;
    readonly hint?: string;
    readonly data?: Readonly<Record<string, TerminalDiagnosticValue>>;
  } = {}
): TerminalDiagnostic {
  const content = {
    code,
    severity: options.severity ?? 'error',
    message: redactDiagnosticText(message),
    ...(options.target === undefined ? {} : { target: redactDiagnosticText(options.target) }),
    ...(options.cause === undefined ? {} : { cause: diagnosticValue(options.cause) }),
    ...(options.hint === undefined ? {} : { hint: redactDiagnosticText(options.hint) }),
    ...(options.data === undefined ? {} : { data: diagnosticData(options.data) })
  } as const;
  return terminalDiagnosticFromContent(content);
}

export function terminalDiagnosticFromContent(
  content: Omit<TerminalDiagnostic, 'fingerprint'>
): TerminalDiagnostic {
  const immutableContent = {
    code: content.code,
    severity: content.severity,
    message: content.message,
    ...(content.target === undefined ? {} : { target: content.target }),
    ...(content.cause === undefined ? {} : { cause: immutableDiagnosticValue(content.cause) }),
    ...(content.hint === undefined ? {} : { hint: content.hint }),
    ...(content.data === undefined ? {} : { data: immutableDiagnosticData(content.data) })
  } as const;
  return Object.freeze({
    ...immutableContent,
    fingerprint: diagnosticFingerprint(immutableContent)
  });
}

function diagnosticFingerprint(content: Omit<TerminalDiagnostic, 'fingerprint'>): string {
  const serialized = JSON.stringify(canonicalDiagnosticValue(content));
  return `diagnostic:sha256:${sha256Hex(serialized)}`;
}

export function createDiagnosticOccurrenceReporter(owner: string): DiagnosticOccurrenceReporter {
  const normalizedOwner = owner.trim();
  if (normalizedOwner.length === 0) throw new TypeError('Diagnostic occurrence owner must not be empty.');
  let nextSequence = 1;
  return Object.freeze({
    owner: normalizedOwner,
    report(item: TerminalDiagnostic) {
      const content = snapshotTerminalDiagnostic(item);
      const sequence = nextSequence;
      nextSequence += 1;
      return Object.freeze({
        id: `${normalizedOwner}:diagnostic:${String(sequence)}`,
        owner: normalizedOwner,
        sequence,
        diagnostic: content
      });
    }
  });
}

function snapshotTerminalDiagnostic(item: TerminalDiagnostic): TerminalDiagnostic {
  const issue = terminalDiagnosticIssue(item);
  if (issue !== undefined) throw new TypeError(`Invalid terminal diagnostic: ${issue}`);
  return terminalDiagnosticFromContent({
    code: item.code,
    severity: item.severity,
    message: item.message,
    ...(item.target === undefined ? {} : { target: item.target }),
    ...(item.cause === undefined ? {} : { cause: item.cause }),
    ...(item.hint === undefined ? {} : { hint: item.hint }),
    ...(item.data === undefined ? {} : { data: item.data })
  });
}

function canonicalDiagnosticValue(value: TerminalDiagnosticValue): TerminalDiagnosticValue {
  if (Array.isArray(value)) return value.map(canonicalDiagnosticValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => compareCodeUnits(left, right))
        .map(([key, item]) => [key, canonicalDiagnosticValue(item)])
    );
  }
  return value;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function immutableDiagnosticValue(value: TerminalDiagnosticValue): TerminalDiagnosticValue {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(immutableDiagnosticValue));
  }
  if (value !== null && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, immutableDiagnosticValue(item)])
    ));
  }
  return value;
}

function immutableDiagnosticData(
  data: Readonly<Record<string, TerminalDiagnosticValue>>
): Readonly<Record<string, TerminalDiagnosticValue>> {
  return Object.freeze(Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, immutableDiagnosticValue(value)])
  ));
}

function diagnosticValue(value: unknown): TerminalDiagnosticValue {
  const normalized = normalizeDiagnosticValue(value, new Set(), 0, { nodes: 0 });
  return normalized.ok
    ? redactDiagnosticValue(normalized.value)
    : diagnosticTruncation;
}

function diagnosticData(
  data: Readonly<Record<string, TerminalDiagnosticValue>>
): Readonly<Record<string, TerminalDiagnosticValue>> {
  const normalized = normalizeDiagnosticValue(data, new Set(), 0, { nodes: 0 });
  if (!normalized.ok) return { value: diagnosticTruncation };
  const redacted = redactDiagnosticValue(normalized.value);
  return isDiagnosticObject(redacted)
    ? redacted
    : { value: redacted };
}

function isDiagnosticObject(
  value: TerminalDiagnosticValue
): value is Readonly<Record<string, TerminalDiagnosticValue>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const maximumDiagnosticDepth = 3;
const maximumDiagnosticNodes = 1_000;
const diagnosticTruncation = '[Truncated]';

interface DiagnosticTraversalBudget {
  nodes: number;
}

type DiagnosticNormalization =
  | { readonly ok: true; readonly value: TerminalDiagnosticValue }
  | { readonly ok: false };

function normalizeDiagnosticValue(
  value: unknown,
  ancestors: Set<object>,
  depth: number,
  budget: DiagnosticTraversalBudget
): DiagnosticNormalization {
  budget.nodes += 1;
  if (budget.nodes > maximumDiagnosticNodes) return { ok: false };
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return { ok: true, value };
  }
  if (typeof value === 'number') {
    return { ok: true, value: Number.isFinite(value) ? value : String(value) };
  }
  if (typeof value === 'bigint') return { ok: true, value: value.toString() };
  if (typeof value === 'symbol') return { ok: true, value: value.description ?? 'symbol' };
  if (typeof value === 'function' || value === undefined) {
    return { ok: true, value: objectTag(value) };
  }
  if (value instanceof Error) {
    return { ok: true, value: { name: value.name, message: value.message } };
  }
  if (ancestors.has(value)) return { ok: true, value: '[Circular]' };
  if (depth >= maximumDiagnosticDepth) return { ok: true, value: objectTag(value) };

  let arrayValue: unknown[] | undefined;
  try {
    arrayValue = Array.isArray(value) ? value : undefined;
  } catch {
    return { ok: true, value: '[Unserializable]' };
  }

  ancestors.add(value);
  if (arrayValue !== undefined) {
    const normalized: TerminalDiagnosticValue[] = [];
    try {
      const length = arrayValue.length;
      for (let index = 0; index < length; index += 1) {
        const item = normalizeDiagnosticValue(arrayValue[index], ancestors, depth + 1, budget);
        if (!item.ok) {
          ancestors.delete(value);
          return item;
        }
        normalized.push(item.value);
      }
    } catch {
      ancestors.delete(value);
      return { ok: true, value: '[Unserializable]' };
    }
    ancestors.delete(value);
    return { ok: true, value: normalized };
  }

  const objectValue = value as Record<string, unknown>;
  const normalizedEntries: [string, TerminalDiagnosticValue][] = [];
  try {
    for (const key in objectValue) {
      if (!Object.hasOwn(objectValue, key)) continue;
      const item = normalizeDiagnosticValue(objectValue[key], ancestors, depth + 1, budget);
      if (!item.ok) {
        ancestors.delete(value);
        return item;
      }
      normalizedEntries.push([key, item.value]);
    }
  } catch {
    ancestors.delete(value);
    return { ok: true, value: '[Unserializable]' };
  }
  ancestors.delete(value);
  return { ok: true, value: Object.fromEntries(normalizedEntries) };
}

function objectTag(value: unknown): string {
  try {
    return Object.prototype.toString.call(value);
  } catch {
    return '[Unserializable]';
  }
}

function redactDiagnosticValue(value: TerminalDiagnosticValue): TerminalDiagnosticValue {
  if (typeof value === 'string') return redactDiagnosticText(value);
  if (Array.isArray(value)) return value.map(redactDiagnosticValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactDiagnosticValue(item)])
    );
  }
  return value;
}

function redactDiagnosticText(value: string): string {
  return redactSecretLikeText(value);
}

export function terminalDiagnosticIssue(item: unknown): string | undefined {
  if (!isNonArrayObject(item)) return 'diagnostic must be an object.';
  const unknownField = findUnsupportedField(item, terminalDiagnosticFields);
  if (unknownField !== undefined) return `diagnostic contains unsupported field: ${unknownField}.`;
  return diagnosticContentIssue(item);
}

function diagnosticContentIssue(item: Readonly<Record<string, unknown>>): string | undefined {
  if (typeof item['fingerprint'] !== 'string' || item['fingerprint'].length === 0) {
    return 'diagnostic fingerprint must be a non-empty string.';
  }
  if (!isStringMember(item['code'], terminalDiagnosticCodes)) {
    return `unsupported diagnostic code: ${String(item['code'])}.`;
  }
  if (!isStringMember(item['severity'], terminalSeverities)) {
    return `unsupported diagnostic severity: ${String(item['severity'])}.`;
  }
  if (typeof item['message'] !== 'string') return 'diagnostic message must be a string.';
  if (item['target'] !== undefined && typeof item['target'] !== 'string') {
    return 'diagnostic target must be a string.';
  }
  if (item['cause'] !== undefined) {
    const issue = jsonValueIssue(item['cause']);
    if (issue !== undefined) return `diagnostic cause must be JSON-safe: ${issue}.`;
  }
  if (item['hint'] !== undefined && typeof item['hint'] !== 'string') return 'diagnostic hint must be a string.';
  if (
    item['data'] !== undefined
    && (!isNonArrayObject(item['data']) || jsonValueIssue(item['data']) !== undefined)
  ) {
    return 'diagnostic data must be a JSON-safe object.';
  }
  const content: Omit<TerminalDiagnostic, 'fingerprint'> = {
    code: item['code'],
    severity: item['severity'],
    message: item['message'],
    ...(typeof item['target'] === 'string' ? { target: item['target'] } : {}),
    ...(item['cause'] === undefined ? {} : { cause: item['cause'] as TerminalDiagnosticValue }),
    ...(typeof item['hint'] === 'string' ? { hint: item['hint'] } : {}),
    ...(item['data'] === undefined
      ? {}
      : { data: item['data'] as Readonly<Record<string, TerminalDiagnosticValue>> })
  };
  if (item['fingerprint'] !== diagnosticFingerprint(content)) {
    return 'diagnostic fingerprint does not match its canonical content.';
  }
  return undefined;
}

export function diagnosticOccurrenceIssue(item: unknown): string | undefined {
  if (!isNonArrayObject(item)) return 'diagnostic occurrence must be an object.';
  const unknownField = findUnsupportedField(item, diagnosticOccurrenceFields);
  if (unknownField !== undefined) {
    return `diagnostic occurrence contains unsupported field: ${unknownField}.`;
  }
  if (typeof item['id'] !== 'string' || item['id'].length === 0) {
    return 'diagnostic occurrence id must be a non-empty string.';
  }
  if (typeof item['owner'] !== 'string' || item['owner'].length === 0) {
    return 'diagnostic occurrence owner must be a non-empty string.';
  }
  if (
    typeof item['sequence'] !== 'number'
    || !Number.isInteger(item['sequence'])
    || item['sequence'] < 1
  ) {
    return 'diagnostic occurrence sequence must be a positive integer.';
  }
  if (item['id'] !== `${item['owner']}:diagnostic:${String(item['sequence'])}`) {
    return 'diagnostic occurrence id must match its owner and sequence.';
  }
  const diagnosticIssue = terminalDiagnosticIssue(item['diagnostic']);
  return diagnosticIssue === undefined
    ? undefined
    : `diagnostic occurrence contains an invalid diagnostic: ${diagnosticIssue}`;
}
