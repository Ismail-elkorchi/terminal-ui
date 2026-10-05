import type {
  TerminalResponseClassification,
  TerminalResponseProtocol,
} from './terminal-response.ts';
import { csiBody } from './terminal-response.ts';

const privateModeNumbers = [
  25,
  1000,
  1002,
  1003,
  1004,
  1006,
  1036,
  1049,
  2004,
  2026,
  2027
] as const;

export type TerminalModeKey = `private:${typeof privateModeNumbers[number]}` | 'standard:8';
export const queriedModes: readonly TerminalModeKey[] = Object.freeze([
  ...privateModeNumbers.map((mode): TerminalModeKey => `private:${String(mode)}` as TerminalModeKey),
  'standard:8',
]);
export type TerminalModeReportState = 'unrecognized' | 'set' | 'reset' | 'permanently_set' | 'permanently_reset';
export type TerminalModeReports = Readonly<Partial<Record<TerminalModeKey, TerminalModeReportState>>>;

export interface TerminalModeEvidence {
  readonly reports: TerminalModeReports;
  readonly missingModes: readonly TerminalModeKey[];
  readonly conflictingModes: readonly TerminalModeKey[];
  /** Every requested mode replied; conflicting reports remain unusable even when complete. */
  readonly complete: boolean;
}

export interface TerminalModeResponseProtocol extends TerminalResponseProtocol<TerminalModeReports> {
  evidence(): TerminalModeEvidence;
}

export function terminalModeQueryRequest(modes: readonly TerminalModeKey[] = queriedModes): string {
  return `${modes.map((mode) => {
    const [namespace, number] = mode.split(':');
    return `\u001B[${namespace === 'private' ? '?' : ''}${number ?? ''}$p`;
  }).join('')}\u001B[c`;
}

export function createTerminalModeResponseProtocol(modes: readonly TerminalModeKey[] = queriedModes): TerminalModeResponseProtocol {
  const requested = [...new Set(modes)];
  const reports = new Map<TerminalModeKey, TerminalModeReportState>();
  const received = new Set<TerminalModeKey>();
  const conflicts = new Set<TerminalModeKey>();
  let deviceAttributesReceived = false;
  let retired = false;
  const complete = (): boolean => requested.every((mode) => received.has(mode));
  const snapshot = (): TerminalModeReports => Object.freeze(Object.fromEntries(reports));
  return {
    acceptReplayedResponses: false,
    classify(control): TerminalResponseClassification<TerminalModeReports> | undefined {
      const body = csiBody(control);
      if (body === undefined || body.length === 0) return undefined;
      if (isPrimaryDeviceAttributes(body)) {
        if (!retired) deviceAttributesReceived = true;
        return { kind: 'consume' };
      }
      const report = parseModeReport(body);
      if (report === undefined || !requested.includes(report.mode)) return undefined;
      if (!retired) {
        if (received.has(report.mode) && reports.get(report.mode) !== report.state) {
          conflicts.add(report.mode);
          reports.delete(report.mode);
        }
        received.add(report.mode);
        if (!conflicts.has(report.mode)) reports.set(report.mode, report.state);
      }
      return { kind: 'consume' };
    },
    complete: () => complete() ? snapshot() : undefined,
    evidence: () => Object.freeze({
      reports: snapshot(),
      missingModes: Object.freeze(requested.filter((mode) => !received.has(mode))),
      conflictingModes: Object.freeze(requested.filter((mode) => conflicts.has(mode))),
      complete: complete(),
    }),
    retire() {
      retired = true;
      return deviceAttributesReceived && complete() ? undefined : {
        quarantineUntilDeadline: true,
        classify: (control) => this.classify(control),
      };
    },
  };
}

export function modeIsSet(state: TerminalModeReportState | undefined): boolean | undefined {
  if (state === 'set' || state === 'permanently_set') return true;
  if (state === 'reset' || state === 'permanently_reset') return false;
  return undefined;
}

export function modeIsMutable(state: TerminalModeReportState | undefined): boolean | undefined {
  // An unrecognized query says nothing about set/reset implementation.
  if (state === undefined || state === 'unrecognized') return undefined;
  return state === 'set' || state === 'reset';
}

function parseModeReport(
  body: Uint8Array
): { readonly mode: TerminalModeKey; readonly state: TerminalModeReportState } | undefined {
  if (body.at(-1) !== lowercaseY || body.at(-2) !== dollar) return undefined;
  const privateMode = body[0] === questionMark;
  const start = privateMode ? 1 : 0;
  const separator = body.indexOf(semicolon, start);
  if (separator <= start || separator !== body.length - 4) return undefined;
  const number = decimal(body.subarray(start, separator));
  const mode = `${privateMode ? 'private' : 'standard'}:${String(number)}`;
  const state = modeReportState(body[separator + 1]);
  return isQueriedMode(mode) && state !== undefined ? { mode, state } : undefined;
}

function isPrimaryDeviceAttributes(body: Uint8Array): boolean {
  if (body[0] !== questionMark || body.at(-1) !== lowercaseC || body.length < 3) return false;
  return body.subarray(1, body.length - 1).every((byte) => isDigit(byte) || byte === semicolon);
}

function modeReportState(value: number | undefined): TerminalModeReportState | undefined {
  switch (value) {
    case 0x30: return 'unrecognized';
    case 0x31: return 'set';
    case 0x32: return 'reset';
    case 0x33: return 'permanently_set';
    case 0x34: return 'permanently_reset';
    default: return undefined;
  }
}

function decimal(bytes: Uint8Array): number | undefined {
  if (bytes.length === 0 || !bytes.every(isDigit)) return undefined;
  let value = 0;
  for (const byte of bytes) {
    value = value * 10 + byte - 0x30;
    if (!Number.isSafeInteger(value)) return undefined;
  }
  return value;
}

function isQueriedMode(value: string): value is TerminalModeKey {
  return (queriedModes as readonly string[]).includes(value);
}

function isDigit(value: number): boolean {
  return value >= 0x30 && value <= 0x39;
}

const questionMark = 0x3f;
const semicolon = 0x3b;
const dollar = 0x24;
const lowercaseC = 0x63;
const lowercaseY = 0x79;
