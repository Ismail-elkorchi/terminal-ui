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
