import type { RenderNode } from '../../../render-node/index.ts';
import { borderStyleFromValue, borderTitleText } from '../../border.ts';
import { stringify } from '../../render-node-props.ts';
import { mergeStyles, renderNodeStyle } from '../../render-node-style.ts';
import type { BorderStyle } from '../../border.ts';
import type { Rect } from '../../layout.ts';
import type { TerminalStyle } from '../../render-primitives.ts';

export function borderForRenderNode(widget: RenderNode, focused = false): BorderStyle {
  return focusBorder(defaultBorderStyle(widget, borderStyleFromValue(widget.props['border']) ?? { kind: 'single' }), focused);
}

export function borderForModal(widget: RenderNode, focused = false): BorderStyle {
  const border = defaultBorderStyle(
    widget,
    borderStyleFromValue(widget.props['border']) ?? { kind: 'single' },
    modalBorderStyle(widget)
  );
  if (border.title !== undefined || border.kind === 'none') return focusBorder(border, focused);
  const title = modalLabel(widget);
  return focusBorder(title.length === 0 ? border : { ...border, title }, focused);
}

function defaultBorderStyle(widget: RenderNode, border: BorderStyle, baseStyle = renderNodeStyle(widget, 'border')): BorderStyle {
  if (border.kind === 'none') return border;
  const style = mergeStyles(baseStyle, border.style);
  return style === undefined ? border : { ...border, style };
}

function modalBorderStyle(widget: RenderNode): TerminalStyle | undefined {
  return mergeStyles(
    { fg: { kind: 'theme', token: 'surface.raised.border' } },
    widget.styles?.border
  );
}

export function modalLabel(widget: RenderNode): string {
  const title = stringify(widget.props['title']);
  if (title.length > 0) return title;
  const borderTitle = borderStyleFromValue(widget.props['border'])?.title;
  return borderTitleText(borderTitle);
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
