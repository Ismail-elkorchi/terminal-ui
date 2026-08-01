import type { ElementTextRole } from '../../element/metadata.ts';
import type { HelpGroup } from '../../ui-model/contracts.ts';
import {
  defaultTextWidthProfile,
  normalizeTextDocumentOffset,
  textDocumentSelectionRange,
  sanitizeTerminalText,
  textDocumentLength,
  textDocumentLineCount
} from '../../text/index.ts';
import { block, blockFromText, line, wrapRenderSpans } from './frame.ts';
import { inlineContentAccessibleText } from '../../visual/inline-content.ts';
import { renderNodeFrameSource } from '../../visual/source.ts';
import { textAreaInputCursor, textAreaInputLine } from './input-visual.ts';
import {
  activityIndicatorBlock as feedbackActivityIndicatorBlock,
  activityIndicatorText as feedbackActivityIndicatorText,
  helpBarText as feedbackHelpBarText
} from './feedback-visual.ts';
import { textAreaRenderModel } from './text-area/render-model.ts';
import {
  textAreaCursorInLayout,
  textAreaOffsetInLayout,
  textAreaVisibleText
} from './text-area/layout.ts';
import { defaultStyleForTextRole, resolveRenderNodeStyle } from '../style-resolution.ts';
import { renderInlineContent } from './inline-content.ts';
import { stringify } from './render-node-props.ts';
import { defaultTheme } from '../../theme/index.ts';
import type { AccessibleNode } from '../../accessibility/index.ts';
import type { TerminalTheme } from '../../theme/index.ts';
import type { RenderNodeOfKind } from '../model/index.ts';
import type { CursorPosition } from '../contracts.ts';
import type { FrameCellSource, RenderBlock, RenderLine, RenderSpan, TerminalStyle } from './frame.ts';
import type { Rect } from '../contracts.ts';
import type { RoutedPointerEvent } from '../../input/pointer.ts';
import type { TextWidthProfile } from '../../text/index.ts';

type TextNode = RenderNodeOfKind<unknown, 'text'>;
type RichTextNode = RenderNodeOfKind<unknown, 'richText'>;
type TextAreaNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'textArea'>;
type HelpBarNode = RenderNodeOfKind<unknown, 'helpBar'>;
type ActivityIndicatorNode = RenderNodeOfKind<unknown, 'activityIndicator'>;

export function textBlock(renderNode: TextNode): RenderBlock {
  const content = sanitizeTerminalText(stringify(renderNode.props.content)).text;
  return blockFromText(content, {
    ...styleOption(textStyle(renderNode)),
    source: textSource(renderNode)
  });
}

export function textAccessibleBase(renderNode: TextNode, id: string): AccessibleNode {
  return {
    id,
    role: 'text',
    label: id,
    value: sanitizeTerminalText(stringify(renderNode.props.content)).text
  };
}

export function richTextBlock(
  renderNode: RichTextNode,
  bounds: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): RenderBlock {
  const segments = richTextSegments(renderNode, theme);
  if (renderNode.props.wrap === true && bounds.width > 0) {
    return block(wrapRenderSpans(segments, bounds.width, { widthProfile }));
  }
  return block([line(segments)]);
}

export function richTextAccessibleBase(renderNode: RichTextNode, id: string): AccessibleNode {
  return {
    id,
    role: 'text',
    label: id,
    value: inlineContentAccessibleText(renderNode.props.segments)
  };
}

export function textAreaText(renderNode: TextAreaNode, bounds: Rect): string {
  return textAreaBlock(renderNode, bounds, defaultTheme, defaultTextWidthProfile).lines.map((currentLine) =>
    currentLine.spans.map((currentSpan) => currentSpan.text).join('')
  ).join('\n');
}

