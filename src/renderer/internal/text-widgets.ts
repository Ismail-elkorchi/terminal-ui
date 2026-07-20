import type { ElementTextRole } from '../../element/metadata.ts';
import {
  defaultTextWidthProfile,
  normalizeTextDocumentOffset,
  normalizeTextDocumentSelection,
  sanitizeTerminalText
} from '../../text/index.ts';
import { block, blockFromText, line, wrapRenderSpans } from './frame.ts';
import { inlineContentAccessibleText } from '../../visual/inline-content.ts';
import { renderNodeFrameSource } from '../../visual/source.ts';
import { textAreaInputCursor, textAreaInputLine } from './input-visual.ts';
import {
  statusIndicatorText as feedbackStatusIndicatorText, helpBarText as feedbackHelpBarText, spinnerBlock as feedbackSpinnerBlock, spinnerText as feedbackSpinnerText
} from './feedback-visual.ts';
import { textAreaRenderModel } from './text-area/render-model.ts';
import {
  textAreaCursorInProjection,
  textAreaOffsetInProjection,
  textAreaVisibleText
} from './text-area/projection.ts';
import { defaultStyleForTextRole, resolveRenderNodeStyle } from './render-node-style.ts';
import { renderInlineContent } from './inline-content.ts';
import { numberProp, stringify } from './render-node-props.ts';
import { defaultTheme } from '../../theme/index.ts';
import type { AccessibleNode } from '../../accessibility/index.ts';
import type { TerminalTheme } from '../../theme/index.ts';
import type { RenderNodeOfKind } from '../model/index.ts';
import { normalizeProcessStatus } from '../../ui-model/status.ts';
import type { CursorPosition } from '../model/cursor.ts';
import type { FrameCellSource, RenderBlock, RenderLine, RenderSpan, TerminalStyle } from './frame.ts';
import type { Rect } from '../model/layout.ts';
import type { RoutedPointerEvent } from '../../input/pointer.ts';
import type { TextSelection, TextWidthProfile } from '../../text/index.ts';

type TextNode = RenderNodeOfKind<unknown, 'text'>;
type RichTextNode = RenderNodeOfKind<unknown, 'richText'>;
type TextAreaNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'textArea'>;
type HelpBarNode = RenderNodeOfKind<unknown, 'helpBar'>;
type StatusIndicatorNode = RenderNodeOfKind<unknown, 'statusIndicator'>;
type SpinnerNode = RenderNodeOfKind<unknown, 'spinner'>;

export function textBlock(widget: TextNode): RenderBlock {
  const content = sanitizeTerminalText(stringify(widget.props.content)).text;
  return blockFromText(content, {
    ...styleOption(textStyle(widget)),
    source: textSource(widget)
  });
}

export function textAccessibleBase(widget: TextNode, id: string): AccessibleNode {
  return {
    id,
    role: 'text',
    label: id,
    value: sanitizeTerminalText(stringify(widget.props.content)).text
  };
}

export function richTextBlock(
  widget: RichTextNode,
  bounds: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): RenderBlock {
  const segments = richTextSegments(widget, theme);
  if (widget.props.wrap === true && bounds.width > 0) {
    return block(wrapRenderSpans(segments, bounds.width, { widthProfile }));
  }
  return block([line(segments)]);
}

export function richTextAccessibleBase(widget: RichTextNode, id: string): AccessibleNode {
  return {
    id,
    role: 'text',
    label: id,
    value: inlineContentAccessibleText(widget.props.segments)
  };
}

export function textAreaText(widget: TextAreaNode, bounds: Rect): string {
  return textAreaBlock(widget, bounds, defaultTheme, defaultTextWidthProfile).lines.map((currentLine) =>
    currentLine.spans.map((currentSpan) => currentSpan.text).join('')
  ).join('\n');
}

