import type { RenderNodeOfKind } from '../model/index.ts';
import { sanitizeTerminalText, wrapTextCells } from '../../text/index.ts';
import { measureTextCells, textWidthProfileKey } from '../../text/index.ts';
import type { TextWidthProfile } from '../../text/index.ts';
import { measuredWindow, type MeasuredWindow } from '../../behavior/measured-window.ts';
import {
  type DocumentSourceOptions, documentBodyStyle, documentDetailStyle, documentFieldSpans, documentMarkerStyle, documentRecordLevelStyle, documentResultStyle, documentSpan, documentSummaryStyle, documentTitleStyle, sourceToken
} from './document-visual.ts';
import { stringify } from './render-node-props.ts';
import type { AccessibleNode } from '../../accessibility/index.ts';
import type { TerminalTheme } from '../../theme/index.ts';
import type { FieldItem, LogLevel } from '../../ui-model/contracts.ts';
import { isRecordResult, optionalRecordResult } from '../../ui-model/status.ts';
import type { StructuredBlock } from '../../ui-model/documents.ts';
import type { LayoutNode } from '../model/layout.ts';
import type { Rect } from '../model/layout.ts';
import type { HitTarget } from '../model/renderer.ts';
import { clipRenderLine, clipRenderSpans } from '../../visual/render.ts';
import type { RenderBlock, RenderLine, RenderSpan, TerminalStyle } from '../../visual/render.ts';

type StructuredBlockNode = RenderNodeOfKind<unknown, 'structuredBlock'>;
type ActivityFeedNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'activityFeed'>;
type DocumentNode = StructuredBlockNode | ActivityFeedNode;

interface StructuredBlockRenderOptions {
  readonly renderNode: DocumentNode;
  readonly kind: 'structuredBlock' | 'activityFeed';
  readonly selected: boolean;
  readonly widthProfile: TextWidthProfile;
  readonly itemId?: string;
  readonly itemIndex?: number;
}

interface ActivityFeedMeasuredBlock {
  readonly block: StructuredBlock;
  readonly index: number;
  readonly lines: readonly RenderLine[];
}

interface ActivityFeedRenderModel {
  readonly blocks: readonly StructuredBlock[];
  readonly selectedIndex: number | undefined;
  readonly window: MeasuredWindow<ActivityFeedMeasuredBlock>;
}

const activityFeedRenderModelCache = new WeakMap<object, {
  readonly width: number;
  readonly height: number;
  readonly theme: TerminalTheme;
  readonly widthProfileKey: string;
  readonly model: ActivityFeedRenderModel;
}>();

export function structuredBlockText(
  renderNode: StructuredBlockNode,
  node: LayoutNode,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): string {
  return renderBlockText(structuredBlockBlock(renderNode, node, theme, widthProfile));
}

export function structuredBlockBlock(
  renderNode: StructuredBlockNode,
  node: LayoutNode,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): RenderBlock {
  const block = blockFromRenderNode(renderNode);
  return {
    lines: structuredBlockLines(block, theme, node.bounds.width, {
      renderNode,
      kind: 'structuredBlock',
      selected: false,
      widthProfile,
      itemId: block.id
    })
  };
}

export function structuredBlockAccessibleBase(renderNode: StructuredBlockNode, id: string): AccessibleNode {
  const block = blockFromRenderNode(renderNode);
  const children = structuredBlockAccessibleChildren(block, id);
  return {
    id,
    role: 'text',
    label: block.title,
    value: block.summary ?? block.title,
    description: structuredBlockDescription(block),
    ...(children.length === 0 ? {} : { children })
  };
}

export function activityFeedText(
  renderNode: ActivityFeedNode,
  node: LayoutNode,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): string {
  return renderBlockText(activityFeedBlock(renderNode, node, theme, widthProfile));
}

export function activityFeedBlock(
  renderNode: ActivityFeedNode,
  node: LayoutNode,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): RenderBlock {
  return {
    lines: activityFeedRows(renderNode, node, theme, widthProfile)
  };
}

export function activityFeedAccessibleBase(
  renderNode: ActivityFeedNode,
  node: LayoutNode,
  id: string,
  focused: boolean,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): AccessibleNode {
  const { blocks, window } = activityFeedRenderModel(renderNode, node.bounds, theme, widthProfile);
  return {
    id,
    role: 'listbox',
    label: id,
    description: blocks.length === 0
      ? 'Showing 0 activity blocks.'
      : `Showing ${String(window.startIndex + 1)}-${String(window.endIndexExclusive)} of ${String(blocks.length)} activity blocks.`,
    ...(focused ? { focused } : {})
  };
}

