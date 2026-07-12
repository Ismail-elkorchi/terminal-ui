import { clipTextCells, sanitizeTerminalText, terminalTextWidth } from '../text/index.ts';
import { block, line, span } from './frame.ts';
import { formSource, type FormVisualKind } from './form-visual.ts';
import { selectedTextSpans, selectionFromUnknown, singleLineCursorColumn, visibleLineWindow } from './text-display.ts';
import { textOffsetAtVisualColumn } from './text-pointer.ts';
import { inputCursorStyle, mergeStyles, resolveRenderNodeStyle, renderNodeStyle } from './render-node-style.ts';
import type { TextAreaHighlight } from '../ui-model/options/content.ts';
import type { TextSelection } from '../text/index.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { RenderNodeOfKind, RenderNodesOfKind } from '../render-node/index.ts';
import type { CursorPosition } from './cursor.ts';
import type { FrameCellSource, RenderBlock, RenderLine, RenderSpan, TerminalStyle } from './frame.ts';
import type { Rect } from './layout.ts';
import type { RoutedPointerEvent } from '../input/pointer.ts';

type SingleLineInputNode = RenderNodesOfKind<unknown, 'numberInput' | 'textInput'>;
type TextAreaNode = RenderNodeOfKind<unknown, 'textArea'>;
type InputNode = SingleLineInputNode | TextAreaNode;

export interface SingleLineInputBlockInput {
  readonly widget: SingleLineInputNode;
  readonly bounds: Rect;
  readonly theme: TerminalTheme;
  readonly value: string;
  readonly cursor?: number;
  readonly selection?: TextSelection;
  readonly placeholder?: string;
  readonly focused?: boolean;
}

export interface TextAreaInputBlockInput {
  readonly widget: TextAreaNode;
  readonly bounds: Rect;
  readonly theme: TerminalTheme;
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
    renderNodeStyle(input.widget, 'selection', 'selected'),
    {
      normalSource: inputSource(input.widget, model.usesPlaceholder ? 'placeholder' : 'value'),
      selectedSource: inputSource(input.widget, 'selection')
    }
  );
  return block([line([
    styledSpan(model.prefix, model.chromeStyle, inputSource(input.widget, 'chrome', 'chrome.prefix')),
    ...clipSpans(contentSpans, Math.max(0, input.bounds.width - model.prefixWidth - model.suffixWidth)),
    styledSpan(model.suffix, model.chromeStyle, inputSource(input.widget, 'chrome', 'chrome.suffix'))
  ])]);
}

export function singleLineInputCursor(input: SingleLineInputBlockInput): CursorPosition {
  const model = singleLineInputModel({ ...input, focused: true });
  const contentWidth = Math.max(0, input.bounds.width - model.prefixWidth - model.suffixWidth);
  const style = cursorVisualStyle(input.widget);
  return {
    row: input.bounds.row,
    column: input.bounds.column + model.prefixWidth + singleLineCursorColumn(input.value, input.cursor, Math.max(0, contentWidth - 1)),
    ...(style === undefined ? {} : { style }),
    source: inputSource(input.widget, 'cursor')
  };
}

export function singleLineInputPointerOffset(
  input: SingleLineInputBlockInput,
  pointer: RoutedPointerEvent
): number | undefined {
  if (pointer.localColumn === undefined) return undefined;
  const model = singleLineInputModel(input);
  const contentColumn = pointer.localColumn - 1 - model.prefixWidth;
  return textOffsetAtVisualColumn(input.value, Math.max(0, contentColumn));
}

