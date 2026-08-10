import { csiBody } from './terminal-response.ts';
import type {
  TerminalResponseClassification,
  TerminalResponseProtocol
} from './terminal-response.ts';

export const queriedPrivateModes = Object.freeze([
  25,
  1000,
  1002,
  1003,
  1004,
  1006,
  1049,
  2004,
  2026,
  2027
] as const);

export type QueriedPrivateMode = typeof queriedPrivateModes[number];
export type TerminalModeReportState = 'unrecognized' | 'set' | 'reset' | 'permanently_set' | 'permanently_reset';
export type TerminalModeReports = Readonly<Partial<Record<QueriedPrivateMode, TerminalModeReportState>>>;

export function terminalModeQueryRequest(): string {
  return `${queriedPrivateModes.map((mode) => `\u001B[?${String(mode)}$p`).join('')}\u001B[c`;
}

export function createTerminalModeResponseProtocol(): TerminalResponseProtocol<TerminalModeReports> {
  const reports: Partial<Record<QueriedPrivateMode, TerminalModeReportState>> = {};
  return {
    classify(control): TerminalResponseClassification<TerminalModeReports> | undefined {
      const body = csiBody(control);
      if (body === undefined || body.length === 0) return undefined;
      if (isPrimaryDeviceAttributes(body)) {
        return { kind: 'matched', value: Object.freeze({ ...reports }) };
      }
      const report = parseModeReport(body);
      if (report === undefined) return undefined;
      reports[report.mode] = report.state;
      return { kind: 'consume' };
    }
  };
}

export function modeIsSet(state: TerminalModeReportState | undefined): boolean | undefined {
  if (state === 'set' || state === 'permanently_set') return true;
  if (state === 'reset' || state === 'permanently_reset') return false;
  return undefined;
}

export function modeIsMutable(state: TerminalModeReportState | undefined): boolean | undefined {
  if (state === undefined) return undefined;
  return state === 'set' || state === 'reset';
}

function parseModeReport(
  body: Uint8Array
): { readonly mode: QueriedPrivateMode; readonly state: TerminalModeReportState } | undefined {
  if (body[0] !== questionMark || body.at(-1) !== lowercaseY || body.at(-2) !== dollar) return undefined;
  const separator = body.indexOf(semicolon, 1);
  if (separator < 2 || separator !== body.length - 4) return undefined;
  const mode = decimal(body.subarray(1, separator));
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

function isQueriedMode(value: number | undefined): value is QueriedPrivateMode {
  return value !== undefined && (queriedPrivateModes as readonly number[]).includes(value);
}

function isDigit(value: number): boolean {
  return value >= 0x30 && value <= 0x39;
}

const questionMark = 0x3f;
const semicolon = 0x3b;
const dollar = 0x24;
const lowercaseC = 0x63;
const lowercaseY = 0x79;
