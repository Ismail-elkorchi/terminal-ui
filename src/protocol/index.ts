import { sanitizeTerminalText } from '../text/index.ts';
import type { TerminalHost, TerminalStateChange, TerminalStateSnapshot } from '../host/index.ts';

export interface TerminalProtocolWriter {
  enableAlternateScreen(): Promise<void>;
  disableAlternateScreen(): Promise<void>;
  enableBracketedPaste(): Promise<void>;
  disableBracketedPaste(): Promise<void>;
  enableMouseReporting(mode: MouseReportingMode): Promise<void>;
  disableMouseReporting(): Promise<void>;
  enableFocusReporting(): Promise<void>;
  disableFocusReporting(): Promise<void>;
  hideCursor(): Promise<void>;
  showCursor(): Promise<void>;
  moveCursor(row: number, column: number): Promise<void>;
  clearScreen(): Promise<void>;
  clearLine(): Promise<void>;
  setTitle(title: string): Promise<void>;
  bell(): Promise<void>;
}

export type MouseReportingMode = 'none' | 'click' | 'drag' | 'all';

export interface TerminalRestorePlan {
  readonly snapshot: TerminalStateSnapshot;
  readonly operations: readonly TerminalStateChange[];
}

export function createProtocolWriter(host: TerminalHost): TerminalProtocolWriter {
  return {
    enableAlternateScreen: async () => host.write({ text: '\u001B[?1049h' }),
    disableAlternateScreen: async () => host.write({ text: '\u001B[?1049l' }),
    enableBracketedPaste: async () => host.write({ text: '\u001B[?2004h' }),
    disableBracketedPaste: async () => host.write({ text: '\u001B[?2004l' }),
    enableMouseReporting: async (mode) => host.write({ text: mouseReportingEnableSequence(assertMouseReportingMode(mode)) }),
    disableMouseReporting: async () => host.write({ text: mouseReportingDisableSequence() }),
    enableFocusReporting: async () => host.write({ text: '\u001B[?1004h' }),
    disableFocusReporting: async () => host.write({ text: '\u001B[?1004l' }),
    hideCursor: async () => host.write({ text: '\u001B[?25l' }),
    showCursor: async () => host.write({ text: '\u001B[?25h' }),
    moveCursor: async (row, column) => host.write({ text: cursorMoveSequence(row, column) }),
    clearScreen: async () => host.write({ text: '\u001B[2J' }),
    clearLine: async () => host.write({ text: '\u001B[2K' }),
    setTitle: async (title) => host.write({ text: `\u001B]0;${sanitizeControlSequence(title)}\u0007` }),
    bell: async () => host.write({ text: '\u0007' })
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
  return `\u001B[?${baseMode}h\u001B[?1006h`;
}

function mouseReportingDisableSequence(): string {
  return '\u001B[?1003l\u001B[?1002l\u001B[?1000l\u001B[?1006l';
}

export function createRestorePlan(snapshot: TerminalStateSnapshot): TerminalRestorePlan {
  return {
    snapshot,
    operations: [
      { kind: 'cursorVisible', enabled: snapshot.cursorVisible },
      { kind: 'focusReporting', enabled: snapshot.focusReporting },
      { kind: 'mouseReporting', enabled: snapshot.mouseReporting },
      { kind: 'bracketedPaste', enabled: snapshot.bracketedPaste },
      { kind: 'alternateScreen', enabled: snapshot.alternateScreen },
      { kind: 'rawInput', enabled: snapshot.rawInput }
    ]
  };
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
