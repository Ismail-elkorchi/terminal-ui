import { redactSecretLikeText } from './text/secrets.ts';
import { sha256Hex } from './diagnostic-identity.ts';
import { snapshotCanonicalJsonValue } from './foundation/json.ts';
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
  'TUI_TERMINAL_OWNERSHIP_FAILED',
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
const canonicalDiagnostics = new WeakSet<object>();
const canonicalDiagnosticOccurrences = new WeakSet<object>();

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
  return createCanonicalTerminalDiagnostic(canonicalDiagnosticContent(content));
}

export function terminalDiagnosticFromContent(
  content: Omit<TerminalDiagnostic, 'fingerprint'>
): TerminalDiagnostic {
  const result = readDiagnosticContent(content);
  if (!result.ok) throw new TypeError(`Invalid terminal diagnostic content: ${result.issue}`);
  return createCanonicalTerminalDiagnostic(result.content);
}

function diagnosticFingerprint(content: Omit<TerminalDiagnostic, 'fingerprint'>): string {
  const serialized = JSON.stringify(content);
  return `diagnostic:sha256:${sha256Hex(serialized)}`;
}

export function createDiagnosticOccurrenceReporter(owner: string): DiagnosticOccurrenceReporter {
  const normalizedOwner = owner.trim();
  if (normalizedOwner.length === 0) throw new TypeError('Diagnostic occurrence owner must not be empty.');
  let nextSequence = 1;
  return Object.freeze({
    owner: normalizedOwner,
    report(item: TerminalDiagnostic) {
      const content = adoptTerminalDiagnostic(item);
      const sequence = nextSequence;
      nextSequence += 1;
      const occurrence = Object.freeze({
        id: `${normalizedOwner}:diagnostic:${String(sequence)}`,
        owner: normalizedOwner,
        sequence,
        diagnostic: content
      });
      canonicalDiagnosticOccurrences.add(occurrence);
      return occurrence;
    }
  });
}

export function adoptTerminalDiagnostic(item: TerminalDiagnostic): TerminalDiagnostic {
  if (canonicalDiagnostics.has(item)) return item;
  if (!isNonArrayObject(item)) throw new TypeError('Invalid terminal diagnostic: diagnostic must be an object.');
  const unknownField = findUnsupportedField(item, terminalDiagnosticFields);
  if (unknownField !== undefined) {
    throw new TypeError(`Invalid terminal diagnostic: diagnostic contains unsupported field: ${unknownField}.`);
  }
  const result = readDiagnosticContent(item);
  if (!result.ok) throw new TypeError(`Invalid terminal diagnostic: ${result.issue}`);
  const fingerprint = item.fingerprint;
  if (typeof fingerprint !== 'string' || fingerprint.length === 0) {
    throw new TypeError('Invalid terminal diagnostic: diagnostic fingerprint must be a non-empty string.');
  }
  const expectedFingerprint = diagnosticFingerprint(result.content);
  if (fingerprint !== expectedFingerprint) {
    throw new TypeError('Invalid terminal diagnostic: diagnostic fingerprint does not match its canonical content.');
  }
  return createCanonicalTerminalDiagnostic(result.content, expectedFingerprint);
}

type DiagnosticContentRead =
  | { readonly ok: true; readonly content: Omit<TerminalDiagnostic, 'fingerprint'> }
  | { readonly ok: false; readonly issue: string };

