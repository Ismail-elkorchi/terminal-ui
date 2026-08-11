/* eslint-disable @typescript-eslint/no-unnecessary-condition -- Public JavaScript callers can bypass TypeScript. */
import { sanitizeTerminalCellText } from '../text/index.ts';
export type { ClipboardWritePolicy, ClipboardWriteResult } from './clipboard.ts';
export { createClipboardWriteSequence, writeClipboardText } from './clipboard.ts';
export type { TerminalProtocolSink } from './types.ts';
export {
  KITTY_KEYBOARD_FLAGS,
  LEGACY_KEYBOARD_PROFILE,
  decodeKeyboardProfile,
  kittyKeyboardFlags,
  kittyKeyboardProfile,
  normalizeKeyboardProfile
} from './keyboard.ts';
export type { KittyKeyboardFlagMap, KittyKeyboardFlags, TerminalKeyboardProfile } from './keyboard.ts';
import type { TerminalProtocolSink } from './types.ts';
import { normalizeKeyboardProfile } from './keyboard.ts';
import type { TerminalKeyboardProfile } from './keyboard.ts';

export interface TerminalProtocolWriter {
  enableAlternateScreen(): Promise<void>;
  disableAlternateScreen(): Promise<void>;
  enableBracketedPaste(): Promise<void>;
  disableBracketedPaste(): Promise<void>;
  setMouseReporting(state: MouseReportingState): Promise<void>;
  enableFocusReporting(): Promise<void>;
  disableFocusReporting(): Promise<void>;
  enableUnicodeGraphemeMode(): Promise<void>;
  disableUnicodeGraphemeMode(): Promise<void>;
  pushKeyboardProfile(profile: TerminalKeyboardProfile): Promise<void>;
  setKeyboardProfile(profile: TerminalKeyboardProfile): Promise<void>;
  popKeyboardProfile(): Promise<void>;
  hideCursor(): Promise<void>;
  showCursor(): Promise<void>;
  moveCursor(row: number, column: number): Promise<void>;
  clearScreen(): Promise<void>;
  clearLine(): Promise<void>;
  setTitle(title: string): Promise<void>;
  bell(): Promise<void>;
}

export type MouseReportingMode = 'none' | 'click' | 'drag' | 'all';
export type MouseReportingEncoding = 'default' | 'sgr';

export interface MouseReportingState {
  readonly tracking: MouseReportingMode;
  readonly encoding: MouseReportingEncoding;
}

export function createProtocolWriter(sink: TerminalProtocolSink): TerminalProtocolWriter {
  return {
    enableAlternateScreen: async () => sink.write('\u001B[?1049h'),
    disableAlternateScreen: async () => sink.write('\u001B[?1049l'),
    enableBracketedPaste: async () => sink.write('\u001B[?2004h'),
    disableBracketedPaste: async () => sink.write('\u001B[?2004l'),
    setMouseReporting: async (state) => sink.write(mouseReportingSequence(normalizeMouseReportingState(state))),
    enableFocusReporting: async () => sink.write('\u001B[?1004h'),
    disableFocusReporting: async () => sink.write('\u001B[?1004l'),
    enableUnicodeGraphemeMode: async () => sink.write('\u001B[?2027h'),
    disableUnicodeGraphemeMode: async () => sink.write('\u001B[?2027l'),
    pushKeyboardProfile: async (profile) => {
      const normalized = normalizeKeyboardProfile(profile);
      const flags = normalized.kind === 'kitty' ? normalized.flags : 0;
      await sink.write(`\u001B[>${String(flags)}u`);
    },
    setKeyboardProfile: async (profile) => {
      const normalized = normalizeKeyboardProfile(profile);
      const flags = normalized.kind === 'kitty' ? normalized.flags : 0;
      await sink.write(`\u001B[=${String(flags)}u`);
    },
    popKeyboardProfile: async () => sink.write('\u001B[<u'),
    hideCursor: async () => sink.write('\u001B[?25l'),
    showCursor: async () => sink.write('\u001B[?25h'),
    moveCursor: async (row, column) => sink.write(cursorMoveSequence(row, column)),
    clearScreen: async () => sink.write('\u001B[2J'),
    clearLine: async () => sink.write('\u001B[2K'),
    setTitle: async (title) => sink.write(`\u001B]0;${terminalTitle(title)}\u0007`),
    bell: async () => sink.write('\u0007')
  };
}

function cursorMoveSequence(row: number, column: number): string {
  return `\u001B[${String(positiveInteger(row, 'row'))};${String(positiveInteger(column, 'column'))}H`;
}

function mouseReportingSequence(state: MouseReportingState): string {
  const resetTracking = '\u001B[?1003l\u001B[?1002l\u001B[?1000l';
  const encoding = state.encoding === 'sgr' ? '\u001B[?1006h' : '\u001B[?1006l';
  if (state.tracking === 'none') return `${resetTracking}${encoding}`;
  const tracking = state.tracking === 'click'
    ? '1000'
    : state.tracking === 'drag'
      ? '1002'
      : '1003';
  return `${resetTracking}${encoding}\u001B[?${tracking}h`;
}

export function normalizeMouseReportingState(state: MouseReportingState): MouseReportingState {
  if (typeof state !== 'object' || state === null || Array.isArray(state)) {
    throw new TypeError('mouse reporting state must be an object.');
  }
  const tracking = assertMouseReportingMode(state.tracking);
  const encoding = state.encoding;
  if (encoding !== 'default' && encoding !== 'sgr') {
    throw new RangeError('mouse reporting encoding must be default or sgr.');
  }
  return Object.freeze({ tracking, encoding });
}

function terminalTitle(value: string): string {
  if (typeof value !== 'string') throw new TypeError('Terminal title must be a string.');
  const title = sanitizeTerminalCellText(value).text;
  if (title.length > 4096) throw new RangeError('Terminal title must not exceed 4096 code units.');
  return title;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive integer.`);
  }
  return value;
}

function assertMouseReportingMode(mode: MouseReportingMode): MouseReportingMode {
  if (mode === 'none' || mode === 'click' || mode === 'drag' || mode === 'all') return mode;
  throw new RangeError('mouse reporting mode must be none, click, drag, or all.');
}
export {
  defaultTerminalOutputCapabilities
} from './output-capabilities.ts';
export type {
  TerminalOutputCapabilityProfile,
  TerminalOutputFeatureSupport
} from './output-capabilities.ts';
