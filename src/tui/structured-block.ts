import type { RenderNodeOfKind } from '../render-node/index.ts';
import { sanitizeTerminalText, wrapTextCells } from '../text/index.ts';
import { dataWindow, rowWindow } from '../behavior/data-window.ts';
import {
  type DocumentSourceOptions, documentBodyStyle, documentDetailStyle, documentFieldSpans, documentMarkerStyle, documentSpan, documentStatusStyle, documentSummaryStyle, documentTitleStyle, sourceToken
} from './document-visual.ts';
import { numberProp, stringify } from './render-node-props.ts';
import type { AccessibleNode } from '../accessibility/index.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { FieldItem } from '../components/contracts.ts';
import { optionalRecordStatus } from '../components/status.ts';
import type { StructuredBlock } from '../components/options/documents.ts';
import type { LayoutNode } from './layout.ts';
import type { Rect } from './layout.ts';
import type { HitTarget } from './render-node-renderer.ts';
import { clipRenderLine, clipRenderSpans } from './render-primitives.ts';
import type { RenderBlock, RenderLine, RenderSpan, TerminalStyle } from './render-primitives.ts';

type StructuredBlockNode = RenderNodeOfKind<unknown, 'structuredBlock'>;
type ActivityFeedNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'activityFeed'>;
type DocumentNode = StructuredBlockNode | ActivityFeedNode;

interface StructuredBlockRenderOptions {
  readonly widget: DocumentNode;
  readonly kind: 'structuredBlock' | 'activityFeed';
  readonly selected: boolean;
  readonly itemId?: string;
  readonly itemIndex?: number;
}

export function structuredBlockText(widget: StructuredBlockNode, node: LayoutNode, theme: TerminalTheme): string {
  return renderBlockText(structuredBlockBlock(widget, node, theme));
}

export function structuredBlockBlock(widget: StructuredBlockNode, node: LayoutNode, theme: TerminalTheme): RenderBlock {
  const block = blockFromRenderNode(widget);
  return {
    lines: structuredBlockLines(block, theme, node.bounds.width, {
      widget,
      kind: 'structuredBlock',
      selected: false,
      itemId: block.id
    })
  };
}

export function structuredBlockAccessibleBase(widget: StructuredBlockNode, id: string): AccessibleNode {
  const block = blockFromRenderNode(widget);
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

export function activityFeedText(widget: ActivityFeedNode, node: LayoutNode, theme: TerminalTheme): string {
  return renderBlockText(activityFeedBlock(widget, node, theme));
}

export function activityFeedBlock(widget: ActivityFeedNode, node: LayoutNode, theme: TerminalTheme): RenderBlock {
  return {
    lines: activityFeedRows(widget, node, theme)
  };
}

export function activityFeedAccessibleBase(widget: ActivityFeedNode, node: LayoutNode, id: string, focused: boolean): AccessibleNode {
  const blocks = activityFeedBlocks(widget);
  const selected = selectedBlockIndex(widget, blocks.length);
  const window = dataWindow({
    totalRows: blocks.length,
    viewportRows: Math.max(1, node.bounds.height),
    selectedIndex: selected ?? 0
  });
  return {
    id,
    role: 'listbox',
    label: id,
    description: blocks.length === 0
      ? 'Showing 0 activity blocks.'
      : `Showing ${String(window.start + 1)}-${String(window.end)} of ${String(blocks.length)} activity blocks.`,
    ...(focused ? { focused } : {})
  };
}

export function activityFeedAccessibleChildren(widget: ActivityFeedNode, node: LayoutNode): readonly AccessibleNode[] {
  const blocks = visibleActivityBlocks(widget, node.bounds);
  const selected = selectedBlockIndex(widget, activityFeedBlocks(widget).length);
  return blocks.map(({ block, index }) => ({
    id: `${widget.id ?? 'activityFeed'}:block:${block.id}`,
    role: 'option',
    label: block.title,
    value: block.summary ?? block.title,
    selected: selected === index,
    description: structuredBlockDescription(block)
  }));
}

export function activityFeedHitTargets<TMessage>(
  widget: ActivityFeedNode<TMessage>,
  bounds: Rect,
  theme: TerminalTheme
): readonly HitTarget<TMessage>[] {
  const toActionMessage = activityFeedActionMessageFactory(widget);
  if (toActionMessage === undefined) return [];
  const selected = selectedBlockIndex(widget, activityFeedBlocks(widget).length);
  const targets: HitTarget<TMessage>[] = [];
  let rowOffset = 0;
  for (const { block, index } of visibleActivityBlocks(widget, bounds)) {
    if (rowOffset >= bounds.height) break;
    const height = Math.min(
      activityFeedItemLines(widget, block, index, selected === index, bounds.width, theme).length,
      bounds.height - rowOffset
    );
    if (height <= 0) continue;
    targets.push({
      id: `${widget.id ?? 'activityFeed'}:block:${block.id}`,
      bounds: {
        row: bounds.row + rowOffset,
        column: bounds.column,
        width: bounds.width,
        height
      },
      accepts: ['click'],
      message: () => toActionMessage({ kind: 'select', index }),
      cursor: 'pointer'
    });
    rowOffset += height;
  }
  return targets;
}

function activityFeedRows(widget: ActivityFeedNode, node: LayoutNode, theme: TerminalTheme): readonly RenderLine[] {
  const selected = selectedBlockIndex(widget, activityFeedBlocks(widget).length);
  const rows: RenderLine[] = [];
  for (const { block, index } of visibleActivityBlocks(widget, node.bounds)) {
    const selectedRow = selected === index;
    const marker = selectedRow ? `${theme.tokens.symbols.pointer} ` : '  ';
    const lines = activityFeedItemLines(widget, block, index, selectedRow, node.bounds.width, theme);
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      if (rows.length >= node.bounds.height) return rows;
      const prefix = lineIndex === 0 ? marker : '  ';
      rows.push({
        spans: [
          documentSpan(
            widget,
            'activityFeed',
            'marker',
            selectedRow ? 'selection.selected' : 'selection.unselected',
            prefix,
            documentMarkerStyle(widget, selectedRow),
            sourceOptionsForBlock({ itemId: block.id, itemIndex: index, selected: selectedRow })
          ),
          ...(lines[lineIndex]?.spans ?? [])
        ]
      });
    }
  }
  return rows;
}

