import { renderFrameAnsi, renderFramePlain } from './frame.ts';
import type { AccessibleNode, AccessibleSnapshot } from '../accessibility/index.ts';
import type { Frame, RenderSerializeOptions } from './frame.ts';

export interface RenderTuiOutputOptions {
  readonly frame: Frame;
  readonly ansi?: RenderSerializeOptions;
}

export interface RenderedTuiOutput {
  readonly plainTextFrame: string;
  readonly accessibleText: string;
  readonly accessibility: AccessibleSnapshot;
  readonly ansiFrame?: string;
  readonly frame: Frame;
}

export function renderTuiOutput(input: RenderTuiOutputOptions): RenderedTuiOutput {
  return {
    plainTextFrame: renderFramePlain(input.frame),
    accessibleText: renderAccessibleSnapshot(input.frame.accessibility),
    accessibility: input.frame.accessibility,
    ...(input.ansi === undefined ? {} : { ansiFrame: renderFrameAnsi(input.frame, input.ansi) }),
    frame: input.frame
  };
}

export function renderAccessibleSnapshot(snapshot: AccessibleSnapshot): string {
  const title = snapshot.title ?? snapshot.root.label;
  return [
    ...(title === undefined ? [] : [`# ${title}`]),
    ...renderAccessibleNode(snapshot.root, 0)
  ].join('\n');
}

function renderAccessibleNode(node: AccessibleNode, depth: number): readonly string[] {
  const indent = '  '.repeat(depth);
  const children = node.children ?? [];
  return [
    `${indent}- ${node.role}${nodeLabel(node)}${nodeState(node)}${nodeDescription(node)}`,
    ...children.flatMap((child) => renderAccessibleNode(child, depth + 1))
  ];
}

function nodeLabel(node: AccessibleNode): string {
  const value = node.value === undefined ? '' : ` = ${String(node.value)}`;
  return node.label === undefined ? value : `: ${node.label}${value}`;
}

function nodeState(node: AccessibleNode): string {
  const state = [
    ...(node.focused === true ? ['focused'] : []),
    ...(node.selected === true ? ['selected'] : []),
    ...(node.disabled === true ? ['disabled'] : []),
    ...(node.checked === undefined ? [] : [`checked:${String(node.checked)}`]),
    ...(node.expanded === undefined ? [] : [node.expanded ? 'expanded' : 'collapsed']),
    ...(node.numericValue === undefined ? [] : [numericValueState(node.numericValue)]),
    ...(node.live === undefined || node.live === 'off' ? [] : [`live:${node.live}`]),
    ...(node.scope === undefined ? [] : [`scope:${node.scope.kind}`]),
    ...(node.labelledBy === undefined ? [] : [`labelled-by:${node.labelledBy}`]),
    ...(node.describedBy === undefined ? [] : [`described-by:${node.describedBy.join(',')}`]),
    ...(node.window === undefined ? [] : [windowState(node.window)]),
    ...(node.textWindow === undefined ? [] : [textWindowState(node.textWindow)]),
    ...(node.position === undefined ? [] : [positionState(node.position)])
  ];
  return state.length === 0 ? '' : ` [${state.join(', ')}]`;
}

function textWindowState(window: NonNullable<AccessibleNode['textWindow']>): string {
  return `text-window:${String(window.startOffset)}-${String(window.endOffsetExclusive)}/${String(window.totalLength)}`;
}

function numericValueState(numericValue: NonNullable<AccessibleNode['numericValue']>): string {
  if (numericValue.indeterminate === true) return 'value:indeterminate';
  if (numericValue.current === undefined) return 'value';
  return numericValue.maximum === undefined
    ? `value:${String(numericValue.current)}`
    : `value:${String(numericValue.current)}/${String(numericValue.maximum)}`;
}

function windowState(window: NonNullable<AccessibleNode['window']>): string {
  return `window:${String(window.startIndex)}-${String(window.endIndexExclusive)}/${String(window.totalCount)}`;
}

function positionState(position: NonNullable<AccessibleNode['position']>): string {
  if (position.positionInSet !== undefined && position.setSize !== undefined) {
    return `position:${String(position.positionInSet)}/${String(position.setSize)}`;
  }
  if (position.rowIndex !== undefined && position.rowCount !== undefined) {
    return `row:${String(position.rowIndex)}/${String(position.rowCount)}`;
  }
  return 'position';
}

function nodeDescription(node: AccessibleNode): string {
  return node.description === undefined ? '' : ` - ${node.description}`;
}
