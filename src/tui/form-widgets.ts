import { clipTextCells, measureTextCells, sanitizeTerminalText } from '../text/index.ts';
import { block, line, span } from './frame.ts';
import { widgetStyle } from './widget-style.ts';
import { numberProp, stringify } from './widget-props.ts';
import type { AccessibleNode } from '../accessibility/index.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { FormOption, Widget } from '../widgets/index.ts';
import type { RenderBlock, RenderLine, TerminalStyle } from './frame.ts';
import type { Rect } from './layout.ts';
import type { HitTarget } from './widget-renderer.ts';

export function formContentBounds(widget: Widget, bounds: Rect): Rect {
  const titleRows = formTitle(widget).length === 0 ? 0 : 1;
  return {
    row: bounds.row + titleRows,
    column: bounds.column,
    width: bounds.width,
    height: Math.max(0, bounds.height - titleRows)
  };
}

export function fieldContentBounds(widget: Widget, bounds: Rect): Rect {
  const headerRows = fieldHeaderLines(widget).length;
  return {
    row: bounds.row + headerRows,
    column: bounds.column,
    width: bounds.width,
    height: Math.max(0, bounds.height - headerRows)
  };
}

export function formBlock(widget: Widget, bounds: Rect): RenderBlock {
  const title = formTitle(widget);
  if (title.length === 0 || bounds.height <= 0) return block([]);
  return block([line([styledSpan(clip(title, bounds.width), widgetStyle(widget, 'title'))])]);
}

export function fieldBlock(widget: Widget, bounds: Rect): RenderBlock {
  return block(fieldHeaderLines(widget).slice(0, Math.max(0, bounds.height)).map((item) => {
    const text = clip(item.text, bounds.width);
    return line([styledSpan(text, item.style)]);
  }));
}

export function labelBlock(widget: Widget, bounds: Rect): RenderBlock {
  const text = labelText(widget);
  return block([line([styledSpan(clip(text, bounds.width), widgetStyle(widget, 'label', widget.props['disabled'] === true ? 'disabled' : undefined))])]);
}

export function buttonBlock(widget: Widget, bounds: Rect, focused = false): RenderBlock {
  const label = clean(stringify(widget.props['label'])) || 'Button';
  const style = widgetStyle(widget, 'label', widget.props['disabled'] === true ? 'disabled' : focused ? 'focused' : undefined);
  return block([line([styledSpan(clip(`[ ${label} ]`, bounds.width), style)])]);
}

export function checkboxBlock(widget: Widget, bounds: Rect, theme: TerminalTheme): RenderBlock {
  const checked = widget.props['checked'] === true;
  const symbol = checked ? theme.symbols.checkboxChecked : theme.symbols.checkboxUnchecked;
  const label = labelWithRequired(clean(stringify(widget.props['label'])), widget.props['required'] === true);
  const lines = [
    line([styledSpan(clip(`${symbol} ${label}`, bounds.width), controlStyle(widget))]),
    ...errorLines(widget, bounds.width)
  ];
  return block(lines.slice(0, Math.max(0, bounds.height)));
}

export function radioGroupBlock(widget: Widget, bounds: Rect, theme: TerminalTheme): RenderBlock {
  const lines: RenderLine[] = [];
  const label = clean(stringify(widget.props['label']));
  if (label.length > 0) {
    lines.push(line([styledSpan(clip(labelWithRequired(label, widget.props['required'] === true), bounds.width), widgetStyle(widget, 'label'))]));
  }
  const selected = selectedId(widget);
  for (const option of formOptions(widget)) {
    const symbol = option.id === selected ? theme.symbols.radioChecked : theme.symbols.radioUnchecked;
    const text = `${symbol} ${option.label}`;
    lines.push(line([styledSpan(clip(text, bounds.width), optionStyle(option, widget))]));
  }
  lines.push(...errorLines(widget, bounds.width));
  return block(lines.slice(0, Math.max(0, bounds.height)));
}

