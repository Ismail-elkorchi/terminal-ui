import type { AccessibleNode } from '../../accessibility/index.ts';
import { inlineContentAccessibleText } from '../../visual/inline-content.ts';
import {
  block,
  line,
  span
} from '../../visual/render.ts';
import type { RenderBlock } from '../../visual/render.ts';
import type {
  HitTarget,
  Rect
} from '../contracts.ts';
import type { RenderNodeOfKind } from '../model/index.ts';
import { renderInlineContent } from './inline-content.ts';
import {
  renderNodeStyle
} from '../style-resolution.ts';
import { renderNodeFrameSource } from '../../visual/source.ts';

type DisclosureNode<TMessage = unknown> =
  RenderNodeOfKind<TMessage, 'disclosure'>;

export function disclosureBlock(
  renderNode: DisclosureNode,
  expanded: boolean,
  theme: import('../../theme/index.ts').TerminalTheme
): RenderBlock {
  const marker = expanded
    ? theme.tokens.symbols.expanded
    : theme.tokens.symbols.collapsed;
  const summary = renderNode.props.summary ?? [];
  return block([line([
    span(marker, {
      ...optionalStyle(renderNodeStyle(renderNode, 'marker')),
      source: disclosureSource(renderNode, 'marker')
    }),
    span(` ${renderNode.props.label}`, {
      ...optionalStyle(renderNodeStyle(renderNode, 'label')),
      source: disclosureSource(renderNode, 'label')
    }),
    ...(summary.length === 0
      ? []
      : [
          span(' '),
          ...renderInlineContent(summary, {
            theme,
            ...optionalBaseStyle(renderNodeStyle(renderNode, 'summary')),
            source: (_segment, index) => renderNodeFrameSource(renderNode, {
              rendererFamily: 'component',
              cellRole: 'text',
              partName: 'summary',
              itemIndex: index
            })
          })
        ])
  ])]);
}

export function disclosureChildBounds(
  renderNode: DisclosureNode,
  bounds: Rect
): readonly Rect[] {
  return [renderNode.props.expanded
    ? {
        row: bounds.row + 1,
        column: bounds.column,
        width: bounds.width,
        height: Math.max(0, bounds.height - 1)
      }
    : {
        row: bounds.row + 1,
        column: bounds.column,
        width: 0,
        height: 0
      }];
}

export function disclosureAccessibleNode(
  renderNode: DisclosureNode,
  id: string,
  focused: boolean,
  children: readonly AccessibleNode[]
): AccessibleNode {
  const toggleId = `${id}:toggle`;
  const summary = renderNode.props.summary === undefined
    ? undefined
    : inlineContentAccessibleText(renderNode.props.summary);
  return {
    id,
    role: 'group',
    label: renderNode.props.label,
    children: [
      {
        id: toggleId,
        role: 'button',
        label: renderNode.props.label,
        expanded: renderNode.props.expanded,
        disabled: renderNode.props.disabled === true,
        ...(renderNode.props.expanded ? { controls: `${id}:content` } : {}),
        ...(summary === undefined || summary.length === 0
          ? {}
          : { description: summary }),
        ...(focused ? { focused } : {})
      },
      ...(renderNode.props.expanded
        ? [{
            id: `${id}:content`,
            role: 'group' as const,
            label: `${renderNode.props.label} content`,
            children
          }]
        : [])
    ]
  };
}

export function disclosureHitTargets<TMessage>(
  renderNode: DisclosureNode<TMessage>,
  bounds: Rect
): readonly HitTarget<TMessage>[] {
  const toMessage = renderNode.props.toActionMessage;
  if (toMessage === undefined) return [];
  return [{
    id: `${renderNode.id ?? renderNode.kind}:toggle`,
    bounds: {
      row: bounds.row,
      column: bounds.column,
      width: bounds.width,
      height: Math.min(1, bounds.height)
    },
    accepts: ['click'],
    cursor: 'pointer',
    focus: { kind: 'target', targetId: 'toggle' },
    message: () => toMessage({ kind: 'toggle' })
  }];
}

function disclosureSource(
  renderNode: DisclosureNode,
  partName: 'marker' | 'label'
) {
  return renderNodeFrameSource(renderNode, {
    rendererFamily: 'component',
    cellRole: partName === 'marker' ? 'decoration' : 'text',
    partName
  });
}

function optionalStyle(
  style: import('../../visual/render.ts').TerminalStyle | undefined
): { readonly style?: import('../../visual/render.ts').TerminalStyle } {
  return style === undefined ? {} : { style };
}

function optionalBaseStyle(
  style: import('../../visual/render.ts').TerminalStyle | undefined
): { readonly baseStyle?: import('../../visual/render.ts').TerminalStyle } {
  return style === undefined ? {} : { baseStyle: style };
}
