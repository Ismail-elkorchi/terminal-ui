import type { RenderNode } from '../render-node/index.ts';
import { sanitizeTerminalText } from '../text/index.ts';
import {
  commandMatchSpans, commandMetadataStyle, commandRowStyle, commandSelectionMarkerSpans, commandStatusSpans, styledSpan
} from './command-visual.ts';
import { numberProp, stringify } from './render-node-props.ts';
import { renderNodeFrameSource } from './frame-source.ts';
import { selectedTextSpans, selectionFromUnknown, singleLineCursorColumn, visibleLineWindow } from './text-display.ts';
import { textOffsetAtVisualColumn } from './text-pointer.ts';
import { inputCursorStyle, mergeStyles, themeStyle, renderNodeStyle } from './render-node-style.ts';
import type { AccessibleNode } from '../accessibility/index.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { TextSelection } from '../text/index.ts';
import type { SuggestionItem, ComponentValidationTone } from '../components/contracts.ts';
import { optionalValidationTone } from '../components/status.ts';
import type { CommandBarDisplay, CommandBarValidation } from '../components/types.ts';
import type { CursorPosition } from './cursor.ts';
import type { Rect } from './layout.ts';
import type { RoutedPointerEvent } from './pointer-types.ts';
import { clipRenderSpans, measureRenderSpans } from './render-primitives.ts';
import type { FrameCellSource, RenderBlock, RenderLine, RenderSpan } from './render-primitives.ts';

type CommandPartKind =
  | 'completion'
  | 'cursor'
  | 'description'
  | 'footer'
  | 'history'
  | 'label'
  | 'marker'
  | 'match'
  | 'placeholder'
  | 'prompt'
  | 'selection'
  | 'validation'
  | 'value'
  | 'window';

export function commandBarBlock(widget: RenderNode, bounds: Pick<Rect, 'width' | 'height'>, theme: TerminalTheme): RenderBlock {
  const display = commandBarDisplay(widget);
  const lines: RenderLine[] = [inputLine(widget, bounds.width)];
  const validation = validationProp(widget);
  if (bounds.height > lines.length && validation !== undefined) lines.push(validationLine(widget, validation, theme));
  if (display === 'expanded') {
    const suggestions = commandBarSuggestions(widget);
    const selected = nonNegativeInteger(numberProp(widget, 'selectedSuggestion'));
    const remaining = Math.max(0, bounds.height - lines.length - footerReserve(widget));
    lines.push(...suggestions.slice(0, remaining).map((suggestion, index) => suggestionLine(
      widget,
      suggestion,
      index,
      index === selected,
      matchQuery(widget),
      theme
    )));
    const footer = footerText(widget);
    if (bounds.height > lines.length && footer.length > 0) lines.push(mutedLine(widget, footer, theme));
  }
  return { lines: lines.slice(0, bounds.height) };
}

export function commandBarText(widget: RenderNode, height: number, theme: TerminalTheme): string {
  return commandBarBlock(widget, { width: 1_000, height }, theme).lines.map((line) => line.spans.map((span) => span.text).join('')).join('\n');
}

export function commandBarAccessibleChildren(widget: RenderNode): readonly AccessibleNode[] | undefined {
  const suggestions = commandBarDisplay(widget) === 'expanded' ? commandBarSuggestions(widget) : [];
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
    selected: index === selected,
    disabled: suggestion.disabled === true
  })));
  return children.length === 0 ? undefined : children;
}

export function commandBarCursor(widget: RenderNode, bounds: Rect): CursorPosition {
  const model = commandInputModel(widget, bounds.width);
  return {
    row: bounds.row,
    column: bounds.column + Math.max(0, Math.min(bounds.width - 1, model.promptCells + model.cursorColumn)),
    style: inputCursorStyle(),
    source: commandSource(widget, 'cursor', { role: 'cursor', partKind: 'cursor' })
  };
}

export function commandBarPointerOffset(
  widget: RenderNode,
  bounds: Pick<Rect, 'width'>,
  pointer: RoutedPointerEvent
): number | undefined {
  if (pointer.localColumn === undefined) return undefined;
  const model = commandInputModel(widget, bounds.width);
  const contentColumn = pointer.localColumn - 1 - model.promptCells;
  return textOffsetAtVisualColumn(model.value, model.offsetCells + Math.max(0, contentColumn));
}

