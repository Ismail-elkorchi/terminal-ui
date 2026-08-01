import type { RenderNodeOfKind } from '../../../model/index.ts';
import { borderStyleFromValue } from '../../border.ts';
import { mergeStyles, renderNodeStyle } from '../../../style-resolution.ts';
import type { BorderStyle } from '../../border.ts';
import type { Rect } from '../../../contracts.ts';
import type { TerminalStyle } from '../../../../visual/render.ts';
import type { TerminalTheme } from '../../../../theme/index.ts';
import { borderTitleAccessibleText } from '../../../../visual/border.ts';
import { renderNodeFrameSource } from '../../../../visual/source.ts';
import { renderBorderTitle } from '../../border-title.ts';

type DialogNode = RenderNodeOfKind<unknown, 'dialog'>;

export function borderForDialog(
  renderNode: DialogNode,
  theme?: TerminalTheme
): BorderStyle {
  const border = defaultBorderStyle(
    renderNode,
    borderStyleFromValue(renderNode.props.border) ?? { kind: 'rounded' },
    dialogBorderStyle(renderNode)
  );
  if (border.title !== undefined || border.kind === 'none' || theme === undefined) {
    return border;
  }
  const title = renderBorderTitle(renderNode.props.title, {
    theme,
    ...styleOption(renderNodeStyle(renderNode, 'title')),
    source: (part, index) => renderNodeFrameSource(renderNode, {
      rendererFamily: 'dialog',
      cellRole: 'text',
      partName: `${part}.${String(index)}`,
      partType: 'title',
      description: `${part}.${String(index)}`
    })
  });
  return title === undefined ? border : { ...border, title };
}

function styleOption(style: TerminalStyle | undefined): { readonly baseStyle?: TerminalStyle } {
  return style === undefined ? {} : { baseStyle: style };
}

function defaultBorderStyle(renderNode: DialogNode, border: BorderStyle, baseStyle = renderNodeStyle(renderNode, 'border')): BorderStyle {
  if (border.kind === 'none') return border;
  const style = mergeStyles(baseStyle, border.style);
  return style === undefined ? border : { ...border, style };
}

function dialogBorderStyle(renderNode: DialogNode): TerminalStyle | undefined {
  return mergeStyles(
    { fg: { kind: 'theme', token: 'surface.raised.border' } },
    renderNode.styles?.parts?.['border']
  );
}

export function dialogLabel(renderNode: DialogNode): string {
  return borderTitleAccessibleText(renderNode.props.title);
}

export function borderContentBounds(bounds: Rect, border: BorderStyle): Rect {
  return border.kind === 'none'
    ? bounds
    : {
        row: bounds.row + 1,
        column: bounds.column + 1,
        width: Math.max(0, bounds.width - 2),
        height: Math.max(0, bounds.height - 2)
      };
}
