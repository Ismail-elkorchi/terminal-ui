import type { AccessibleNode, AccessibleSnapshot } from '../../accessibility/types.ts';
import { sanitizeTerminalSingleLineText } from '../../text/sanitize.ts';

/** Presentation only: relationships resolve against this snapshot, never application state. */
export function accessibleNodeIndex(snapshot: AccessibleSnapshot): ReadonlyMap<string, AccessibleNode> {
  const nodes = new Map<string, AccessibleNode>();
  const visit = (node: AccessibleNode): void => {
    nodes.set(node.id, node);
    for (const child of node.children ?? []) visit(child);
  };
  visit(snapshot.root);
  return nodes;
}

export function accessibleNodeText(node: AccessibleNode, nodes: ReadonlyMap<string, AccessibleNode>): string {
  const labelledBy = node.labelledBy === undefined ? undefined : nodes.get(node.labelledBy);
  const name = labelledBy?.label ?? labelledBy?.value ?? node.label;
  const label = name === undefined ? '' : `: ${plain(String(name))}`;
  const value = node.value === undefined ? '' : ` = ${plain(String(node.value))}`;
  const state = [...interactionState(node), ...contextState(node, nodes)];
  const description = node.description === undefined ? '' : ` - ${plain(node.description)}`;
  return `${node.role}${label}${value}${state.length === 0 ? '' : ` [${state.join(', ')}]`}${description}`;
}

function interactionState(node: AccessibleNode): readonly string[] {
  return [
    ...(node.focused === true ? ['focused'] : []),
    ...(node.selected === undefined ? [] : [node.selected ? 'selected' : 'not selected']),
    ...(node.disabled === true ? ['disabled'] : []),
    ...(node.busy === true ? ['busy'] : []),
    ...(node.readOnly === true ? ['read-only'] : []),
    ...(node.required === true ? ['required'] : []),
    ...(node.invalid === undefined || node.invalid === false ? [] : [`invalid:${String(node.invalid)}`]),
    ...(node.checked === undefined ? [] : [`checked:${String(node.checked)}`]),
    ...(node.pressed === undefined ? [] : [`pressed:${String(node.pressed)}`]),
    ...(node.current === undefined || node.current === false ? [] : [`current:${String(node.current)}`]),
    ...(node.orientation === undefined ? [] : [node.orientation]),
    ...(node.multiSelectable === true ? ['multi-selectable'] : []),
    ...(node.expanded === undefined ? [] : [node.expanded ? 'expanded' : 'collapsed']),
  ];
}

function contextState(node: AccessibleNode, nodes: ReadonlyMap<string, AccessibleNode>): readonly string[] {
  return [
    ...(node.numericValue === undefined ? [] : numericValueState(node.numericValue)),
    ...(node.live === undefined || node.live === 'off' ? [] : [`live:${node.live}`]),
    ...(node.scope === undefined ? [] : [
      `scope:${node.scope.kind}`,
      ...(node.scope.trapsFocus === true ? ['focus trapped'] : []),
      ...(node.scope.obscuresBackground === true ? ['background obscured'] : []),
    ]),
    ...relationship('labelled-by', node.labelledBy, nodes),
    ...(node.describedBy ?? []).flatMap((id) => relationship('described-by', id, nodes)),
    ...relationship('controls', node.controls, nodes),
    ...relationship('active-descendant', node.activeDescendant, nodes, true),
    ...relationship('error', node.errorMessage, nodes),
    ...(node.window === undefined ? [] : [
      `window:${String(node.window.startIndex)}-${String(node.window.endIndexExclusive)}/${String(node.window.totalCount)}`,
      ...(node.window.omittedBefore === undefined ? [] : [`omitted-before:${String(node.window.omittedBefore)}`]),
      ...(node.window.omittedAfter === undefined ? [] : [`omitted-after:${String(node.window.omittedAfter)}`]),
    ]),
    ...(node.textWindow === undefined ? [] : [
      `text-window:${String(node.textWindow.startOffset)}-${String(node.textWindow.endOffsetExclusive)}/${String(node.textWindow.totalLength)}`,
    ]),
    ...(node.textPosition === undefined ? [] : [
      `caret:${String(node.textPosition.caretOffset)}`,
      ...(node.textPosition.selection === undefined ? [] : [
        `selection:${String(node.textPosition.selection.startOffset)}-${String(node.textPosition.selection.endOffsetExclusive)}`,
      ]),
    ]),
    ...positionState(node.position),
  ];
}

function relationship(
  kind: string,
  id: string | undefined,
  nodes: ReadonlyMap<string, AccessibleNode>,
  active = false,
): readonly string[] {
  if (id === undefined) return [];
  const target = nodes.get(id);
  const content = target === undefined ? '' : [
    target.label,
    kind === 'controls' || target.value === undefined ? undefined : String(target.value),
    ...(active ? [
      ...positionState(target.position),
      ...(target.selected === undefined ? [] : [target.selected ? 'selected' : 'not selected']),
      ...(target.disabled === true ? ['disabled'] : []),
      ...(target.expanded === undefined ? [] : [target.expanded ? 'expanded' : 'collapsed']),
    ] : []),
  ].filter((part): part is string => part !== undefined && part !== '').map((part) => plain(part)).join('; ');
  return [`${kind}:${plain(id)}${content === '' ? '' : ` (${content})`}`];
}

function numericValueState(value: NonNullable<AccessibleNode['numericValue']>): readonly string[] {
  if (value.indeterminate === true) return ['value:indeterminate'];
  return [
    value.current === undefined ? 'value' : `value:${String(value.current)}${value.maximum === undefined ? '' : `/${String(value.maximum)}`}`,
    ...(value.minimum === undefined ? [] : [`minimum:${String(value.minimum)}`]),
    ...(value.current === undefined && value.maximum !== undefined ? [`maximum:${String(value.maximum)}`] : []),
  ];
}

function positionState(position: AccessibleNode['position']): readonly string[] {
  if (position === undefined) return [];
  return [
    ...(position.positionInSet === undefined ? [] : [`position:${String(position.positionInSet)}${position.setSize === undefined ? '' : `/${String(position.setSize)}`}`]),
    ...(position.rowIndex === undefined ? [] : [`row:${String(position.rowIndex)}${position.rowCount === undefined ? '' : `/${String(position.rowCount)}`}`]),
    ...(position.columnIndex === undefined ? [] : [`column:${String(position.columnIndex)}${position.columnCount === undefined ? '' : `/${String(position.columnCount)}`}`]),
    ...(position.positionInSet === undefined && position.setSize !== undefined ? [`set-size:${String(position.setSize)}`] : []),
    ...(position.rowIndex === undefined && position.rowCount !== undefined ? [`rows:${String(position.rowCount)}`] : []),
    ...(position.columnIndex === undefined && position.columnCount !== undefined ? [`columns:${String(position.columnCount)}`] : []),
    ...(position.level === undefined ? [] : [`level:${String(position.level)}`]),
    ...(position.columnLabel === undefined ? [] : [`column-label:${plain(position.columnLabel)}`]),
    ...(position.group === undefined ? [] : [`group:${plain(position.group)}`]),
  ];
}

export function plain(text: string): string {
  return sanitizeTerminalSingleLineText(text).text;
}
