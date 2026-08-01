import type { RenderNodeOfKind } from '../model/index.ts';
import { finiteNonNegativeIntegerOrZero, isNonArrayObject } from '../../foundation/validation.ts';
import { sanitizeTerminalText } from '../../text/index.ts';
import {
  commandMatchSpans, commandMetadataStyle, commandRowStyle, commandSelectionMarkerSpans, commandStatusSpans, styledSpan
} from './command-visual.ts';
import { numberProp, stringify } from './render-node-props.ts';
import { isFrameCellInteractionState, renderNodeFrameSource } from '../../visual/source.ts';
import { selectedTextSpans, selectionFromUnknown, singleLineCursorColumn, visibleLineWindow } from './text-display.ts';
import { textOffsetAtVisualColumn } from './text-pointer.ts';
import { inputCursorStyle, mergeStyles, resolveRenderNodeStyle, themeStyle, renderNodeStyle } from '../style-resolution.ts';
import type { AccessibleNode } from '../../accessibility/index.ts';
import type { TerminalTheme } from '../../theme/index.ts';
import type { TextSelection, TextWidthProfile } from '../../text/index.ts';
import type { SuggestionItem } from '../../ui-model/contracts.ts';
import type { CommandInputDisplay, CommandInputValidation } from '../../ui-model/documents.ts';
import type { CursorPosition } from '../contracts.ts';
import type { Rect } from '../contracts.ts';
import type { RoutedPointerEvent } from '../../input/pointer.ts';
import type { HitTarget } from '../contracts.ts';
import { interactionVisualState, renderNodeTargetId } from './pointer-interaction.ts';
import { clipRenderSpans, measureRenderSpans, padRenderLine } from '../../visual/render.ts';
import type { FrameCellSource, RenderBlock, RenderLine, RenderSpan } from '../../visual/render.ts';
import { placeAnchoredSurface } from '../../interaction/anchored-surface.ts';
import { terminalTextWidth } from '../../text/index.ts';
import type { LayoutNode } from '../contracts.ts';
import { ignoreMessage } from '../../interaction/message.ts';

type CommandPartKind =
  | 'completion'
  | 'cursor'
  | 'description'
  | 'footer'
  | 'history'
  | 'label'
  | 'marker'
  | 'match'
  | 'padding'
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
  widthProfile: TextWidthProfile,
  focused = false
): RenderBlock {
  const content = commandInputContentBlock(renderNode, bounds, theme, widthProfile, focused);
  if (commandInputDisplay(renderNode) === 'expanded' || content.lines.length >= bounds.height) return content;
  const offset = commandInputContentRowOffset(renderNode, bounds.height);
  const padding = inputPaddingLine(renderNode, bounds.width, widthProfile, focused);
  return {
    lines: Array.from({ length: Math.max(0, Math.floor(bounds.height)) }, (_value, index) =>
      content.lines[index - offset] ?? padding)
  };
}

export function commandInputMeasurementBlock(
  renderNode: CommandInputNode,
  bounds: Pick<Rect, 'width' | 'height'>,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): RenderBlock {
  return commandInputContentBlock(renderNode, bounds, theme, widthProfile, false);
}

