import type { AccessibleNode, AccessibleSnapshot } from '../accessibility/types.ts';
import type { Frame } from './contracts.ts';
import { renderFrameAnsi, renderFramePlain } from './frame.ts';
import type { RenderSerializeOptions } from './internal/ansi.ts';
import { accessibleNodeIndex, accessibleNodeText, plain } from './internal/accessible-text.ts';

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
  const nodes = accessibleNodeIndex(snapshot);
  const renderNode = (node: AccessibleNode, depth: number): readonly string[] => [
    `${'  '.repeat(depth)}- ${accessibleNodeText(node, nodes)}`,
    ...(node.children ?? []).flatMap((child) => renderNode(child, depth + 1)),
  ];
  return [
    ...(title === undefined ? [] : [`# ${plain(title)}`]),
    ...renderNode(snapshot.root, 0),
  ].join('\n');
}