export function selectBoxBlock(widget: Widget, bounds: Rect, theme: TerminalTheme): RenderBlock {
  const selected = selectedOption(widget);
  const label = clean(stringify(widget.props['label']));
  const placeholder = clean(stringify(widget.props['placeholder'])) || 'Select…';
  const value = selected?.label ?? placeholder;
  const prefix = label.length === 0 ? '' : `${labelWithRequired(label, widget.props['required'] === true)}: `;
  const style = widget.props['disabled'] === true
    ? widgetStyle(widget, 'value', 'disabled')
    : selected === undefined
      ? widgetStyle(widget, 'placeholder')
      : widgetStyle(widget, 'value');
  const rows = [
    line([styledSpan(clip(`${prefix}${value} ${theme.symbols.treeCollapsed}`, bounds.width), style)]),
    ...errorLines(widget, bounds.width)
  ];
  return block(rows.slice(0, Math.max(0, bounds.height)));
}

export function textInputBlock(widget: Widget, bounds: Rect, focused = false): RenderBlock {
  return controlInputBlock(inputValue(widget), widget, bounds, focused);
}

export function numberInputBlock(widget: Widget, bounds: Rect, focused = false): RenderBlock {
  return controlInputBlock(numberInputValue(widget), widget, bounds, focused);
}

export function formAccessibleBase(widget: Widget, id: string, focused: boolean): AccessibleNode {
  return {
    id,
    role: 'application',
    label: formTitle(widget) || id,
    ...(focused ? { focused } : {})
  };
}

export function fieldAccessibleBase(widget: Widget, id: string, focused: boolean): AccessibleNode {
  const description = fieldDescription(widget);
  return {
    id,
    role: 'text',
    label: labelWithRequired(clean(stringify(widget.props['label'])), widget.props['required'] === true) || id,
    ...(description.length === 0 ? {} : { description }),
    ...(widget.props['disabled'] === true ? { disabled: true } : {}),
    ...(focused ? { focused } : {})
  };
}

export function labelAccessibleBase(widget: Widget, id: string): AccessibleNode {
  const description = stringify(widget.props['forId']);
  return {
    id,
    role: 'text',
    label: labelText(widget) || id,
    ...(description.length === 0 ? {} : { description: `Labels ${description}.` }),
    ...(widget.props['disabled'] === true ? { disabled: true } : {})
  };
}

export function buttonAccessibleBase(widget: Widget, id: string, focused: boolean): AccessibleNode {
  return {
    id,
    role: 'button',
    label: clean(stringify(widget.props['label'])) || id,
    ...(widget.props['disabled'] === true ? { disabled: true } : {}),
    ...(focused ? { focused } : {})
  };
}

export function checkboxAccessibleBase(widget: Widget, id: string, focused: boolean): AccessibleNode {
  const description = fieldDescription(widget);
  return {
    id,
    role: 'checkbox',
    label: labelWithRequired(clean(stringify(widget.props['label'])), widget.props['required'] === true) || id,
    checked: widget.props['checked'] === true,
    ...(description.length === 0 ? {} : { description }),
    ...(widget.props['disabled'] === true ? { disabled: true } : {}),
    ...(focused ? { focused } : {})
  };
}

export function radioGroupAccessibleBase(widget: Widget, id: string, focused: boolean): AccessibleNode {
  const selected = selectedOption(widget);
  const description = fieldDescription(widget);
  return {
    id,
    role: 'listbox',
    label: labelWithRequired(clean(stringify(widget.props['label'])), widget.props['required'] === true) || id,
    ...(selected === undefined ? {} : { value: selected.label }),
    ...(description.length === 0 ? {} : { description }),
    ...(widget.props['disabled'] === true ? { disabled: true } : {}),
    ...(focused ? { focused } : {})
  };
}

export function radioGroupAccessibleChildren(widget: Widget): readonly AccessibleNode[] {
  const selected = selectedId(widget);
  return formOptions(widget).map((option) => ({
    id: `${widget.id ?? 'radioGroup'}:${option.id}`,
    role: 'radio',
    label: option.label,
    checked: option.id === selected,
    selected: option.id === selected,
    ...(option.description === undefined ? {} : { description: option.description }),
    ...(option.disabled === true || widget.props['disabled'] === true ? { disabled: true } : {})
  }));
}

export function selectBoxAccessibleBase(widget: Widget, id: string, focused: boolean): AccessibleNode {
  const selected = selectedOption(widget);
  const description = fieldDescription(widget);
  return {
    id,
    role: 'listbox',
    label: labelWithRequired(clean(stringify(widget.props['label'])), widget.props['required'] === true) || id,
    ...(selected === undefined ? {} : { value: selected.label }),
    ...(description.length === 0 ? {} : { description }),
    ...(widget.props['disabled'] === true ? { disabled: true } : {}),
    ...(focused ? { focused } : {})
  };
}