function commandInputContentBlock(
  renderNode: CommandInputNode,
  bounds: Pick<Rect, 'width' | 'height'>,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  focused: boolean
): RenderBlock {
  const display = commandInputDisplay(renderNode);
  const lines: RenderLine[] = [inputLine(renderNode, bounds.width, widthProfile, focused)];
  const validation = validationProp(renderNode);
  if (bounds.height > lines.length && validation !== undefined) lines.push(validationLine(renderNode, validation, theme));
  if (display === 'expanded') {
    const suggestions = commandInputSuggestions(renderNode);
    const selected = finiteNonNegativeIntegerOrZero(numberProp(renderNode, 'selectedSuggestionIndex'));
    const remaining = Math.max(0, bounds.height - lines.length - footerReserve(renderNode));
    lines.push(...suggestions.slice(0, remaining).map((suggestion, index) => suggestionLine(
      renderNode,
      suggestion,
      index,
      index === selected,
      matchQuery(renderNode),
      theme,
      bounds.width,
      widthProfile
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
  const suggestions = commandInputDisplay(renderNode) === 'compact' ? [] : commandInputSuggestions(renderNode);
  const validation = validationProp(renderNode);
  const children: AccessibleNode[] = [];
  if (validation !== undefined) {
    children.push({
      id: `${renderNode.id ?? 'command-input'}:validation`,
      role: 'status',
      label: validation.level ?? 'validation',
      value: validation.message
    });
  }
  const selected = finiteNonNegativeIntegerOrZero(numberProp(renderNode, 'selectedSuggestionIndex'));
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
    row: bounds.row + commandInputContentRowOffset(renderNode, bounds.height),
    column: bounds.column + Math.max(
      0,
      Math.min(bounds.width - 1, model.promptCells + model.cursorColumn)
    ),
    style: inputCursorStyle(),
    source: commandSource(renderNode, 'cursor', { role: 'cursor', partType: 'cursor' })
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
      message: () => toMessage({ kind: 'selectSuggestion', suggestionIndex: index }),
      cursor: 'pointer'
    }];
  });
}

export function commandInputPopupBounds(
  renderNode: CommandInputNode,
  bounds: Rect,
  viewport: Rect,
  widthProfile: TextWidthProfile
): readonly Rect[] {
  if (!commandInputUsesPopup(renderNode) || (renderNode.children?.length ?? 0) === 0) return [];
  const suggestions = commandInputSuggestions(renderNode);
  const visibleRows = Math.min(suggestions.length, renderNode.props.maxVisibleSuggestions);
  const contentWidth = suggestions.reduce((width, suggestion) => Math.max(
    width,
    terminalTextWidth(
      suggestion.description === undefined
        ? suggestion.label ?? suggestion.value
        : `${suggestion.label ?? suggestion.value} · ${suggestion.description}`,
      { widthProfile }
    )
  ), 0);
  return [placeAnchoredSurface({
    viewport,
    anchor: {
      kind: 'target',
      bounds
    },
    size: {
      width: Math.max(bounds.width, contentWidth + 4),
      height: visibleRows + 2
    },
    ...(renderNode.props.placement === undefined ? {} : { placement: renderNode.props.placement }),
    margin: 0
  })];
}

export function commandInputPopupHitTargets<TMessage>(
  renderNode: CommandInputNode<TMessage>,
  layout: LayoutNode
): readonly HitTarget<TMessage>[] {
  const toMessage = renderNode.props.toActionMessage;
  if (!commandInputUsesPopup(renderNode) || toMessage === undefined) return [];
  const popupBounds = layout.children[0]?.bounds;
  return [
    {
      id: renderNodeTargetId(renderNode, 'outside'),
      bounds: layout.viewport,
      accepts: ['click'],
      message: () => toMessage({ kind: 'dismissSuggestions' }),
      zIndex: 18
    },
    ...(popupBounds === undefined ? [] : [{
      id: renderNodeTargetId(renderNode, 'popup'),
      bounds: popupBounds,
      accepts: ['click'] as const,
      message: ignoreMessage,
      zIndex: 19
    }])
  ];
}

export function commandInputUsesPopup(renderNode: CommandInputNode): boolean {
  return commandInputDisplay(renderNode) === 'popup' && commandInputSuggestions(renderNode).length > 0;
}