export function activityFeedAccessibleChildren(
  renderNode: ActivityFeedNode,
  node: LayoutNode,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): readonly AccessibleNode[] {
  const model = activityFeedRenderModel(renderNode, node.bounds, theme, widthProfile);
  return model.window.entries.map(({ item: { value: { block, index } } }) => ({
    id: `${renderNode.id ?? 'activityFeed'}:block:${block.id}`,
    role: 'option',
    label: block.title,
    value: block.summary ?? block.title,
    selected: model.selectedIndex === index,
    description: structuredBlockDescription(block)
  }));
}

export function activityFeedHitTargets<TMessage>(
  renderNode: ActivityFeedNode<TMessage>,
  bounds: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): readonly HitTarget<TMessage>[] {
  const toActionMessage = activityFeedActionMessageFactory(renderNode);
  if (toActionMessage === undefined) return [];
  const model = activityFeedRenderModel(renderNode, bounds, theme, widthProfile);
  return model.window.entries.map(({ item: { value: { block } }, rowOffset, visibleRows }) => ({
      id: `${renderNode.id ?? 'activityFeed'}:block:${block.id}`,
      bounds: {
        row: bounds.row + rowOffset,
        column: bounds.column,
        width: bounds.width,
        height: visibleRows
      },
      accepts: ['click'],
      message: () => toActionMessage({ kind: 'select', id: block.id }),
      cursor: 'pointer'
    }));
}

function activityFeedRows(
  renderNode: ActivityFeedNode,
  node: LayoutNode,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): readonly RenderLine[] {
  const model = activityFeedRenderModel(renderNode, node.bounds, theme, widthProfile);
  return model.window.entries.flatMap(({ item: { value }, clippedRowsBefore, visibleRows }) =>
    value.lines.slice(clippedRowsBefore, clippedRowsBefore + visibleRows)
  );
}

function activityFeedRenderModel(
  renderNode: ActivityFeedNode,
  bounds: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): ActivityFeedRenderModel {
  const cached = activityFeedRenderModelCache.get(renderNode);
  const profileKey = textWidthProfileKey(widthProfile);
  if (
    cached?.width === bounds.width
    && cached.height === bounds.height
    && cached.theme === theme
    && cached.widthProfileKey === profileKey
  ) return cached.model;
  const blocks = activityFeedBlocks(renderNode);
  const selectedIndex = selectedBlockIndex(renderNode, blocks.length);
  const measured = blocks.map((block, index): ActivityFeedMeasuredBlock => {
    const selected = selectedIndex === index;
    const content = activityFeedItemLines(renderNode, block, index, selected, bounds.width, theme, widthProfile);
    const marker = selected ? `${theme.tokens.symbols.pointer} ` : '  ';
    return {
      block,
      index,
      lines: content.map((line, lineIndex): RenderLine => ({
        spans: [
          documentSpan(
            renderNode,
            'activityFeed',
            'marker',
            selected ? 'selection.selected' : 'selection.unselected',
            lineIndex === 0 ? marker : '  ',
            documentMarkerStyle(renderNode, selected),
            sourceOptionsForBlock({ itemId: block.id, itemIndex: index, selected })
          ),
          ...line.spans
        ]
      }))
    };
  });
  const selectedId = selectedIndex === undefined ? undefined : blocks[selectedIndex]?.id;
  const window = measuredWindow({
    items: measured.map((value) => ({ id: value.block.id, value, rows: value.lines.length })),
    viewportRows: bounds.height,
    ...(selectedId === undefined ? {} : { selectedId })
  });
  const model = { blocks, selectedIndex, window };
  activityFeedRenderModelCache.set(renderNode, {
    width: bounds.width,
    height: bounds.height,
    theme,
    widthProfileKey: profileKey,
    model
  });
  return model;
}

function activityFeedItemLines(
  renderNode: ActivityFeedNode,
  block: StructuredBlock,
  index: number,
  selected: boolean,
  width: number,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): readonly RenderLine[] {
  const marker = selected ? `${theme.tokens.symbols.pointer} ` : '  ';
  const markerWidth = measureTextCells(marker, { widthProfile }).cells;
  return structuredBlockLines(block, theme, Math.max(0, width - markerWidth), {
    renderNode,
    kind: 'activityFeed',
    selected,
    widthProfile,
    itemId: block.id,
    itemIndex: index
  });
}

