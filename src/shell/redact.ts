import { isSecretBearingName, redactSecretLikeText, secretRedactionReplacement } from '../text/secrets.ts';
import type { TerminalDiagnostic, TerminalDiagnosticValue } from '../diagnostics.ts';
import type { ShellTranscriptCommand } from './types.ts';

const sensitiveAssignment = /^(?<name>[A-Za-z_][A-Za-z0-9_-]*)=(?<value>.*)$/u;

export function redactShellTranscriptCommand(command: ShellTranscriptCommand): ShellTranscriptCommand {
  const secrets = sensitiveShellValuesFromCommand(command);
  const argv = command.argv === undefined ? undefined : redactShellArgv(command.argv);
  return {
    ...command,
    input: argv === undefined ? redactShellInput(command.input) : shellCommandLine(argv),
    ...(argv === undefined ? {} : { argv }),
    diagnostics: redactShellDiagnostics(command.diagnostics, secrets)
  };
}

export function redactShellDiagnostics(
  diagnostics: readonly TerminalDiagnostic[],
  secrets: readonly string[] = []
): readonly TerminalDiagnostic[] {
  return diagnostics.map((item) => redactDiagnostic(item, secrets));
}

export function redactShellCommandDiagnostics(
  input: string,
  argv: readonly string[] | undefined,
  diagnostics: readonly TerminalDiagnostic[]
): readonly TerminalDiagnostic[] {
  const secrets = sensitiveShellValuesFromCommand({
    input,
    ...(argv === undefined ? {} : { argv }),
    status: 'parsed',
    diagnostics: []
  });
  return redactShellDiagnostics(diagnostics, secrets);
}

export function redactShellArgv(argv: readonly string[]): readonly string[] {
  const redacted: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index] ?? '';
    const option = optionName(current);
    const assignment = splitOptionAssignment(current);
    if (assignment !== undefined && isSecretBearingName(assignment.name)) {
      redacted.push(`${assignment.prefix}${secretRedactionReplacement}`);
      continue;
    }
    if (isSensitiveAssignment(current)) {
      redacted.push(redactAssignment(current));
      continue;
    }
    redacted.push(current);
    if (option !== undefined && isSecretBearingName(option) && index + 1 < argv.length) {
      index += 1;
      redacted.push(secretRedactionReplacement);
    }
  }
  return redacted;
}

export function redactShellInput(input: string): string {
  return redactSecretLikeText(input);
}

function shellCommandLine(argv: readonly string[]): string {
  return argv.map(shellQuote).join(' ');
}

function shellQuote(value: string): string {
  return /^[A-Za-z0-9_./:@%+=,\-[\]]+$/u.test(value)
    ? value
    : `'${value.replaceAll("'", "'\\''")}'`;
}

function optionName(value: string): string | undefined {
  if (!value.startsWith('-') || value.includes('=')) return undefined;
  return value.replace(/^-+/u, '').toLowerCase();
}

function splitOptionAssignment(value: string): { readonly name: string; readonly prefix: string } | undefined {
  if (!value.startsWith('-')) return undefined;
  const equals = value.indexOf('=');
  if (equals === -1) return undefined;
  return {
    name: value.slice(0, equals).replace(/^-+/u, '').toLowerCase(),
    prefix: value.slice(0, equals + 1)
  };
}

function isSensitiveAssignment(value: string): boolean {
  const match = sensitiveAssignment.exec(value);
  return match?.groups?.['name'] !== undefined && isSecretBearingName(match.groups['name']);
}

function redactAssignment(value: string): string {
  const match = sensitiveAssignment.exec(value);
  const name = match?.groups?.['name'];
  return name === undefined ? value : `${name}=${secretRedactionReplacement}`;
}

export function sensitiveShellValuesFromCommand(command: ShellTranscriptCommand): readonly string[] {
  const argv = command.argv ?? [];
  const values = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index] ?? '';
    const assignment = splitOptionAssignment(current);
    if (assignment !== undefined && isSecretBearingName(assignment.name)) {
      const secret = current.slice(assignment.prefix.length);
      if (secret.length > 0) values.add(secret);
      continue;
    }
    const envAssignment = sensitiveAssignment.exec(current);
    if (
      envAssignment?.groups?.['name'] !== undefined
      && envAssignment.groups['value'] !== undefined
      && isSecretBearingName(envAssignment.groups['name'])
    ) {
      const value = envAssignment.groups['value'];
      if (value.length > 0) values.add(value);
      continue;
    }
    const option = optionName(current);
    if (option !== undefined && isSecretBearingName(option) && index + 1 < argv.length) {
      index += 1;
      const secret = argv[index];
      if (secret !== undefined && secret.length > 0) values.add(secret);
    }
  }
  values.delete(secretRedactionReplacement);
  return [...values];
}

function redactDiagnostic(item: TerminalDiagnostic, secrets: readonly string[]): TerminalDiagnostic {
  return {
    ...item,
    message: redactDiagnosticString(item.message, secrets),
    ...(item.target === undefined ? {} : { target: redactDiagnosticString(item.target, secrets) }),
    ...(item.hint === undefined ? {} : { hint: redactDiagnosticString(item.hint, secrets) }),
    ...(item.cause === undefined ? {} : { cause: redactDiagnosticValue(item.cause, secrets) }),
    ...(item.data === undefined ? {} : { data: redactDiagnosticData(item.data, secrets) })
  };
}

function redactDiagnosticData(
  data: Record<string, TerminalDiagnosticValue>,
  secrets: readonly string[]
): Record<string, TerminalDiagnosticValue> {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      redactDiagnosticValue(value, secrets)
    ])
  );
}

function redactDiagnosticValue(
  value: TerminalDiagnosticValue,
  secrets: readonly string[]
): TerminalDiagnosticValue {
  if (typeof value === 'string') return redactDiagnosticString(value, secrets);
  if (isDiagnosticArray(value)) {
    const redacted: TerminalDiagnosticValue[] = [];
    for (const item of value) redacted.push(redactDiagnosticValue(item, secrets));
    return redacted;
  }
  if (isDiagnosticObject(value)) {
    const redacted: Record<string, TerminalDiagnosticValue> = {};
    for (const key of Object.keys(value)) {
      const item = value[key];
      if (item !== undefined) redacted[key] = redactDiagnosticValue(item, secrets);
    }
    return redacted;
  }
  return value;
}

function isDiagnosticArray(value: TerminalDiagnosticValue): value is readonly TerminalDiagnosticValue[] {
  return Array.isArray(value);
}

function isDiagnosticObject(value: TerminalDiagnosticValue): value is Readonly<Record<string, TerminalDiagnosticValue>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function redactDiagnosticString(value: string, secrets: readonly string[]): string {
  let next = redactShellInput(value);
  for (const secret of secrets) {
    if (secret.length === 0) continue;
    next = next.split(secret).join(secretRedactionReplacement);
  }
  return next;
}
