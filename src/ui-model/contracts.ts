export type ValidationLevel = 'info' | 'warning' | 'error';
export type ComponentDensity = 'compact' | 'regular';

export type ComponentStatus =
  | 'idle'
  | 'pending'
  | 'running'
  | 'success'
  | 'warning'
  | 'error'
  | 'info';

export type ProcessStatus = Extract<ComponentStatus, 'idle' | 'running' | 'success' | 'warning' | 'error'>;
export type RecordStatus = Exclude<ComponentStatus, 'idle'> | 'failed' | 'cancelled' | 'skipped';
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

export interface HierarchyItem<TNode> {
  readonly children?: readonly TNode[];
  readonly expanded?: boolean;
}

export interface SuggestionItem<TValue = string> {
  readonly value: TValue;
  readonly label?: string;
  readonly description?: string;
  readonly disabled?: boolean;
}

export interface SearchEntry<TValue = string> extends ChoiceItem<TValue> {
  readonly group?: string;
  readonly keywords?: readonly string[];
  readonly preview?: string;
}

export interface FieldItem {
  readonly label: string;
  readonly value: string;
}

export interface HelpBinding {
  readonly key: string;
  readonly label: string;
}

export interface HelpGroup {
  readonly id: string;
  readonly label?: string;
  readonly bindings: readonly HelpBinding[];
}
