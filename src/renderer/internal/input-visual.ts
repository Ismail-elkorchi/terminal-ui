import { clipTextCells, sanitizeTerminalText, terminalTextWidth } from '../../text/index.ts';
import { isNonArrayObject } from '../../foundation/validation.ts';
import { block, line, span } from './frame.ts';
import { formSource, type FormVisualKind } from './form-visual.ts';
import { selectedTextSpans, selectionFromUnknown, singleLineCursorColumn, visibleLineWindow } from './text-display.ts';
import { textOffsetAtVisualColumn } from './text-pointer.ts';
import { inputCursorStyle, mergeStyles, resolveRenderNodeStyle, renderNodeStyle, themeStyle } from './render-node-style.ts';
import type { TextAreaHighlight } from '../../ui-model/content.ts';
import type { TextSelection, TextWidthProfile } from '../../text/index.ts';
import type { TerminalTheme } from '../../theme/index.ts';
import type { RenderNodeOfKind, RenderNodesOfKind } from '../model/index.ts';
import type { CursorPosition } from '../model/cursor.ts';
import type { FrameCellSource, RenderBlock, RenderLine, RenderSpan, TerminalStyle } from './frame.ts';
import type { Rect } from '../model/layout.ts';
import type { RoutedPointerEvent } from '../../input/pointer.ts';

type SingleLineInputNode = RenderNodesOfKind<unknown, 'numberInput' | 'textInput'>;
type TextAreaNode = RenderNodeOfKind<unknown, 'textArea'>;
type InputNode = SingleLineInputNode | TextAreaNode;

export interface SingleLineInputBlockInput {
  readonly renderNode: SingleLineInputNode;
  readonly bounds: Rect;
  readonly theme: TerminalTheme;
  readonly widthProfile: TextWidthProfile;
  readonly value: string;
  readonly cursor?: number;
  readonly selection?: TextSelection;
  readonly placeholder?: string;
  readonly focused?: boolean;
}

export interface TextAreaInputBlockInput {
  readonly renderNode: TextAreaNode;
  readonly bounds: Rect;
  readonly theme: TerminalTheme;
  readonly widthProfile: TextWidthProfile;
  readonly lineCount: number;
  readonly selection?: TextSelection;
  readonly usesPlaceholder?: boolean;
  readonly focused?: boolean;
  readonly activeLineIndex?: number;
}

export interface TextAreaVisualLine {
  readonly text: string;
  readonly start: number;
  readonly logicalLineIndex: number;
  readonly firstVisualLine: boolean;
}

interface NormalizedTextAreaHighlight {
  readonly start: number;
  readonly end: number;
  readonly label: string;
  readonly style?: TerminalStyle;
}

export function singleLineInputBlock(input: SingleLineInputBlockInput): RenderBlock {
  const model = singleLineInputModel(input);
  const contentSpans = selectedTextSpans(
    model.display,
    model.usesPlaceholder ? undefined : input.selection,
    model.contentStyle,
    renderNodeStyle(input.renderNode, 'selection', 'selected'),
    {
      normalSource: inputSource(input.renderNode, model.usesPlaceholder ? 'placeholder' : 'value'),
      selectedSource: inputSource(input.renderNode, 'selection')
    }
  );
  return block([line([
    styledSpan(model.prefix, model.frameStyle, inputSource(input.renderNode, 'frame', 'frame.prefix')),
    ...clipSpans(
      contentSpans,
      Math.max(0, input.bounds.width - model.prefixWidth - model.suffixWidth),
      input.widthProfile
    ),
    styledSpan(model.suffix, model.frameStyle, inputSource(input.renderNode, 'frame', 'frame.suffix'))
  ])]);
}

export function singleLineInputCursor(input: SingleLineInputBlockInput): CursorPosition {
  const model = singleLineInputModel({ ...input, focused: true });
  const contentWidth = Math.max(0, input.bounds.width - model.prefixWidth - model.suffixWidth);
  const style = cursorVisualStyle(input.renderNode);
  return {
    row: input.bounds.row,
    column: input.bounds.column + model.prefixWidth + singleLineCursorColumn(
      input.value,
      input.cursor,
      { widthProfile: input.widthProfile },
      Math.max(0, contentWidth - 1)
    ),
    ...(style === undefined ? {} : { style }),
    source: inputSource(input.renderNode, 'cursor')
  };
}