export function textAreaInputLine(input: TextAreaInputBlockInput, lineInput: {
  readonly lineRecord: TextAreaVisualLine;
  readonly rowIndex: number;
  readonly lineIndex: number;
  readonly offsetColumn: number;
}): RenderLine {
  const active = input.activeLineIndex === lineInput.lineRecord.logicalLineIndex && textAreaActiveLineEnabled(input.widget);
  const prefix = textAreaLinePrefixSpans(
    input.widget,
    input.theme,
    input.focused === true,
    lineInput.rowIndex,
    lineInput.lineRecord.logicalLineIndex,
    input.lineCount,
    active,
    lineInput.lineRecord.firstVisualLine
  );
  const prefixWidth = spansWidth(prefix);
  const contentWidth = Math.max(0, input.bounds.width - prefixWidth);
  const window = visibleLineWindow(lineInput.lineRecord.text, lineInput.offsetColumn, contentWidth);
  const selectionInWindow = input.usesPlaceholder === true
    ? undefined
    : selectionIntersection(input.selection, lineInput.lineRecord.start + window.startOffset, lineInput.lineRecord.start + window.endOffset);
  const contentStyle = input.usesPlaceholder === true ? renderNodeStyle(input.widget, 'placeholder') : inputContentStyle(input.widget, input.focused === true, active);
  const contentSpans = textAreaContentSpans(input.widget, {
    text: window.text,
    absoluteStart: lineInput.lineRecord.start + window.startOffset,
    usesPlaceholder: input.usesPlaceholder === true,
    active,
    contentStyle,
    selectedStyle: renderNodeStyle(input.widget, 'selection', 'selected'),
    ...(selectionInWindow === undefined
      ? {}
      : {
          selection: {
            start: selectionInWindow.start - lineInput.lineRecord.start - window.startOffset,
            end: selectionInWindow.end - lineInput.lineRecord.start - window.startOffset
          }
        })
  });
  return line([
    ...prefix,
    ...contentSpans,
    ...textAreaActiveLineFill(input.widget, active, contentWidth, contentSpans)
  ]);
}

export function textAreaInputCursor(input: {
  readonly widget: TextAreaNode;
  readonly bounds: Rect;
  readonly theme: TerminalTheme;
  readonly rowOffset: number;
  readonly columnCells: number;
  readonly offsetColumn: number;
  readonly lineCount: number;
}): CursorPosition {
  const prefixWidth = textAreaInputPrefixWidth(input.widget, input.theme, input.lineCount);
  const style = cursorVisualStyle(input.widget);
  return {
    row: input.bounds.row + input.rowOffset,
    column: input.bounds.column + prefixWidth + Math.max(0, Math.min(
      Math.max(0, input.bounds.width - prefixWidth - 1),
      Math.max(0, input.columnCells - input.offsetColumn)
    )),
    ...(style === undefined ? {} : { style }),
    source: inputSource(input.widget, 'cursor')
  };
}

export function textAreaInputContentBounds(bounds: Rect, theme: TerminalTheme, widget?: TextAreaNode, lineCount = 1): Rect {
  const prefixWidth = widget === undefined
    ? terminalTextWidth(`${theme.tokens.symbols.borderSingle.vertical} `)
    : textAreaInputPrefixWidth(widget, theme, lineCount);
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
  readonly chromeStyle: TerminalStyle | undefined;
  readonly contentStyle: TerminalStyle | undefined;
} {
  const value = cleanInputText(input.value);
  const placeholder = cleanInputText(input.placeholder ?? '');
  const usesPlaceholder = value.length === 0 && placeholder.length > 0;
  const prefix = `${inputStateMarker(input.widget, input.theme, input.focused === true)}[ `;
  const suffix = ' ]';
  return {
    display: usesPlaceholder ? placeholder : value,
    usesPlaceholder,
    prefix,
    suffix,
    prefixWidth: terminalTextWidth(prefix),
    suffixWidth: terminalTextWidth(suffix),
    chromeStyle: inputChromeStyle(input.widget, input.focused === true),
    contentStyle: usesPlaceholder ? renderNodeStyle(input.widget, 'placeholder') : inputContentStyle(input.widget, input.focused === true)
  };
}