function visibleActivityBlocks(
  widget: ActivityFeedNode,
  bounds: Rect
): readonly { readonly block: StructuredBlock; readonly index: number }[] {
  const blocks = activityFeedBlocks(widget);
  const selected = selectedBlockIndex(widget, blocks.length) ?? 0;
  const window = rowWindow(blocks, {
    viewportRows: Math.max(1, bounds.height),
    selectedIndex: selected
  });
  return window.rows.map((block, offset) => ({
    block,
    index: window.start + offset
  }));
}

function activityFeedItemLines(
  widget: ActivityFeedNode,
  block: StructuredBlock,
  index: number,
  selected: boolean,
  width: number,
  theme: TerminalTheme
): readonly RenderLine[] {
  const marker = selected ? `${theme.tokens.symbols.pointer} ` : '  ';
  return structuredBlockLines(block, theme, Math.max(0, width - marker.length), {
    widget,
    kind: 'activityFeed',
    selected,
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
  const fieldLabelWidth = maxFieldLabelWidth(block.fields ?? []);
  const lines: RenderLine[] = [headerLine(block, theme, collapsed, options, width)];
  if (block.summary !== undefined && block.summary.length > 0) {
    lines.push(compactTextLine(block.summary, width, documentSummaryStyle(options.widget, options.selected), options, 'summary', 'summary'));
  }
  for (const field of block.fields ?? []) {
    lines.push(fieldLine(field, fieldLabelWidth, width, options));
  }
  if (!collapsed && block.body !== undefined && block.body.length > 0) {
    lines.push(...wrappedTextLines(block.body, width, documentBodyStyle(options.widget, block.style, options.selected), options, 'body', 'body'));
  }
  if (!collapsed && block.details !== undefined && block.details.length > 0) {
    const detailLines = block.details.split('\n');
    for (let index = 0; index < detailLines.length; index += 1) {
      lines.push(...detailTextLines(detailLines[index] ?? '', index === 0, width, documentDetailStyle(options.widget, block.style, options.selected), options));
    }
  }
  return lines;
}

function structuredBlockDescription(block: StructuredBlock): string {
  const parts = [
    block.status === undefined ? undefined : `status ${block.status}`,
    block.collapsed === true ? 'collapsed' : 'expanded',
    block.fields === undefined ? undefined : `${String(block.fields.length)} fields`
  ].filter((part): part is string => part !== undefined);
  return parts.join(', ');
}

function structuredBlockAccessibleChildren(block: StructuredBlock, id: string): readonly AccessibleNode[] {
  const children: AccessibleNode[] = [];
  if (block.status !== undefined) {
    children.push({
      id: `${id}:status`,
      role: 'status',
      label: 'status',
      value: block.status
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

function blockFromRenderNode(widget: StructuredBlockNode): StructuredBlock {
  const title = stringify(widget.props.title);
  return {
    id: widget.id ?? 'structured-block',
    title: title.length === 0 ? widget.id ?? 'Block' : title,
    ...optionalString('summary', widget.props.summary),
    ...optionalStyle(widget.props.style),
    ...optionalStatus(widget.props.status),
    ...optionalFields(widget.props.fields),
    ...optionalString('body', widget.props.body),
    ...optionalString('details', widget.props.details),
    ...(widget.props.collapsed === true ? { collapsed: true } : {})
  };
}

function activityFeedBlocks(widget: ActivityFeedNode): readonly StructuredBlock[] {
  return Array.isArray(widget.props.blocks)
    ? widget.props.blocks.filter(isStructuredBlock).map(sanitizeBlock)
    : [];
}

function activityFeedActionMessageFactory<TMessage>(
  widget: ActivityFeedNode<TMessage>
): ((action: import('../components/activity-feed.ts').ActivityFeedAction) => TMessage) | undefined {
  return widget.props.toActionMessage;
}

function selectedBlockIndex(widget: ActivityFeedNode, length: number): number | undefined {
  const selected = numberProp(widget, 'selected');
  if (selected === undefined || length <= 0) return undefined;
  return Math.max(0, Math.min(length - 1, Math.floor(selected)));
}

function sanitizeBlock(block: StructuredBlock): StructuredBlock {
  return {
    id: cleanLine(block.id),
    title: cleanLine(block.title),
    ...(block.summary === undefined ? {} : { summary: cleanLine(block.summary) }),
    ...(block.style === undefined ? {} : { style: block.style }),
    ...(block.status === undefined ? {} : { status: block.status }),
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

function optionalStatus(value: unknown): Pick<StructuredBlock, 'status'> | Record<string, never> {
  const status = optionalRecordStatus(value);
  return status === undefined ? {} : { status };
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
      options.widget,
      options.kind,
      'marker',
      collapsed ? 'toggle.collapsed' : 'toggle.expanded',
      collapsed ? theme.tokens.symbols.collapsed : theme.tokens.symbols.expanded,
      documentMarkerStyle(options.widget, options.selected),
      sourceOptionsForBlock(options)
    )
  ];
  if (block.status !== undefined) {
    spans.push(
      documentSpan(options.widget, options.kind, 'separator', 'status.separator', ' ', documentMarkerStyle(options.widget, options.selected), sourceOptionsForBlock(options)),
      documentSpan(options.widget, options.kind, 'chrome', 'status.open', '[', documentStatusStyle(block.status), sourceOptionsForBlock(options)),
      documentSpan(options.widget, options.kind, 'status', `status.${sourceToken(block.status)}`, block.status, documentStatusStyle(block.status), sourceOptionsForBlock(options)),
      documentSpan(options.widget, options.kind, 'chrome', 'status.close', ']', documentStatusStyle(block.status), sourceOptionsForBlock(options))
    );
  }
  spans.push(
    documentSpan(options.widget, options.kind, 'separator', 'title.separator', ' ', documentMarkerStyle(options.widget, options.selected), sourceOptionsForBlock(options)),
    documentSpan(options.widget, options.kind, 'title', 'title', block.title, documentTitleStyle(options.widget, block.style, options.selected), sourceOptionsForBlock(options))
  );
  return clipRenderLine({ spans }, Math.max(0, width), { ellipsis: '…', mode: 'middle' });
}

function fieldLine(field: FieldItem, labelWidth: number, width: number, options: StructuredBlockRenderOptions): RenderLine {
  return {
    spans: clipRenderSpans(
      documentFieldSpans(options.widget, field, labelWidth, options.selected, options.kind, sourceOptionsForBlock(options)),
      Math.max(0, width),
      { ellipsis: '…', mode: 'middle' }
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
      [documentSpan(options.widget, options.kind, visual, label, text, style, sourceOptionsForBlock(options))],
      Math.max(0, width),
      { ellipsis: '…', mode: 'middle' }
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
    const wrapped = width > 0 ? wrapTextCells(line, width).map((item) => item.text) : [line];
    return wrapped.map((textLine) => ({
      spans: [documentSpan(options.widget, options.kind, visual, label, textLine, style, sourceOptionsForBlock(options))]
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
    documentSpan(options.widget, options.kind, 'detail', 'details.label', prefix, style, sourceOptionsForBlock(options)),
    documentSpan(options.widget, options.kind, 'separator', 'details.separator', ': ', style, sourceOptionsForBlock(options)),
    documentSpan(options.widget, options.kind, 'detail', 'details.body', detailText, style, sourceOptionsForBlock(options))
  ];
  const plain = spans.map((item) => item.text).join('');
  if (width <= 0 || plain.length <= width) return [{ spans }];
  return wrappedTextLines(plain, width, style, options, 'detail', 'details.body');
}

function maxFieldLabelWidth(fields: readonly FieldItem[]): number {
  return fields.reduce((width, field) => Math.max(width, field.label.length), 0);
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