export function singleLineInputPointerOffset(
  input: SingleLineInputBlockInput,
  pointer: RoutedPointerEvent
): number | undefined {
  if (pointer.localColumn === undefined) return undefined;
  const model = singleLineInputModel(input);
  const contentColumn = pointer.localColumn - 1 - model.prefixWidth;
  return textOffsetAtVisualColumn(input.value, Math.max(0, contentColumn), { widthProfile: input.widthProfile });
}

export function textAreaInputLine(input: TextAreaInputBlockInput, lineInput: {
  readonly lineRecord: TextAreaVisualLine;
  readonly rowIndex: number;
  readonly lineIndex: number;
  readonly offsetColumn: number;
}): RenderLine {
  const active = input.activeLineIndex === lineInput.lineRecord.logicalLineIndex && textAreaActiveLineEnabled(input.renderNode);
  const prefix = textAreaLinePrefixSpans(
    input.renderNode,
    input.theme,
    input.focused === true,
    lineInput.rowIndex,
    lineInput.lineRecord.logicalLineIndex,
    input.lineCount,
    active,
    lineInput.lineRecord.firstVisualLine
  );
  const prefixWidth = spansWidth(prefix, input.widthProfile);
  const contentWidth = Math.max(0, input.bounds.width - prefixWidth);
  const window = visibleLineWindow(
    lineInput.lineRecord.text,
    lineInput.offsetColumn,
    contentWidth,
    { widthProfile: input.widthProfile }
  );
  const selectionInWindow = input.usesPlaceholder === true
    ? undefined
    : selectionIntersection(input.selection, lineInput.lineRecord.start + window.startOffset, lineInput.lineRecord.start + window.endOffset);
  const contentStyle = input.usesPlaceholder === true ? renderNodeStyle(input.renderNode, 'placeholder') : inputContentStyle(input.renderNode, input.focused === true, active);
  const contentSpans = textAreaContentSpans(input.renderNode, {
    text: window.text,
    absoluteStart: lineInput.lineRecord.start + window.startOffset,
    usesPlaceholder: input.usesPlaceholder === true,
    active,
    contentStyle,
    selectedStyle: renderNodeStyle(input.renderNode, 'selection', 'selected'),
    ...(selectionInWindow === undefined
      ? {}
      : {
          selection: {
            startOffset: selectionInWindow.startOffset - lineInput.lineRecord.start - window.startOffset,
            endOffsetExclusive: selectionInWindow.endOffsetExclusive
              - lineInput.lineRecord.start
              - window.startOffset
          }
        })
  });
  return line([
    ...prefix,
    ...contentSpans,
    ...textAreaActiveLineFill(input.renderNode, active, contentWidth, contentSpans, input.widthProfile)
  ]);
}

export function textAreaInputCursor(input: {
  readonly renderNode: TextAreaNode;
  readonly bounds: Rect;
  readonly theme: TerminalTheme;
  readonly widthProfile: TextWidthProfile;
  readonly rowOffset: number;
  readonly columnCells: number;
  readonly offsetColumn: number;
  readonly lineCount: number;
}): CursorPosition {
  const prefixWidth = textAreaInputPrefixWidth(input.renderNode, input.theme, input.widthProfile, input.lineCount);
  const style = cursorVisualStyle(input.renderNode);
  return {
    row: input.bounds.row + input.rowOffset,
    column: input.bounds.column + prefixWidth + Math.max(0, Math.min(
      Math.max(0, input.bounds.width - prefixWidth - 1),
      Math.max(0, input.columnCells - input.offsetColumn)
    )),
    ...(style === undefined ? {} : { style }),
    source: inputSource(input.renderNode, 'cursor')
  };
}

export function textAreaInputContentBounds(
  bounds: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  renderNode?: TextAreaNode,
  lineCount = 1
): Rect {
  const prefixWidth = renderNode === undefined
    ? terminalTextWidth(`${theme.tokens.symbols.borderSingle.vertical} `, { widthProfile })
    : textAreaInputPrefixWidth(renderNode, theme, widthProfile, lineCount);
  return {
    ...bounds,
    width: Math.max(0, bounds.width - prefixWidth)
  };
}