export function textAreaBlock(
  renderNode: TextAreaNode,
  bounds: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  focused = false
): RenderBlock {
  const model = textAreaRenderModel(renderNode, bounds, theme, widthProfile);
  const selection = model.usesPlaceholder || renderNode.props.selection === undefined
    ? undefined
    : textDocumentSelectionRange(model.document, renderNode.props.selection, renderNode.props.caret);
  return block(model.layout.lines
    .slice(model.scroll.offsetRow, model.scroll.offsetRow + Math.max(0, bounds.height))
    .map((record, index): RenderLine => textAreaInputLine({
      renderNode,
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
  renderNode: TextAreaNode,
  id: string,
  focused: boolean,
  bounds?: Rect,
  theme: TerminalTheme = defaultTheme,
  widthProfile: TextWidthProfile = defaultTextWidthProfile
): AccessibleNode {
  const model = bounds === undefined ? undefined : textAreaRenderModel(renderNode, bounds, theme, widthProfile);
  const value = model === undefined || model.usesPlaceholder
    ? ''
    : textAreaVisibleText(model.layout, model.scroll);
  return {
    id,
    role: 'textbox',
    label: id,
    value,
    description: textAreaDescription(renderNode, bounds, theme, widthProfile),
    ...(renderNode.props.disabled === true ? { disabled: true } : {}),
    ...(focused ? { focused } : {})
  };
}

export function textAreaCursor(
  renderNode: TextAreaNode,
  bounds: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): CursorPosition {
  const model = textAreaRenderModel(renderNode, bounds, theme, widthProfile);
  const cursor = textAreaCursorInLayout(
    model.layout,
    renderNode.props.caret
  );
  const rowOffset = Math.max(0, Math.min(bounds.height - 1, cursor.rowIndex - model.scroll.offsetRow));
  return textAreaInputCursor({
    renderNode,
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
  renderNode: TextAreaNode,
  bounds: Rect,
  theme: TerminalTheme,
  pointer: RoutedPointerEvent,
  widthProfile: TextWidthProfile
): number | undefined {
  if (pointer.localRow === undefined || pointer.localColumn === undefined) return undefined;
  const model = textAreaRenderModel(renderNode, bounds, theme, widthProfile);
  const rowIndex = Math.max(
    0,
    Math.min(model.layout.lines.length - 1, model.scroll.offsetRow + pointer.localRow - 1)
  );
  const gutterWidth = Math.max(0, bounds.width - model.contentBounds.width);
  const visualColumn = Math.max(0, pointer.localColumn - 1 - gutterWidth + model.scroll.offsetColumn);
  return normalizeTextDocumentOffset(
    model.document,
    textAreaOffsetInLayout(model.layout, rowIndex, visualColumn)
  );
}

export function helpBarText(renderNode: HelpBarNode, widthProfile: TextWidthProfile): string {
  return feedbackHelpBarText(renderNode, widthProfile);
}

export function helpBarAccessibleBase(renderNode: HelpBarNode, id: string): AccessibleNode {
  const groups: readonly HelpGroup[] = Array.isArray(renderNode.props.groups)
    ? renderNode.props.groups
    : [];
  return {
    id,
    role: 'group',
    label: 'Keyboard shortcuts',
    children: groups.map((group) => ({
      id: `${id}:${group.id}`,
      role: 'group',
      label: group.label ?? group.id,
      children: group.bindings.map((binding, index) => ({
        id: `${id}:${group.id}:${String(index)}`,
        role: 'text',
        label: binding.key,
        value: binding.label
      }))
    }))
  };
}

export function activityIndicatorBlock(
  renderNode: ActivityIndicatorNode,
  theme: TerminalTheme
): RenderBlock {
  return feedbackActivityIndicatorBlock(renderNode, theme);
}

export function activityIndicatorText(
  renderNode: ActivityIndicatorNode,
  theme: TerminalTheme
): string {
  return feedbackActivityIndicatorText(renderNode, theme);
}

export function activityIndicatorAccessibleBase(
  renderNode: ActivityIndicatorNode,
  id: string
): AccessibleNode {
  const status = renderNode.props.status;
  const label = renderNode.props.label;
  return {
    id,
    role: 'status',
    label: id,
    value: `${label} (${status})`,
    live: 'polite'
  };
}

function richTextSegments(renderNode: RichTextNode, theme: TerminalTheme): readonly RenderSpan[] {
  const rootStyle = resolveRenderNodeStyle(renderNode, { part: 'root' });
  return renderInlineContent(renderNode.props.segments, {
    theme,
    ...(rootStyle === undefined ? {} : { baseStyle: rootStyle }),
    source: (_segment, index) => richTextSource(renderNode, index)
  });
}

function textStyle(renderNode: TextNode): TerminalStyle | undefined {
  const role = renderNodeTextRole(renderNode.props.textRole);
  const base = role === undefined ? undefined : defaultStyleForTextRole(role);
  if (base === undefined) return resolveRenderNodeStyle(renderNode, { part: 'root' });
  return resolveRenderNodeStyle(renderNode, {
    part: 'root',
    base
  });
}

function styleOption(style: TerminalStyle | undefined): { readonly style?: TerminalStyle } {
  return style === undefined ? {} : { style };
}

function textSource(renderNode: TextNode): FrameCellSource {
  const role = renderNodeTextRole(renderNode.props.textRole);
  return renderNodeFrameSource(renderNode, {
    rendererFamily: 'text',
    cellRole: 'text',
    partName: role === undefined ? 'content' : `role.${role}`,
    description: role === undefined ? 'content' : `role.${role}`
  });
}

function richTextSource(renderNode: RichTextNode, index: number): FrameCellSource {
  return renderNodeFrameSource(renderNode, {
    rendererFamily: 'text',
    cellRole: 'text',
    partName: 'segment',
    itemIndex: index,
    description: `segment.${String(index)}`
  });
}

function renderNodeTextRole(value: unknown): ElementTextRole | undefined {
  switch (value) {
    case 'title':
    case 'heading':
    case 'body':
    case 'caption':
    case 'metadata':
    case 'metric':
    case 'badge':
      return value;
    default:
      return undefined;
  }
}

function textAreaDescription(
  renderNode: TextAreaNode,
  bounds: Rect | undefined,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): string {
  const lines = textDocumentLength(renderNode.props.document) === 0 ? 0 : textDocumentLineCount(renderNode.props.document);
  const scrollText = bounds === undefined ? '' : textAreaScrollDescription(renderNode, bounds, theme, widthProfile);
  const selection = renderNode.props.selection;
  const selectionText = selection === undefined ? '' : ' Selection active.';
  const requiredText = renderNode.props.required === true ? ' Required.' : '';
  const error = sanitizeTerminalText(stringify(renderNode.props.error)).text;
  const errorText = error.length === 0 ? '' : ` ${error}`;
  return `${String(lines)} lines.${scrollText}${selectionText}${requiredText}${errorText}`;
}

function textAreaScrollDescription(
  renderNode: TextAreaNode,
  bounds: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): string {
  const model = textAreaRenderModel(renderNode, bounds, theme, widthProfile);
  const totalRows = model.scroll.contentRows;
  const visibleRows = Math.min(totalRows, Math.max(0, model.scroll.viewportRows));
  const start = visibleRows === 0 ? 0 : model.scroll.offsetRow + 1;
  const end = visibleRows === 0 ? 0 : Math.min(totalRows, model.scroll.offsetRow + visibleRows);
  const omittedAfter = Math.max(0, totalRows - end);
  return ` Showing ${String(start)}-${String(end)} of ${String(totalRows)} rows. Omitted before: ${String(model.scroll.offsetRow)}. Omitted after: ${String(omittedAfter)}. Horizontal offset: ${String(model.scroll.offsetColumn)}.`;
}
