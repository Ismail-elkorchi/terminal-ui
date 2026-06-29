import { sanitizeTerminalText } from '../text/index.ts';
import { numberProp, stringify } from './widget-props.ts';
import { selectedTextSpans, singleLineCursorColumn } from './text-display.ts';
import { themeStyle, widgetStyle } from './widget-style.ts';
import type { AccessibleNode } from '../accessibility/index.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { TextSelection } from '../text/index.ts';
import type { CommandBarSuggestion, CommandBarValidation, CommandBarValidationTone, Widget } from '../widgets/index.ts';
import type { Rect } from './layout.ts';
import type { RenderBlock, RenderLine, RenderSpan, TerminalStyle } from './render-primitives.ts';

export function commandBarBlock(widget: Widget, height: number, theme: TerminalTheme): RenderBlock {
  const lines: RenderLine[] = [inputLine(widget)];
  const validation = validationProp(widget);
  if (height > lines.length && validation !== undefined) lines.push(validationLine(widget, validation));
  const suggestions = commandBarSuggestions(widget);
  const selected = nonNegativeInteger(numberProp(widget, 'selectedSuggestion'));
  const remaining = Math.max(0, height - lines.length - footerReserve(widget));
  lines.push(...suggestions.slice(0, remaining).map((suggestion, index) => suggestionLine(
    widget,
    suggestion,
    index === selected,
    matchQuery(widget),
    theme
  )));
  const footer = footerText(widget);
  if (height > lines.length && footer.length > 0) lines.push(mutedLine(widget, footer));
  return { lines: lines.slice(0, height) };
}

export function commandBarText(widget: Widget, height: number, theme: TerminalTheme): string {
  return commandBarBlock(widget, height, theme).lines.map((line) => line.spans.map((span) => span.text).join('')).join('\n');
}

export function commandBarAccessibleChildren(widget: Widget): readonly AccessibleNode[] | undefined {
  const suggestions = commandBarSuggestions(widget);
  const validation = validationProp(widget);
  const children: AccessibleNode[] = [];
  if (validation !== undefined) {
    children.push({
      id: `${widget.id ?? 'command-bar'}:validation`,
      role: 'status',
      label: validation.tone ?? 'validation',
      value: validation.message
    });
  }
  const selected = nonNegativeInteger(numberProp(widget, 'selectedSuggestion'));
  children.push(...suggestions.map((suggestion, index) => ({
    id: `${widget.id ?? 'command-bar'}:suggestion:${String(index)}`,
    role: 'option' as const,
    label: suggestion.label ?? suggestion.value,
    value: suggestion.value,
    selected: index === selected
  })));
  return children.length === 0 ? undefined : children;
}

export function commandBarCursor(widget: Widget, bounds: Rect): { readonly row: number; readonly column: number } {
  const prompt = promptText(widget);
  const value = valueText(widget);
  const promptCells = singleLineCursorColumn(prompt, prompt.length);
  const valueCells = singleLineCursorColumn(value, numberProp(widget, 'cursor'));
  const beforeCursorCells = promptCells + valueCells;
  return { row: bounds.row, column: bounds.column + Math.max(0, Math.min(bounds.width - 1, beforeCursorCells)) };
}

function inputLine(widget: Widget): RenderLine {
  const value = valueText(widget);
  const placeholder = placeholderText(widget);
  const completion = completionText(widget);
  const spans: RenderSpan[] = [
    styledSpan(promptText(widget), widgetStyle(widget, 'placeholder')),
    ...(value.length === 0 && placeholder.length > 0
      ? [styledSpan(placeholder, widgetStyle(widget, 'placeholder'))]
      : valueSpans(widget, value, selectionProp(widget)))
  ];
  if (value.length > 0 && completion.length > 0) {
    spans.push(styledSpan(completion, widgetStyle(widget, 'value', 'disabled')));
  }
  return {
    spans
  };
}

function validationLine(widget: Widget, validation: CommandBarValidation): RenderLine {
  return {
    spans: [styledSpan(validation.message, validationStyle(widget, validation.tone ?? 'error'))]
  };
}

function suggestionLine(
  widget: Widget,
  suggestion: CommandBarSuggestion,
  selected: boolean,
  query: string,
  theme: TerminalTheme
): RenderLine {
  const label = suggestion.label ?? suggestion.value;
  const description = suggestion.description;
  const spans: RenderSpan[] = [
    styledSpan(`${selected ? theme.symbols.pointer : theme.symbols.unselected} `, selected ? widgetStyle(widget, 'value', 'selected') : undefined),
    ...matchSpans(label, query)
  ];
  if (description !== undefined && description.length > 0) {
    spans.push(styledSpan(` - ${description}`, widgetStyle(widget, 'value', 'disabled')));
  }
  return {
    spans
  };
}

