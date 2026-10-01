import type { AccessibleNode, AccessibleSnapshot } from '../../accessibility/types.ts';
import type { AccessibleTextBaseline } from '../../renderer/internal/accessible-text.ts';
import { accessibleNodeIndex, accessibleNodeText, plain } from '../../renderer/internal/accessible-text.ts';
import { renderAccessibleSnapshot } from '../../renderer/output.ts';

export function decodeTuiOutputMode(value: unknown): 'visual' | 'accessible' {
  if (value === undefined || value === 'visual') return 'visual';
  if (value === 'accessible') return value;
  throw new TypeError('TUI outputMode must be visual or accessible.');
}

/** A pure projection of accepted frame semantics, with no separate application state. */
export function accessibleFrameOutput(
  previous: AccessibleSnapshot | undefined,
  next: AccessibleSnapshot,
): string {
  if (previous === undefined) {
    return `Accessible terminal output. Tab moves focus; Ctrl+L repeats context when unbound.\n${renderAccessibleSnapshot(next)}\n`;
  }
  const before = accessibleNodeIndex(previous);
  const after = accessibleNodeIndex(next);
  const lines: string[] = [];
  const announced = new Set<string>();
  const announce = (prefix: string, node: AccessibleNode, previous?: AccessibleTextBaseline): void => {
    if (announced.has(node.id)) return;
    announced.add(node.id);
    for (const id of [node.labelledBy, node.errorMessage, ...(node.describedBy ?? [])]) {
      if (id !== undefined) announced.add(id);
    }
    lines.push(`${prefix}: ${announcementText(node, after, previous)}`);
  };
  const announceTree = (prefix: string, node: AccessibleNode, liveOnly = false): void => {
    announce(prefix, node);
    const visit = (parent: AccessibleNode, depth: number): void => {
      for (const child of parent.children ?? []) {
        if (liveOnly && child.live === 'off') continue;
        const text = announcementText(child, after);
        if (!announced.has(child.id) && text !== 'group') {
          lines.push(`${'  '.repeat(depth)}- ${text}`);
          announced.add(child.id);
        }
        visit(child, text === 'group' ? depth : depth + 1);
      }
    };
    visit(node, 1);
  };
  if (previous.title !== next.title && next.title !== undefined) lines.push(`Context: ${plain(next.title)}`);
  for (const node of before.values()) {
    if (isDialog(node) && !after.has(node.id)) lines.push(`Closed: ${plain(node.label ?? node.role)}`);
  }
  for (const node of after.values()) {
    if (isDialog(node) && !before.has(node.id)) announceTree('Opened', node);
  }
  announceFocus(next, before, after, announced, lines, announce);
  for (const node of after.values()) {
    if (announced.has(node.id)) continue;
    const prior = before.get(node.id);
    if (node.live !== undefined && node.live !== 'off') {
      if (treeText(prior, before) !== treeText(node, after)) announceTree('Update', node, true);
      continue;
    }
    // Background text, animation and window reorder are silent. The full context
    // remains available on demand; controls still expose consequential state changes.
    if (prior === undefined || controlState(prior, before) === controlState(node, after)) continue;
    announce(changePrefix(prior, node), node);
  }
  return lines.length === 0 ? '' : `${lines.join('\n')}\n`;
}

function announceFocus(
  next: AccessibleSnapshot,
  before: ReadonlyMap<string, AccessibleNode>,
  after: ReadonlyMap<string, AccessibleNode>,
  announced: Set<string>,
  lines: string[],
  announce: (prefix: string, node: AccessibleNode, previous?: AccessibleTextBaseline) => void,
): void {
  const oldFocus = [...before.values()].find((node) => node.focused === true);
  const focus = [...after.values()].find((node) => node.focused === true);
  if (focus !== undefined && !announced.has(focus.id) && (oldFocus?.id !== focus.id
    || accessibleNodeText(oldFocus, before) !== accessibleNodeText(focus, after))) {
    const sameControl = oldFocus?.id === focus.id && oldFocus.role === focus.role;
    const context = focusContext(next.root, focus.id);
    if (!sameControl && context.length > 0) lines.push(`Context: ${context.join(' > ')}`);
    announce(sameControl ? changePrefix(oldFocus, focus) : 'Focus', focus,
      sameControl ? { node: oldFocus, nodes: before } : undefined);
    if (focus.activeDescendant !== undefined) announced.add(focus.activeDescendant);
  }
}

