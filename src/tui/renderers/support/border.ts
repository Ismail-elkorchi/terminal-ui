import type { Widget } from '../../../widgets/index.ts';
import { stringify } from '../../widget-props.ts';
import { mergeStyles, widgetStyle } from '../../widget-style.ts';
import { isRecord } from './common.ts';
import type { BorderStyle } from '../../border.ts';
import type { TerminalColor, TerminalStyle } from '../../frame.ts';
import type { Rect } from '../../layout.ts';

export function borderForWidget(widget: Widget, focused = false): BorderStyle {
  return focusBorder(defaultBorderStyle(widget, borderFromValue(widget.props['border']) ?? { kind: 'single' }), focused);
}

export function borderForModal(widget: Widget, focused = false): BorderStyle {
  const border = defaultBorderStyle(widget, borderFromValue(widget.props['border']) ?? { kind: 'single' });
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
  return borderFromValue(widget.props['border'])?.title ?? '';
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

function borderFromValue(value: unknown): BorderStyle | undefined {
  if (!isRecord(value)) return undefined;
  const kind = value['kind'];
  if (!isBorderKind(kind)) return undefined;
  const title = value['title'];
  const titleAlign = value['titleAlign'];
  const style = terminalStyleFromValue(value['style']);
  const focusStyle = terminalStyleFromValue(value['focusStyle']);
  return {
    kind,
    ...(typeof title === 'string' ? { title } : {}),
    ...(isTitleAlign(titleAlign) ? { titleAlign } : {}),
    ...(style === undefined ? {} : { style }),
    ...(focusStyle === undefined ? {} : { focusStyle })
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

function isBorderKind(value: unknown): value is BorderStyle['kind'] {
  return value === 'none'
    || value === 'single'
    || value === 'double'
    || value === 'rounded'
    || value === 'heavy'
    || value === 'ascii';
}

function isTitleAlign(value: unknown): value is NonNullable<BorderStyle['titleAlign']> {
  return value === 'start' || value === 'center' || value === 'end';
}

function terminalStyleFromValue(value: unknown): TerminalStyle | undefined {
  if (!isRecord(value)) return undefined;
  const fg = terminalColorFromValue(value['fg']);
  const bg = terminalColorFromValue(value['bg']);
  return {
    ...(fg === undefined ? {} : { fg }),
    ...(bg === undefined ? {} : { bg }),
    ...(typeof value['bold'] === 'boolean' ? { bold: value['bold'] } : {}),
    ...(typeof value['dim'] === 'boolean' ? { dim: value['dim'] } : {}),
    ...(typeof value['italic'] === 'boolean' ? { italic: value['italic'] } : {}),
    ...(typeof value['underline'] === 'boolean' ? { underline: value['underline'] } : {}),
    ...(typeof value['strikethrough'] === 'boolean' ? { strikethrough: value['strikethrough'] } : {}),
    ...(typeof value['inverse'] === 'boolean' ? { inverse: value['inverse'] } : {}),
    ...(typeof value['hidden'] === 'boolean' ? { hidden: value['hidden'] } : {})
  };
}

function terminalColorFromValue(value: unknown): TerminalColor | undefined {
  if (!isRecord(value)) return undefined;
  const kind = value['kind'];
  if (kind === 'ansi') {
    const color = value['value'];
    return typeof color === 'number' && Number.isFinite(color) ? { kind, value: color } : undefined;
  }
  if (kind === 'rgb') {
    const r = value['r'];
    const g = value['g'];
    const b = value['b'];
    return typeof r === 'number' && Number.isFinite(r)
      && typeof g === 'number' && Number.isFinite(g)
      && typeof b === 'number' && Number.isFinite(b)
      ? { kind, r, g, b }
      : undefined;
  }
  if (kind === 'theme') {
    const token = value['token'];
    return typeof token === 'string' ? { kind, token } : undefined;
  }
  return undefined;
}
