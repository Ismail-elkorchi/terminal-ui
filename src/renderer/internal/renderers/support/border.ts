import type { RenderNodeOfKind } from '../../../model/index.ts';
import { borderStyleFromValue, borderTitleText } from '../../border.ts';
import { stringify } from '../../render-node-props.ts';
import { mergeStyles, renderNodeStyle } from '../../render-node-style.ts';
import type { BorderStyle } from '../../border.ts';
import type { Rect } from '../../../model/layout.ts';
import type { TerminalStyle } from '../../../../visual/render.ts';

type DialogNode = RenderNodeOfKind<unknown, 'dialog'>;

export function borderForDialog(widget: DialogNode, focused = false): BorderStyle {
  const border = defaultBorderStyle(
    widget,
    borderStyleFromValue(widget.props.border) ?? { kind: 'single' },
    dialogBorderStyle(widget)
  );
  if (border.title !== undefined || border.kind === 'none') return focusBorder(border, focused);
  const title = dialogLabel(widget);
  return focusBorder(title.length === 0 ? border : { ...border, title }, focused);
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
  const title = stringify(widget.props.title);
  if (title.length > 0) return title;
  const borderTitle = borderStyleFromValue(widget.props.border)?.title;
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