function textAreaLinePrefixSpans(
  widget: TextAreaNode,
  theme: TerminalTheme,
  focused: boolean,
  rowIndex: number,
  lineIndex: number,
  lineCount: number,
  active: boolean,
  firstVisualLine = true
): readonly RenderSpan[] {
  const marker = textAreaLineMarker(widget, theme, focused, rowIndex, active);
  const lineNumber = textAreaLineNumber(widget, lineIndex, lineCount, firstVisualLine);
  const markerStyle = textAreaMarkerStyle(widget, focused, active, rowIndex);
  const gutterStyle = textAreaGutterStyle(widget, active);
  if (lineNumber === undefined) {
    return [styledSpan(`${marker} `, markerStyle, inputSource(widget, active ? 'activeLine' : 'chrome', active ? 'activeLine.gutter' : 'chrome.prefix'))];
  }
  return [
    styledSpan(marker, markerStyle, inputSource(widget, active ? 'activeLine' : 'chrome', active ? 'activeLine.marker' : 'chrome.marker')),
    styledSpan(lineNumber, textAreaLineNumberStyle(widget, active), inputSource(widget, 'lineNumber', active ? 'activeLine.lineNumber' : 'lineNumber')),
    styledSpan(` ${theme.tokens.symbols.borderSingle.vertical} `, gutterStyle, inputSource(widget, 'gutter', active ? 'activeLine.gutter' : 'gutter.separator'))
  ];
}

function textAreaInputPrefixWidth(widget: TextAreaNode, theme: TerminalTheme, lineCount: number): number {
  return spansWidth(textAreaLinePrefixSpans(widget, theme, true, 0, Math.max(0, lineCount - 1), lineCount, false));
}

function textAreaLineMarker(widget: TextAreaNode, theme: TerminalTheme, focused: boolean, rowIndex: number, active: boolean): string {
  if (active) return focused ? theme.tokens.symbols.pointer : theme.tokens.symbols.selected;
  if (rowIndex === 0) return inputStateMarker(widget, theme, focused);
  return theme.tokens.symbols.borderSingle.vertical;
}

function inputStateMarker(widget: InputNode, theme: TerminalTheme, focused: boolean): string {
  if (widget.props.disabled === true) return '-';
  if (typeof widget.props.error === 'string' && widget.props.error.length > 0) return theme.tokens.symbols.statusError;
  return focused ? theme.tokens.symbols.pointer : theme.tokens.symbols.borderSingle.vertical;
}

function inputChromeStyle(widget: InputNode, focused: boolean): TerminalStyle | undefined {
  const state = widget.props.disabled === true
    ? 'disabled'
    : typeof widget.props.error === 'string' && widget.props.error.length > 0
      ? 'error'
      : focused
        ? 'focused'
        : undefined;
  return resolveRenderNodeStyle(widget, {
    part: 'border',
    base: { fg: { kind: 'theme', token: 'control.border' } },
    ...(state === undefined ? {} : { state })
  });
}

function cursorVisualStyle(widget: InputNode): TerminalStyle | undefined {
  return mergeStyles(
    inputCursorStyle(),
    widget.styles?.parts?.['cursor'],
    widget.styles?.states?.focused
  );
}

function textAreaMarkerStyle(widget: TextAreaNode, focused: boolean, active: boolean, rowIndex: number): TerminalStyle | undefined {
  if (active) return textAreaActiveGutterStyle(widget);
  if (focused && rowIndex === 0) return inputChromeStyle(widget, true);
  return textAreaGutterStyle(widget, false);
}

function textAreaGutterStyle(widget: TextAreaNode, active: boolean): TerminalStyle | undefined {
  return active
    ? textAreaActiveGutterStyle(widget)
    : mergeStyles(
        {
          fg: { kind: 'theme', token: 'editor.gutter.foreground' },
          bg: { kind: 'theme', token: 'editor.gutter.background' }
        },
        widget.styles?.parts?.['gutter']
      );
}

