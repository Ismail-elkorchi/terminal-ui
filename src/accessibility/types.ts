import type { TerminalDiagnostic } from '../diagnostics.ts';

export interface AccessibleSnapshot {
  readonly schemaVersion: 'terminal-ui.accessible-snapshot.v1';
  readonly source: AccessibleSnapshotSource;
  readonly title?: string;
  readonly root: AccessibleNode;
  readonly focusPath: readonly string[];
  readonly diagnostics: readonly TerminalDiagnostic[];
}

export type AccessibleSnapshotSource = 'prompt' | 'shell' | 'tui' | 'widget' | 'progress';

export interface AccessibleNode {
  readonly id: string;
  readonly role: AccessibleRole;
  readonly label?: string;
  readonly value?: AccessibleValue;
  readonly focused?: boolean;
  readonly selected?: boolean;
  readonly disabled?: boolean;
  readonly expanded?: boolean;
  readonly checked?: boolean | 'mixed';
  readonly progress?: AccessibleProgress;
  readonly live?: AccessibleLiveRegion;
  readonly scope?: AccessibleScope;
  readonly window?: AccessibleWindow;
  readonly position?: AccessiblePosition;
  readonly description?: string;
  readonly children?: readonly AccessibleNode[];
}

export interface AccessibilityOptions {
  readonly decorative?: boolean;
  readonly label?: string;
  readonly description?: string;
}

export type AccessibleValue = string | number | boolean | null;

export interface AccessibleProgress {
  readonly value?: number;
  readonly max?: number;
  readonly indeterminate?: boolean;
}

export type AccessibleLiveRegion = 'off' | 'polite' | 'assertive';

export type AccessibleScopeKind = 'document' | 'modal' | 'popover' | 'menu';

export interface AccessibleScope {
  readonly kind: AccessibleScopeKind;
  readonly trapsFocus?: boolean;
  readonly obscuresBackground?: boolean;
}

export interface AccessibleWindow {
  readonly start: number;
  readonly end: number;
  readonly total: number;
  readonly omittedBefore?: number;
  readonly omittedAfter?: number;
}

export interface AccessiblePosition {
  readonly index?: number;
  readonly count?: number;
  readonly level?: number;
  readonly rowIndex?: number;
  readonly rowCount?: number;
  readonly columnIndex?: number;
  readonly columnCount?: number;
  readonly columnLabel?: string;
  readonly group?: string;
}

export type AccessibleRole =
  | 'application'
  | 'dialog'
  | 'status'
  | 'progressbar'
  | 'textbox'
  | 'button'
  | 'checkbox'
  | 'radio'
  | 'listbox'
  | 'option'
  | 'menu'
  | 'menuitem'
  | 'table'
  | 'row'
  | 'cell'
  | 'text';

export interface AccessibleSnapshotInput {
  readonly source: AccessibleSnapshotSource;
  readonly title?: string;
  readonly root: AccessibleNode;
  readonly focusPath?: readonly string[];
  readonly diagnostics?: readonly TerminalDiagnostic[];
}

export const accessibleRoles = [
  'application',
  'dialog',
  'status',
  'progressbar',
  'textbox',
  'button',
  'checkbox',
  'radio',
  'listbox',
  'option',
  'menu',
  'menuitem',
  'table',
  'row',
  'cell',
  'text'
] as const satisfies readonly AccessibleRole[];

export const accessibleSources = [
  'prompt',
  'shell',
  'tui',
  'widget',
  'progress'
] as const satisfies readonly AccessibleSnapshotSource[];