function readDiagnosticContent(item: Readonly<Record<string, unknown>>): DiagnosticContentRead {
  let code: unknown;
  let severity: unknown;
  let message: unknown;
  let target: unknown;
  let causeValue: unknown;
  let hint: unknown;
  let dataValue: unknown;
  try {
    code = item['code'];
    severity = item['severity'];
    message = item['message'];
    target = item['target'];
    causeValue = item['cause'];
    hint = item['hint'];
    dataValue = item['data'];
  } catch {
    return { ok: false, issue: 'diagnostic properties could not be read.' };
  }
  if (!isStringMember(code, terminalDiagnosticCodes)) {
    return { ok: false, issue: `unsupported diagnostic code: ${String(code)}.` };
  }
  if (!isStringMember(severity, terminalSeverities)) {
    return { ok: false, issue: `unsupported diagnostic severity: ${String(severity)}.` };
  }
  if (typeof message !== 'string') {
    return { ok: false, issue: 'diagnostic message must be a string.' };
  }
  if (target !== undefined && typeof target !== 'string') {
    return { ok: false, issue: 'diagnostic target must be a string.' };
  }
  if (hint !== undefined && typeof hint !== 'string') {
    return { ok: false, issue: 'diagnostic hint must be a string.' };
  }

  let cause: TerminalDiagnosticValue | undefined;
  if (causeValue !== undefined) {
    try {
      cause = snapshotCanonicalJsonValue(causeValue, 'diagnostic cause');
    } catch (error) {
      return {
        ok: false,
        issue: error instanceof Error ? error.message : 'diagnostic cause must be JSON-safe.'
      };
    }
  }

  let data: Readonly<Record<string, TerminalDiagnosticValue>> | undefined;
  if (dataValue !== undefined) {
    try {
      const adopted = snapshotCanonicalJsonValue(dataValue, 'diagnostic data');
      if (!isDiagnosticObject(adopted)) {
        return { ok: false, issue: 'diagnostic data must be a JSON-safe object.' };
      }
      data = adopted;
    } catch (error) {
      return {
        ok: false,
        issue: error instanceof Error ? error.message : 'diagnostic data must be a JSON-safe object.'
      };
    }
  }

  return {
    ok: true,
    content: canonicalDiagnosticContent({
      code,
      severity,
      message,
      ...(target === undefined ? {} : { target }),
      ...(cause === undefined ? {} : { cause }),
      ...(hint === undefined ? {} : { hint }),
      ...(data === undefined ? {} : { data })
    })
  };
}

function canonicalDiagnosticContent(
  content: Omit<TerminalDiagnostic, 'fingerprint'>
): Omit<TerminalDiagnostic, 'fingerprint'> {
  return Object.freeze({
    ...(content.cause === undefined ? {} : { cause: content.cause }),
    code: content.code,
    ...(content.data === undefined ? {} : { data: content.data }),
    ...(content.hint === undefined ? {} : { hint: content.hint }),
    message: content.message,
    severity: content.severity,
    ...(content.target === undefined ? {} : { target: content.target })
  });
}

function createCanonicalTerminalDiagnostic(
  content: Omit<TerminalDiagnostic, 'fingerprint'>,
  fingerprint = diagnosticFingerprint(content)
): TerminalDiagnostic {
  const item = Object.freeze({ ...content, fingerprint });
  canonicalDiagnostics.add(item);
  return item;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function diagnosticValue(value: unknown): TerminalDiagnosticValue {
  const normalized = normalizeDiagnosticValue(value, new Set(), 0, { nodes: 0 });
  return normalized.ok
    ? normalized.value
    : diagnosticTruncation;
}

function diagnosticData(
  data: Readonly<Record<string, TerminalDiagnosticValue>>
): Readonly<Record<string, TerminalDiagnosticValue>> {
  const normalized = normalizeDiagnosticValue(data, new Set(), 0, { nodes: 0 });
  if (!normalized.ok) return Object.freeze({ value: diagnosticTruncation });
  return isDiagnosticObject(normalized.value)
    ? normalized.value
    : Object.freeze({ value: normalized.value });
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
  if (value === null || typeof value === 'boolean') {
    return { ok: true, value };
  }
  if (typeof value === 'string') return { ok: true, value: redactDiagnosticText(value) };
  if (typeof value === 'number') {
    return { ok: true, value: Number.isFinite(value) ? value : redactDiagnosticText(String(value)) };
  }
  if (typeof value === 'bigint') return { ok: true, value: redactDiagnosticText(value.toString()) };
  if (typeof value === 'symbol') {
    return { ok: true, value: redactDiagnosticText(value.description ?? 'symbol') };
  }
  if (typeof value === 'function' || value === undefined) {
    return { ok: true, value: redactDiagnosticText(objectTag(value)) };
  }
  if (value instanceof Error) {
    return {
      ok: true,
      value: Object.freeze({
        message: redactDiagnosticText(value.message),
        name: redactDiagnosticText(value.name)
      })
    };
  }
  if (ancestors.has(value)) return { ok: true, value: redactDiagnosticText('[Circular]') };
  if (depth >= maximumDiagnosticDepth) {
    return { ok: true, value: redactDiagnosticText(objectTag(value)) };
  }

  let arrayValue: unknown[] | undefined;
  try {
    arrayValue = Array.isArray(value) ? value : undefined;
  } catch {
    return { ok: true, value: redactDiagnosticText('[Unserializable]') };
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
      return { ok: true, value: redactDiagnosticText('[Unserializable]') };
    }
    ancestors.delete(value);
    return { ok: true, value: Object.freeze(normalized) };
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
    return { ok: true, value: redactDiagnosticText('[Unserializable]') };
  }
  ancestors.delete(value);
  normalizedEntries.sort(([left], [right]) => compareCodeUnits(left, right));
  return { ok: true, value: Object.freeze(Object.fromEntries(normalizedEntries)) };
}