export function selectBoxAccessibleChildren(widget: Widget): readonly AccessibleNode[] {
  const selected = selectedId(widget);
  return formOptions(widget).map((option) => ({
    id: `${widget.id ?? 'selectBox'}:${option.id}`,
    role: 'option',
    label: option.label,
    selected: option.id === selected,
    ...(option.description === undefined ? {} : { description: option.description }),
    ...(option.disabled === true || widget.props['disabled'] === true ? { disabled: true } : {})
  }));
}

export function textInputAccessibleBase(widget: Widget, id: string, focused: boolean): AccessibleNode {
  return inputAccessibleBase(widget, id, focused, inputValue(widget));
}

export function numberInputAccessibleBase(widget: Widget, id: string, focused: boolean): AccessibleNode {
  return inputAccessibleBase(widget, id, focused, numberInputValue(widget));
}

export function textInputCursor(widget: Widget, bounds: Rect): { readonly row: number; readonly column: number } {
  return singleLineCursor(inputValue(widget), numberProp(widget, 'cursor'), bounds);
}

export function numberInputCursor(widget: Widget, bounds: Rect): { readonly row: number; readonly column: number } {
  return singleLineCursor(numberInputValue(widget), numberProp(widget, 'cursor'), bounds);
}

export function controlHitTargets<TMessage>(widget: Widget<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  if (widget.props['disabled'] === true) return [];
  if (!('message' in widget.props)) return [];
  const message = widget.props['message'] as TMessage;
  return [{
    id: `${widget.id ?? widget.kind}:control`,
    bounds,
    message,
    cursor: 'pointer'
  }];
}

export function optionHitTargets<TMessage>(widget: Widget<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  if (widget.props['disabled'] === true) return [];
  const toMessage = optionMessageFactory(widget);
  if (toMessage === undefined) return [];
  const labelOffset = clean(stringify(widget.props['label'])).length > 0 ? 1 : 0;
  return formOptions(widget).flatMap((option, index): HitTarget<TMessage>[] => {
    if (option.disabled === true) return [];
    return [{
      id: `${widget.id ?? widget.kind}:${option.id}`,
      bounds: {
        row: bounds.row + labelOffset + index,
        column: bounds.column,
        width: bounds.width,
        height: 1
      },
      message: toMessage(option),
      cursor: 'pointer'
    }];
  });
}

function controlInputBlock(value: string, widget: Widget, bounds: Rect, focused: boolean): RenderBlock {
  const placeholder = clean(stringify(widget.props['placeholder']));
  const displayValue = value.length === 0 && placeholder.length > 0 ? placeholder : value;
  const style = widget.props['disabled'] === true
    ? widgetStyle(widget, 'value', 'disabled')
    : value.length === 0 && placeholder.length > 0
      ? widgetStyle(widget, 'placeholder')
      : widgetStyle(widget, 'value', focused ? 'focused' : undefined);
  const rows = [
    line([styledSpan(clip(displayValue, bounds.width), style)]),
    ...errorLines(widget, bounds.width)
  ];
  return block(rows.slice(0, Math.max(0, bounds.height)));
}

function inputAccessibleBase(widget: Widget, id: string, focused: boolean, value: string): AccessibleNode {
  const description = fieldDescription(widget);
  return {
    id,
    role: 'textbox',
    label: id,
    value,
    ...(description.length === 0 ? {} : { description }),
    ...(widget.props['disabled'] === true ? { disabled: true } : {}),
    ...(focused ? { focused } : {})
  };
}

function fieldHeaderLines(widget: Widget): readonly { readonly text: string; readonly style?: TerminalStyle }[] {
  const rows: { readonly text: string; readonly style?: TerminalStyle }[] = [];
  const label = labelWithRequired(clean(stringify(widget.props['label'])), widget.props['required'] === true);
  if (label.length > 0) pushStyledRow(rows, label, widgetStyle(widget, 'label', widget.props['disabled'] === true ? 'disabled' : undefined));
  const description = clean(stringify(widget.props['description']));
  if (description.length > 0) pushStyledRow(rows, description, widgetStyle(widget, 'value', 'disabled'));
  const error = clean(stringify(widget.props['error']));
  if (error.length > 0) pushStyledRow(rows, error, widgetStyle(widget, 'error', 'error'));
  return rows;
}

