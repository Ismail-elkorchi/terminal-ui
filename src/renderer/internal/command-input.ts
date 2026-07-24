import type { RenderNodeOfKind } from '../model/index.ts';
import { sanitizeTerminalText } from '../../text/index.ts';
import {
  commandMatchSpans, commandMetadataStyle, commandRowStyle, commandSelectionMarkerSpans, commandStatusSpans, styledSpan
} from './command-visual.ts';
import { numberProp, stringify } from './render-node-props.ts';
import { isFrameCellInteractionState, renderNodeFrameSource } from '../../visual/source.ts';
import { selectedTextSpans, selectionFromUnknown, singleLineCursorColumn, visibleLineWindow } from './text-display.ts';
import { textOffsetAtVisualColumn } from './text-pointer.ts';
import { inputCursorStyle, mergeStyles, resolveRenderNodeStyle, themeStyle, renderNodeStyle } from './render-node-style.ts';
import type { AccessibleNode } from '../../accessibility/index.ts';
import type { TerminalTheme } from '../../theme/index.ts';
import type { TextSelection, TextWidthProfile } from '../../text/index.ts';
import type { SuggestionItem, ComponentValidationTone } from '../../ui-model/contracts.ts';
import { optionalValidationTone } from '../../ui-model/status.ts';
import type { CommandInputDisplay, CommandInputValidation } from '../../ui-model/documents.ts';
import type { CursorPosition } from '../model/cursor.ts';
import type { Rect } from '../model/layout.ts';
import type { RoutedPointerEvent } from '../../input/pointer.ts';
import type { HitTarget } from '../model/renderer.ts';
import { interactionVisualState, renderNodeTargetId } from './pointer-presentation.ts';
import { clipRenderSpans, measureRenderSpans } from '../../visual/render.ts';
import type { FrameCellSource, RenderBlock, RenderLine, RenderSpan } from '../../visual/render.ts';

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

export function commandInputBlock(
  renderNode: CommandInputNode,
  bounds: Pick<Rect, 'width' | 'height'>,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): RenderBlock {
  const display = commandInputDisplay(renderNode);
  const lines: RenderLine[] = [inputLine(renderNode, bounds.width, widthProfile)];
  const validation = validationProp(renderNode);
  if (bounds.height > lines.length && validation !== undefined) lines.push(validationLine(renderNode, validation, theme));
  if (display === 'expanded') {
    const suggestions = commandInputSuggestions(renderNode);
    const selected = nonNegativeInteger(numberProp(renderNode, 'selectedSuggestion'));
    const remaining = Math.max(0, bounds.height - lines.length - footerReserve(renderNode));
    lines.push(...suggestions.slice(0, remaining).map((suggestion, index) => suggestionLine(
      renderNode,
      suggestion,
      index,
      index === selected,
      matchQuery(renderNode),
      theme
    )));
    const footer = footerText(renderNode);
    if (bounds.height > lines.length && footer.length > 0) lines.push(mutedLine(renderNode, footer, theme));
  }
  return { lines: lines.slice(0, bounds.height) };
}

export function commandInputText(
  renderNode: CommandInputNode,
  height: number,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): string {
  return commandInputBlock(renderNode, { width: 1_000, height }, theme, widthProfile).lines
    .map((line) => line.spans.map((span) => span.text).join('')).join('\n');
}

export function commandInputAccessibleChildren(renderNode: CommandInputNode): readonly AccessibleNode[] | undefined {
  const suggestions = commandInputDisplay(renderNode) === 'expanded' ? commandInputSuggestions(renderNode) : [];
  const validation = validationProp(renderNode);
  const children: AccessibleNode[] = [];
  if (validation !== undefined) {
    children.push({
      id: `${renderNode.id ?? 'command-input'}:validation`,
      role: 'status',
      label: validation.tone ?? 'validation',
      value: validation.message
    });
  }
  const selected = nonNegativeInteger(numberProp(renderNode, 'selectedSuggestion'));
  if (suggestions.length > 0) {
    const id = renderNode.id ?? 'command-input';
    children.push({
      id: `${id}:suggestions`,
      role: 'listbox',
      label: 'Suggestions',
      children: suggestions.map((suggestion, index) => ({
        id: `${id}:suggestion:${String(index)}`,
        role: 'option' as const,
        label: suggestion.label ?? suggestion.value,
        value: suggestion.value,
        selected: index === selected,
        disabled: suggestion.disabled === true
      }))
    });
  }
  return children.length === 0 ? undefined : children;
}

