import { sanitizeTerminalText } from '../text/index.ts';
export type { ClipboardWritePolicy, ClipboardWriteResult } from './clipboard.ts';
export { createClipboardWriteSequence, writeClipboardText } from './clipboard.ts';
export type { TerminalProtocolSink } from './types.ts';
import type { TerminalProtocolSink } from './types.ts';

export interface TerminalProtocolWriter {
  enableAlternateScreen(): Promise<void>;
  disableAlternateScreen(): Promise<void>;
  enableBracketedPaste(): Promise<void>;
  disableBracketedPaste(): Promise<void>;
  enableMouseReporting(mode: MouseReportingMode): Promise<void>;
  disableMouseReporting(): Promise<void>;
  enableFocusReporting(): Promise<void>;
  disableFocusReporting(): Promise<void>;
  enableEnhancedKeyboard(): Promise<void>;
  disableEnhancedKeyboard(): Promise<void>;
  hideCursor(): Promise<void>;
  showCursor(): Promise<void>;
  moveCursor(row: number, column: number): Promise<void>;
  clearScreen(): Promise<void>;
  clearLine(): Promise<void>;
  setTitle(title: string): Promise<void>;
  bell(): Promise<void>;
}

export type MouseReportingMode = 'none' | 'click' | 'drag' | 'all';

export function createProtocolWriter(sink: TerminalProtocolSink): TerminalProtocolWriter {
  return {
    enableAlternateScreen: async () => sink.write('\u001B[?1049h'),
    disableAlternateScreen: async () => sink.write('\u001B[?1049l'),
    enableBracketedPaste: async () => sink.write('\u001B[?2004h'),
    disableBracketedPaste: async () => sink.write('\u001B[?2004l'),
    enableMouseReporting: async (mode) => sink.write(mouseReportingEnableSequence(assertMouseReportingMode(mode))),
    disableMouseReporting: async () => sink.write(mouseReportingDisableSequence()),
    enableFocusReporting: async () => sink.write('\u001B[?1004h'),
    disableFocusReporting: async () => sink.write('\u001B[?1004l'),
    enableEnhancedKeyboard: async () => sink.write('\u001B[>3u'),
    disableEnhancedKeyboard: async () => sink.write('\u001B[<u'),
    hideCursor: async () => sink.write('\u001B[?25l'),
    showCursor: async () => sink.write('\u001B[?25h'),
    moveCursor: async (row, column) => sink.write(cursorMoveSequence(row, column)),
    clearScreen: async () => sink.write('\u001B[2J'),
    clearLine: async () => sink.write('\u001B[2K'),
    setTitle: async (title) => sink.write(`\u001B]0;${sanitizeControlSequence(title)}\u0007`),
    bell: async () => sink.write('\u0007')
  };
}

function cursorMoveSequence(row: number, column: number): string {
  return `\u001B[${String(positiveInteger(row, 'row'))};${String(positiveInteger(column, 'column'))}H`;
}

function mouseReportingEnableSequence(mode: MouseReportingMode): string {
  if (mode === 'none') return mouseReportingDisableSequence();
  const baseMode = mode === 'click'
    ? '1000'
    : mode === 'drag'
      ? '1002'
      : '1003';
  return `\u001B[?1006h\u001B[?${baseMode}h`;
}

function mouseReportingDisableSequence(): string {
  return '\u001B[?1003l\u001B[?1002l\u001B[?1000l\u001B[?1006l';
}

export function sanitizeControlSequence(sequence: string): string {
  return sanitizeTerminalText(sequence).text;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive integer.`);
  }
  return value;
}

function assertMouseReportingMode(mode: unknown): MouseReportingMode {
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