function textAreaActiveGutterStyle(widget: TextAreaNode): TerminalStyle | undefined {
  return mergeStyles(
    {
      fg: { kind: 'theme', token: 'editor.gutter.active.foreground' },
      bg: { kind: 'theme', token: 'editor.activeLine.background' },
      bold: true
    },
    widget.styles?.parts?.['gutter']
  );
}

function textAreaLineNumberStyle(widget: TextAreaNode, active: boolean): TerminalStyle | undefined {
  return active
    ? mergeStyles(
        {
          fg: { kind: 'theme', token: 'editor.gutter.active.foreground' },
          bg: { kind: 'theme', token: 'editor.activeLine.background' },
          bold: true
        },
        widget.styles?.parts?.['lineNumber']
      )
    : mergeStyles(
        {
          fg: { kind: 'theme', token: 'editor.gutter.foreground' },
          bg: { kind: 'theme', token: 'editor.gutter.background' }
        },
        widget.styles?.parts?.['lineNumber']
      );
}

function inputContentStyle(widget: InputNode, focused: boolean, active = false): TerminalStyle | undefined {
  if (widget.props.disabled === true) return renderNodeStyle(widget, 'value', 'disabled');
  if (typeof widget.props.error === 'string' && widget.props.error.length > 0) return renderNodeStyle(widget, 'value', 'error');
  return mergeStyles(
    renderNodeStyle(widget, 'value'),
    focused ? widget.styles?.states?.focused : undefined,
    active && widget.kind === 'textArea' ? textAreaActiveLineTextStyle(widget) : undefined
  );
}

function textAreaActiveLineTextStyle(widget: TextAreaNode): TerminalStyle | undefined {
  return mergeStyles(
    { bg: { kind: 'theme', token: 'editor.activeLine.background' } },
    widget.styles?.parts?.['activeLine']
  );
}

function textAreaContentSpans(
  widget: TextAreaNode,
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
  const highlights = input.usesPlaceholder ? [] : textAreaHighlights(widget, input.absoluteStart, absoluteEnd);
  if (input.selection === undefined && highlights.length === 0) {
    return selectedTextSpans(input.text, undefined, input.contentStyle, input.selectedStyle, {
      normalSource: textAreaContentSource(widget, input.usesPlaceholder, input.active),
      selectedSource: inputSource(widget, 'selection')
    });
  }

  const cuts = normalizedTextCuts(input.text.length, input.selection, highlights);
  return cuts.flatMap((start, index) => {
    const end = cuts[index + 1];
    if (end === undefined || end <= start) return [];
    const text = input.text.slice(start, end);
    const selected = input.selection !== undefined && start >= input.selection.start && end <= input.selection.end;
    if (selected) {
      return [span(text, {
        ...(input.selectedStyle === undefined ? {} : { style: input.selectedStyle }),
        source: inputSource(widget, 'selection')
      })];
    }
    const highlight = highlights.find((current) => start >= current.start && end <= current.end);
    if (highlight !== undefined) {
      const style = mergeStyles(input.contentStyle, defaultHighlightStyle(), highlight.style);
      return [span(text, {
        ...(style === undefined ? {} : { style }),
        source: inputSource(widget, 'highlight', highlight.label)
      })];
    }
    return [span(text, {
      ...(input.contentStyle === undefined ? {} : { style: input.contentStyle }),
      source: textAreaContentSource(widget, input.usesPlaceholder, input.active)
    })];
  });
}

function textAreaActiveLineFill(
  widget: TextAreaNode,
  active: boolean,
  contentWidth: number,
  contentSpans: readonly RenderSpan[]
): readonly RenderSpan[] {
  if (!active) return [];
  const remaining = Math.max(0, contentWidth - spansWidth(contentSpans));
  return remaining === 0
    ? []
    : [styledSpan(' '.repeat(remaining), textAreaActiveLineTextStyle(widget), inputSource(widget, 'activeLine', 'activeLine.background'))];
}

