import type { TerminalStyle } from '../visual/render.ts';
export type { LogHistory, LogEntry } from './log-history.ts';
import type {
  FieldItem,
  LogLevel,
  RecordResult,
  TitledItem,
  ValidationLevel
} from './contracts.ts';

export interface StructuredBlock extends TitledItem {
  readonly summary?: string;
  readonly style?: TerminalStyle;
  /** Lifecycle outcome for the work represented by this record. */
  readonly result?: RecordResult;
  /** Informational severity of the record, independent of its lifecycle result. */
  readonly level?: LogLevel;
  readonly fields?: readonly FieldItem[];
  readonly body?: string;
  readonly details?: string;
  readonly collapsed?: boolean;
}

export interface CommandInputValidation {
  readonly message: string;
  readonly level?: ValidationLevel;
}

export type CommandInputDisplay = 'compact' | 'expanded';
