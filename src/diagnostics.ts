import { redactSecretLikeText } from './text/secrets.ts';
import { sha256Hex } from './diagnostic-identity.ts';

export type TerminalSeverity = 'debug' | 'info' | 'warning' | 'error' | 'fatal';

export type TerminalDiagnosticValue =
  | string
  | number
  | boolean
  | null
  | readonly TerminalDiagnosticValue[]
  | { readonly [key: string]: TerminalDiagnosticValue };

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
  'TUI_PROJECTION_FAILED',
  'TUI_OUTPUT_FAILED',
  'TUI_EXIT_HOOK_FAILED',
  'TUI_RENDER_FAILED',
  'TUI_LAYOUT_FAILED',
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
  'TEXT_UNSAFE_CONTROL_SEQUENCE',
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
] as const satisfies readonly TerminalSeverity[];

export interface TerminalDiagnostic {
  readonly schemaVersion: 'terminal-ui.terminal-diagnostic.v1';
  readonly fingerprint: string;
  readonly code: TerminalDiagnosticCode;
  readonly severity: TerminalSeverity;
  readonly message: string;
  readonly target?: string;
  readonly cause?: TerminalDiagnosticValue;
  readonly hint?: string;
  readonly data?: Record<string, TerminalDiagnosticValue>;
}

export interface DiagnosticOccurrence extends TerminalDiagnostic {
  readonly id: string;
  readonly owner: string;
  readonly sequence: number;
}

export interface DiagnosticOccurrenceReporter {
  readonly owner: string;
  report(diagnostic: TerminalDiagnostic): DiagnosticOccurrence;
}

export function diagnostic(
  code: TerminalDiagnosticCode,
  message: string,
  options: {
    readonly severity?: TerminalSeverity;
    readonly target?: string;
    readonly cause?: unknown;
    readonly hint?: string;
    readonly data?: Record<string, TerminalDiagnosticValue>;
  } = {}
): TerminalDiagnostic {
  const content = {
    schemaVersion: 'terminal-ui.terminal-diagnostic.v1',
    code,
    severity: options.severity ?? 'error',
    message: redactDiagnosticText(message),
    ...(options.target === undefined ? {} : { target: redactDiagnosticText(options.target) }),
    ...(options.cause === undefined ? {} : { cause: diagnosticValue(options.cause) }),
    ...(options.hint === undefined ? {} : { hint: redactDiagnosticText(options.hint) }),
    ...(options.data === undefined ? {} : { data: diagnosticData(options.data) })
  } as const;
  return { ...content, fingerprint: diagnosticFingerprint(content) };
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
      const sequence = nextSequence;
      nextSequence += 1;
      return Object.freeze({
        ...item,
        id: `${normalizedOwner}:diagnostic:${String(sequence)}`,
        owner: normalizedOwner,
        sequence
      });
    }
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

function diagnosticValue(value: unknown, depth = 0): TerminalDiagnosticValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return typeof value === 'string' ? redactDiagnosticText(value) : value;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'symbol') return value.description ?? 'symbol';
  if (typeof value === 'function' || value === undefined) return Object.prototype.toString.call(value);
  if (value instanceof Error) {
    return {
      name: redactDiagnosticText(value.name),
      message: redactDiagnosticText(value.message)
    };
  }
  if (depth >= 3) return Object.prototype.toString.call(value);
  if (Array.isArray(value)) return value.map((item) => diagnosticValue(item, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, diagnosticValue(item, depth + 1)])
    );
  }
  return Object.prototype.toString.call(value);
}

function diagnosticData(
  data: Record<string, TerminalDiagnosticValue>
): Record<string, TerminalDiagnosticValue> {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, redactDiagnosticValue(value)])
  );
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
  if (!isRecord(item)) return 'diagnostic must be an object.';
  if (item['schemaVersion'] !== 'terminal-ui.terminal-diagnostic.v1') return 'diagnostic schemaVersion is invalid.';
  if (typeof item['fingerprint'] !== 'string' || item['fingerprint'].length === 0) {
    return 'diagnostic fingerprint must be a non-empty string.';
  }
  if (!isOneOf(item['code'], terminalDiagnosticCodes)) {
    return `unsupported diagnostic code: ${String(item['code'])}.`;
  }
  if (!isOneOf(item['severity'], terminalSeverities)) {
    return `unsupported diagnostic severity: ${String(item['severity'])}.`;
  }
  if (typeof item['message'] !== 'string') return 'diagnostic message must be a string.';
  if (item['target'] !== undefined && typeof item['target'] !== 'string') {
    return 'diagnostic target must be a string.';
  }
  if (item['cause'] !== undefined && !isDiagnosticValue(item['cause'])) {
    return 'diagnostic cause must be JSON-safe.';
  }
  if (item['hint'] !== undefined && typeof item['hint'] !== 'string') return 'diagnostic hint must be a string.';
  if (
    item['data'] !== undefined
    && (!isRecord(item['data']) || !Object.values(item['data']).every(isDiagnosticValue))
  ) {
    return 'diagnostic data must be a JSON-safe object.';
  }
  const content: Omit<TerminalDiagnostic, 'fingerprint'> = {
    schemaVersion: 'terminal-ui.terminal-diagnostic.v1',
    code: item['code'],
    severity: item['severity'],
    message: item['message'],
    ...(typeof item['target'] === 'string' ? { target: item['target'] } : {}),
    ...(item['cause'] === undefined ? {} : { cause: item['cause'] as TerminalDiagnosticValue }),
    ...(typeof item['hint'] === 'string' ? { hint: item['hint'] } : {}),
    ...(item['data'] === undefined
      ? {}
      : { data: item['data'] as Record<string, TerminalDiagnosticValue> })
  };
  if (item['fingerprint'] !== diagnosticFingerprint(content)) {
    return 'diagnostic fingerprint does not match its canonical content.';
  }
  return undefined;
}

export function diagnosticOccurrenceIssue(item: unknown): string | undefined {
  const diagnosticIssue = terminalDiagnosticIssue(item);
  if (diagnosticIssue !== undefined) return diagnosticIssue;
  if (!isRecord(item)) return 'diagnostic occurrence must be an object.';
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
  return undefined;
}

function isDiagnosticValue(value: unknown): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isDiagnosticValue);
  return isRecord(value) && Object.values(value).every(isDiagnosticValue);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOneOf<TValue extends string>(value: unknown, options: readonly TValue[]): value is TValue {
  return typeof value === 'string' && (options as readonly string[]).includes(value);
}
