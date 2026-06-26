import { redactSecretLikeText } from './text/secrets.ts';

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
  'HOST_STREAM_CLOSED',
  'HOST_RESTORE_FAILED',
  'HOST_PROTOCOL_UNSUPPORTED',
  'INPUT_CANCELLED',
  'INPUT_INTERRUPTED',
  'INPUT_TIMEOUT',
  'PROMPT_VALIDATION_FAILED',
  'PROMPT_NON_TTY_DENIED',
  'PROMPT_EDITOR_UNAVAILABLE',
  'PROMPT_DATA_SOURCE_FAILED',
  'SHELL_COMMAND_PARSE_DIAGNOSTIC',
  'SHELL_COMMAND_PARSE_FAILED',
  'SHELL_COMMAND_VALIDATE_DIAGNOSTIC',
  'SHELL_COMMAND_VALIDATE_FAILED',
  'SHELL_COMMAND_RUN_DIAGNOSTIC',
  'SHELL_COMMAND_RUN_FAILED',
  'TUI_RENDER_FAILED',
  'TUI_LAYOUT_FAILED',
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
  readonly code: TerminalDiagnosticCode;
  readonly severity: TerminalSeverity;
  readonly message: string;
  readonly target?: string;
  readonly cause?: TerminalDiagnosticValue;
  readonly hint?: string;
  readonly data?: Record<string, TerminalDiagnosticValue>;
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
  const result: TerminalDiagnostic = {
    schemaVersion: 'terminal-ui.terminal-diagnostic.v1',
    code,
    severity: options.severity ?? 'error',
    message: redactDiagnosticText(message),
    ...(options.target === undefined ? {} : { target: redactDiagnosticText(options.target) }),
    ...(options.cause === undefined ? {} : { cause: diagnosticValue(options.cause) }),
    ...(options.hint === undefined ? {} : { hint: redactDiagnosticText(options.hint) }),
    ...(options.data === undefined ? {} : { data: diagnosticData(options.data) })
  };
  return result;
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