function textAreaHighlights(widget: TextAreaNode, start: number, end: number): readonly NormalizedTextAreaHighlight[] {
  const raw = widget.props.highlights;
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
  if (!isRecord(value)) return undefined;
  const start = value['start'];
  const end = value['end'];
  if (typeof start !== 'number' || typeof end !== 'number' || !Number.isFinite(start) || !Number.isFinite(end)) {
    return undefined;
  }
  const rangeStart = Math.max(0, Math.floor(Math.min(start, end)));
  const rangeEnd = Math.max(0, Math.floor(Math.max(start, end)));
  const clippedStart = Math.max(windowStart, rangeStart);
  const clippedEnd = Math.min(windowEnd, rangeEnd);
  if (clippedEnd <= clippedStart) return undefined;
  const label = typeof value['label'] === 'string' && value['label'].length > 0
    ? value['label']
    : `highlight.${String(index)}`;
  const style = isRecord(value['style'])
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
    cuts.add(clampOffset(selection.start, length));
    cuts.add(clampOffset(selection.end, length));
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

function clipSpans(spans: readonly RenderSpan[], width: number): readonly RenderSpan[] {
  const clipped: RenderSpan[] = [];
  let remaining = Math.max(0, width);
  for (const current of spans) {
    if (remaining <= 0) break;
    const next = sanitizeTerminalText(current.text).text;
    const truncated = terminalTextWidth(next) > remaining;
    const visible = truncated
      ? clipTextCells(next, remaining, { ellipsis: '…' }).text
      : visibleLineWindow(next, 0, remaining).text;
    if (visible.length > 0) {
      clipped.push(span(visible, {
        ...(current.style === undefined ? {} : { style: current.style }),
        ...(current.link === undefined ? {} : { link: current.link }),
        ...(current.source === undefined ? {} : { source: current.source })
      }));
      remaining -= terminalTextWidth(visible);
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
  const nextStart = Math.max(start, selection.start);
  const nextEnd = Math.min(end, selection.end);
  return nextStart >= nextEnd ? undefined : { start: nextStart, end: nextEnd };
}

function styledSpan(text: string, style: TerminalStyle | undefined, source: FrameCellSource): RenderSpan {
  return span(text, {
    ...(style === undefined ? {} : { style }),
    source
  });
}

function spansWidth(spans: readonly RenderSpan[]): number {
  return spans.reduce((sum, current) => sum + terminalTextWidth(current.text), 0);
}

function inputSource(widget: InputNode, visual: FormVisualKind, label: string = visual): FrameCellSource {
  return formSource(widget, visual, label);
}

function textAreaContentSource(widget: TextAreaNode, placeholder: boolean, active: boolean): FrameCellSource {
  if (placeholder) return inputSource(widget, 'placeholder');
  return inputSource(widget, 'value', active ? 'activeLine.value' : 'value');
}

function textAreaLineNumber(widget: TextAreaNode, lineIndex: number, lineCount: number, firstVisualLine: boolean): string | undefined {
  const options = textAreaLineNumberOptions(widget);
  if (options === undefined) return undefined;
  const start = options.start;
  const width = Math.max(options.minWidth, String(start + Math.max(0, lineCount - 1)).length);
  return firstVisualLine ? String(start + lineIndex).padStart(width, ' ') : ''.padStart(width, ' ');
}

function textAreaLineNumberOptions(widget: TextAreaNode): { readonly start: number; readonly minWidth: number } | undefined {
  const raw = widget.props.lineNumbers;
  if (raw !== true && !isRecord(raw)) return undefined;
  const start = isRecord(raw) && typeof raw['start'] === 'number' && Number.isFinite(raw['start'])
    ? Math.floor(raw['start'])
    : 1;
  const minWidth = isRecord(raw) && typeof raw['minWidth'] === 'number' && Number.isFinite(raw['minWidth'])
    ? Math.max(1, Math.floor(raw['minWidth']))
    : 1;
  return { start, minWidth };
}

function textAreaActiveLineEnabled(widget: TextAreaNode): boolean {
  return widget.props.activeLine === true;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
