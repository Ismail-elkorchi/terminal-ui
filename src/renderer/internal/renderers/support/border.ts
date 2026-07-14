import type { RenderNodeOfKind } from '../../../model/index.ts';
import { borderStyleFromValue } from '../../border.ts';
import { mergeStyles, renderNodeStyle } from '../../render-node-style.ts';
import type { BorderStyle } from '../../border.ts';
import type { Rect } from '../../../model/layout.ts';
import type { TerminalStyle } from '../../../../visual/render.ts';
import type { TerminalTheme } from '../../../../theme/index.ts';
import { borderTitleAccessibleText } from '../../../../visual/border.ts';
import { renderNodeFrameSource } from '../../../../visual/source.ts';
import { renderBorderTitle } from '../../border-title.ts';

type DialogNode = RenderNodeOfKind<unknown, 'dialog'>;

export function borderForDialog(
  widget: DialogNode,
  focused = false,
  theme?: TerminalTheme
): BorderStyle {
  const border = defaultBorderStyle(
    widget,
    borderStyleFromValue(widget.props.border) ?? { kind: 'single' },
    dialogBorderStyle(widget)
  );
  if (border.title !== undefined || border.kind === 'none' || theme === undefined) {
    return focusBorder(border, focused);
  }
  const title = renderBorderTitle(widget.props.title, {
    theme,
    ...styleOption(renderNodeStyle(widget, 'title')),
    source: (part, index) => renderNodeFrameSource(widget, {
      family: 'dialog',
      role: 'text',
      part: `${part}.${String(index)}`,
      partKind: 'title',
      label: `${part}.${String(index)}`
    })
  });
  return focusBorder(title === undefined ? border : { ...border, title }, focused);
}

function styleOption(style: TerminalStyle | undefined): { readonly baseStyle?: TerminalStyle } {
  return style === undefined ? {} : { baseStyle: style };
}

function defaultBorderStyle(widget: DialogNode, border: BorderStyle, baseStyle = renderNodeStyle(widget, 'border')): BorderStyle {
  if (border.kind === 'none') return border;
  const style = mergeStyles(baseStyle, border.style);
  return style === undefined ? border : { ...border, style };
}

function dialogBorderStyle(widget: DialogNode): TerminalStyle | undefined {
  return mergeStyles(
    { fg: { kind: 'theme', token: 'surface.raised.border' } },
    widget.styles?.parts?.['border']
  );
}

export function dialogLabel(widget: DialogNode): string {
  return borderTitleAccessibleText(widget.props.title);
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

function focusBorder(border: BorderStyle, focused: boolean): BorderStyle {
  if (!focused || border.kind === 'none') return border;
  return {
    ...border,
    style: {
      ...border.style,
      ...(border.focusStyle ?? { fg: { kind: 'theme', token: 'focus.border' } })
    }
  };
}
