import type { Widget } from '../../../widgets/index.ts';
import { borderStyleFromValue } from '../../border.ts';
import { stringify } from '../../widget-props.ts';
import { mergeStyles, widgetStyle } from '../../widget-style.ts';
import type { BorderStyle } from '../../border.ts';
import type { Rect } from '../../layout.ts';

export function borderForWidget(widget: Widget, focused = false): BorderStyle {
  return focusBorder(defaultBorderStyle(widget, borderStyleFromValue(widget.props['border']) ?? { kind: 'single' }), focused);
}

export function borderForModal(widget: Widget, focused = false): BorderStyle {
  const border = defaultBorderStyle(widget, borderStyleFromValue(widget.props['border']) ?? { kind: 'single' });
  if (border.title !== undefined || border.kind === 'none') return focusBorder(border, focused);
  const title = modalLabel(widget);
  return focusBorder(title.length === 0 ? border : { ...border, title }, focused);
}

function defaultBorderStyle(widget: Widget, border: BorderStyle): BorderStyle {
  if (border.kind === 'none') return border;
  const style = mergeStyles(widgetStyle(widget, 'border'), border.style);
  return style === undefined ? border : { ...border, style };
}

export function modalLabel(widget: Widget): string {
  const title = stringify(widget.props['title']);
  if (title.length > 0) return title;
  return borderStyleFromValue(widget.props['border'])?.title ?? '';
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
