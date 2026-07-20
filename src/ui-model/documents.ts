import type { TerminalStyle } from '../visual/render.ts';
export type { ScrollbackHistory, ScrollbackItem } from './scrollback-history.ts';
import type {
  ComponentValidationTone,
  FieldItem,
  RecordStatus,
  TitledItem
} from './contracts.ts';

export interface StructuredBlock extends TitledItem {
  readonly summary?: string;
  readonly style?: TerminalStyle;
  readonly status?: RecordStatus;
  readonly fields?: readonly FieldItem[];
  readonly body?: string;
  readonly details?: string;
  readonly collapsed?: boolean;
}

export interface CommandInputValidation {
  readonly message: string;
  readonly tone?: ComponentValidationTone;
}

export type CommandInputDisplay = 'compact' | 'expanded';