function singleLineInputModel(input: SingleLineInputBlockInput): {
  readonly display: string;
  readonly usesPlaceholder: boolean;
  readonly prefix: string;
  readonly suffix: string;
  readonly prefixWidth: number;
  readonly suffixWidth: number;
  readonly frameStyle: TerminalStyle | undefined;
  readonly contentStyle: TerminalStyle | undefined;
} {
  const value = cleanInputText(input.value);
  const placeholder = cleanInputText(input.placeholder ?? '');
  const usesPlaceholder = value.length === 0 && placeholder.length > 0;
  const prefix = `${inputStateMarker(input.renderNode, input.theme, input.focused === true)}[ `;
  const suffix = ' ]';
  return {
    display: usesPlaceholder ? placeholder : value,
    usesPlaceholder,
    prefix,
    suffix,
    prefixWidth: terminalTextWidth(prefix, { widthProfile: input.widthProfile }),
    suffixWidth: terminalTextWidth(suffix, { widthProfile: input.widthProfile }),
    frameStyle: inputBorderStyle(input.renderNode, input.focused === true),
    contentStyle: usesPlaceholder ? renderNodeStyle(input.renderNode, 'placeholder') : inputContentStyle(input.renderNode, input.focused === true)
  };
}

function textAreaLinePrefixSpans(
  renderNode: TextAreaNode,
  theme: TerminalTheme,
  focused: boolean,
  rowIndex: number,
  lineIndex: number,
  lineCount: number,
  active: boolean,
  firstVisualLine = true
): readonly RenderSpan[] {
  const marker = textAreaLineMarker(renderNode, theme, focused, rowIndex, active);
  const lineNumber = textAreaLineNumber(renderNode, lineIndex, lineCount, firstVisualLine);
  const markerStyle = textAreaMarkerStyle(renderNode, focused, active, rowIndex);
  const gutterStyle = textAreaGutterStyle(renderNode, active);
  if (lineNumber === undefined) {
    return [styledSpan(`${marker} `, markerStyle, inputSource(renderNode, active ? 'activeLine' : 'gutter', active ? 'activeLine.gutter' : 'gutter.prefix'))];
  }
  return [
    styledSpan(marker, markerStyle, inputSource(renderNode, active ? 'activeLine' : 'gutter', active ? 'activeLine.marker' : 'gutter.marker')),
    styledSpan(lineNumber, textAreaLineNumberStyle(renderNode, active), inputSource(renderNode, 'lineNumber', active ? 'activeLine.lineNumber' : 'lineNumber')),
    styledSpan(` ${theme.tokens.symbols.borderSingle.vertical} `, gutterStyle, inputSource(renderNode, 'gutter', active ? 'activeLine.gutter' : 'gutter.separator'))
  ];
}

function textAreaInputPrefixWidth(
  renderNode: TextAreaNode,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  lineCount: number
): number {
  return spansWidth(
    textAreaLinePrefixSpans(renderNode, theme, true, 0, Math.max(0, lineCount - 1), lineCount, false),
    widthProfile
  );
}

function textAreaLineMarker(renderNode: TextAreaNode, theme: TerminalTheme, focused: boolean, rowIndex: number, active: boolean): string {
  if (active) return focused ? theme.tokens.symbols.pointer : theme.tokens.symbols.selected;
  if (rowIndex === 0) return inputStateMarker(renderNode, theme, focused);
  return theme.tokens.symbols.borderSingle.vertical;
}

function inputStateMarker(renderNode: InputNode, theme: TerminalTheme, focused: boolean): string {
  if (renderNode.props.disabled === true) return '-';
  if (typeof renderNode.props.error === 'string' && renderNode.props.error.length > 0) return theme.tokens.symbols.statusError;
  return focused ? theme.tokens.symbols.pointer : theme.tokens.symbols.borderSingle.vertical;
}

function inputBorderStyle(renderNode: InputNode, focused: boolean): TerminalStyle | undefined {
  const state = renderNode.props.disabled === true
    ? 'disabled'
    : focused
      ? 'focused'
      : undefined;
  return mergeStyles(resolveRenderNodeStyle(renderNode, {
    part: 'border',
    base: { fg: { kind: 'theme', token: 'control.border' } },
    ...(state === undefined ? {} : { state })
  }), inputValidationStyle(renderNode));
}

