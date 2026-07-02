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

export interface WidgetTitledItem {
  readonly id: string;
  readonly title: string;
}

export interface WidgetChoiceItem<TValue = string> extends WidgetItemBase {
  readonly value: TValue;
}

export interface WidgetActionItem<TMessage = never> extends WidgetItemBase {
  readonly message?: TMessage;
  readonly shortcut?: string;
  readonly tone?: WidgetActionTone;
}

export interface WidgetNavigationItem<TMessage = never> extends WidgetItemBase {
  readonly message?: TMessage;
}

export interface WidgetHierarchyItem<TNode> {
  readonly children?: readonly TNode[];
  readonly expanded?: boolean;
}

export interface WidgetSuggestionItem<TValue = string> {
  readonly value: TValue;
  readonly label?: string;
  readonly description?: string;
  readonly disabled?: boolean;
}

export interface WidgetSearchEntry<TValue = string> extends WidgetChoiceItem<TValue> {
  readonly group?: string;
  readonly keywords?: readonly string[];
  readonly preview?: string;
}

export interface WidgetFieldItem {
  readonly label: string;
  readonly value: string;
}

export interface WidgetKeyBinding {
  readonly key: string;
  readonly label: string;
}

export interface WidgetTreeItem<TNode> extends WidgetItemBase, WidgetHierarchyItem<TNode> {}