function errorLines(widget: Widget, width: number): readonly RenderLine[] {
  const error = clean(stringify(widget.props['error']));
  return error.length === 0 ? [] : [line([styledSpan(clip(error, width), widgetStyle(widget, 'error', 'error'))])];
}

function styledSpan(text: string, style: TerminalStyle | undefined) {
  return style === undefined ? span(text) : span(text, { style });
}

function pushStyledRow(rows: { text: string; style?: TerminalStyle }[], text: string, style: TerminalStyle | undefined): void {
  rows.push(style === undefined ? { text } : { text, style });
}

function fieldDescription(widget: Widget): string {
  const parts = [
    clean(stringify(widget.props['description'])),
    widget.props['required'] === true ? 'Required.' : '',
    clean(stringify(widget.props['error']))
  ].filter((part) => part.length > 0);
  return parts.join(' ');
}

function formTitle(widget: Widget): string {
  return clean(stringify(widget.props['title']));
}

function labelText(widget: Widget): string {
  return labelWithRequired(clean(stringify(widget.props['text'])), widget.props['required'] === true);
}

function labelWithRequired(label: string, required: boolean): string {
  if (label.length === 0) return required ? 'Required' : '';
  return required ? `${label} *` : label;
}

function selectedId(widget: Widget): string | undefined {
  const selected = widget.props['selected'];
  return typeof selected === 'string' ? clean(selected) : undefined;
}

function selectedOption(widget: Widget): FormOption<unknown> | undefined {
  const selected = selectedId(widget);
  return selected === undefined ? undefined : formOptions(widget).find((option) => option.id === selected);
}

function formOptions(widget: Widget): readonly FormOption<unknown>[] {
  const options = widget.props['options'];
  return Array.isArray(options) ? options.flatMap((option): readonly FormOption<unknown>[] => sanitizeOption(option)) : [];
}

function sanitizeOption(value: unknown): readonly FormOption<unknown>[] {
  if (!isRecord(value)) return [];
  const id = value['id'];
  const label = value['label'];
  if (typeof id !== 'string' || typeof label !== 'string') return [];
  const description = value['description'];
  return [{
    id: clean(id),
    label: clean(label),
    value: value['value'],
    ...(value['disabled'] === true ? { disabled: true } : {}),
    ...(typeof description === 'string' ? { description: clean(description) } : {})
  }];
}

function optionMessageFactory<TMessage>(widget: Widget<TMessage>): ((option: FormOption<unknown>) => TMessage) | undefined {
  const toMessage = widget.props['toMessage'];
  if (!isOptionMessageFactory(toMessage)) return undefined;
  return (option) => toMessage(option) as TMessage;
}

function optionStyle(option: FormOption<unknown>, widget: Widget): TerminalStyle | undefined {
  if (option.disabled === true || widget.props['disabled'] === true) return widgetStyle(widget, 'value', 'disabled');
  if (option.id === selectedId(widget)) return widgetStyle(widget, 'value', 'selected');
  return undefined;
}

function controlStyle(widget: Widget): TerminalStyle | undefined {
  return widget.props['disabled'] === true ? widgetStyle(widget, 'value', 'disabled') : undefined;
}

function inputValue(widget: Widget): string {
  return clean(stringify(widget.props['value']));
}

function numberInputValue(widget: Widget): string {
  const value = widget.props['value'];
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

function singleLineCursor(value: string, cursor: number | undefined, bounds: Rect): { readonly row: number; readonly column: number } {
  const offset = Math.max(0, Math.min(value.length, Math.floor(cursor ?? value.length)));
  const cells = measureTextCells(value.slice(0, offset)).cells;
  return {
    row: bounds.row,
    column: bounds.column + Math.max(0, Math.min(Math.max(0, bounds.width - 1), cells))
  };
}

function clip(value: string, width: number): string {
  return clipTextCells(value, Math.max(0, width), { ellipsis: '…' }).text;
}

function clean(value: string): string {
  return sanitizeTerminalText(value).text.replace(/\s*\n\s*/gu, ' ');
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionMessageFactory(value: unknown): value is (option: FormOption<unknown>) => unknown {
  return typeof value === 'function';
}