export function commandInputCursor(renderNode: CommandInputNode, bounds: Rect, widthProfile: TextWidthProfile): CursorPosition {
  const model = commandInputModel(renderNode, bounds.width, widthProfile);
  return {
    row: bounds.row,
    column: bounds.column + Math.max(0, Math.min(bounds.width - 1, model.promptCells + model.cursorColumn)),
    style: inputCursorStyle(),
    source: commandSource(renderNode, 'cursor', { role: 'cursor', partKind: 'cursor' })
  };
}

export function commandInputPointerOffset(
  renderNode: CommandInputNode,
  bounds: Pick<Rect, 'width'>,
  pointer: RoutedPointerEvent,
  widthProfile: TextWidthProfile
): number | undefined {
  if (pointer.localColumn === undefined) return undefined;
  const model = commandInputModel(renderNode, bounds.width, widthProfile);
  const contentColumn = pointer.localColumn - 1 - model.promptCells;
  return textOffsetAtVisualColumn(
    model.value,
    model.offsetCells + Math.max(0, contentColumn),
    { widthProfile }
  );
}

export function commandInputSuggestionHitTargets<TMessage>(
  renderNode: CommandInputNode<TMessage>,
  bounds: Rect
): readonly HitTarget<TMessage>[] {
  if (commandInputDisplay(renderNode) !== 'expanded') return [];
  const toMessage = renderNode.props.toActionMessage;
  if (toMessage === undefined) return [];
  const validationRows = validationProp(renderNode) === undefined ? 0 : 1;
  const available = Math.max(0, bounds.height - 1 - validationRows - footerReserve(renderNode));
  return commandInputSuggestions(renderNode).slice(0, available).flatMap((suggestion, index): readonly HitTarget<TMessage>[] => {
    if (suggestion.disabled === true) return [];
    return [{
      id: commandSuggestionTargetId(renderNode, index),
      bounds: {
        row: bounds.row + 1 + validationRows + index,
        column: bounds.column,
        width: bounds.width,
        height: 1
      },
      message: () => toMessage({ kind: 'selectSuggestion', index }),
      cursor: 'pointer'
    }];
  });
}

function inputLine(renderNode: CommandInputNode, width: number, widthProfile: TextWidthProfile): RenderLine {
  const model = commandInputModel(renderNode, width, widthProfile);
  const placeholder = placeholderText(renderNode);
  const completion = completionText(renderNode);
  const spans: RenderSpan[] = [
    styledSpan(model.prompt, commandPromptStyle(renderNode), commandSource(renderNode, 'prompt', { role: 'decoration', partKind: 'prompt' })),
    ...(model.value.length === 0 && placeholder.length > 0
      ? clipRenderSpans([styledSpan(placeholder, renderNodeStyle(renderNode, 'placeholder'), commandSource(renderNode, 'placeholder', { partKind: 'placeholder' }))], model.contentWidth, { widthProfile })
      : valueWindowSpans(renderNode, model, widthProfile))
  ];
  const visibleCells = measureRenderSpans(spans, { widthProfile }) - model.promptCells;
  const completionWidth = Math.max(0, model.contentWidth - visibleCells);
  if (model.value.length > 0 && completion.length > 0 && model.window.endOffset >= model.value.length && completionWidth > 0) {
    spans.push(...clipRenderSpans([
      styledSpan(completion, resolveRenderNodeStyle(renderNode, {
        part: 'completion',
        base: themeStyle('input.placeholder', { dim: true })
      }), commandSource(renderNode, 'completion', { partKind: 'completion' }))
    ], completionWidth, { widthProfile }));
  }
  const historyIndex = numberProp(renderNode, 'historyIndex');
  if (historyIndex !== undefined) {
    spans.push(styledSpan(
      `  #${String(Math.max(0, Math.floor(historyIndex)) + 1)}`,
      renderNodeStyle(renderNode, 'placeholder'),
      commandSource(renderNode, 'history', { partKind: 'history' })
    ));
  }
  return {
    spans
  };
}