function cursorVisualStyle(renderNode: InputNode): TerminalStyle | undefined {
  return mergeStyles(
    inputCursorStyle(),
    renderNode.styles?.parts?.['cursor'],
    renderNode.styles?.states?.focused
  );
}

function textAreaMarkerStyle(renderNode: TextAreaNode, focused: boolean, active: boolean, rowIndex: number): TerminalStyle | undefined {
  if (active) return textAreaActiveGutterStyle(renderNode);
  if (focused && rowIndex === 0) return inputBorderStyle(renderNode, true);
  return textAreaGutterStyle(renderNode, false);
}

function textAreaGutterStyle(renderNode: TextAreaNode, active: boolean): TerminalStyle | undefined {
  return active
    ? textAreaActiveGutterStyle(renderNode)
    : mergeStyles(
        {
          fg: { kind: 'theme', token: 'editor.gutter.foreground' },
          bg: { kind: 'theme', token: 'editor.gutter.background' }
        },
        renderNode.styles?.parts?.['gutter']
      );
}

function textAreaActiveGutterStyle(renderNode: TextAreaNode): TerminalStyle | undefined {
  return mergeStyles(
    {
      fg: { kind: 'theme', token: 'editor.gutter.active.foreground' },
      bg: { kind: 'theme', token: 'editor.activeLine.background' },
      bold: true
    },
    renderNode.styles?.parts?.['gutter']
  );
}

function textAreaLineNumberStyle(renderNode: TextAreaNode, active: boolean): TerminalStyle | undefined {
  return active
    ? mergeStyles(
        {
          fg: { kind: 'theme', token: 'editor.gutter.active.foreground' },
          bg: { kind: 'theme', token: 'editor.activeLine.background' },
          bold: true
        },
        renderNode.styles?.parts?.['lineNumber']
      )
    : mergeStyles(
        {
          fg: { kind: 'theme', token: 'editor.gutter.foreground' },
          bg: { kind: 'theme', token: 'editor.gutter.background' }
        },
        renderNode.styles?.parts?.['lineNumber']
      );
}

function inputContentStyle(renderNode: InputNode, focused: boolean, active = false): TerminalStyle | undefined {
  if (renderNode.props.disabled === true) return renderNodeStyle(renderNode, 'value', 'disabled');
  return mergeStyles(
    renderNodeStyle(renderNode, 'value'),
    focused ? renderNode.styles?.states?.focused : undefined,
    active && renderNode.kind === 'textArea' ? textAreaActiveLineTextStyle(renderNode) : undefined,
    inputValidationStyle(renderNode)
  );
}

function inputValidationStyle(renderNode: InputNode): TerminalStyle | undefined {
  return typeof renderNode.props.error === 'string' && renderNode.props.error.length > 0
    ? mergeStyles(themeStyle('status.error', { bold: true }), renderNode.styles?.parts?.['error'])
    : undefined;
}

function textAreaActiveLineTextStyle(renderNode: TextAreaNode): TerminalStyle | undefined {
  return mergeStyles(
    { bg: { kind: 'theme', token: 'editor.activeLine.background' } },
    renderNode.styles?.parts?.['activeLine']
  );
}