function inputLine(
  renderNode: CommandInputNode,
  width: number,
  widthProfile: TextWidthProfile,
  focused: boolean
): RenderLine {
  const model = commandInputModel(renderNode, width, widthProfile);
  const placeholder = placeholderText(renderNode);
  const completion = completionText(renderNode);
  const fieldStyle = commandInputFieldStyle(renderNode, focused);
  const spans: RenderSpan[] = [
    styledSpan(model.prompt, commandPromptStyle(renderNode), commandSource(renderNode, 'prompt', { role: 'decoration', partType: 'prompt' })),
    ...(model.value.length === 0 && placeholder.length > 0
      ? clipRenderSpans([styledSpan(placeholder, renderNodeStyle(renderNode, 'placeholder'), commandSource(renderNode, 'placeholder', { partType: 'placeholder' }))], model.contentWidth, { widthProfile })
      : valueWindowSpans(renderNode, model, widthProfile))
  ];
  const visibleCells = measureRenderSpans(spans, { widthProfile }) - model.promptCells;
  const completionWidth = Math.max(0, model.contentWidth - visibleCells);
  if (model.value.length > 0 && completion.length > 0 && model.window.endOffset >= model.value.length && completionWidth > 0) {
    spans.push(...clipRenderSpans([
      styledSpan(completion, resolveRenderNodeStyle(renderNode, {
        part: 'completion',
        base: themeStyle('input.placeholder', { dim: true })
      }), commandSource(renderNode, 'completion', { partType: 'completion' }))
    ], completionWidth, { widthProfile }));
  }
  const historyIndex = numberProp(renderNode, 'historyIndex');
  if (historyIndex !== undefined) {
    spans.push(styledSpan(
      `  #${String(Math.max(0, Math.floor(historyIndex)) + 1)}`,
      renderNodeStyle(renderNode, 'placeholder'),
      commandSource(renderNode, 'history', { partType: 'history' })
    ));
  }
  const styled = spans.map((current): RenderSpan => {
    const style = mergeStyles(fieldStyle, current.style);
    return {
      ...current,
      ...(style === undefined ? {} : { style })
    };
  });
  return padRenderLine({ spans: styled }, Math.max(0, width), {
    widthProfile,
    fill: {
      text: ' ',
      ...(fieldStyle === undefined ? {} : { style: fieldStyle }),
      source: commandSource(renderNode, 'window', { role: 'decoration', partType: 'window' })
    }
  });
}

function inputPaddingLine(
  renderNode: CommandInputNode,
  width: number,
  widthProfile: TextWidthProfile,
  focused: boolean
): RenderLine {
  const fieldStyle = commandInputFieldStyle(renderNode, focused);
  return padRenderLine({ spans: [] }, Math.max(0, width), {
    widthProfile,
    fill: {
      text: ' ',
      ...(fieldStyle === undefined ? {} : { style: fieldStyle }),
      source: commandSource(renderNode, 'padding', { role: 'decoration', partType: 'padding' })
    }
  });
}

function commandInputFieldStyle(
  renderNode: CommandInputNode,
  focused: boolean
): ReturnType<typeof resolveRenderNodeStyle> {
  return resolveRenderNodeStyle(renderNode, {
    part: 'value',
    base: {
      fg: { kind: 'theme', token: 'control.foreground' },
      bg: { kind: 'theme', token: 'control.background' }
    },
    ...(focused ? { state: 'focused' } : {})
  });
}

function commandInputContentRowOffset(renderNode: CommandInputNode, height: number): number {
  if (commandInputDisplay(renderNode) === 'expanded') return 0;
  const contentHeight = 1 + (validationProp(renderNode) === undefined ? 0 : 1);
  return Math.floor(Math.max(0, Math.floor(height) - contentHeight) / 2);
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
    spans: commandStatusSpans(renderNode, theme, validation.level ?? 'error', validation.message, {
      markerSource: commandSource(renderNode, 'validation.marker', { role: 'decoration', partType: 'marker' }),
      textSource: commandSource(renderNode, 'validation', { partType: 'validation' })
    })
  };
}

