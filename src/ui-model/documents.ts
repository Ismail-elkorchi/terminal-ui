import type { TerminalStyle } from '../visual/render.ts';
import type {
  ComponentValidationTone,
  FieldItem,
  LogLevel,
  RecordStatus,
  TitledItem
} from './contracts.ts';

export interface ScrollbackItem {
  readonly id: string;
  readonly text: string;
  readonly level?: LogLevel;
  readonly style?: TerminalStyle;
  readonly timestamp?: string;
  readonly metadata?: Record<string, string>;
}

export interface StructuredBlock extends TitledItem {
  readonly summary?: string;
  readonly style?: TerminalStyle;
  readonly status?: RecordStatus;
  readonly fields?: readonly FieldItem[];
  readonly body?: string;
  readonly details?: string;
  readonly collapsed?: boolean;
}

export interface CommandBarValidation {
  readonly message: string;
  readonly tone?: ComponentValidationTone;
}

export type CommandBarDisplay = 'compact' | 'expanded';
