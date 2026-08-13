export type ValidationLevel = 'info' | 'warning' | 'error';
export type ComponentDensity = 'compact' | 'regular';

export type StatusBarStatus =
  | 'idle'
  | 'pending'
  | 'running'
  | 'success'
  | 'warning'
  | 'error'
  | 'info';

export type ProcessStatus = 'idle' | 'running' | 'success' | 'warning' | 'error';
export type LogLevel = 'info' | 'warning' | 'error';

export interface ItemBase {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly disabled?: boolean;
}

export interface TitledItem {
  readonly id: string;
  readonly title: string;
}

export interface ChoiceItem<TValue = string> extends ItemBase {
  readonly value: TValue;
}

export interface SearchEntry<TValue = string> extends ChoiceItem<TValue> {
  readonly group?: string;
  readonly keywords?: readonly string[];
  readonly preview?: string;
}

export interface HelpBinding {
  readonly binding: import('../interaction/key-binding.ts').KeyboardBinding;
  readonly label: string;
}

export interface HelpGroup {
  readonly id: string;
  readonly label?: string;
  readonly bindings: readonly HelpBinding[];
}