function suggestionLine(
  renderNode: CommandInputNode,
  suggestion: SuggestionItem,
  index: number,
  selected: boolean,
  query: string,
  theme: TerminalTheme,
  width: number,
  widthProfile: TextWidthProfile
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
  return padRenderLine({
    spans: clipRenderSpans(spans, width, { ellipsis: '…', widthProfile })
  }, width, {
    widthProfile,
    fill: styledSpan(
      ' ',
      rowStyle,
      commandSource(
        renderNode,
        `suggestion.${String(index)}.padding`,
        commandSourceOptions('padding', state, 'decoration')
      )
    )
  });
}

function commandSuggestionTargetId(renderNode: CommandInputNode, index: number): string {
  return renderNodeTargetId(renderNode, 'suggestion', String(index));
}

function mutedLine(renderNode: CommandInputNode, text: string, theme: TerminalTheme): RenderLine {
  return {
    spans: commandStatusSpans(renderNode, theme, 'muted', text, {
      markerSource: commandSource(renderNode, 'footer.marker', { role: 'decoration', partType: 'marker' }),
      textSource: commandSource(renderNode, 'footer', { partType: 'footer' })
    })
  };
}

function commandInputSuggestions(renderNode: CommandInputNode): readonly SuggestionItem[] {
  const suggestions = renderNode.props.suggestions;
  return Array.isArray(suggestions)
    ? suggestions.flatMap((suggestion): SuggestionItem[] => {
        if (!isNonArrayObject(suggestion)) return [];
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
  return renderNode.props.validation;
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
      normalSource: commandSource(renderNode, 'value', { partType: 'value' }),
      selectedSource: commandSource(renderNode, 'selection', { partType: 'selection', state: 'selected' })
    }
  );
  if (model.offsetCells <= 0) return spans;
  return [
    styledSpan('‹', renderNodeStyle(renderNode, 'placeholder'), commandSource(renderNode, 'window.left', { role: 'decoration', partType: 'window' })),
    ...clipRenderSpans(spans, Math.max(0, model.contentWidth - 1), { widthProfile })
  ];
}

function windowSelection(selection: TextSelection | undefined, start: number, end: number): TextSelection | undefined {
  if (selection === undefined) return undefined;
  const nextStart = Math.max(start, selection.startOffset);
  const nextEnd = Math.min(end, selection.endOffsetExclusive);
  if (nextStart >= nextEnd) return undefined;
  return {
    startOffset: nextStart - start,
    endOffsetExclusive: nextEnd - start
  };
}

function commandSource(
  renderNode: CommandInputNode,
  description: string,
  options: {
    readonly role?: FrameCellSource['cellRole'];
    readonly partType?: CommandPartKind;
    readonly state?: import('../../element/metadata.ts').ElementVisualState;
  } = {}
): FrameCellSource {
  return renderNodeFrameSource(renderNode, {
    rendererFamily: 'command',
    cellRole: options.role ?? 'text',
    partName: description,
    ...(options.partType === undefined ? {} : { partType: options.partType }),
    ...(isFrameCellInteractionState(options.state)
      ? { interactionState: options.state }
      : {}),
    description
  });
}

function commandSourceOptions(
  partType: CommandPartKind,
  state?: import('../../element/metadata.ts').ElementVisualState,
  role?: FrameCellSource['cellRole']
): {
  readonly role?: FrameCellSource['cellRole'];
  readonly partType: CommandPartKind;
  readonly state?: import('../../element/metadata.ts').ElementVisualState;
} {
  return {
    ...(role === undefined ? {} : { role }),
    partType,
    ...(state === undefined ? {} : { state })
  };
}

function footerReserve(renderNode: CommandInputNode): number {
  return footerText(renderNode).length === 0 ? 0 : 1;
}

function commandInputDisplay(renderNode: CommandInputNode): CommandInputDisplay {
  return renderNode.props.display === 'expanded' || renderNode.props.display === 'popup'
    ? renderNode.props.display
    : 'compact';
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

type CommandInputNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'commandInput'>;
