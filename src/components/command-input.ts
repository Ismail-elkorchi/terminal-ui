import type { ValidationLevel } from './validation.ts';

export interface CommandInputValidation {
  readonly message: string;
  readonly level?: ValidationLevel;
}

export type CommandInputDisplay = 'compact' | 'expanded' | 'popup';
