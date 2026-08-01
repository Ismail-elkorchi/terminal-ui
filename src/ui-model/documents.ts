export type { LogHistory, LogEntry } from './log-history.ts';
import type {
  ValidationLevel
} from './contracts.ts';

export interface CommandInputValidation {
  readonly message: string;
  readonly level?: ValidationLevel;
}

export type CommandInputDisplay = 'compact' | 'expanded' | 'popup';
