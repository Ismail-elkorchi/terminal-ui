import { clipTextCells, sanitizeTerminalText, terminalTextWidth } from '../text/index.ts';
import { block, line, span } from './frame.ts';
import { formSource, type FormVisualKind } from './form-visual.ts';
import { selectedTextSpans, selectionFromUnknown, singleLineCursorColumn, visibleLineWindow } from './text-display.ts';
import { widgetStyle } from './widget-style.ts';
import type { TextSelection } from '../text/index.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { Widget } from '../widgets/index.ts';
import type { CursorPosition } from './cursor.ts';
import type { FrameCellSource, RenderBlock, RenderLine, RenderSpan, TerminalStyle } from './frame.ts';
import type { Rect } from './layout.ts';

export interface SingleLineInputBlockInput {
  readonly widget: Widget;
  readonly bounds: Rect;
  readonly theme: TerminalTheme;
  readonly value: string;
  readonly cursor?: number;
  readonly selection?: TextSelection;
  readonly placeholder?: string;
  readonly focused?: boolean;
}

export interface TextAreaInputBlockInput {
  readonly widget: Widget;
  readonly bounds: Rect;
  readonly theme: TerminalTheme;
  readonly lines: readonly TextAreaVisualLine[];
  readonly selection?: TextSelection;
  readonly usesPlaceholder?: boolean;
  readonly focused?: boolean;
}

export interface TextAreaVisualLine {
  readonly text: string;
  readonly start: number;
}

export function singleLineInputBlock(input: SingleLineInputBlockInput): RenderBlock {
  const model = singleLineInputModel(input);
  const contentSpans = selectedTextSpans(
    model.display,
    model.usesPlaceholder ? undefined : input.selection,
    model.contentStyle,
    widgetStyle(input.widget, 'value', 'selected'),
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
  return {
    row: input.bounds.row,
    column: input.bounds.column + model.prefixWidth + singleLineCursorColumn(input.value, input.cursor, Math.max(0, contentWidth - 1)),
    source: inputSource(input.widget, 'cursor')
  };
}

export function textAreaInputLine(input: TextAreaInputBlockInput, lineInput: {
  readonly lineRecord: TextAreaVisualLine;
  readonly rowIndex: number;
  readonly offsetColumn: number;
}): RenderLine {
  const prefix = textAreaLinePrefix(input.widget, input.theme, input.focused === true, lineInput.rowIndex);
  const prefixWidth = terminalTextWidth(prefix);
  const contentWidth = Math.max(0, input.bounds.width - prefixWidth);
  const window = visibleLineWindow(lineInput.lineRecord.text, lineInput.offsetColumn, contentWidth);
  const selectionInWindow = input.usesPlaceholder === true
    ? undefined
    : selectionIntersection(input.selection, lineInput.lineRecord.start + window.startOffset, lineInput.lineRecord.start + window.endOffset);
  return line([
    styledSpan(prefix, inputChromeStyle(input.widget, input.focused === true), inputSource(input.widget, 'chrome', 'chrome.prefix')),
    ...selectedTextSpans(
      window.text,
      selectionInWindow === undefined
        ? undefined
        : {
            start: selectionInWindow.start - lineInput.lineRecord.start - window.startOffset,
            end: selectionInWindow.end - lineInput.lineRecord.start - window.startOffset
      },
      input.usesPlaceholder === true ? widgetStyle(input.widget, 'placeholder') : inputContentStyle(input.widget, input.focused === true),
      widgetStyle(input.widget, 'value', 'selected'),
      {
        normalSource: inputSource(input.widget, input.usesPlaceholder === true ? 'placeholder' : 'value'),
        selectedSource: inputSource(input.widget, 'selection')
      }
    )
  ]);
}

export function textAreaInputCursor(input: {
  readonly widget: Widget;
  readonly bounds: Rect;
  readonly theme: TerminalTheme;
  readonly rowOffset: number;
  readonly columnCells: number;
  readonly offsetColumn: number;
}): CursorPosition {
  const prefixWidth = terminalTextWidth(textAreaLinePrefix(input.widget, input.theme, true, 0));
  return {
    row: input.bounds.row + input.rowOffset,
    column: input.bounds.column + prefixWidth + Math.max(0, Math.min(
      Math.max(0, input.bounds.width - prefixWidth - 1),
      Math.max(0, input.columnCells - input.offsetColumn)
    )),
    source: inputSource(input.widget, 'cursor')
  };
}

export function textAreaInputContentBounds(bounds: Rect, theme: TerminalTheme): Rect {
  const prefixWidth = terminalTextWidth(`${theme.symbols.borderSingle.vertical} `);
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
    contentStyle: usesPlaceholder ? widgetStyle(input.widget, 'placeholder') : inputContentStyle(input.widget, input.focused === true)
  };
}

function textAreaLinePrefix(widget: Widget, theme: TerminalTheme, focused: boolean, rowIndex: number): string {
  if (rowIndex === 0) return `${inputStateMarker(widget, theme, focused)} `;
  return `${theme.symbols.borderSingle.vertical} `;
}

function inputStateMarker(widget: Widget, theme: TerminalTheme, focused: boolean): string {
  if (widget.props['disabled'] === true) return '-';
  if (typeof widget.props['error'] === 'string' && widget.props['error'].length > 0) return theme.symbols.statusError;
  return focused ? theme.symbols.pointer : theme.symbols.borderSingle.vertical;
}

function inputChromeStyle(widget: Widget, focused: boolean): TerminalStyle | undefined {
  if (widget.props['disabled'] === true) return widgetStyle(widget, 'border', 'disabled');
  if (typeof widget.props['error'] === 'string' && widget.props['error'].length > 0) return widgetStyle(widget, 'border', 'error');
  return widgetStyle(widget, 'border', focused ? 'focused' : undefined);
}

function inputContentStyle(widget: Widget, focused: boolean): TerminalStyle | undefined {
  if (widget.props['disabled'] === true) return widgetStyle(widget, 'value', 'disabled');
  if (typeof widget.props['error'] === 'string' && widget.props['error'].length > 0) return widgetStyle(widget, 'value', 'error');
  return widgetStyle(widget, 'value', focused ? 'focused' : undefined);
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

function inputSource(widget: Widget, visual: FormVisualKind, label: string = visual): FrameCellSource {
  return formSource(widget, visual, label);
}