export function textAreaBlock(
  widget: TextAreaNode,
  bounds: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  focused = false
): RenderBlock {
  const model = textAreaRenderModel(widget, bounds, theme, widthProfile);
  const selection = model.usesPlaceholder
    ? undefined
    : normalizeTextDocumentSelection(model.document, selectionFromTextAreaProps(widget.props.selection));
  return block(model.projection.lines
    .slice(model.scroll.offsetRow, model.scroll.offsetRow + Math.max(0, bounds.height))
    .map((record, index): RenderLine => textAreaInputLine({
      widget,
      bounds,
      theme,
      widthProfile,
      lineCount: model.lineCount,
      usesPlaceholder: model.usesPlaceholder,
      focused,
      ...(model.activeLineIndex === undefined ? {} : { activeLineIndex: model.activeLineIndex }),
      ...(selection === undefined ? {} : { selection })
    }, {
      lineRecord: record,
      rowIndex: index,
      lineIndex: model.scroll.offsetRow + index,
      offsetColumn: model.scroll.offsetColumn
    })));
}

export function textAreaAccessibleBase(
  widget: TextAreaNode,
  id: string,
  focused: boolean,
  bounds?: Rect,
  theme: TerminalTheme = defaultTheme,
  widthProfile: TextWidthProfile = defaultTextWidthProfile
): AccessibleNode {
  const model = bounds === undefined ? undefined : textAreaRenderModel(widget, bounds, theme, widthProfile);
  const value = model === undefined || model.usesPlaceholder
    ? ''
    : textAreaVisibleText(model.projection, model.scroll);
  return {
    id,
    role: 'textbox',
    label: id,
    value,
    description: textAreaDescription(widget, bounds, theme, widthProfile),
    ...(widget.props.disabled === true ? { disabled: true } : {}),
    ...(focused ? { focused } : {})
  };
}

function selectionFromTextAreaProps(value: unknown): TextSelection | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const record = value as Readonly<Record<string, unknown>>;
  return typeof record['start'] === 'number' && typeof record['end'] === 'number'
    ? { start: record['start'], end: record['end'] }
    : undefined;
}

export function textAreaCursor(
  widget: TextAreaNode,
  bounds: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): CursorPosition {
  const model = textAreaRenderModel(widget, bounds, theme, widthProfile);
  const cursor = textAreaCursorInProjection(
    model.projection,
    numberProp(widget, 'cursor') ?? model.document.text.length
  );
  const rowOffset = Math.max(0, Math.min(bounds.height - 1, cursor.rowIndex - model.scroll.offsetRow));
  return textAreaInputCursor({
    widget,
    bounds,
    theme,
    widthProfile,
    rowOffset,
    columnCells: cursor.columnCells,
    offsetColumn: model.scroll.offsetColumn,
    lineCount: model.lineCount
  });
}

export function textAreaPointerOffset(
  widget: TextAreaNode,
  bounds: Rect,
  theme: TerminalTheme,
  pointer: RoutedPointerEvent,
  widthProfile: TextWidthProfile
): number | undefined {
  if (pointer.localRow === undefined || pointer.localColumn === undefined) return undefined;
  const model = textAreaRenderModel(widget, bounds, theme, widthProfile);
  const rowIndex = Math.max(
    0,
    Math.min(model.projection.lines.length - 1, model.scroll.offsetRow + pointer.localRow - 1)
  );
  const gutterWidth = Math.max(0, bounds.width - model.contentBounds.width);
  const visualColumn = Math.max(0, pointer.localColumn - 1 - gutterWidth + model.scroll.offsetColumn);
  return normalizeTextDocumentOffset(
    model.document,
    textAreaOffsetInProjection(model.projection, rowIndex, visualColumn)
  );
}

export function helpBarText(widget: HelpBarNode, widthProfile: TextWidthProfile): string {
  return feedbackHelpBarText(widget, widthProfile);
}

export function helpBarAccessibleBase(widget: HelpBarNode, id: string, widthProfile: TextWidthProfile): AccessibleNode {
  return {
    id,
    role: 'status',
    label: id,
    value: helpBarText(widget, widthProfile),
    live: 'polite'
  };
}

export function statusIndicatorText(widget: StatusIndicatorNode, theme: TerminalTheme): string {
  return feedbackStatusIndicatorText(widget, theme);
}

export function statusIndicatorAccessibleBase(widget: StatusIndicatorNode, id: string): AccessibleNode {
  return {
    id,
    role: 'status',
    label: id,
    value: statusIndicatorText(widget, defaultTheme),
    live: 'polite'
  };
}