function objectTag(value: unknown): string {
  try {
    return Object.prototype.toString.call(value);
  } catch {
    return '[Unserializable]';
  }
}

function redactDiagnosticText(value: string): string {
  return redactSecretLikeText(value);
}

export function terminalDiagnosticIssue(item: unknown): string | undefined {
  if (typeof item === 'object' && item !== null && canonicalDiagnostics.has(item)) return undefined;
  if (!isNonArrayObject(item)) return 'diagnostic must be an object.';
  const unknownField = findUnsupportedField(item, terminalDiagnosticFields);
  if (unknownField !== undefined) return `diagnostic contains unsupported field: ${unknownField}.`;
  if (typeof item['fingerprint'] !== 'string' || item['fingerprint'].length === 0) {
    return 'diagnostic fingerprint must be a non-empty string.';
  }
  const result = readDiagnosticContent(item);
  if (!result.ok) return result.issue;
  if (item['fingerprint'] !== diagnosticFingerprint(result.content)) {
    return 'diagnostic fingerprint does not match its canonical content.';
  }
  return undefined;
}

export function adoptDiagnosticOccurrence(item: DiagnosticOccurrence): DiagnosticOccurrence {
  if (canonicalDiagnosticOccurrences.has(item)) return item;
  if (!isNonArrayObject(item)) {
    throw new TypeError('Invalid diagnostic occurrence: diagnostic occurrence must be an object.');
  }
  const unknownField = findUnsupportedField(item, diagnosticOccurrenceFields);
  if (unknownField !== undefined) {
    throw new TypeError(
      `Invalid diagnostic occurrence: diagnostic occurrence contains unsupported field: ${unknownField}.`
    );
  }
  const id = item.id;
  const owner = item.owner;
  const sequence = item.sequence;
  if (typeof id !== 'string' || id.length === 0) {
    throw new TypeError('Invalid diagnostic occurrence: diagnostic occurrence id must be a non-empty string.');
  }
  if (typeof owner !== 'string' || owner.length === 0) {
    throw new TypeError('Invalid diagnostic occurrence: diagnostic occurrence owner must be a non-empty string.');
  }
  if (typeof sequence !== 'number' || !Number.isInteger(sequence) || sequence < 1) {
    throw new TypeError('Invalid diagnostic occurrence: diagnostic occurrence sequence must be a positive integer.');
  }
  if (id !== `${owner}:diagnostic:${String(sequence)}`) {
    throw new TypeError('Invalid diagnostic occurrence: diagnostic occurrence id must match its owner and sequence.');
  }
  const occurrence = Object.freeze({
    id,
    owner,
    sequence,
    diagnostic: adoptTerminalDiagnostic(item.diagnostic)
  });
  canonicalDiagnosticOccurrences.add(occurrence);
  return occurrence;
}

export function diagnosticOccurrenceIssue(item: unknown): string | undefined {
  if (typeof item === 'object' && item !== null && canonicalDiagnosticOccurrences.has(item)) return undefined;
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
