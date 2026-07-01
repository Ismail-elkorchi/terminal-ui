import { renderFrameAnsi, renderFramePlain } from './render.ts';
import type { AccessibleNode, AccessibleSnapshot } from '../accessibility/index.ts';
import type { Frame, RenderSerializeOptions } from './frame.ts';

export interface OutputProjectionInput {
  readonly frame: Frame;
  readonly ansi?: RenderSerializeOptions;
}

export interface OutputProjection {
  readonly schemaVersion: 'terminal-ui.output-projection.v1';
  readonly plainTextFrame: string;
  readonly accessibleText: string;
  readonly accessibility: AccessibleSnapshot;
  readonly ansiFrame?: string;
  readonly frame: Frame;
}

export function projectTuiOutput(input: OutputProjectionInput): OutputProjection {
  return {
    schemaVersion: 'terminal-ui.output-projection.v1',
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
    ...(node.progress === undefined ? [] : [progressState(node.progress)]),
    ...(node.live === undefined || node.live === 'off' ? [] : [`live:${node.live}`]),
    ...(node.scope === undefined ? [] : [`scope:${node.scope.kind}`]),
    ...(node.window === undefined ? [] : [windowState(node.window)]),
    ...(node.position === undefined ? [] : [positionState(node.position)])
  ];
  return state.length === 0 ? '' : ` [${state.join(', ')}]`;
}

function progressState(progress: NonNullable<AccessibleNode['progress']>): string {
  if (progress.indeterminate === true) return 'progress:indeterminate';
  if (progress.value === undefined) return 'progress';
  return progress.max === undefined ? `progress:${String(progress.value)}` : `progress:${String(progress.value)}/${String(progress.max)}`;
}

function windowState(window: NonNullable<AccessibleNode['window']>): string {
  return `window:${String(window.start)}-${String(window.end)}/${String(window.total)}`;
}

function positionState(position: NonNullable<AccessibleNode['position']>): string {
  if (position.index !== undefined && position.count !== undefined) {
    return `position:${String(position.index)}/${String(position.count)}`;
  }
  if (position.rowIndex !== undefined && position.rowCount !== undefined) {
    return `row:${String(position.rowIndex)}/${String(position.rowCount)}`;
  }
  return 'position';
}

function nodeDescription(node: AccessibleNode): string {
  return node.description === undefined ? '' : ` - ${node.description}`;
}