function structuredBlockLines(
  block: StructuredBlock,
  theme: TerminalTheme,
  width: number,
  options: StructuredBlockRenderOptions
): readonly RenderLine[] {
  const collapsed = block.collapsed === true;
  const fieldLabelWidth = maxFieldLabelWidth(block.fields ?? [], options.widthProfile);
  const lines: RenderLine[] = [headerLine(block, theme, collapsed, options, width)];
  if (block.summary !== undefined && block.summary.length > 0) {
    lines.push(compactTextLine(block.summary, width, documentSummaryStyle(options.renderNode, options.selected), options, 'summary', 'summary'));
  }
  for (const field of block.fields ?? []) {
    lines.push(fieldLine(field, fieldLabelWidth, width, options));
  }
  if (!collapsed && block.body !== undefined && block.body.length > 0) {
    lines.push(...wrappedTextLines(block.body, width, documentBodyStyle(options.renderNode, block.style, options.selected), options, 'body', 'body'));
  }
  if (!collapsed && block.details !== undefined && block.details.length > 0) {
    const detailLines = block.details.split('\n');
    for (let index = 0; index < detailLines.length; index += 1) {
      lines.push(...detailTextLines(detailLines[index] ?? '', index === 0, width, documentDetailStyle(options.renderNode, block.style, options.selected), options));
    }
  }
  return lines;
}

function structuredBlockDescription(block: StructuredBlock): string {
  const parts = [
    block.result === undefined ? undefined : `result ${block.result}`,
    block.level === undefined ? undefined : `level ${block.level}`,
    block.collapsed === true ? 'collapsed' : 'expanded',
    block.fields === undefined ? undefined : `${String(block.fields.length)} fields`
  ].filter((part): part is string => part !== undefined);
  return parts.join(', ');
}

function structuredBlockAccessibleChildren(block: StructuredBlock, id: string): readonly AccessibleNode[] {
  const children: AccessibleNode[] = [];
  if (block.result !== undefined) {
    children.push({
      id: `${id}:result`,
      role: 'status',
      label: 'result',
      value: block.result
    });
  }
  if (block.level !== undefined) {
    children.push({
      id: `${id}:level`,
      role: 'text',
      label: 'level',
      value: block.level
    });
  }
  if (block.summary !== undefined && block.summary.length > 0) {
    children.push({
      id: `${id}:summary`,
      role: 'text',
      label: 'summary',
      value: block.summary
    });
  }
  for (const field of block.fields ?? []) {
    children.push({
      id: `${id}:field:${field.label}`,
      role: 'text',
      label: field.label,
      value: field.value
    });
  }
  return children;
}

function blockFromRenderNode(renderNode: StructuredBlockNode): StructuredBlock {
  const title = stringify(renderNode.props.title);
  return {
    id: renderNode.id ?? 'structured-block',
    title: title.length === 0 ? renderNode.id ?? 'Block' : title,
    ...optionalString('summary', renderNode.props.summary),
    ...optionalStyle(renderNode.props.style),
    ...optionalResult(renderNode.props.result),
    ...optionalLevel(renderNode.props.level),
    ...optionalFields(renderNode.props.fields),
    ...optionalString('body', renderNode.props.body),
    ...optionalString('details', renderNode.props.details),
    ...(renderNode.props.collapsed === true ? { collapsed: true } : {})
  };
}

function activityFeedBlocks(renderNode: ActivityFeedNode): readonly StructuredBlock[] {
  return Array.isArray(renderNode.props.blocks)
    ? renderNode.props.blocks.filter(isStructuredBlock).map(sanitizeBlock)
    : [];
}

function activityFeedActionMessageFactory<TMessage>(
  renderNode: ActivityFeedNode<TMessage>
): ((action: import('../../ui-model/activity-feed.ts').ActivityFeedAction) => TMessage) | undefined {
  return renderNode.props.toActionMessage;
}

function selectedBlockIndex(renderNode: ActivityFeedNode, length: number): number | undefined {
  const selectedId = stringify(renderNode.props.selectedId);
  if (selectedId.length === 0 || length <= 0) return undefined;
  const selected = activityFeedBlocks(renderNode).findIndex((block) => block.id === selectedId);
  return selected < 0 ? undefined : selected;
}

function sanitizeBlock(block: StructuredBlock): StructuredBlock {
  return {
    id: cleanLine(block.id),
    title: cleanLine(block.title),
    ...(block.summary === undefined ? {} : { summary: cleanLine(block.summary) }),
    ...(block.style === undefined ? {} : { style: block.style }),
    ...(isRecordResult(block.result) ? { result: block.result } : {}),
    ...(isLogLevel(block.level) ? { level: block.level } : {}),
    ...(block.fields === undefined ? {} : { fields: block.fields.map(sanitizeField) }),
    ...(block.body === undefined ? {} : { body: cleanText(block.body) }),
    ...(block.details === undefined ? {} : { details: cleanText(block.details) }),
    ...(block.collapsed === undefined ? {} : { collapsed: block.collapsed })
  };
}