function inputLine(widget: RenderNode, width: number): RenderLine {
  const model = commandInputModel(widget, width);
  const placeholder = placeholderText(widget);
  const completion = completionText(widget);
  const spans: RenderSpan[] = [
    styledSpan(model.prompt, commandPromptStyle(widget), commandSource(widget, 'prompt', { role: 'decoration', partKind: 'prompt' })),
    ...(model.value.length === 0 && placeholder.length > 0
      ? clipRenderSpans([styledSpan(placeholder, renderNodeStyle(widget, 'placeholder'), commandSource(widget, 'placeholder', { partKind: 'placeholder' }))], model.contentWidth)
      : valueWindowSpans(widget, model))
  ];
  const visibleCells = measureRenderSpans(spans) - model.promptCells;
  const completionWidth = Math.max(0, model.contentWidth - visibleCells);
  if (model.value.length > 0 && completion.length > 0 && model.window.endOffset >= model.value.length && completionWidth > 0) {
    spans.push(...clipRenderSpans([
      styledSpan(completion, renderNodeStyle(widget, 'placeholder'), commandSource(widget, 'completion', { partKind: 'completion', state: 'preview' }))
    ], completionWidth));
  }
  const historyIndex = numberProp(widget, 'historyIndex');
  if (historyIndex !== undefined) {
    spans.push(styledSpan(
      `  #${String(Math.max(0, Math.floor(historyIndex)) + 1)}`,
      renderNodeStyle(widget, 'placeholder'),
      commandSource(widget, 'history', { partKind: 'history', state: 'history' })
    ));
  }
  return {
    spans
  };
}

function commandPromptStyle(widget: RenderNode): ReturnType<typeof renderNodeStyle> {
  return mergeStyles(themeStyle('command.prompt'), widget.styles?.label);
}

interface CommandInputModel {
  readonly prompt: string;
  readonly promptCells: number;
  readonly value: string;
  readonly contentWidth: number;
  readonly offsetCells: number;
  readonly cursorColumn: number;
  readonly window: ReturnType<typeof visibleLineWindow>;
}

function commandInputModel(widget: RenderNode, width: number): CommandInputModel {
  const prompt = promptText(widget);
  const value = valueText(widget);
  const promptCells = singleLineCursorColumn(prompt, prompt.length);
  const contentWidth = Math.max(0, Math.floor(width) - promptCells);
  const cursorCells = singleLineCursorColumn(value, numberProp(widget, 'cursor'));
  const offsetCells = Math.max(0, cursorCells - Math.max(0, contentWidth - 1));
  const window = visibleLineWindow(value, offsetCells, contentWidth);
  return {
    prompt,
    promptCells,
    value,
    contentWidth,
    offsetCells,
    cursorColumn: Math.max(0, cursorCells - offsetCells),
    window
  };
}

function validationLine(widget: RenderNode, validation: CommandBarValidation, theme: TerminalTheme): RenderLine {
  return {
    spans: commandStatusSpans(widget, theme, validationToneForSurface(validation.tone ?? 'error'), validation.message, {
      markerSource: commandSource(widget, 'validation.marker', { role: 'decoration', partKind: 'marker', state: validation.tone ?? 'error' }),
      textSource: commandSource(widget, 'validation', { partKind: 'validation', state: validation.tone ?? 'error' })
    })
  };
}

function suggestionLine(
  widget: RenderNode,
  suggestion: SuggestionItem,
  index: number,
  selected: boolean,
  query: string,
  theme: TerminalTheme
): RenderLine {
  const label = suggestion.label ?? suggestion.value;
  const description = suggestion.description;
  const disabled = suggestion.disabled === true;
  const rowStyle = commandRowStyle(widget, selected, disabled);
  const state = disabled ? 'disabled' : selected ? 'selected' : undefined;
  const spans: RenderSpan[] = [
    ...commandSelectionMarkerSpans(widget, theme, selected, commandSource(widget, `suggestion.${String(index)}.marker`, commandSourceOptions('marker', state, 'decoration'))),
    ...commandMatchSpans(label, query, rowStyle, {
      source: commandSource(widget, `suggestion.${String(index)}.label`, commandSourceOptions('label', state)),
      matchSource: commandSource(widget, `suggestion.${String(index)}.match`, commandSourceOptions('match', state))
    })
  ];
  if (description !== undefined && description.length > 0) {
    spans.push(styledSpan(
      ` · ${description}`,
      commandMetadataStyle(widget, selected, disabled),
      commandSource(widget, `suggestion.${String(index)}.description`, commandSourceOptions('description', state))
    ));
  }
  return {
    spans
  };
}

function mutedLine(widget: RenderNode, text: string, theme: TerminalTheme): RenderLine {
  return {
    spans: commandStatusSpans(widget, theme, 'muted', text, {
      markerSource: commandSource(widget, 'footer.marker', { role: 'decoration', partKind: 'marker', state: 'muted' }),
      textSource: commandSource(widget, 'footer', { partKind: 'footer', state: 'muted' })
    })
  };
}

