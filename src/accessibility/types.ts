import type { TerminalDiagnostic } from '../diagnostics.ts';

export interface AccessibleSnapshot {
  readonly schemaVersion: 'terminal-ui.accessible-snapshot.v1';
  readonly source: AccessibleSnapshotSource;
  readonly title?: string;
  readonly root: AccessibleNode;
  readonly focusPath: readonly string[];
  readonly diagnostics: readonly TerminalDiagnostic[];
}

export type AccessibleSnapshotSource = 'prompt' | 'tui' | 'renderer' | 'progress' | 'test_harness';

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
  readonly numericValue?: AccessibleNumericValue;
  readonly live?: AccessibleLiveRegion;
  readonly scope?: AccessibleScope;
  readonly window?: AccessibleWindow;
  readonly position?: AccessiblePosition;
  readonly description?: string;
  readonly controls?: string;
  readonly labelledBy?: string;
  readonly children?: readonly AccessibleNode[];
}

export interface AccessibilityOptions {
  readonly decorative?: boolean;
  readonly label?: string;
  readonly description?: string;
}

export type AccessibleValue = string | number | boolean | null;

export interface AccessibleNumericValue {
  readonly current?: number;
  readonly minimum?: number;
  readonly maximum?: number;
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
  readonly startIndex: number;
  readonly endIndexExclusive: number;
  readonly totalCount: number;
  readonly omittedBefore?: number;
  readonly omittedAfter?: number;
}

export interface AccessiblePosition {
  readonly positionInSet?: number;
  readonly setSize?: number;
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
  | 'form'
  | 'group'
  | 'navigation'
  | 'status'
  | 'progressbar'
  | 'meter'
  | 'textbox'
  | 'button'
  | 'checkbox'
  | 'switch'
  | 'radio'
  | 'radiogroup'
  | 'slider'
  | 'spinbutton'
  | 'combobox'
  | 'listbox'
  | 'option'
  | 'menu'
  | 'menubar'
  | 'menuitem'
  | 'menuitemcheckbox'
  | 'menuitemradio'
  | 'tablist'
  | 'tab'
  | 'table'
  | 'grid'
  | 'rowgroup'
  | 'row'
  | 'cell'
  | 'gridcell'
  | 'columnheader'
  | 'rowheader'
  | 'tree'
  | 'treeitem'
  | 'image'
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
  'form',
  'group',
  'navigation',
  'status',
  'progressbar',
  'meter',
  'textbox',
  'button',
  'checkbox',
  'switch',
  'radio',
  'radiogroup',
  'slider',
  'spinbutton',
  'combobox',
  'listbox',
  'option',
  'menu',
  'menubar',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'tablist',
  'tab',
  'table',
  'grid',
  'rowgroup',
  'row',
  'cell',
  'gridcell',
  'columnheader',
  'rowheader',
  'tree',
  'treeitem',
  'image',
  'text'
] as const satisfies readonly AccessibleRole[];

export const accessibleSources = [
  'prompt',
  'tui',
  'renderer',
  'progress',
  'test_harness'
] as const satisfies readonly AccessibleSnapshotSource[];