function commandPromptStyle(renderNode: CommandInputNode): ReturnType<typeof renderNodeStyle> {
  return mergeStyles(themeStyle('command.prompt'), renderNode.styles?.parts?.['prompt']);
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

function commandInputModel(renderNode: CommandInputNode, width: number, widthProfile: TextWidthProfile): CommandInputModel {
  const prompt = promptText(renderNode);
  const value = valueText(renderNode);
  const promptCells = singleLineCursorColumn(prompt, prompt.length, { widthProfile });
  const contentWidth = Math.max(0, Math.floor(width) - promptCells);
  const cursorCells = singleLineCursorColumn(value, numberProp(renderNode, 'cursor'), { widthProfile });
  const offsetCells = Math.max(0, cursorCells - Math.max(0, contentWidth - 1));
  const window = visibleLineWindow(value, offsetCells, contentWidth, { widthProfile });
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

function validationLine(renderNode: CommandInputNode, validation: CommandInputValidation, theme: TerminalTheme): RenderLine {
  return {
    spans: commandStatusSpans(renderNode, theme, validationToneForSurface(validation.tone ?? 'error'), validation.message, {
      markerSource: commandSource(renderNode, 'validation.marker', { role: 'decoration', partKind: 'marker' }),
      textSource: commandSource(renderNode, 'validation', { partKind: 'validation' })
    })
  };
}

function suggestionLine(
  renderNode: CommandInputNode,
  suggestion: SuggestionItem,
  index: number,
  selected: boolean,
  query: string,
  theme: TerminalTheme
): RenderLine {
  const label = suggestion.label ?? suggestion.value;
  const description = suggestion.description;
  const disabled = suggestion.disabled === true;
  const state = interactionVisualState(renderNode, commandSuggestionTargetId(renderNode, index), {
    disabled,
    selected
  });
  const rowStyle = commandRowStyle(renderNode, state);
  const spans: RenderSpan[] = [
    ...commandSelectionMarkerSpans(renderNode, theme, selected, state, commandSource(renderNode, `suggestion.${String(index)}.marker`, commandSourceOptions('marker', state, 'decoration'))),
    ...commandMatchSpans(label, query, rowStyle, {
      source: commandSource(renderNode, `suggestion.${String(index)}.label`, commandSourceOptions('label', state)),
      matchSource: commandSource(renderNode, `suggestion.${String(index)}.match`, commandSourceOptions('match', state))
    })
  ];
  if (description !== undefined && description.length > 0) {
    spans.push(styledSpan(
      ` · ${description}`,
      commandMetadataStyle(renderNode, state),
      commandSource(renderNode, `suggestion.${String(index)}.description`, commandSourceOptions('description', state))
    ));
  }
  return {
    spans
  };
}

function commandSuggestionTargetId(renderNode: CommandInputNode, index: number): string {
  return renderNodeTargetId(renderNode, 'suggestion', String(index));
}

function mutedLine(renderNode: CommandInputNode, text: string, theme: TerminalTheme): RenderLine {
  return {
    spans: commandStatusSpans(renderNode, theme, 'muted', text, {
      markerSource: commandSource(renderNode, 'footer.marker', { role: 'decoration', partKind: 'marker' }),
      textSource: commandSource(renderNode, 'footer', { partKind: 'footer' })
    })
  };
}

function commandInputSuggestions(renderNode: CommandInputNode): readonly SuggestionItem[] {
  const suggestions = renderNode.props.suggestions;
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

function validationProp(renderNode: CommandInputNode): CommandInputValidation | undefined {
  const validation = renderNode.props.validation;
  if (!isRecord(validation)) return undefined;
  const message = validation.message;
  if (typeof message !== 'string' || message.length === 0) return undefined;
  const tone = optionalValidationTone(validation.tone);
  return {
    message: clean(message),
    ...(tone === undefined ? {} : { tone })
  };
}

function validationToneForSurface(tone: ComponentValidationTone): 'info' | 'warning' | 'error' {
  return tone;
}

function valueWindowSpans(
  renderNode: CommandInputNode,
  model: CommandInputModel,
  widthProfile: TextWidthProfile
): readonly RenderSpan[] {
  const selection = windowSelection(selectionFromUnknown(model.value, renderNode.props.selection), model.window.startOffset, model.window.endOffset);
  const spans = selectedTextSpans(
    model.window.text,
    selection,
    renderNodeStyle(renderNode, 'value'),
    renderNodeStyle(renderNode, 'value', 'selected'),
    {
      normalSource: commandSource(renderNode, 'value', { partKind: 'value' }),
      selectedSource: commandSource(renderNode, 'selection', { partKind: 'selection', state: 'selected' })
    }
  );
  if (model.offsetCells <= 0) return spans;
  return [
    styledSpan('‹', renderNodeStyle(renderNode, 'placeholder'), commandSource(renderNode, 'window.left', { role: 'decoration', partKind: 'window' })),
    ...clipRenderSpans(spans, Math.max(0, model.contentWidth - 1), { widthProfile })
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
  renderNode: CommandInputNode,
  label: string,
  options: {
    readonly role?: FrameCellSource['role'];
    readonly partKind?: CommandPartKind;
    readonly state?: import('../../element/metadata.ts').ElementVisualState;
  } = {}
): FrameCellSource {
  return renderNodeFrameSource(renderNode, {
    family: 'command',
    role: options.role ?? 'text',
    part: label,
    ...(options.partKind === undefined ? {} : { partKind: options.partKind }),
    ...(isFrameCellInteractionState(options.state) ? { state: options.state } : {}),
    label
  });
}

function commandSourceOptions(
  partKind: CommandPartKind,
  state?: import('../../element/metadata.ts').ElementVisualState,
  role?: FrameCellSource['role']
): {
  readonly role?: FrameCellSource['role'];
  readonly partKind: CommandPartKind;
  readonly state?: import('../../element/metadata.ts').ElementVisualState;
} {
  return {
    ...(role === undefined ? {} : { role }),
    partKind,
    ...(state === undefined ? {} : { state })
  };
}

function footerReserve(renderNode: CommandInputNode): number {
  return footerText(renderNode).length === 0 ? 0 : 1;
}

function commandInputDisplay(renderNode: CommandInputNode): CommandInputDisplay {
  return renderNode.props.display === 'expanded' ? 'expanded' : 'compact';
}

function matchQuery(renderNode: CommandInputNode): string {
  const explicit = clean(stringify(renderNode.props.matchQuery)).trim();
  return explicit.length === 0 ? valueText(renderNode).trim() : explicit;
}

function promptText(renderNode: CommandInputNode): string {
  return clean(stringify(renderNode.props.prompt) || '> ');
}

function valueText(renderNode: CommandInputNode): string {
  return clean(stringify(renderNode.props.value));
}

function placeholderText(renderNode: CommandInputNode): string {
  return clean(stringify(renderNode.props.placeholder));
}

function completionText(renderNode: CommandInputNode): string {
  return clean(stringify(renderNode.props.completionPreview));
}

function footerText(renderNode: CommandInputNode): string {
  return clean(stringify(renderNode.props.footer));
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
type CommandInputNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'commandInput'>;