function isDialog(node: AccessibleNode): boolean {
  return node.role === 'dialog' || node.scope?.kind === 'modal'
    || node.scope?.kind === 'popover' && node.label !== undefined;
}

function treeText(node: AccessibleNode | undefined, nodes: ReadonlyMap<string, AccessibleNode>): string {
  if (node === undefined) return '';
  return [accessibleNodeText({ ...node, focused: false }, nodes),
    ...(node.children ?? []).filter((child) => child.live !== 'off').map((child) => treeText(child, nodes))].join('\n');
}

const valueRoles = new Set<AccessibleNode['role']>([
  'textbox', 'checkbox', 'switch', 'radio', 'radiogroup', 'slider', 'spinbutton',
  'combobox', 'listbox', 'grid', 'tree', 'menu', 'menubar', 'tablist',
]);

function controlState(node: AccessibleNode, nodes: ReadonlyMap<string, AccessibleNode>): string {
  return JSON.stringify([
    node.selected, node.checked, node.pressed, node.current, node.expanded,
    node.disabled, node.busy, node.readOnly, node.required, node.invalid, node.errorMessage,
    node.activeDescendant,
    errorText(node, nodes),
    valueRoles.has(node.role) ? node.value : undefined,
    valueRoles.has(node.role) ? node.numericValue : undefined,
  ]);
}

function focusContext(root: AccessibleNode, id: string): readonly string[] {
  const visit = (node: AccessibleNode, ancestors: readonly string[]): readonly string[] | undefined => {
    if (node.id === id) return ancestors;
    const next = node.label === undefined ? ancestors : [...ancestors, plain(node.label)];
    for (const child of node.children ?? []) {
      const found = visit(child, next);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  return visit(root, []) ?? [];
}

function validationWasCleared(prior: AccessibleNode | undefined, next: AccessibleNode): boolean {
  return prior !== undefined
    && (prior.invalid !== undefined && prior.invalid !== false || prior.errorMessage !== undefined)
    && (next.invalid === undefined || next.invalid === false) && next.errorMessage === undefined;
}

/** Long edit values are excerpts; repeat context retains the complete snapshot. */
function announcementText(
  node: AccessibleNode,
  nodes: ReadonlyMap<string, AccessibleNode>,
  previous?: AccessibleTextBaseline,
): string {
  const options = previous === undefined ? {} : { previous };
  if (typeof node.value !== 'string' || node.value.length <= 240 || node.value === previous?.node.value) {
    return accessibleNodeText(node, nodes, options);
  }
  const caret = Math.max(0, (node.textPosition?.caretOffset ?? 0) - (node.textWindow?.startOffset ?? 0));
  let start = Math.max(0, Math.min(caret - 120, node.value.length - 240));
  let end = Math.min(node.value.length, start + 240);
  // Preserve Unicode scalar boundaries even when the excerpt starts inside a surrogate pair.
  if (start > 0 && isLowSurrogate(node.value.charCodeAt(start))) start -= 1;
  if (end < node.value.length && isLowSurrogate(node.value.charCodeAt(end))) end += 1;
  const value = `${start > 0 ? '…' : ''}${node.value.slice(start, end)}${end < node.value.length ? '…' : ''}`;
  return `${accessibleNodeText(node, nodes, { ...options, valueText: value })} [value excerpt:${String(start)}-${String(end)}/${String(node.value.length)}]`;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

function errorText(node: AccessibleNode, nodes: ReadonlyMap<string, AccessibleNode>): string | undefined {
  const error = node.errorMessage === undefined ? undefined : nodes.get(node.errorMessage);
  return error === undefined ? undefined : accessibleNodeText(error, nodes);
}

function changePrefix(prior: AccessibleNode | undefined, next: AccessibleNode): string {
  const prefix = validationWasCleared(prior, next) ? 'Validation cleared' : 'Changed';
  const cleared = [
    ...(prior?.disabled === true && next.disabled !== true ? ['enabled'] : []),
    ...(prior?.readOnly === true && next.readOnly !== true ? ['editable'] : []),
    ...(prior?.busy === true && next.busy !== true ? ['ready'] : []),
    ...(prior?.required === true && next.required !== true ? ['optional'] : []),
  ];
  return cleared.length === 0 ? prefix : `${prefix} (${cleared.join(', ')})`;
}