function commandBarSuggestions(widget: RenderNode): readonly SuggestionItem[] {
  const suggestions = widget.props['suggestions'];
  return Array.isArray(suggestions)
    ? suggestions.flatMap((suggestion): SuggestionItem[] => {
        if (!isRecord(suggestion)) return [];
        const value = suggestion['value'];
        if (typeof value !== 'string') return [];
        const label = suggestion['label'];
        const description = suggestion['description'];
        const disabled = suggestion['disabled'];
        return [{
          value: clean(value),
          ...(typeof label === 'string' ? { label: clean(label) } : {}),
          ...(typeof description === 'string' ? { description: clean(description) } : {}),
          ...(disabled === true ? { disabled } : {})
        }];
      })
    : [];
}

function validationProp(widget: RenderNode): CommandBarValidation | undefined {
  const validation = widget.props['validation'];
  if (!isRecord(validation)) return undefined;
  const message = validation['message'];
  if (typeof message !== 'string' || message.length === 0) return undefined;
  const tone = optionalValidationTone(validation['tone']);
  return {
    message: clean(message),
    ...(tone === undefined ? {} : { tone })
  };
}

function validationToneForSurface(tone: ComponentValidationTone): 'info' | 'warning' | 'error' {
  return tone;
}

function valueWindowSpans(widget: RenderNode, model: CommandInputModel): readonly RenderSpan[] {
  const selection = windowSelection(selectionFromUnknown(model.value, widget.props['selection']), model.window.startOffset, model.window.endOffset);
  const spans = selectedTextSpans(
    model.window.text,
    selection,
    renderNodeStyle(widget, 'value'),
    renderNodeStyle(widget, 'value', 'selected'),
    {
      normalSource: commandSource(widget, 'value', { partKind: 'value' }),
      selectedSource: commandSource(widget, 'selection', { partKind: 'selection', state: 'selected' })
    }
  );
  if (model.offsetCells <= 0) return spans;
  return [
    styledSpan('‹', renderNodeStyle(widget, 'placeholder'), commandSource(widget, 'window.left', { role: 'decoration', partKind: 'window' })),
    ...clipRenderSpans(spans, Math.max(0, model.contentWidth - 1))
  ];
}

function windowSelection(selection: TextSelection | undefined, start: number, end: number): TextSelection | undefined {
  if (selection === undefined) return undefined;
  const nextStart = Math.max(start, selection.start);
  const nextEnd = Math.min(end, selection.end);
  if (nextStart >= nextEnd) return undefined;
  return {
    start: nextStart - start,
    end: nextEnd - start
  };
}

function commandSource(
  widget: RenderNode,
  label: string,
  options: {
    readonly role?: FrameCellSource['role'];
    readonly partKind?: CommandPartKind;
    readonly state?: string;
  } = {}
): FrameCellSource {
  return renderNodeFrameSource(widget, {
    family: 'command',
    role: options.role ?? 'text',
    part: label,
    ...(options.partKind === undefined ? {} : { partKind: options.partKind }),
    ...(options.state === undefined ? {} : { state: options.state }),
    label
  });
}

function commandSourceOptions(
  partKind: CommandPartKind,
  state?: string,
  role?: FrameCellSource['role']
): {
  readonly role?: FrameCellSource['role'];
  readonly partKind: CommandPartKind;
  readonly state?: string;
} {
  return {
    ...(role === undefined ? {} : { role }),
    partKind,
    ...(state === undefined ? {} : { state })
  };
}

function footerReserve(widget: RenderNode): number {
  return footerText(widget).length === 0 ? 0 : 1;
}

function commandBarDisplay(widget: RenderNode): CommandBarDisplay {
  return widget.props['display'] === 'expanded' ? 'expanded' : 'compact';
}

function matchQuery(widget: RenderNode): string {
  const explicit = clean(stringify(widget.props['matchQuery'])).trim();
  return explicit.length === 0 ? valueText(widget).trim() : explicit;
}

function promptText(widget: RenderNode): string {
  return clean(stringify(widget.props['prompt']) || '> ');
}

function valueText(widget: RenderNode): string {
  return clean(stringify(widget.props['value']));
}

function placeholderText(widget: RenderNode): string {
  return clean(stringify(widget.props['placeholder']));
}

function completionText(widget: RenderNode): string {
  return clean(stringify(widget.props['completionPreview']));
}

function footerText(widget: RenderNode): string {
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
