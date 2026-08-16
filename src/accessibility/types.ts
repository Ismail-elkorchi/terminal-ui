import type { TerminalDiagnostic } from '../diagnostics.ts';

export interface AccessibleSnapshot {
  readonly source: AccessibleSnapshotSource;
  readonly title?: string;
  readonly root: AccessibleNode;
  readonly focusPath: readonly string[];
  readonly diagnostics: readonly TerminalDiagnostic[];
}

export type AccessibleSnapshotSource = typeof accessibleSources[number];

export interface AccessibleNode {
  readonly id: string;
  readonly role: AccessibleRole;
  readonly label?: string;
  readonly value?: AccessibleValue;
  readonly focused?: boolean;
  readonly selected?: boolean;
  readonly disabled?: boolean;
  readonly busy?: boolean;
  readonly readOnly?: boolean;
  readonly expanded?: boolean;
  readonly checked?: boolean | 'mixed';
  readonly pressed?: boolean | 'mixed';
  readonly current?: boolean | 'page' | 'step' | 'location' | 'date' | 'time';
  readonly orientation?: 'horizontal' | 'vertical';
  readonly multiSelectable?: boolean;
  readonly required?: boolean;
  readonly invalid?: boolean | 'grammar' | 'spelling';
  readonly numericValue?: AccessibleNumericValue;
  readonly live?: AccessibleLiveRegion;
  readonly scope?: AccessibleScope;
  readonly window?: AccessibleWindow;
  readonly position?: AccessiblePosition;
  readonly description?: string;
  readonly controls?: string;
  readonly labelledBy?: string;
  readonly describedBy?: readonly string[];
  readonly activeDescendant?: string;
  readonly errorMessage?: string;
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

export type AccessibleRole = typeof accessibleRoles[number];

export interface AccessibleSnapshotInput {
  readonly source: AccessibleSnapshotSource;
  readonly title?: string;
  readonly root: AccessibleNode;
  readonly focusPath?: readonly string[];
  readonly diagnostics?: readonly TerminalDiagnostic[];
}

const accessibleRoleValues = [
  'application',
  'document',
  'dialog',
  'tooltip',
  'form',
  'group',
  'heading',
  'link',
  'navigation',
  'toolbar',
  'search',
  'complementary',
  'status',
  'progressbar',
  'meter',
  'separator',
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
  'tabpanel',
  'list',
  'listitem',
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
] as const;

export const accessibleRoles: typeof accessibleRoleValues = Object.freeze(accessibleRoleValues);

const accessibleRoleSet: ReadonlySet<string> = new Set(accessibleRoles);

export function isAccessibleRole(value: unknown): value is AccessibleRole {
  return typeof value === 'string' && accessibleRoleSet.has(value);
}

const accessibleReadOnlyRoles = new Set<AccessibleRole>([
  'checkbox',
  'columnheader',
  'combobox',
  'grid',
  'gridcell',
  'group',
  'list',
  'listbox',
  'menu',
  'menubar',
  'radiogroup',
  'rowheader',
  'slider',
  'spinbutton',
  'switch',
  'tablist',
  'textbox',
  'tree',
]);

export function accessibleRoleSupportsReadOnly(role: AccessibleRole): boolean {
  return accessibleReadOnlyRoles.has(role);
}

const accessibleSourceValues = [
  'prompt',
  'tui',
  'renderer',
  'progress',
  'test_harness'
] as const;

export const accessibleSources: typeof accessibleSourceValues = Object.freeze(accessibleSourceValues);
