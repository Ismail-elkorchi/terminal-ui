export type WidgetTone =
  | 'default'
  | 'primary'
  | 'secondary'
  | 'info'
  | 'success'
  | 'warning'
  | 'error'
  | 'destructive'
  | 'progress'
  | 'muted';

export type WidgetActionTone = Extract<WidgetTone, 'default' | 'destructive'>;
export type WidgetValidationTone = Extract<WidgetTone, 'info' | 'warning' | 'error'>;

export type WidgetStatus =
  | 'idle'
  | 'pending'
  | 'running'
  | 'success'
  | 'warning'
  | 'error'
  | 'info';

export type WidgetProcessStatus = Extract<WidgetStatus, 'idle' | 'running' | 'success' | 'warning' | 'error'>;
export type WidgetRecordStatus = Exclude<WidgetStatus, 'idle'> | 'failed' | 'cancelled' | 'skipped';

export interface WidgetItemBase {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly disabled?: boolean;
}

export interface WidgetValueItem<TValue = string> extends WidgetItemBase {
  readonly value: TValue;
}

export interface WidgetActionItem<TMessage = never> extends WidgetItemBase {
  readonly message?: TMessage;
  readonly shortcut?: string;
  readonly tone?: WidgetActionTone;
}

export interface WidgetSuggestionItem<TValue = string> {
  readonly value: TValue;
  readonly label?: string;
  readonly description?: string;
  readonly disabled?: boolean;
}

export interface WidgetSearchEntry<TValue = string> extends WidgetValueItem<TValue> {
  readonly group?: string;
  readonly keywords?: readonly string[];
  readonly preview?: string;
}

export interface WidgetFieldItem {
  readonly label: string;
  readonly value: string;
}