function textAreaContentSpans(
  renderNode: TextAreaNode,
  input: {
    readonly text: string;
    readonly absoluteStart: number;
    readonly usesPlaceholder: boolean;
    readonly active: boolean;
    readonly contentStyle: TerminalStyle | undefined;
    readonly selectedStyle: TerminalStyle | undefined;
    readonly selection?: TextSelection;
  }
): readonly RenderSpan[] {
  if (input.text.length === 0) return [];
  const absoluteEnd = input.absoluteStart + input.text.length;
  const highlights = input.usesPlaceholder ? [] : textAreaHighlights(renderNode, input.absoluteStart, absoluteEnd);
  if (input.selection === undefined && highlights.length === 0) {
    return selectedTextSpans(input.text, undefined, input.contentStyle, input.selectedStyle, {
      normalSource: textAreaContentSource(renderNode, input.usesPlaceholder, input.active),
      selectedSource: inputSource(renderNode, 'selection')
    });
  }

  const cuts = normalizedTextCuts(input.text.length, input.selection, highlights);
  return cuts.flatMap((start, index) => {
    const end = cuts[index + 1];
    if (end === undefined || end <= start) return [];
    const text = input.text.slice(start, end);
    const selected = input.selection !== undefined
      && start >= input.selection.startOffset
      && end <= input.selection.endOffsetExclusive;
    if (selected) {
      return [span(text, {
        ...(input.selectedStyle === undefined ? {} : { style: input.selectedStyle }),
        source: inputSource(renderNode, 'selection')
      })];
    }
    const highlight = highlights.find((current) => start >= current.start && end <= current.end);
    if (highlight !== undefined) {
      const style = mergeStyles(input.contentStyle, defaultHighlightStyle(), highlight.style);
      return [span(text, {
        ...(style === undefined ? {} : { style }),
        source: inputSource(renderNode, 'highlight', highlight.label)
      })];
    }
    return [span(text, {
      ...(input.contentStyle === undefined ? {} : { style: input.contentStyle }),
      source: textAreaContentSource(renderNode, input.usesPlaceholder, input.active)
    })];
  });
}

function textAreaActiveLineFill(
  renderNode: TextAreaNode,
  active: boolean,
  contentWidth: number,
  contentSpans: readonly RenderSpan[],
  widthProfile: TextWidthProfile
): readonly RenderSpan[] {
  if (!active) return [];
  const remaining = Math.max(0, contentWidth - spansWidth(contentSpans, widthProfile));
  return remaining === 0
    ? []
    : [styledSpan(' '.repeat(remaining), textAreaActiveLineTextStyle(renderNode), inputSource(renderNode, 'activeLine', 'activeLine.background'))];
}

function textAreaHighlights(renderNode: TextAreaNode, start: number, end: number): readonly NormalizedTextAreaHighlight[] {
  const raw = renderNode.props.highlights;
  if (!Array.isArray(raw) || end <= start) return [];
  return raw.flatMap((input, index): readonly NormalizedTextAreaHighlight[] => {
    const normalized = normalizeTextAreaHighlight(input, index, start, end);
    return normalized === undefined ? [] : [normalized];
  });
}

function normalizeTextAreaHighlight(
  value: unknown,
  index: number,
  windowStart: number,
  windowEnd: number
): NormalizedTextAreaHighlight | undefined {
  if (!isNonArrayObject(value)) return undefined;
  const startOffset = value['startOffset'];
  const endOffsetExclusive = value['endOffsetExclusive'];
  if (typeof startOffset !== 'number'
    || typeof endOffsetExclusive !== 'number'
    || !Number.isFinite(startOffset)
    || !Number.isFinite(endOffsetExclusive)) {
    return undefined;
  }
  const rangeStart = Math.max(0, Math.floor(Math.min(startOffset, endOffsetExclusive)));
  const rangeEnd = Math.max(0, Math.floor(Math.max(startOffset, endOffsetExclusive)));
  const clippedStart = Math.max(windowStart, rangeStart);
  const clippedEnd = Math.min(windowEnd, rangeEnd);
  if (clippedEnd <= clippedStart) return undefined;
  const label = typeof value['label'] === 'string' && value['label'].length > 0
    ? value['label']
    : `highlight.${String(index)}`;
  const style = isNonArrayObject(value['style'])
    ? value['style'] as TextAreaHighlight['style']
    : undefined;
  return {
    start: clippedStart - windowStart,
    end: clippedEnd - windowStart,
    label,
    ...(style === undefined ? {} : { style })
  };
}

function normalizedTextCuts(
  length: number,
  selection: TextSelection | undefined,
  highlights: readonly NormalizedTextAreaHighlight[]
): readonly number[] {
  const cuts = new Set<number>([0, length]);
  if (selection !== undefined) {
    cuts.add(clampOffset(selection.startOffset, length));
    cuts.add(clampOffset(selection.endOffsetExclusive, length));
  }
  for (const highlight of highlights) {
    cuts.add(clampOffset(highlight.start, length));
    cuts.add(clampOffset(highlight.end, length));
  }
  return [...cuts].toSorted((left, right) => left - right);
}