function sanitizeField(field: FieldItem): FieldItem {
  return {
    label: cleanLine(field.label),
    value: cleanLine(field.value)
  };
}

function isStructuredBlock(value: unknown): value is StructuredBlock {
  return typeof value === 'object'
    && value !== null
    && 'id' in value
    && 'title' in value
    && typeof value.id === 'string'
    && typeof value.title === 'string';
}

function optionalString<TKey extends 'summary' | 'body' | 'details'>(
  key: TKey,
  value: unknown
): Pick<StructuredBlock, TKey> | Record<string, never> {
  return typeof value === 'string' && value.length > 0
    ? { [key]: cleanText(value) } as Pick<StructuredBlock, TKey>
    : {};
}

function optionalStyle(value: unknown): Pick<StructuredBlock, 'style'> | Record<string, never> {
  return isTerminalStyle(value) ? { style: value } : {};
}

function optionalResult(value: unknown): Pick<StructuredBlock, 'result'> | Record<string, never> {
  const result = optionalRecordResult(value);
  return result === undefined ? {} : { result };
}

function optionalLevel(value: unknown): Pick<StructuredBlock, 'level'> | Record<string, never> {
  return isLogLevel(value) ? { level: value } : {};
}

function isLogLevel(value: unknown): value is LogLevel {
  return value === 'info' || value === 'warning' || value === 'error';
}

function optionalFields(value: unknown): Pick<StructuredBlock, 'fields'> | Record<string, never> {
  if (!Array.isArray(value)) return {};
  const fields = value.filter(isField).map(sanitizeField);
  return fields.length === 0 ? {} : { fields };
}

function isField(value: unknown): value is FieldItem {
  return typeof value === 'object'
    && value !== null
    && 'label' in value
    && 'value' in value
    && typeof value.label === 'string'
    && typeof value.value === 'string';
}

function isTerminalStyle(value: unknown): value is TerminalStyle {
  if (!isRecord(value)) return false;
  const style = value;
  return optionalBoolean(style['bold'])
    && optionalBoolean(style['dim'])
    && optionalBoolean(style['italic'])
    && optionalBoolean(style['underline'])
    && optionalBoolean(style['strikethrough'])
    && optionalBoolean(style['inverse'])
    && optionalBoolean(style['hidden']);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

function optionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === 'boolean';
}

function headerLine(
  block: StructuredBlock,
  theme: TerminalTheme,
  collapsed: boolean,
  options: StructuredBlockRenderOptions,
  width: number
): RenderLine {
  const spans: RenderSpan[] = [
    documentSpan(
      options.renderNode,
      options.kind,
      'marker',
      collapsed ? 'toggle.collapsed' : 'toggle.expanded',
      collapsed ? theme.tokens.symbols.collapsed : theme.tokens.symbols.expanded,
      documentMarkerStyle(options.renderNode, options.selected),
      sourceOptionsForBlock(options)
    )
  ];
  if (block.result !== undefined) {
    spans.push(
      documentSpan(options.renderNode, options.kind, 'separator', 'result.separator', ' ', documentMarkerStyle(options.renderNode, options.selected), sourceOptionsForBlock(options)),
      documentSpan(options.renderNode, options.kind, 'delimiter', 'result.open', '[', documentResultStyle(options.renderNode, block.result), sourceOptionsForBlock(options)),
      documentSpan(options.renderNode, options.kind, 'result', `result.${sourceToken(block.result)}`, block.result, documentResultStyle(options.renderNode, block.result), sourceOptionsForBlock(options)),
      documentSpan(options.renderNode, options.kind, 'delimiter', 'result.close', ']', documentResultStyle(options.renderNode, block.result), sourceOptionsForBlock(options))
    );
  }
  if (block.level !== undefined) {
    spans.push(
      documentSpan(options.renderNode, options.kind, 'separator', 'level.separator', ' ', documentMarkerStyle(options.renderNode, options.selected), sourceOptionsForBlock(options)),
      documentSpan(options.renderNode, options.kind, 'delimiter', 'level.open', '[', documentRecordLevelStyle(options.renderNode, block.level), sourceOptionsForBlock(options)),
      documentSpan(options.renderNode, options.kind, 'level', `level.${sourceToken(block.level)}`, block.level, documentRecordLevelStyle(options.renderNode, block.level), sourceOptionsForBlock(options)),
      documentSpan(options.renderNode, options.kind, 'delimiter', 'level.close', ']', documentRecordLevelStyle(options.renderNode, block.level), sourceOptionsForBlock(options))
    );
  }
  spans.push(
    documentSpan(options.renderNode, options.kind, 'separator', 'title.separator', ' ', documentMarkerStyle(options.renderNode, options.selected), sourceOptionsForBlock(options)),
    documentSpan(options.renderNode, options.kind, 'title', 'title', block.title, documentTitleStyle(options.renderNode, block.style, options.selected), sourceOptionsForBlock(options))
  );
  return clipRenderLine({ spans }, Math.max(0, width), {
    ellipsis: '…',
    mode: 'middle',
    widthProfile: options.widthProfile
  });
}