function mutedLine(widget: Widget, text: string): RenderLine {
  return {
    spans: [styledSpan(text, widgetStyle(widget, 'value', 'disabled'))]
  };
}

function matchSpans(text: string, query: string): readonly RenderSpan[] {
  if (query.length === 0) return [{ text }];
  const lowerText = text.toLocaleLowerCase();
  const lowerQuery = query.toLocaleLowerCase();
  const spans: RenderSpan[] = [];
  let cursor = 0;
  for (;;) {
    const index = lowerText.indexOf(lowerQuery, cursor);
    if (index === -1) break;
    if (index > cursor) spans.push({ text: text.slice(cursor, index) });
    const end = index + query.length;
    spans.push({
      text: text.slice(index, end),
      style: themeStyle('menu.match', { underline: true })
    });
    cursor = end;
  }
  if (cursor < text.length) spans.push({ text: text.slice(cursor) });
  return spans.length === 0 ? [{ text }] : spans;
}

function commandBarSuggestions(widget: Widget): readonly CommandBarSuggestion[] {
  const suggestions = widget.props['suggestions'];
  return Array.isArray(suggestions)
    ? suggestions.flatMap((suggestion): CommandBarSuggestion[] => {
        if (!isRecord(suggestion)) return [];
        const value = suggestion['value'];
        if (typeof value !== 'string') return [];
        const label = suggestion['label'];
        const description = suggestion['description'];
        return [{
          value: clean(value),
          ...(typeof label === 'string' ? { label: clean(label) } : {}),
          ...(typeof description === 'string' ? { description: clean(description) } : {})
        }];
      })
    : [];
}

function validationProp(widget: Widget): CommandBarValidation | undefined {
  const validation = widget.props['validation'];
  if (!isRecord(validation)) return undefined;
  const message = validation['message'];
  if (typeof message !== 'string' || message.length === 0) return undefined;
  const tone = validationTone(validation['tone']);
  return {
    message: clean(message),
    ...(tone === undefined ? {} : { tone })
  };
}

function validationTone(value: unknown): CommandBarValidationTone | undefined {
  return value === 'info' || value === 'warning' || value === 'error' ? value : undefined;
}

function validationStyle(widget: Widget, tone: CommandBarValidationTone): TerminalStyle | undefined {
  if (tone === 'info') return widgetStyle(widget, 'value', 'focused');
  return widgetStyle(widget, tone, tone);
}

function valueSpans(widget: Widget, value: string, selection: TextSelection | undefined): readonly RenderSpan[] {
  const normalized = normalizeSelection(value, selection);
  return selectedTextSpans(
    value,
    normalized,
    widgetStyle(widget, 'value'),
    widgetStyle(widget, 'value', 'selected')
  );
}

function styledSpan(text: string, style: TerminalStyle | undefined): RenderSpan {
  return style === undefined ? { text } : { text, style };
}

function selectionProp(widget: Widget): TextSelection | undefined {
  const selection = widget.props['selection'];
  if (!isRecord(selection)) return undefined;
  const start = selection['start'];
  const end = selection['end'];
  if (typeof start !== 'number' || typeof end !== 'number') return undefined;
  return normalizeSelection(valueText(widget), { start, end });
}

function normalizeSelection(value: string, selection: TextSelection | undefined): TextSelection | undefined {
  if (selection === undefined) return undefined;
  const start = Math.max(0, Math.min(value.length, Math.floor(Math.min(selection.start, selection.end))));
  const end = Math.max(0, Math.min(value.length, Math.floor(Math.max(selection.start, selection.end))));
  return start === end ? undefined : { start, end };
}

function footerReserve(widget: Widget): number {
  return footerText(widget).length === 0 ? 0 : 1;
}

function matchQuery(widget: Widget): string {
  const explicit = clean(stringify(widget.props['matchQuery'])).trim();
  return explicit.length === 0 ? valueText(widget).trim() : explicit;
}

function promptText(widget: Widget): string {
  return clean(stringify(widget.props['prompt']) || '> ');
}

function valueText(widget: Widget): string {
  return clean(stringify(widget.props['value']));
}

function placeholderText(widget: Widget): string {
  return clean(stringify(widget.props['placeholder']));
}

function completionText(widget: Widget): string {
  return clean(stringify(widget.props['completionPreview']));
}

function footerText(widget: Widget): string {
  return clean(stringify(widget.props['footer']));
}

function clean(value: string): string {
  return sanitizeTerminalText(value).text.replace(/\s*\n\s*/gu, ' ');
}

function nonNegativeInteger(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