function clampOffset(value: number, length: number): number {
  return Math.max(0, Math.min(Math.max(0, length), Math.floor(value)));
}

function defaultHighlightStyle(): TerminalStyle {
  return {
    fg: { kind: 'theme', token: 'menu.match' },
    underline: true
  };
}

function cleanInputText(value: string): string {
  return sanitizeTerminalText(value).text.replace(/\s*\n\s*/gu, ' ');
}

function clipSpans(
  spans: readonly RenderSpan[],
  width: number,
  widthProfile: TextWidthProfile
): readonly RenderSpan[] {
  const clipped: RenderSpan[] = [];
  let remaining = Math.max(0, width);
  for (const current of spans) {
    if (remaining <= 0) break;
    const next = sanitizeTerminalText(current.text).text;
    const truncated = terminalTextWidth(next, { widthProfile }) > remaining;
    const visible = truncated
      ? clipTextCells(next, remaining, { ellipsis: '…', widthProfile }).text
      : visibleLineWindow(next, 0, remaining, { widthProfile }).text;
    if (visible.length > 0) {
      clipped.push(span(visible, {
        ...(current.style === undefined ? {} : { style: current.style }),
        ...(current.link === undefined ? {} : { link: current.link }),
        ...(current.source === undefined ? {} : { source: current.source })
      }));
      remaining -= terminalTextWidth(visible, { widthProfile });
    }
    if (truncated) break;
  }
  return clipped;
}

function selectionIntersection(
  selection: ReturnType<typeof selectionFromUnknown>,
  start: number,
  end: number
): ReturnType<typeof selectionFromUnknown> {
  if (selection === undefined) return undefined;
  const nextStart = Math.max(start, selection.startOffset);
  const nextEnd = Math.min(end, selection.endOffsetExclusive);
  return nextStart >= nextEnd
    ? undefined
    : { startOffset: nextStart, endOffsetExclusive: nextEnd };
}

function styledSpan(text: string, style: TerminalStyle | undefined, source: FrameCellSource): RenderSpan {
  return span(text, {
    ...(style === undefined ? {} : { style }),
    source
  });
}

function spansWidth(spans: readonly RenderSpan[], widthProfile: TextWidthProfile): number {
  return spans.reduce((sum, current) => sum + terminalTextWidth(current.text, { widthProfile }), 0);
}

function inputSource(renderNode: InputNode, visual: FormVisualKind, label: string = visual): FrameCellSource {
  return formSource(renderNode, visual, label);
}

function textAreaContentSource(renderNode: TextAreaNode, placeholder: boolean, active: boolean): FrameCellSource {
  if (placeholder) return inputSource(renderNode, 'placeholder');
  return inputSource(renderNode, 'value', active ? 'activeLine.value' : 'value');
}

function textAreaLineNumber(renderNode: TextAreaNode, lineIndex: number, lineCount: number, firstVisualLine: boolean): string | undefined {
  const options = textAreaLineNumberOptions(renderNode);
  if (options === undefined) return undefined;
  const start = options.start;
  const width = Math.max(
    options.minWidth,
    String(start + Math.max(0, lineCount - 1)).length
  );
  return firstVisualLine
    ? String(start + lineIndex).padStart(width, ' ')
    : ''.padStart(width, ' ');
}

function textAreaLineNumberOptions(
  renderNode: TextAreaNode
): { readonly start: number; readonly minWidth: number } | undefined {
  const raw = renderNode.props.lineNumbers;
  if (raw !== true && !isNonArrayObject(raw)) return undefined;
  const startNumber = isNonArrayObject(raw)
    && typeof raw['startNumber'] === 'number'
    && Number.isFinite(raw['startNumber'])
    ? Math.floor(raw['startNumber'])
    : 1;
  const minWidth = isNonArrayObject(raw) && typeof raw['minWidth'] === 'number' && Number.isFinite(raw['minWidth'])
    ? Math.max(1, Math.floor(raw['minWidth']))
    : 1;
  return { start: startNumber, minWidth };
}

function textAreaActiveLineEnabled(renderNode: TextAreaNode): boolean {
  return renderNode.props.activeLine === true;
}