function fieldLine(field: FieldItem, labelWidth: number, width: number, options: StructuredBlockRenderOptions): RenderLine {
  return {
    spans: clipRenderSpans(
      documentFieldSpans(
        options.renderNode,
        field,
        labelWidth,
        options.widthProfile,
        options.selected,
        options.kind,
        sourceOptionsForBlock(options)
      ),
      Math.max(0, width),
      { ellipsis: '…', mode: 'middle', widthProfile: options.widthProfile }
    )
  };
}

function compactTextLine(
  text: string,
  width: number,
  style: TerminalStyle | undefined,
  options: StructuredBlockRenderOptions,
  visual: 'summary',
  label: string
): RenderLine {
  return {
    spans: clipRenderSpans(
      [documentSpan(options.renderNode, options.kind, visual, label, text, style, sourceOptionsForBlock(options))],
      Math.max(0, width),
      { ellipsis: '…', mode: 'middle', widthProfile: options.widthProfile }
    )
  };
}

function wrappedTextLines(
  text: string,
  width: number,
  style: TerminalStyle | undefined,
  options: StructuredBlockRenderOptions,
  visual: 'body' | 'detail' | 'summary',
  label: string
): readonly RenderLine[] {
  return text.split('\n').flatMap((line): RenderLine[] => {
    const wrapped = width > 0
      ? wrapTextCells(line, width, { widthProfile: options.widthProfile }).map((item) => item.text)
      : [line];
    return wrapped.map((textLine) => ({
      spans: [documentSpan(options.renderNode, options.kind, visual, label, textLine, style, sourceOptionsForBlock(options))]
    }));
  });
}

function detailTextLines(
  text: string,
  firstLine: boolean,
  width: number,
  style: TerminalStyle | undefined,
  options: StructuredBlockRenderOptions
): readonly RenderLine[] {
  if (!firstLine) return wrappedTextLines(text, width, style, options, 'detail', 'details.body');
  const prefix = 'Details';
  const detailText = text.length === 0 ? '' : text;
  const spans: RenderSpan[] = [
    documentSpan(options.renderNode, options.kind, 'detail', 'details.label', prefix, style, sourceOptionsForBlock(options)),
    documentSpan(options.renderNode, options.kind, 'separator', 'details.separator', ': ', style, sourceOptionsForBlock(options)),
    documentSpan(options.renderNode, options.kind, 'detail', 'details.body', detailText, style, sourceOptionsForBlock(options))
  ];
  const plain = spans.map((item) => item.text).join('');
  if (width <= 0 || measureTextCells(plain, { widthProfile: options.widthProfile }).cells <= width) {
    return [{ spans }];
  }
  return wrappedTextLines(plain, width, style, options, 'detail', 'details.body');
}

function maxFieldLabelWidth(fields: readonly FieldItem[], widthProfile: TextWidthProfile): number {
  return fields.reduce(
    (width, field) => Math.max(width, measureTextCells(field.label, { widthProfile }).cells),
    0
  );
}

function renderBlockText(block: RenderBlock): string {
  return block.lines.map((line) => line.spans.map((span) => span.text).join('')).join('\n');
}

function sourceOptionsForBlock(input: {
  readonly itemId?: string;
  readonly itemIndex?: number;
  readonly selected?: boolean;
}): DocumentSourceOptions {
  return {
    ...(input.itemId === undefined ? {} : { itemId: input.itemId }),
    ...(input.itemIndex === undefined ? {} : { itemIndex: input.itemIndex }),
    ...(input.selected === true ? { state: 'selected' } : {})
  };
}

function cleanLine(value: string): string {
  return cleanText(value).replace(/\s*\n\s*/gu, ' ');
}

function cleanText(value: string): string {
  return sanitizeTerminalText(value).text;
}