export function spinnerBlock(widget: SpinnerNode, theme: TerminalTheme): RenderBlock {
  return feedbackSpinnerBlock(widget, theme);
}

export function spinnerText(widget: SpinnerNode, theme: TerminalTheme): string {
  return feedbackSpinnerText(widget, theme);
}

export function spinnerAccessibleBase(widget: SpinnerNode, id: string): AccessibleNode {
  const status = normalizeProcessStatus(widget.props.status, 'running');
  const label = stringify(widget.props.label) || 'Loading';
  return {
    id,
    role: 'status',
    label: id,
    value: `${label} (${status})`,
    live: 'polite'
  };
}

function richTextSegments(widget: RichTextNode, theme: TerminalTheme): readonly RenderSpan[] {
  const rootStyle = resolveRenderNodeStyle(widget, { part: 'root' });
  return renderInlineContent(widget.props.segments, {
    theme,
    ...(rootStyle === undefined ? {} : { baseStyle: rootStyle }),
    source: (_segment, index) => richTextSource(widget, index)
  });
}

function textStyle(widget: TextNode): TerminalStyle | undefined {
  const role = widgetTextRole(widget.props.textRole);
  const base = role === undefined ? undefined : defaultStyleForTextRole(role);
  if (base === undefined) return resolveRenderNodeStyle(widget, { part: 'root' });
  return resolveRenderNodeStyle(widget, {
    part: 'root',
    base
  });
}

function styleOption(style: TerminalStyle | undefined): { readonly style?: TerminalStyle } {
  return style === undefined ? {} : { style };
}

function textSource(widget: TextNode): FrameCellSource {
  const role = widgetTextRole(widget.props.textRole);
  return renderNodeFrameSource(widget, {
    family: 'text',
    role: 'text',
    part: role === undefined ? 'content' : `role.${role}`,
    label: role === undefined ? 'content' : `role.${role}`
  });
}

function richTextSource(widget: RichTextNode, index: number): FrameCellSource {
  return renderNodeFrameSource(widget, {
    family: 'text',
    role: 'text',
    part: 'segment',
    itemIndex: index,
    label: `segment.${String(index)}`
  });
}

function widgetTextRole(value: unknown): ElementTextRole | undefined {
  switch (value) {
    case 'title':
    case 'subtitle':
    case 'heading':
    case 'body':
    case 'caption':
    case 'metadata':
    case 'metric':
    case 'badge':
    case 'danger':
    case 'warning':
    case 'success':
      return value;
    default:
      return undefined;
  }
}

function textAreaDescription(
  widget: TextAreaNode,
  bounds: Rect | undefined,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): string {
  const lines = widget.props.document.text.length === 0 ? 0 : widget.props.document.lineCount;
  const scrollText = bounds === undefined ? '' : textAreaScrollDescription(widget, bounds, theme, widthProfile);
  const selection = widget.props.selection;
  const selectionText = selection === undefined ? '' : ' Selection active.';
  const requiredText = widget.props.required === true ? ' Required.' : '';
  const error = sanitizeTerminalText(stringify(widget.props.error)).text;
  const errorText = error.length === 0 ? '' : ` ${error}`;
  return `${String(lines)} lines.${scrollText}${selectionText}${requiredText}${errorText}`;
}

function textAreaScrollDescription(
  widget: TextAreaNode,
  bounds: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): string {
  const model = textAreaRenderModel(widget, bounds, theme, widthProfile);
  const totalRows = model.scroll.contentRows;
  const visibleRows = Math.min(totalRows, Math.max(0, model.scroll.viewportRows));
  const start = visibleRows === 0 ? 0 : model.scroll.offsetRow + 1;
  const end = visibleRows === 0 ? 0 : Math.min(totalRows, model.scroll.offsetRow + visibleRows);
  const omittedAfter = Math.max(0, totalRows - end);
  return ` Showing ${String(start)}-${String(end)} of ${String(totalRows)} rows. Omitted before: ${String(model.scroll.offsetRow)}. Omitted after: ${String(omittedAfter)}. Horizontal offset: ${String(model.scroll.offsetColumn)}.`;
}
